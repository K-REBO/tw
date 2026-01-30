#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write --allow-env --allow-sys --allow-run

/**
 * 特定ユーザーの最新ツイートのリンクを取得するスクリプト
 *
 * 使用方法:
 *   ./get-latest-tweet.ts <username>
 *   ./get-latest-tweet.ts <username> --created    # 作成日時も表示
 *   ./get-latest-tweet.ts <username> --json       # JSON形式で出力
 *   ./get-latest-tweet.ts elonmusk --debug
 */

import { AuthManager } from "./src/auth.ts";
import { getBrowserConfig } from "./src/browser.ts";

interface TweetInfo {
  url: string;
  created?: string;
  createdTimestamp?: number;
}

async function getLatestTweet(username: string, debug = false): Promise<TweetInfo | null> {
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
      expires: cookie.expires ?? -1
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
    const tweetInfo = await page.evaluate((targetUsername: string) => {
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
        let tweetUrl: string | null = null;
        for (const link of links) {
          const href = link.getAttribute('href');
          if (href && href.includes(`/${targetUsername}/status/`)) {
            tweetUrl = `https://x.com${href}`;
            break;
          }
        }

        if (!tweetUrl) continue;

        // Find the timestamp
        let created: string | undefined;
        let createdTimestamp: number | undefined;
        const timeElement = tweet.querySelector('time');
        if (timeElement) {
          const datetime = timeElement.getAttribute('datetime');
          if (datetime) {
            created = datetime;
            createdTimestamp = new Date(datetime).getTime();
          }
        }

        return {
          url: tweetUrl,
          created,
          createdTimestamp,
        };
      }

      return null;
    }, cleanUsername);

    return tweetInfo;

  } finally {
    await browser.close();
  }
}

interface Options {
  username: string;
  debug: boolean;
  json: boolean;
  created: boolean;
}

function parseArgs(): Options {
  const args = Deno.args;

  const options: Options = {
    username: '',
    debug: false,
    json: false,
    created: false,
  };

  for (const arg of args) {
    if (arg === '--debug') {
      options.debug = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--created') {
      options.created = true;
    } else if (!arg.startsWith('--')) {
      options.username = arg;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();

  if (!options.username) {
    console.error("使用方法: ./get-latest-tweet.ts <username> [--created] [--json] [--debug]");
    Deno.exit(1);
  }

  try {
    const tweet = await getLatestTweet(options.username, options.debug);

    if (tweet) {
      if (options.json) {
        console.log(JSON.stringify(tweet, null, 2));
      } else if (options.created) {
        console.log(`${tweet.url}\t${tweet.created || 'unknown'}`);
      } else {
        console.log(tweet.url);
      }
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
