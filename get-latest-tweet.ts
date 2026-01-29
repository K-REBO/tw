#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write --allow-env --allow-sys --allow-run

/**
 * 特定ユーザーの最新ツイートのリンクを取得するスクリプト
 *
 * 使用方法:
 *   ./get-latest-tweet.ts <username>
 *   ./get-latest-tweet.ts elonmusk
 */

import { AuthManager } from "./src/auth.ts";
import { getBrowserConfig } from "./src/browser.ts";

async function getLatestTweetUrl(username: string, debug = false): Promise<string | null> {
  const auth = new AuthManager();
  const browserConfig = await getBrowserConfig();

  if (!await auth.isLoggedIn()) {
    throw new Error("Not logged in. Run: tw login");
  }

  const { firefox, chromium } = await import("npm:playwright-core@1.49.1");
  const browserLauncher = browserConfig.type === "firefox" ? firefox : chromium;

  const browser = await browserLauncher.launch({
    headless: !debug,
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
    const url = `https://x.com/${cleanUsername}`;

    if (debug) {
      console.error(`🔍 Navigating to: ${url}`);
    }

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(3000);

    if (page.url().includes("/login") || page.url().includes("/i/flow/login")) {
      throw new Error("Not logged in - redirected to login page");
    }

    // Find the first non-pinned, non-reply tweet
    const tweetUrl = await page.evaluate((targetUsername: string) => {
      const tweets = document.querySelectorAll('article[data-testid="tweet"]');

      for (const tweet of tweets) {
        // Skip pinned tweets
        const pinnedIndicator = tweet.querySelector('[data-testid="socialContext"]');
        if (pinnedIndicator?.textContent?.includes('Pinned')) {
          continue;
        }

        // Skip replies (tweets that show "Replying to")
        const replyIndicator = tweet.textContent?.includes('Replying to');
        if (replyIndicator) {
          continue;
        }

        // Check if this tweet is from the target user
        const userLink = tweet.querySelector(`a[href="/${targetUsername}"]`);
        if (!userLink) {
          continue;
        }

        // Find the tweet link (contains /status/)
        const links = tweet.querySelectorAll('a[href*="/status/"]');
        for (const link of links) {
          const href = link.getAttribute('href');
          if (href && href.includes(`/${targetUsername}/status/`)) {
            return `https://x.com${href}`;
          }
        }
      }

      return null;
    }, cleanUsername);

    return tweetUrl;

  } finally {
    await browser.close();
  }
}

async function main() {
  const username = Deno.args[0];
  const debug = Deno.args.includes('--debug');

  if (!username || username.startsWith('--')) {
    console.error("使用方法: ./get-latest-tweet.ts <username> [--debug]");
    Deno.exit(1);
  }

  try {
    const url = await getLatestTweetUrl(username, debug);

    if (url) {
      console.log(url);
    } else {
      console.error("❌ ツイートが見つかりませんでした");
      Deno.exit(1);
    }
  } catch (error) {
    console.error(`❌ Error: ${(error as Error).message}`);
    Deno.exit(1);
  }
}

main();
