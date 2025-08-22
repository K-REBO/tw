# Twitter Scraper CLI (tw)

A command-line tool for scraping Twitter posts without using the official API. Built with Deno and Playwright.

[日本語版 README](README.ja.md)

## Installation

```bash
# Make executable
chmod +x tw

# Or use single file version
chmod +x tw-single.ts
```

## Basic Usage

### 1. Login
```bash
./tw login

# Show browser window during login
./tw login --show-browser

# Use existing Firefox profile (automatic if already logged in)
./tw login --use-profile
```
By default, login runs in headless mode. Use `--show-browser` to see the browser window.

### 2. Get Posts
```bash
# Get latest 10 posts
./tw get

# Get posts from specific user
./tw get --from @username

# Search by keyword
./tw get --search "TypeScript"

# Get bookmarked posts
./tw get --bookmark

# Combine user and keyword search
./tw get --from @username --search "keyword"

# Output as JSON
./tw get --format json

# Save to file
./tw get --output tweets.json

# Pipe to jq
./tw get --format json | jq '.[].author.username'

# Show browser during scraping (for debugging)
./tw get --show-browser
```

### 3. Logout
```bash
./tw logout
```

## Main Options

| Option | Description | Default |
|---|---|---|
| `--from <user>` | Posts from specific user | - |
| `--search <keyword>` | Search by keyword | - |
| `--limit <number>` | Number of posts (no limit) | 10 |
| `--since <date>` | Posts since date (YYYY-MM-DD) | - |
| `--until <date>` | Posts until date (YYYY-MM-DD) | - |
| `--format <type>` | Output format (table/json) | table |
| `--output <file>` | Save to file | - |
| `--lang <code>` | Language code (ja, en, etc.) | - |
| `--min-likes <number>` | Minimum like count | 0 |
| `--verified` | Verified users only | false |
| `--no-media` | Hide media URLs | false |
| `--bookmark` | Get bookmarked posts | false |

## Advanced Options

| Option | Description | Default |
|---|---|---|
| `--show-browser` | Show browser window (default: headless) | false |
| `--auth-file <path>` | Specify authentication file path | `./twitter-auth.json` |
| `--use-profile` | Use existing Firefox profile for login | false |
| `--debug` | Show debug information with browser | false |

### Using a Firefox Profile

If you want to use your existing Firefox profile for login (e.g., to avoid 2FA), you can use the `--profile` option.

1.  Find your Firefox profile path.
    -   **macOS:** `~/Library/Application Support/Firefox/Profiles/<your-profile>`
    -   **Linux:** `~/.mozilla/firefox/<your-profile>`
    -   **Windows:** `%APPDATA%\Mozilla\Firefox\Profiles\<your-profile>`
2.  Run the login command with the profile path.

```bash
./tw login --use-profile --show-browser
```

This will reuse your existing browser session, so you may not need to enter your password.

## Practical Examples

```bash
# Get AI-related tweets in English
./tw get --search "artificial intelligence" --lang en --limit 20

# Search high-engagement tweets
./tw get --search "TypeScript" --min-likes 50 --verified

# Save tweets from specific period as JSON
./tw get --search "machine learning" --since 2024-01-01 --format json --output ml-tweets.json

# Get bookmarked posts
./tw get --bookmark --limit 50 --format json

# Multiple condition filtering
./tw get --from @username --search "keyword" --limit 30

# Debug mode with browser visible
./tw get --debug --show-browser --limit 5
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