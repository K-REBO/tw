import { firefox, Browser, Page } from "npm:playwright@^1.40.0";
import type { AuthData } from "./types.ts";

export class AuthManager {
  private authFile: string;
  
  constructor(authFilePath?: string) {
    this.authFile = authFilePath || "./twitter-auth.json";
  }
  
  async login(useExistingProfile: boolean = false, headless: boolean = true): Promise<void> {
    let browser: Browser;
    let context: any;
    let page: Page;
    
    if (useExistingProfile) {
      // Try to find and use existing Firefox profile
      const profilePath = await this.findFirefoxProfile();
      if (profilePath) {
        console.log(`🦊 Found Firefox profile: ${profilePath}`);
        console.log('📋 Copying profile to temporary location...');
        
        // Create temporary profile directory
        const tempProfile = await Deno.makeTempDir({ prefix: "tw_firefox_" });
        
        // Copy essential profile files
        try {
          await this.copyProfileFiles(profilePath, tempProfile);
          
          context = await firefox.launchPersistentContext(tempProfile, {
            headless
          });
          page = context.pages()[0] || await context.newPage();
        } catch (error) {
          console.log('⚠️ Failed to copy profile, using default method');
          browser = await firefox.launch({ headless });
          page = await browser.newPage();
        }
      } else {
        console.log('⚠️ No Firefox profile found, using temporary profile');
        browser = await firefox.launch({ headless });
        page = await browser.newPage();
      }
    } else {
      browser = await firefox.launch({ headless });
      page = await browser.newPage();
    }
    
    try {
      if (useExistingProfile) {
        // If using existing profile, go directly to Twitter and check if logged in
        await page.goto("https://x.com/home");
        
        try {
          // Wait a bit to see if we're already logged in
          await page.waitForURL("**/home", { timeout: 5000 });
          console.log("✅ Already logged in with existing Firefox profile!");
          
          // Extract cookies and save them
          const cookies = await (context || page.context()).cookies();
          const userAgent = await page.evaluate(() => navigator.userAgent);
          
          const authData: AuthData = {
            cookies,
            userAgent,
            loginTime: new Date().toISOString()
          };
          
          await Deno.writeTextFile(this.authFile, JSON.stringify(authData, null, 2));
          return;
          
        } catch {
          // Not logged in, proceed with manual login
          console.log('🔑 Not logged in, please login manually...');
          await page.goto("https://x.com/login");
        }
      } else {
        await page.goto("https://x.com/login");
      }
      
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
      const cookies = await (context || page.context()).cookies();
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
      if (context) {
        await context.close();
      } else if (browser) {
        await browser.close();
      }
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

  private async findFirefoxProfile(): Promise<string | null> {
    const homeDir = Deno.env.get("HOME");
    if (!homeDir) return null;

    const possiblePaths = [
      `${homeDir}/.mozilla/firefox`,
      `${homeDir}/Library/Application Support/Firefox/Profiles`, // macOS
      `${homeDir}/AppData/Roaming/Mozilla/Firefox/Profiles`, // Windows
    ];

    for (const basePath of possiblePaths) {
      try {
        const entries = await Array.fromAsync(Deno.readDir(basePath));
        
        // Look for default profiles
        for (const entry of entries) {
          if (entry.isDirectory && (
            entry.name.includes("default") ||
            entry.name.includes("release")
          )) {
            return `${basePath}/${entry.name}`;
          }
        }
        
        // If no default found, use first profile directory
        for (const entry of entries) {
          if (entry.isDirectory && entry.name.includes(".")) {
            return `${basePath}/${entry.name}`;
          }
        }
      } catch {
        // Directory doesn't exist, try next
        continue;
      }
    }

    return null;
  }

  private async copyProfileFiles(sourcePath: string, destPath: string): Promise<void> {
    // Copy essential Firefox profile files for login persistence
    const essentialFiles = [
      'cookies.sqlite',
      'cookies.sqlite-shm', 
      'cookies.sqlite-wal',
      'sessionstore.jsonlz4',
      'storage.sqlite',
      'webappsstore.sqlite',
      'permissions.sqlite',
      'content-prefs.sqlite'
    ];

    for (const file of essentialFiles) {
      try {
        const sourcePath_full = `${sourcePath}/${file}`;
        const destPath_full = `${destPath}/${file}`;
        await Deno.copyFile(sourcePath_full, destPath_full);
      } catch {
        // File might not exist, continue
      }
    }
  }
}