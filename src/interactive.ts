import { AuthManager } from "./auth.ts";
import { getBrowserConfig } from "./browser.ts";
import { TwitterAPI } from "./api.ts";
import type { Browser, Page } from "npm:playwright-core@1.49.1";

interface InteractiveSessionOptions {
  useApi?: boolean;
}

export class InteractiveSession {
  private auth: AuthManager;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private pollInterval: number | null = null;
  private isRunning = false;
  private useApi: boolean;
  private api: TwitterAPI | null = null;
  private cachedUsername: string | null = null;

  constructor(authManager?: AuthManager, options: InteractiveSessionOptions = {}) {
    this.auth = authManager || new AuthManager();
    this.useApi = options.useApi ?? false;
  }

  async start(options: { debug?: boolean; headless?: boolean } = {}): Promise<void> {
    const authData = await this.auth.getAuthData();

    if (this.useApi) {
      // API mode: no browser needed
      this.api = new TwitterAPI(authData);

      // Verify credentials
      const verification = await this.api.verifyCredentials();
      if (!verification.valid) {
        throw new Error(verification.error || "Not logged in");
      }
      this.cachedUsername = verification.username || null;

      this.isRunning = true;
      return;
    }

    // Browser mode
    const browserConfig = await getBrowserConfig();

    const { firefox, chromium } = await import("npm:playwright-core@1.49.1");
    const browserLauncher = browserConfig.type === "firefox" ? firefox : chromium;

    this.browser = await browserLauncher.launch({
      headless: options.headless ?? true,
      executablePath: browserConfig.executablePath,
    });
    this.page = await this.browser.newPage();

    const cookies = authData.cookies.map(cookie => ({
      ...cookie,
      expires: cookie.expires ?? -1
    }));

    await this.page.context().addCookies(cookies);
    await this.page.setExtraHTTPHeaders({ 'User-Agent': authData.userAgent });

    // Navigate to home to verify login
    await this.page.goto("https://x.com/home", { waitUntil: "domcontentloaded", timeout: 15000 });
    await this.page.waitForTimeout(2000);

    if (this.page.url().includes("/login") || this.page.url().includes("/i/flow/login")) {
      await this.close();
      throw new Error("Not logged in");
    }

    this.isRunning = true;

    // Start polling every 3 minutes
    this.pollInterval = setInterval(async () => {
      const loggedIn = await this.checkLoginStatus();
      if (!loggedIn) {
        console.log("\n⚠️  Session expired. Exiting...");
        await this.close();
        Deno.exit(0);
      }
    }, 3 * 60 * 1000) as unknown as number;
  }

  private async checkLoginStatus(): Promise<boolean> {
    if (!this.page) return false;

    try {
      // Navigate to a simple page to check login status
      const currentUrl = this.page.url();
      await this.page.goto("https://x.com/home", { waitUntil: "domcontentloaded", timeout: 10000 });
      await this.page.waitForTimeout(1000);

      const isLoggedOut = this.page.url().includes("/login") || this.page.url().includes("/i/flow/login");

      // Go back to where we were if still logged in
      if (!isLoggedOut && currentUrl !== "https://x.com/home") {
        await this.page.goto(currentUrl, { waitUntil: "domcontentloaded", timeout: 10000 });
      }

      return !isLoggedOut;
    } catch {
      return false;
    }
  }

  async getUsername(): Promise<string> {
    if (this.useApi) {
      if (this.cachedUsername) {
        return this.cachedUsername;
      }
      if (!this.api) throw new Error("Session not started");

      const verification = await this.api.verifyCredentials();
      if (!verification.valid || !verification.username) {
        throw new Error("Could not get username");
      }
      this.cachedUsername = verification.username;
      return verification.username;
    }

    if (!this.page) throw new Error("Session not started");

    await this.page.goto("https://x.com/home", { waitUntil: "domcontentloaded", timeout: 15000 });
    await this.page.waitForTimeout(2000);

    const username = await this.page.evaluate(() => {
      const profileLink = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
      if (profileLink) {
        const href = profileLink.getAttribute('href');
        if (href) {
          return href.replace('/', '');
        }
      }
      const accountSwitcher = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
      if (accountSwitcher) {
        const spans = accountSwitcher.querySelectorAll('span');
        for (const span of spans) {
          const text = span.textContent || '';
          if (text.startsWith('@')) {
            return text.slice(1);
          }
        }
      }
      return null;
    });

    if (!username) throw new Error("Could not find username");
    return username;
  }

