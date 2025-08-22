#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write --allow-env --allow-sys --allow-run

import { Command } from "https://deno.land/x/cliffy@v1.0.0-rc.4/command/mod.ts";
import * as colors from "https://deno.land/std@0.224.0/fmt/colors.ts";
import { TwitterScraper } from "./src/scraper.ts";
import { AuthManager } from "./src/auth.ts";
import { formatOutput } from "./src/formatter.ts";
import type { GetOptions } from "./src/types.ts";

// These will be initialized per command with custom auth file path

// Generate time-based version (YYYY.MM.DD format)
const generateVersion = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  return `${year}.${month}.${day}`;
};

await new Command()
  .name("tw")
  .version(generateVersion())
  .description("Twitter post scraper without API")
  .action(function() {
    this.showHelp();
  })
  
  .command("login", "Login to Twitter")
  .option("--auth-file <path>", "Custom path for twitter-auth.json", { default: "./twitter-auth.json" })
  .option("--use-profile", "Use existing Firefox profile (automatic login if already logged in)", { default: false })
  .option("--show-browser", "Show browser window (default: headless)", { default: false })
  .action(async (options: any) => {
    const auth = new AuthManager(options.authFile);
    // Default to headless, unless --show-browser is specified
    const headless = !options.showBrowser;
    console.log(colors.blue("🔐 Logging in to Twitter..."));
    try {
      await auth.login(options.useProfile, headless);
      console.log(colors.green("✅ Login successful!"));
    } catch (error) {
      console.error(colors.red("❌ Login failed:"), (error as Error).message);
      Deno.exit(1);
    }
  })
  
  .command("logout", "Clear stored credentials")
  .option("--auth-file <path>", "Custom path for twitter-auth.json", { default: "./twitter-auth.json" })
  .action(async (options: any) => {
    const auth = new AuthManager(options.authFile);
    await auth.logout();
    console.log(colors.green("✅ Logged out successfully"));
  })
  
  .command("get", "Get Twitter posts")
  .option("--from <username>", "Posts from specific user")
  .option("--since <date>", "Posts since date (YYYY-MM-DD)")
  .option("--until <date>", "Posts until date (YYYY-MM-DD)")
  .option("--limit <number>", "Number of posts", { default: 10 })
  .option("--search <keyword>", "Search for posts containing keyword")
  .option("--bookmark", "Get bookmarked posts", { default: false })
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
  .option("--auth-file <path>", "Custom path for twitter-auth.json", { default: "./twitter-auth.json" })
  .option("--show-browser", "Show browser window (default: headless)", { default: false })
  .action(async (options: any) => {
    const auth = new AuthManager(options.authFile);
    const scraper = new TwitterScraper(auth);
    
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
      
      // Force headless to true unless --show-browser is specified
      const headlessValue = !options.showBrowser;
      
      const posts = await scraper.getPosts({
        ...options as GetOptions,
        headless: headlessValue
      });
      
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