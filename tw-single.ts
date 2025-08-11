#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write --allow-env --allow-sys --allow-run

import { Command } from "https://deno.land/x/cliffy@v1.0.0-rc.4/command/mod.ts";
import * as colors from "https://deno.land/std@0.224.0/fmt/colors.ts";
import { firefox, Browser, Page } from "npm:playwright@^1.40.0";

// Types
interface TwitterPost {
  id: string;
  text: string;
  author: {
    username: string;
    displayName: string;
    verified: boolean;
  };
  timestamp: string;
  likes: number;
  retweets: number;
  replies: number;
  isRetweet: boolean;
  isReply: boolean;
  mediaUrls: string[];
  hashtags: string[];
  mentions: string[];
}

interface GetOptions {
  from?: string;
  since?: string;
  until?: string;
  limit?: number;
  search?: string;
  replies?: boolean;
  retweets?: boolean;
  lang?: string;
  verified?: boolean;
  minLikes?: number;
  hashtag?: string;
  debug?: boolean;
}

interface AuthData {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
  }>;
  userAgent: string;
  loginTime: string;
}

// Auth Manager
class AuthManager {
  private authFile = "./twitter-auth.json";
  
  async login(): Promise<void> {
    const browser: Browser = await firefox.launch({ 
      headless: false,
    });
    const page: Page = await browser.newPage();
    
    try {
      await page.goto("https://x.com/login");
      
      console.log("Please complete the login process in the browser...");
      console.log("Press Enter when you're successfully logged in and see your timeline");
      
      // Wait for user input
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

// Twitter Scraper
class TwitterScraper {
  private auth = new AuthManager();
  
  async getPosts(options: GetOptions): Promise<TwitterPost[]> {
    const browser: Browser = await firefox.launch({ headless: !options.debug });
    const page: Page = await browser.newPage();
    
    try {
      // Load authentication
      const authData = await this.auth.getAuthData();
      await page.context().addCookies(authData.cookies);
      await page.setExtraHTTPHeaders({ 'User-Agent': authData.userAgent });
      
      let url = "https://x.com/home";
      
      // Build URL based on options
      if (options.search || (options.from && options.search)) {
        const searchParams = new URLSearchParams({
          q: this.buildSearchQuery(options),
          src: "typed_query",
          f: "live"
        });
        url = `https://x.com/search?${searchParams.toString()}`;
      } else if (options.from) {
        url = `https://x.com/${options.from.replace('@', '')}`;
      }
      
      if (options.debug) {
        console.log("🔍 Navigating to URL:", url);
      }
      
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(3000);
      
      if (options.debug) {
        console.log("🔍 Debugging selectors...");
        const debugInfo = await page.evaluate(() => {
          const selectors = [
            'article[data-testid="tweet"]',
            '[data-testid="tweet"]', 
            'article',
            '[role="article"]',
            '.css-1dbjc4n[data-testid="tweet"]'
          ];
          
          const results: any = {};
          selectors.forEach(sel => {
            const elements = document.querySelectorAll(sel);
            results[sel] = elements.length;
          });
          
          const firstArticle = document.querySelector('article');
          results.firstArticleHTML = firstArticle ? firstArticle.outerHTML.slice(0, 500) : 'No article found';
          
          return results;
        });
        
        console.log("Selector results:", debugInfo);
      }
      
      // Wait for tweets to load
      try {
        await page.waitForSelector('article[data-testid="tweet"]', { timeout: 5000 });
      } catch {
        try {
          await page.waitForSelector('[data-testid="tweet"]', { timeout: 5000 });
        } catch {
          try {
            await page.waitForSelector('article', { timeout: 5000 });
          } catch {
            await page.waitForSelector('[role="article"]', { timeout: 5000 });
          }
        }
      }
      
      const posts: TwitterPost[] = [];
      const limit = Math.min(options.limit || 10, 100);
      let scrollCount = 0;
      const maxScrolls = Math.ceil(limit / 10);
      
      while (posts.length < limit && scrollCount < maxScrolls) {
        const newPosts = await this.extractPosts(page, options);
        
        const uniquePosts = newPosts.filter(post => 
          !posts.some(existing => existing.id === post.id)
        );
        
        posts.push(...uniquePosts);
        
        if (newPosts.length === 0) break;
        
        await page.evaluate(() => (window as any).scrollTo(0, (document as any).body.scrollHeight));
        await page.waitForTimeout(500);
        scrollCount++;
      }
      
      return posts.slice(0, limit);
      
    } catch (error) {
      throw new Error(`Scraping failed: ${(error as Error).message}`);
    } finally {
      await browser.close();
    }
  }
  
  private async extractPosts(page: Page, options: GetOptions): Promise<TwitterPost[]> {
    return await page.evaluate((opts) => {
      // Try multiple selectors for tweets
      let tweets = (document as any).querySelectorAll('article[data-testid="tweet"]');
      if (tweets.length === 0) {
        tweets = (document as any).querySelectorAll('[data-testid="tweet"]');
      }
      if (tweets.length === 0) {
        tweets = (document as any).querySelectorAll('article');
      }
      if (tweets.length === 0) {
        tweets = (document as any).querySelectorAll('[role="article"]');
      }
      
      if (opts.debug) {
        console.log(`🐛 Found ${tweets.length} tweet elements`);
        if (tweets.length > 0) {
          console.log('First tweet HTML:', tweets[0].outerHTML.slice(0, 300));
        }
      }
      const posts: any[] = [];
      
      tweets.forEach((tweet: any, index: number) => {
        try {
          // Extract tweet text
          let textElement = tweet.querySelector('[data-testid="tweetText"]');
          if (!textElement) textElement = tweet.querySelector('[lang]');
          if (!textElement) textElement = tweet.querySelector('div[dir="auto"]');
          if (!textElement) textElement = tweet.querySelector('span');
          
          const text = textElement?.textContent || textElement?.innerText || "";
          
          if (opts.debug && index === 0) {
            console.log('🐛 Tweet element selectors tried:');
            console.log('- [data-testid="tweetText"]:', !!tweet.querySelector('[data-testid="tweetText"]'));
            console.log('- [lang]:', !!tweet.querySelector('[lang]'));
            console.log('- div[dir="auto"]:', !!tweet.querySelector('div[dir="auto"]'));
            console.log('- span:', !!tweet.querySelector('span'));
            console.log('🐛 First tweet text:', text.slice(0, 100));
            console.log('🐛 Tweet innerHTML sample:', tweet.innerHTML.slice(0, 500));
          }
          
          // Extract user info
          let authorElement = tweet.querySelector('[data-testid="User-Name"]');
          if (!authorElement) authorElement = tweet.querySelector('[data-testid="User-Names"]');
          if (!authorElement) authorElement = tweet.querySelector('a[href*="/"]');
          
          let username = "";
          let displayName = "";
          
          if (authorElement) {
            const href = authorElement.href || authorElement.querySelector('a')?.href || "";
            username = href.split('/').pop() || "";
            displayName = authorElement.textContent?.split('@')[0]?.trim() || "";
          }
          
          const timeElement = tweet.querySelector('time');
          const timestamp = timeElement?.getAttribute('datetime') || new Date().toISOString();
          
          const verifiedElement = tweet.querySelector('[data-testid="icon-verified"]');
          const verified = !!verifiedElement;
          
          // Extract engagement metrics
          const likeElement = tweet.querySelector('[data-testid="like"]');
          const likes = parseInt(likeElement?.textContent?.replace(/[^\d]/g, '') || '0');
          
          const retweetElement = tweet.querySelector('[data-testid="retweet"]');
          const retweets = parseInt(retweetElement?.textContent?.replace(/[^\d]/g, '') || '0');
          
          const replyElement = tweet.querySelector('[data-testid="reply"]');
          const replies = parseInt(replyElement?.textContent?.replace(/[^\d]/g, '') || '0');
          
          // Check if it's a retweet or reply
          const isRetweet = !!tweet.querySelector('[data-testid="socialContext"]');
          const isReply = !!tweet.querySelector('[data-testid="tweet"] [data-testid="tweet"]');
          
          // Extract media URLs
          const mediaUrls: string[] = [];
          
          const imgElements = tweet.querySelectorAll('img[src]');
          const videoElements = tweet.querySelectorAll('video[src], video source[src]');
          
          imgElements.forEach((img: any) => {
            const src = img.getAttribute('src');
            if (src && 
                (src.includes('pbs.twimg.com') || src.includes('video.twimg.com')) &&
                !src.includes('profile_images') &&
                !src.includes('profile_banners')) {
              mediaUrls.push(src);
            }
          });
          
          videoElements.forEach((video: any) => {
            const src = video.getAttribute('src');
            if (src && src.includes('video.twimg.com')) {
              mediaUrls.push(src);
            }
          });
          
          if (opts.debug && index === 0 && mediaUrls.length > 0) {
            console.log('🐛 Found media URLs:', mediaUrls);
          }
          
          // Extract hashtags and mentions
          const hashtags = Array.from(text.matchAll(/#\w+/g)).map((match: any) => match[0]);
          const mentions = Array.from(text.matchAll(/@\w+/g)).map((match: any) => match[0]);
          
          // Generate a simple ID based on content hash
          const textHash = text.slice(0, 20).replace(/[^\w]/g, '').toLowerCase();
          const timeHash = new Date(timestamp).getTime().toString(36);
          const id = `${username}_${timeHash}_${textHash}`;
          
          const post: any = {
            id,
            text,
            author: {
              username,
              displayName,
              verified
            },
            timestamp,
            likes,
            retweets,
            replies,
            isRetweet,
            isReply,
            mediaUrls,
            hashtags,
            mentions
          };
          
          if (opts.debug && index === 0) {
            console.log('🐛 Generated post:', JSON.stringify(post, null, 2));
          }
          
          // Apply basic filters
          if (text.trim().length > 0) {
            posts.push(post);
            if (opts.debug) {
              console.log(`🐛 Added post ${index + 1}, total: ${posts.length}`);
            }
          } else if (opts.debug) {
            console.log(`🐛 Skipped empty post ${index + 1}`);
          }
          
        } catch (error) {
          console.warn('Error extracting tweet:', error);
        }
      });
      
      return posts;
    }, options);
  }
  
  private buildSearchQuery(options: GetOptions): string {
    let query = options.search || "";
    
    if (options.from) {
      query += ` from:${options.from.replace('@', '')}`;
    }
    
    if (options.since) {
      query += ` since:${options.since}`;
    }
    
    if (options.until) {
      query += ` until:${options.until}`;
    }
    
    if (options.hashtag) {
      query += ` ${options.hashtag}`;
    }
    
    if (options.lang) {
      query += ` lang:${options.lang}`;
    }
    
    if (!options.replies) {
      query += " -filter:replies";
    }
    
    if (!options.retweets) {
      query += " -filter:retweets";
    }
    
    if (options.verified) {
      query += " filter:verified";
    }
    
    return query.trim();
  }
}

// Formatter
function formatOutput(
  posts: TwitterPost[], 
  format: "table" | "json",
  options: { verbose?: boolean; includeMedia?: boolean } = {}
): string {
  if (format === "json") {
    return JSON.stringify(posts, null, 2);
  }
  
  // Table format
  let output = "";
  
  posts.forEach((post, index) => {
    if (index > 0) output += "\n" + "─".repeat(80) + "\n";
    
    // Header
    const verifiedMark = post.author.verified ? " ✓" : "";
    output += `@${post.author.username}${verifiedMark} (${post.author.displayName})\n`;
    output += `📅 ${new Date(post.timestamp).toLocaleString()}\n`;
    
    // Content
    output += `\n${post.text}\n`;
    
    // Media
    if (options.includeMedia && post.mediaUrls.length > 0) {
      output += `\n📷 Media: ${post.mediaUrls.length} item(s)\n`;
      post.mediaUrls.forEach((url, idx) => {
        output += `Media ${idx + 1}: ${url}\n`;
      });
    }
    
    // Engagement
    output += `\n💖 ${post.likes}  🔄 ${post.retweets}  💬 ${post.replies}`;
    
    // Tags
    if (post.hashtags.length > 0) {
      output += `\n🏷️  ${post.hashtags.join(" ")}`;
    }
    
    if (options.verbose) {
      if (post.mentions.length > 0) {
        output += `\n👥 ${post.mentions.join(" ")}`;
      }
      
      const flags = [];
      if (post.isRetweet) flags.push("RT");
      if (post.isReply) flags.push("Reply");
      if (flags.length > 0) {
        output += `\n🏳️  ${flags.join(", ")}`;
      }
    }
  });
  
  if (posts.length === 0) {
    output = "No posts found matching the criteria.";
  } else {
    output = `Found ${posts.length} post(s):\n\n${output}`;
  }
  
  return output;
}

// CLI
const scraper = new TwitterScraper();
const auth = new AuthManager();

await new Command()
  .name("tw")
  .version("1.0.0")
  .description("Twitter post scraper without API")
  
  .command("login", "Login to Twitter")
  .action(async () => {
    console.log(colors.blue("🔐 Logging in to Twitter..."));
    try {
      await auth.login();
      console.log(colors.green("✅ Login successful!"));
    } catch (error) {
      console.error(colors.red("❌ Login failed:"), (error as Error).message);
      Deno.exit(1);
    }
  })
  
  .command("logout", "Clear stored credentials")
  .action(async () => {
    await auth.logout();
    console.log(colors.green("✅ Logged out successfully"));
  })
  
  .command("get", "Get Twitter posts")
  .option("--from <username>", "Posts from specific user")
  .option("--since <date>", "Posts since date (YYYY-MM-DD)")
  .option("--until <date>", "Posts until date (YYYY-MM-DD)")
  .option("--limit <number>", "Number of posts", { default: 10 })
  .option("--search <keyword>", "Search for posts containing keyword")
  .option("--replies", "Include replies", { default: false })
  .option("--retweets", "Include retweets", { default: false })
  .option("--format <type>", "Output format (table|json)", { default: "table" })
  .option("--output <file>", "Save output to file (works with any format)")
  .option("--verbose", "Show additional metadata", { default: false })
  .option("--no-media", "Exclude media URLs", { default: false })
  .option("--lang <code>", "Posts in specific language")
  .option("--verified", "Only verified users", { default: false })
  .option("--min-likes <number>", "Minimum like count", { default: 0 })
  .option("--hashtag <tag>", "Posts with specific hashtag")
  .option("--debug", "Show debug information", { default: false })
  .action(async (options: any) => {
    if (!await auth.isLoggedIn()) {
      console.error(colors.red("❌ Please login first: tw login"));
      Deno.exit(1);
    }
    
    try {
      if (options.debug) {
        console.log("🐛 CLI Options:", JSON.stringify(options, null, 2));
      }
      
      // JSON出力の場合は余計なメッセージを表示しない
      if (options.format !== "json") {
        console.log(colors.blue("🔍 Scraping Twitter posts..."));
      }
      
      const posts = await scraper.getPosts(options as GetOptions);
      
      const output = formatOutput(posts, options.format as "table" | "json", {
        verbose: options.verbose,
        includeMedia: options.media !== false
      });
      
      if (options.output) {
        await Deno.writeTextFile(options.output, output);
        console.log(colors.green(`✅ Results saved to ${options.output}`));
      } else {
        console.log(output);
      }
      
    } catch (error) {
      console.error(colors.red("❌ Failed to get posts:"), (error as Error).message);
      Deno.exit(1);
    }
  })
  
  .parse(Deno.args);