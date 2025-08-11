import { firefox, Browser, Page } from "npm:playwright@^1.40.0";
import type { AuthData } from "./types.ts";

export class AuthManager {
  private authFile: string;
  
  constructor(authFilePath?: string) {
    this.authFile = authFilePath || "./twitter-auth.json";
  }
  
  async login(): Promise<void> {
    const browser: Browser = await firefox.launch({ 
      headless: false,
      // 既存のプロファイルを使用する場合は下記をコメントアウト
      // executablePath: '/usr/bin/firefox', // システムのFirefoxを使用
      // args: ['--profile', '/home/bido/.mozilla/firefox/your-profile'] // 既存プロファイルパス
    });
    const page: Page = await browser.newPage();
    
    try {
      await page.goto("https://x.com/login");
      
      console.log("Please complete the login process in the browser...");
      console.log("Press Enter when you're successfully logged in and see your timeline");
      
      // Wait for user input
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      await Deno.stdout.write(encoder.encode("Press Enter to continue..."));
      
      const buffer = new Uint8Array(1024);
      await Deno.stdin.read(buffer);
      
      // Wait for timeline to load
      await page.waitForURL("**/home", { timeout: 60000 });
      
      // Extract cookies and user agent
      const cookies = await page.context().cookies();
      const userAgent = await page.evaluate(() => navigator.userAgent);
      
      const authData: AuthData = {
        cookies,
        userAgent,
        loginTime: new Date().toISOString()
      };
      
      await Deno.writeTextFile(this.authFile, JSON.stringify(authData, null, 2));
      
    } catch (error) {
      throw new Error(`Login failed: ${(error as Error).message}`);
    } finally {
      await browser.close();
    }
  }
  
  async logout(): Promise<void> {
    try {
      await Deno.remove(this.authFile);
    } catch (error) {
      // File might not exist
    }
  }
  
  async isLoggedIn(): Promise<boolean> {
    try {
      const authData = await this.getAuthData();
      const loginTime = new Date(authData.loginTime);
      const now = new Date();
      const daysDiff = (now.getTime() - loginTime.getTime()) / (1000 * 3600 * 24);
      
      // Consider session expired after 7 days
      return daysDiff < 7;
    } catch {
      return false;
    }
  }
  
  async getAuthData(): Promise<AuthData> {
    const data = await Deno.readTextFile(this.authFile);
    return JSON.parse(data);
  }
}