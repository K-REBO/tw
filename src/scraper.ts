import type { TwitterPost, GetOptions } from "./types.ts";
import { AuthManager } from "./auth.ts";

export class TwitterScraper {
  private auth: AuthManager;
  
  constructor(authManager?: AuthManager) {
    this.auth = authManager || new AuthManager();
  }
  
  async getPosts(options: GetOptions & { debug?: boolean; headless?: boolean }): Promise<TwitterPost[]> {
    // Dynamic import for faster CLI startup
    const { firefox } = await import("npm:playwright@^1.40.0");
    // Simple headless logic: default true, false only for debug or explicit --no-headless
    const headless = options.debug ? false : (options.headless ?? true);
    const browser = await firefox.launch({ headless });
    const page = await browser.newPage();
    
    try {
      // Load authentication
      const authData = await this.auth.getAuthData();
      await page.context().addCookies(authData.cookies);
      await page.setExtraHTTPHeaders({ 'User-Agent': authData.userAgent });
      
      let url = "https://x.com/home";
      
      // Build URL based on options
      if (options.bookmark) {
        // ブックマークページに移動
        url = "https://x.com/i/bookmarks";
      } else if (options.search || (options.from && options.search)) {
        // 検索が指定されている場合（fromとの併用も含む）
        const searchParams = new URLSearchParams({
          q: this.buildSearchQuery(options),
          src: "typed_query",
          f: "live"  // または "top" for top tweets
        });
        url = `https://x.com/search?${searchParams.toString()}`;
      } else if (options.from) {
        // fromのみが指定されている場合
        url = `https://x.com/${options.from.replace('@', '')}`;
      }
      
      if (options.debug) {
        console.log("🔍 Navigating to URL:", url);
      }
      
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      
      if (options.debug) {
        console.log("🔍 Current URL after navigation:", page.url());
        console.log("🔍 Page title:", await page.title());
        
        // Check if redirected to login
        const currentUrl = page.url();
        if (currentUrl.includes("/login") || currentUrl.includes("/i/flow/login")) {
          console.log("⚠️  Redirected to login page - authentication may have failed");
        }
      }
      
      // Wait a bit for dynamic content to load
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
          
          // Check body content
          results.bodyText = document.body?.innerText?.slice(0, 200) || 'No body text';
          results.htmlLength = document.documentElement?.outerHTML?.length || 0;
          
          // Check for common error/loading indicators
          results.hasLoginForm = !!document.querySelector('input[name="text"]') || !!document.querySelector('input[data-testid="ocfEnterTextTextInput"]');
          results.hasLoadingSpinner = !!document.querySelector('[data-testid="spinner"]') || !!document.querySelector('[aria-label="Loading"]');
          results.hasErrorMessage = document.body?.innerText?.includes('Something went wrong') || document.body?.innerText?.includes('Try again');
          
          // Get first few elements to see structure
          const firstArticle = document.querySelector('article');
          results.firstArticleHTML = firstArticle ? firstArticle.outerHTML.slice(0, 500) : 'No article found';
          
          return results;
        });
        
        console.log("Selector results:", debugInfo);
      }
      
      // Wait for tweets to load - try multiple selectors
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
      const limit = options.limit || 10;
      let scrollCount = 0;
      let noNewPostsCount = 0;
      const maxScrolls = Math.max(limit, 20); // より多くのスクロールを許可
      
      while (posts.length < limit && scrollCount < maxScrolls) {
        const newPosts = await this.extractPosts(page, options);
        
        // Filter duplicates
        const uniquePosts = newPosts.filter(post => 
          !posts.some(existing => existing.id === post.id)
        );
        
        posts.push(...uniquePosts);
        
        if (options.debug) {
          console.log(`🐛 Scroll ${scrollCount + 1}: Found ${newPosts.length} posts, ${uniquePosts.length} unique. Total: ${posts.length}/${limit}`);
        }
        
        if (uniquePosts.length === 0) {
          noNewPostsCount++;
          // 連続で3回新しいポストが見つからなかったら終了
          if (noNewPostsCount >= 3) {
            if (options.debug) {
              console.log("🐛 No new posts found after 3 attempts, stopping");
            }
            break;
          }
        } else {
          noNewPostsCount = 0; // リセット
        }
        
        // Scroll to load more tweets
        await page.evaluate(() => (window as any).scrollTo(0, (document as any).body.scrollHeight));
        await page.waitForTimeout(1000); // 待機時間を延長
        scrollCount++;
      }
      
      return posts.slice(0, limit);
      
    } catch (error) {
      throw new Error(`Scraping failed: ${(error as Error).message}`);
    } finally {
      await browser.close();
    }
  }
  
  private async extractPosts(page: any, options: GetOptions & { debug?: boolean }): Promise<TwitterPost[]> {
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
          // Try multiple selectors for tweet text
          let textElement = tweet.querySelector('[data-testid="tweetText"]');
          if (!textElement) textElement = tweet.querySelector('[lang]'); // tweets often have lang attribute
          if (!textElement) textElement = tweet.querySelector('div[dir="auto"]'); // dir=auto is common
          if (!textElement) textElement = tweet.querySelector('span'); // fallback to span
          
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
          
          // Try multiple selectors for user info
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
          
          // Try multiple selectors for media
          const imgElements = tweet.querySelectorAll('img[src]');
          const videoElements = tweet.querySelectorAll('video[src], video source[src]');
          
          // Process images
          imgElements.forEach((img: any) => {
            const src = img.getAttribute('src');
            if (src && 
                (src.includes('pbs.twimg.com') || src.includes('video.twimg.com')) &&
                !src.includes('profile_images') &&
                !src.includes('profile_banners')) {
              mediaUrls.push(src);
            }
          });
          
          // Process videos  
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
            console.log(`🐛 Skipped post ${index + 1} (empty or filtered)`);
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
  
  private shouldIncludePost(post: TwitterPost, options: GetOptions): boolean {
    if (!options.replies && post.isReply) return false;
    if (!options.retweets && post.isRetweet) return false;
    if (options.verified && !post.author.verified) return false;
    if (options.minLikes && post.likes < options.minLikes) return false;
    
    if (options.since) {
      const sinceDate = new Date(options.since);
      const postDate = new Date(post.timestamp);
      if (postDate < sinceDate) return false;
    }
    
    if (options.until) {
      const untilDate = new Date(options.until);
      const postDate = new Date(post.timestamp);
      if (postDate > untilDate) return false;
    }
    
    return true;
  }
}
