# Twitter Scraper CLI (tw)

A command-line tool for scraping Twitter posts without using the official API. Built with Deno and Playwright.

[日本語版 README](README.ja.md)

## Installation

```bash
# Use single file version (recommended)
chmod +x tw-single.ts

# Or install modular version globally
deno task install
```

## Basic Usage

### 1. Login
```bash
./tw-single.ts login
```
Firefox browser will open. Log in to Twitter and press Enter when you see your timeline.

### 2. Get Posts
```bash
# Get latest 10 posts
./tw-single.ts get

# Get posts from specific user
./tw-single.ts get --from @username

# Search by keyword
./tw-single.ts get --search "TypeScript"

# Combine user and keyword search
./tw-single.ts get --from @username --search "keyword"

# Output as JSON
./tw-single.ts get --format json

# Save to file
./tw-single.ts get --output tweets.json

# Pipe to jq
./tw-single.ts get --format json | jq '.[].author.username'
```

### 3. Logout
```bash
./tw-single.ts logout
```

## Main Options

| Option | Description | Default |
|---|---|---|
| `--from <user>` | Posts from specific user | - |
| `--search <keyword>` | Search by keyword | - |
| `--limit <number>` | Number of posts (max: 100) | 10 |
| `--since <date>` | Posts since date (YYYY-MM-DD) | - |
| `--until <date>` | Posts until date (YYYY-MM-DD) | - |
| `--format <type>` | Output format (table/json) | table |
| `--output <file>` | Save to file | - |
| `--lang <code>` | Language code (ja, en, etc.) | - |
| `--min-likes <number>` | Minimum like count | 0 |
| `--verified` | Verified users only | false |
| `--no-media` | Hide media URLs | false |

## Advanced Options

| Option | Description | Default |
|---|---|---|
| `--headless` | Control headless mode. Use `--no-headless` to show browser. | `true` |
| `--auth-file <path>` | Specify authentication file path. | `./twitter-auth.json` |
| `--profile <path>` | Use existing Firefox profile for login. | - |

### Using a Firefox Profile

If you want to use your existing Firefox profile for login (e.g., to avoid 2FA), you can use the `--profile` option.

1.  Find your Firefox profile path.
    -   **macOS:** `~/Library/Application Support/Firefox/Profiles/<your-profile>`
    -   **Linux:** `~/.mozilla/firefox/<your-profile>`
    -   **Windows:** `%APPDATA%\Mozilla\Firefox\Profiles\<your-profile>`
2.  Run the login command with the profile path.

```bash
./tw-single.ts login --profile /path/to/your/firefox/profile
```

This will reuse your existing browser session, so you may not need to enter your password.

## Practical Examples

```bash
# Get AI-related tweets in Japanese
./tw-single.ts get --search "artificial intelligence" --lang en --limit 20

# Search high-engagement tweets
./tw-single.ts get --search "TypeScript" --min-likes 50 --verified

# Save tweets from specific period as JSON
./tw-single.ts get --search "machine learning" --since 2024-01-01 --format json --output ml-tweets.json

# Multiple condition filtering
./tw-single.ts get --from @username --search "keyword" --limit 30
```

## Output Examples

### Table Format
```
@username ✓ (Display Name)
📅 2025/8/12 10:30:00

Hello world! #example

📷 Media: 1 item(s)
Media 1: https://pbs.twimg.com/media/example.jpg

💖 42  🔄 7  💬 3
```

### JSON Format
```json
[{
  "id": "username_abc123_hello",
  "text": "Hello world! #example",
  "author": {
    "username": "username",
    "displayName": "Display Name",
    "verified": true
  },
  "timestamp": "2025-08-12T10:30:00.000Z",
  "likes": 42,
  "retweets": 7,
  "replies": 3,
  "mediaUrls": ["https://pbs.twimg.com/media/example.jpg"],
  "hashtags": ["#example"]
}]
```

## Requirements

- Deno 1.37+
- Internet connection
- Firefox browser (for initial login)

## Important Notes

- Please respect Twitter's Terms of Service
- Excessive scraping may cause account restrictions
- Authentication data is stored in `twitter-auth.json` (valid for 7 days)