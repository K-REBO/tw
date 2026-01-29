#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write --allow-env --allow-sys --allow-run

import { Command } from "https://deno.land/x/cliffy@v1.0.0-rc.4/command/mod.ts";
import * as colors from "https://deno.land/std@0.224.0/fmt/colors.ts";
import { TwitterScraper } from "./src/scraper.ts";
import { AuthManager } from "./src/auth.ts";
import { formatOutput } from "./src/formatter.ts";
import { InteractiveSession } from "./src/interactive.ts";
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
  
  .command("interactive", "Start interactive session with persistent browser")
  .option("--auth-file <path>", "Custom path for twitter-auth.json", { default: "./twitter-auth.json" })
  .option("--show-browser", "Show browser window (default: headless)", { default: false })
  .action(async (options: any) => {
    const auth = new AuthManager(options.authFile);

    if (!await auth.isLoggedIn()) {
      console.error(colors.red("❌ Please login first: tw login"));
      Deno.exit(1);
    }

    const session = new InteractiveSession(auth);

    console.log(colors.blue("🚀 Starting interactive session..."));
    console.log(colors.gray("   Polling login status every 3 minutes"));
    console.log(colors.gray("   Type 'help' for commands, 'exit' to quit\n"));

    try {
      await session.start({ headless: !options.showBrowser });

      const username = await session.getUsername();
      console.log(colors.green(`✅ Logged in as @${username}\n`));

      // Read commands from stdin
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();

      while (session.running) {
        await Deno.stdout.write(encoder.encode(colors.cyan("tw> ")));

        const buf = new Uint8Array(1024);
        const n = await Deno.stdin.read(buf);
        if (n === null) break;

        const line = decoder.decode(buf.subarray(0, n)).trim();
        if (!line) continue;

        const parts = line.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
        const cmd = parts[0]?.toLowerCase();
        const args = parts.slice(1).map(s => s.replace(/^"|"$/g, ''));

        try {
          switch (cmd) {
            case "help":
              console.log(`
${colors.bold("Commands:")}
  post <text>           Post a tweet
  reply <url> <text>    Reply to a tweet
  quote <url> <text>    Quote a tweet
  user                  Show current username
  exit                  Exit interactive mode
`);
              break;

            case "post":
              if (!args[0]) {
                console.log(colors.yellow("Usage: post <text>"));
                break;
              }
              console.log(colors.blue("📝 Posting..."));
              await session.post(args[0]);
              console.log(colors.green("✅ Posted!"));
              break;

            case "reply":
              if (!args[0] || !args[1]) {
                console.log(colors.yellow("Usage: reply <url> <text>"));
                break;
              }
              console.log(colors.blue("💬 Replying..."));
              await session.reply(args[0], args[1]);
              console.log(colors.green("✅ Replied!"));
              break;

            case "quote":
              if (!args[0] || !args[1]) {
                console.log(colors.yellow("Usage: quote <url> <text>"));
                break;
              }
              console.log(colors.blue("🔄 Quoting..."));
              await session.quote(args[0], args[1]);
              console.log(colors.green("✅ Quoted!"));
              break;

            case "user":
              const currentUser = await session.getUsername();
              console.log(`@${currentUser}`);
              break;

            case "exit":
            case "quit":
              console.log(colors.blue("👋 Bye!"));
              await session.close();
              Deno.exit(0);
              break;

            default:
              console.log(colors.yellow(`Unknown command: ${cmd}. Type 'help' for available commands.`));
          }
        } catch (error) {
          console.error(colors.red(`❌ Error: ${(error as Error).message}`));
        }
      }
    } catch (error) {
      console.error(colors.red("❌ Failed to start session:"), (error as Error).message);
      Deno.exit(1);
    } finally {
      await session.close();
    }
  })

  .command("user", "Show current logged-in user")
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
      const username = await scraper.getUsername({ headless: !options.showBrowser });
      console.log(username);
    } catch (error) {
      console.error(colors.red("❌ Failed to get username:"), (error as Error).message);
      Deno.exit(1);
    }
  })

  .command("post <text:string>", "Post a tweet")
  .option("--auth-file <path>", "Custom path for twitter-auth.json", { default: "./twitter-auth.json" })
  .option("--show-browser", "Show browser window (default: headless)", { default: false })
  .option("--debug", "Show debug information", { default: false })
  .action(async (options: any, text: string) => {
    const auth = new AuthManager(options.authFile);
    const scraper = new TwitterScraper(auth);

    if (!await auth.isLoggedIn()) {
      console.error(colors.red("❌ Please login first: tw login"));
      Deno.exit(1);
    }

    try {
      console.log(colors.blue("📝 Posting to Twitter..."));

      const result = await scraper.post(text, {
        debug: options.debug,
        headless: !options.showBrowser
      });

      if (result.success) {
        console.log(colors.green("✅ Posted successfully!"));
        if (result.url) {
          console.log(colors.cyan(`🔗 ${result.url}`));
        }
      }
    } catch (error) {
      console.error(colors.red("❌ Failed to post:"), (error as Error).message);
      Deno.exit(1);
    }
  })

  .command("reply <url:string> <text:string>", "Reply to a tweet")
  .option("--auth-file <path>", "Custom path for twitter-auth.json", { default: "./twitter-auth.json" })
  .option("--show-browser", "Show browser window (default: headless)", { default: false })
  .option("--debug", "Show debug information", { default: false })
  .action(async (options: any, url: string, text: string) => {
    const auth = new AuthManager(options.authFile);
    const scraper = new TwitterScraper(auth);

    if (!await auth.isLoggedIn()) {
      console.error(colors.red("❌ Please login first: tw login"));
      Deno.exit(1);
    }

    try {
      console.log(colors.blue("💬 Replying to tweet..."));

      const result = await scraper.reply(url, text, {
        debug: options.debug,
        headless: !options.showBrowser
      });

      if (result.success) {
        console.log(colors.green("✅ Replied successfully!"));
        if (result.url) {
          console.log(colors.cyan(`🔗 ${result.url}`));
        }
      }
    } catch (error) {
      console.error(colors.red("❌ Failed to reply:"), (error as Error).message);
      Deno.exit(1);
    }
  })

  .command("quote <url:string> <text:string>", "Quote a tweet")
  .option("--auth-file <path>", "Custom path for twitter-auth.json", { default: "./twitter-auth.json" })
  .option("--show-browser", "Show browser window (default: headless)", { default: false })
  .option("--debug", "Show debug information", { default: false })
  .action(async (options: any, url: string, text: string) => {
    const auth = new AuthManager(options.authFile);
    const scraper = new TwitterScraper(auth);

    if (!await auth.isLoggedIn()) {
      console.error(colors.red("❌ Please login first: tw login"));
      Deno.exit(1);
    }

    try {
      console.log(colors.blue("🔄 Quoting tweet..."));

      const result = await scraper.quote(url, text, {
        debug: options.debug,
        headless: !options.showBrowser
      });

      if (result.success) {
        console.log(colors.green("✅ Quoted successfully!"));
        if (result.url) {
          console.log(colors.cyan(`🔗 ${result.url}`));
        }
      }
    } catch (error) {
      console.error(colors.red("❌ Failed to quote:"), (error as Error).message);
      Deno.exit(1);
    }
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
  .option("--format <type>", "Output format (table|json|markdown)", { default: "table" })
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
      
      // JSON/Markdown出力の場合は余計なメッセージを表示しない
      if (options.format !== "json" && options.format !== "markdown") {
        console.log(colors.blue("🔍 Scraping Twitter posts..."));
      }
      
      // Force headless to true unless --show-browser is specified
      const headlessValue = !options.showBrowser;
      
      const posts = await scraper.getPosts({
        ...options as GetOptions,
        headless: headlessValue
      });
      
      const output = formatOutput(posts, options.format as "table" | "json" | "markdown", {
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