  async post(text: string): Promise<{ success: boolean }> {
    if (this.useApi) {
      if (!this.api) throw new Error("Session not started");

      const result = await this.api.post(text);
      if (!result.success) {
        throw new Error(result.error || "Unknown error");
      }
      return { success: true };
    }

    if (!this.page) throw new Error("Session not started");

    await this.page.goto("https://x.com/compose/post", { waitUntil: "domcontentloaded", timeout: 15000 });
    await this.page.waitForTimeout(2000);

    const textboxSelector = '[data-testid="tweetTextarea_0"]';
    await this.page.waitForSelector(textboxSelector, { timeout: 10000 });
    await this.page.click(textboxSelector);
    await this.page.keyboard.type(text, { delay: 50 });
    await this.page.waitForTimeout(500);

    const postButtonSelector = '[data-testid="tweetButton"]';
    await this.page.waitForSelector(postButtonSelector, { timeout: 5000 });
    await this.page.click(postButtonSelector);
    await this.page.waitForTimeout(3000);

    return { success: true };
  }

  async reply(tweetUrl: string, text: string): Promise<{ success: boolean }> {
    if (this.useApi) {
      if (!this.api) throw new Error("Session not started");

      const tweetId = TwitterAPI.extractTweetId(tweetUrl);
      if (!tweetId) {
        throw new Error("Invalid tweet URL: could not extract tweet ID");
      }

      const result = await this.api.reply(tweetId, text);
      if (!result.success) {
        throw new Error(result.error || "Unknown error");
      }
      return { success: true };
    }

    if (!this.page) throw new Error("Session not started");

    const normalizedUrl = tweetUrl.replace('twitter.com', 'x.com');
    await this.page.goto(normalizedUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    await this.page.waitForTimeout(2000);

    const replyButtonSelector = '[data-testid="reply"]';
    await this.page.waitForSelector(replyButtonSelector, { timeout: 10000 });
    await this.page.click(replyButtonSelector);
    await this.page.waitForTimeout(1000);

    const textboxSelector = '[data-testid="tweetTextarea_0"]';
    await this.page.waitForSelector(textboxSelector, { timeout: 10000 });
    await this.page.click(textboxSelector);
    await this.page.keyboard.type(text, { delay: 50 });
    await this.page.waitForTimeout(500);

    const postButtonSelector = '[data-testid="tweetButton"]';
    await this.page.waitForSelector(postButtonSelector, { timeout: 5000 });
    await this.page.click(postButtonSelector);
    await this.page.waitForTimeout(3000);

    return { success: true };
  }

  async quote(tweetUrl: string, text: string): Promise<{ success: boolean }> {
    if (this.useApi) {
      if (!this.api) throw new Error("Session not started");

      const result = await this.api.quote(tweetUrl, text);
      if (!result.success) {
        throw new Error(result.error || "Unknown error");
      }
      return { success: true };
    }

    if (!this.page) throw new Error("Session not started");

    const normalizedUrl = tweetUrl.replace('twitter.com', 'x.com');
    await this.page.goto(normalizedUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    await this.page.waitForTimeout(2000);

    const retweetButtonSelector = '[data-testid="retweet"]';
    await this.page.waitForSelector(retweetButtonSelector, { timeout: 10000 });
    await this.page.click(retweetButtonSelector);
    await this.page.waitForTimeout(1000);

    // Click quote option
    const quoteSelectors = [
      '[data-testid="Dropdown"] a[href*="/compose/post"]',
      '[role="menuitem"] a[href*="/compose/post"]',
      'a[href*="/compose/post"]',
    ];

    let clicked = false;
    for (const selector of quoteSelectors) {
      try {
        const element = await this.page.waitForSelector(selector, { timeout: 3000 });
        if (element) {
          await element.click();
          clicked = true;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!clicked) throw new Error("Could not find quote option");

    await this.page.waitForTimeout(2000);

    const textboxSelectors = [
      '[data-testid="tweetTextarea_0"]',
      '[role="textbox"]',
    ];

    let textbox = null;
    for (const selector of textboxSelectors) {
      try {
        textbox = await this.page.waitForSelector(selector, { timeout: 3000 });
        if (textbox) break;
      } catch {
        continue;
      }
    }

    if (!textbox) throw new Error("Could not find text input");

    await textbox.click();
    await this.page.keyboard.type(text, { delay: 50 });
    await this.page.waitForTimeout(500);

    const postButtonSelector = '[data-testid="tweetButton"]';
    await this.page.waitForSelector(postButtonSelector, { timeout: 5000 });
    await this.page.click(postButtonSelector);
    await this.page.waitForTimeout(3000);

    return { success: true };
  }

  async close(): Promise<void> {
    this.isRunning = false;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    if (this.useApi) {
      this.api = null;
      return;
    }

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  get running(): boolean {
    return this.isRunning;
  }
}
