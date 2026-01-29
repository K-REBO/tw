#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write --allow-env --allow-sys --allow-run

/**
 * ユーザーのフォロワー/フォローリストを取得するスクリプト
 *
 * 使用方法:
 *   ./get-follow-list.ts <username> followers  # フォロワーを取得
 *   ./get-follow-list.ts <username> following  # フォロー中を取得
 *   ./get-follow-list.ts <username> followers --limit 100  # 最大100件取得
 */

import { AuthManager } from "./src/auth.ts";
import { getBrowserConfig } from "./src/browser.ts";

interface Options {
  limit: number;
  debug: boolean;
  headless: boolean;
}

async function getFollowList(
  username: string,
  mode: "followers" | "following",
  options: Options
): Promise<string[]> {
  const auth = new AuthManager();
  const browserConfig = await getBrowserConfig();

  if (!await auth.isLoggedIn()) {
    throw new Error("Not logged in. Run: tw login");
  }

  const { firefox, chromium } = await import("npm:playwright-core@1.49.1");
  const browserLauncher = browserConfig.type === "firefox" ? firefox : chromium;

  const browser = await browserLauncher.launch({
    headless: options.headless,
    executablePath: browserConfig.executablePath,
  });
  const page = await browser.newPage();

  try {
    const authData = await auth.getAuthData();

    const cookies = authData.cookies.map(cookie => ({
      ...cookie,
      expires: cookie.expires ? Math.floor(cookie.expires / 1000) : -1
    }));

    await page.context().addCookies(cookies);
    await page.setExtraHTTPHeaders({ 'User-Agent': authData.userAgent });

    const cleanUsername = username.replace('@', '');
    const url = `https://x.com/${cleanUsername}/${mode}`;

    if (options.debug) {
      console.error(`🔍 Navigating to: ${url}`);
    }

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(2000);

    if (page.url().includes("/login") || page.url().includes("/i/flow/login")) {
      throw new Error("Not logged in - redirected to login page");
    }

    const usernames: Set<string> = new Set();
    let scrollCount = 0;
    let noNewCount = 0;
    const maxScrolls = Math.ceil(options.limit / 10) + 5;

    while (usernames.size < options.limit && scrollCount < maxScrolls) {
      const newUsernames = await page.evaluate(() => {
        const users: string[] = [];

        // Find user cells
        const userCells = document.querySelectorAll('[data-testid="UserCell"]');

        userCells.forEach((cell) => {
          // Find the username link (starts with @)
          const links = cell.querySelectorAll('a[href^="/"]');
          for (const link of links) {
            const href = link.getAttribute('href');
            if (href && !href.includes('/') && href !== '/') {
              continue;
            }
            // Get username from href like "/username"
            if (href) {
              const match = href.match(/^\/([^\/]+)$/);
              if (match && match[1] && !['home', 'explore', 'notifications', 'messages', 'i'].includes(match[1])) {
                users.push(match[1]);
                break;
              }
            }
          }
        });

        return users;
      });

      const prevSize = usernames.size;
      newUsernames.forEach(u => usernames.add(u));

      if (options.debug) {
        console.error(`🔍 Scroll ${scrollCount + 1}: Found ${newUsernames.length} users, total unique: ${usernames.size}`);
      }

      if (usernames.size === prevSize) {
        noNewCount++;
        if (noNewCount >= 3) {
          if (options.debug) {
            console.error("🔍 No new users found, stopping");
          }
          break;
        }
      } else {
        noNewCount = 0;
      }

      // Scroll down
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1500);
      scrollCount++;
    }

    return Array.from(usernames).slice(0, options.limit);

  } finally {
    await browser.close();
  }
}

// Parse arguments
function parseArgs(): { username: string; mode: "followers" | "following"; options: Options } {
  const args = Deno.args;

  if (args.length < 2) {
    console.error("使用方法: ./get-follow-list.ts <username> <followers|following> [--limit N] [--debug] [--show-browser]");
    Deno.exit(1);
  }

  const username = args[0];
  const mode = args[1] as "followers" | "following";

  if (mode !== "followers" && mode !== "following") {
    console.error("モードは 'followers' または 'following' を指定してください");
    Deno.exit(1);
  }

  const options: Options = {
    limit: 100,
    debug: false,
    headless: true,
  };

  for (let i = 2; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--debug") {
      options.debug = true;
    } else if (args[i] === "--show-browser") {
      options.headless = false;
    }
  }

  return { username, mode, options };
}

async function main() {
  const { username, mode, options } = parseArgs();

  if (options.debug) {
    console.error(`📋 Getting ${mode} for @${username.replace('@', '')} (limit: ${options.limit})`);
  }

  try {
    const users = await getFollowList(username, mode, options);

    // Output usernames, one per line
    for (const user of users) {
      console.log(user);
    }

    if (options.debug) {
      console.error(`✅ Found ${users.length} users`);
    }
  } catch (error) {
    console.error(`❌ Error: ${(error as Error).message}`);
    Deno.exit(1);
  }
}

main();
