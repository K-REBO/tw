# Twitter Scraper CLI (tw)

TwitterのAPIを使わずに投稿を取得するコマンドラインツールです。DenoとPlaywrightを使用しています。

[English README](README.md)

## インストール

```bash
# 実行可能にする
chmod +x tw

# または単一ファイル版を使用
chmod +x tw-single.ts
```

## 基本的な使用方法

### 1. ログイン
```bash
./tw login

# ログイン時にブラウザウィンドウを表示
./tw login --show-browser

# 既存のFirefoxプロファイルを使用（既にログイン済みの場合は自動）
./tw login --use-profile
```
デフォルトでは、ログインはヘッドレスモードで実行されます。ブラウザウィンドウを表示するには`--show-browser`を使用してください。

### 2. 投稿取得
```bash
# 最新10件の投稿を取得
./tw get

# 特定ユーザーの投稿
./tw get --from @username

# キーワード検索
./tw get --search "TypeScript"

# ブックマークした投稿を取得
./tw get --bookmark

# ユーザー + キーワード検索
./tw get --from @username --search "keyword"

# JSON形式で出力
./tw get --format json

# ファイルに保存
./tw get --output tweets.json

# パイプでjqに渡す
./tw get --format json | jq '.[].author.username'

# スクレイピング中にブラウザを表示（デバッグ用）
./tw get --show-browser
```

### 3. ログアウト
```bash
./tw logout
```

## 主要なオプション

| オプション | 説明 | デフォルト |
|---|---|---|
| `--from <user>` | 特定ユーザーの投稿 | - |
| `--search <keyword>` | キーワード検索 | - |
| `--limit <number>` | 取得件数 (制限なし) | 10 |
| `--since <date>` | 開始日 (YYYY-MM-DD) | - |
| `--until <date>` | 終了日 (YYYY-MM-DD) | - |
| `--format <type>` | 出力形式 (table/json) | table |
| `--output <file>` | ファイル出力 | - |
| `--lang <code>` | 言語コード (ja, en等) | - |
| `--min-likes <number>` | 最低いいね数 | 0 |
| `--verified` | 認証済みユーザーのみ | false |
| `--no-media` | メディアURL非表示 | false |
| `--bookmark` | ブックマーク投稿を取得 | false |

## 高度なオプション

| オプション | 説明 | デフォルト |
|---|---|---|
| `--show-browser` | ブラウザウィンドウを表示 (デフォルト: ヘッドレス) | false |
| `--auth-file <path>` | 認証ファイルのパスを指定 | `./twitter-auth.json` |
| `--use-profile` | 既存のFirefoxプロファイルでログイン | false |
| `--debug` | デバッグ情報とブラウザを表示 | false |

### Firefoxプロファイルの使用

既存のFirefoxプロファイルを使用してログインする場合（二要素認証を回避するなど）、`--profile`オプションを使用できます。

1.  Firefoxのプロファイルパスを見つけます。
    -   **macOS:** `~/Library/Application Support/Firefox/Profiles/<あなたのプロファイル>`
    -   **Linux:** `~/.mozilla/firefox/<あなたのプロファイル>`
    -   **Windows:** `%APPDATA%\Mozilla\Firefox\Profiles\<あなたのプロファイル>`
2.  プロファイルパスを指定してloginコマンドを実行します。

```bash
./tw login --use-profile --show-browser
```

これにより既存のブラウザセッションが再利用されるため、パスワードの再入力が不要になる場合があります。

## 実用例

```bash
# 日本語のAI関連ツイートを取得
./tw get --search "人工知能" --lang ja --limit 20

# 高エンゲージメントのツイートを検索
./tw get --search "TypeScript" --min-likes 50 --verified

# 特定期間のツイートをJSON形式で保存
./tw get --search "機械学習" --since 2024-01-01 --format json --output ml-tweets.json

# ブックマーク投稿を取得
./tw get --bookmark --limit 50 --format json

# 複数条件でフィルタリング
./tw get --from @username --search "キーワード" --limit 30

# デバッグモードでブラウザ表示
./tw get --debug --show-browser --limit 5

# 特定ユーザーの詳細情報付きツイート
./tw get --from @photographer --verbose

# 過去1週間の高評価ツイート
./tw get --search "プログラミング" --since 2024-08-05 --min-likes 100
```

## 出力例

### テーブル形式
```
@username ✓ (Display Name)
📅 2025/8/12 10:30:00

こんにちは世界！ #サンプル

📷 Media: 1 item(s)
Media 1: https://pbs.twimg.com/media/example.jpg

💖 42  🔄 7  💬 3
🏷️  #サンプル
```

### JSON形式
```json
[{
  "id": "username_abc123_hello",
  "text": "こんにちは世界！ #サンプル",
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
  "hashtags": ["#サンプル"]
}]
```

## 高度な使用例

### データ分析との組み合わせ
```bash
# 特定トピックのツイートデータを収集
./tw-single.ts get --search "React" --lang ja --limit 100 --format json --output react-tweets.json

# jqで集計処理
./tw-single.ts get --search "AI" --format json | jq '.[] | select(.likes > 50) | .text'

# いいね数順でソート
./tw-single.ts get --format json | jq 'sort_by(.likes) | reverse | .[0:10]'
```

### 定期的なモニタリング
```bash
# 特定キーワードを監視
./tw-single.ts get --search "障害 OR エラー" --verified --limit 20

# 企業アカウントの最新情報
./tw-single.ts get --from @company_official --limit 5
```

## 全オプション一覧

| オプション | 説明 | 例 |
|---|---|---|
| `--from <user>` | 特定ユーザー | `--from @elonmusk` |
| `--search <keyword>` | キーワード | `--search "機械学習"` |
| `--limit <number>` | 件数制限 | `--limit 50` |
| `--since <date>` | 開始日 | `--since 2024-01-01` |
| `--until <date>` | 終了日 | `--until 2024-12-31` |
| `--lang <code>` | 言語 | `--lang ja` |
| `--min-likes <number>` | 最低いいね数 | `--min-likes 100` |
| `--hashtag <tag>` | ハッシュタグ | `--hashtag "#AI"` |
| `--verified` | 認証済みのみ | `--verified` |
| `--replies` | リプライ含む | `--replies` |
| `--retweets` | リツイート含む | `--retweets` |
| `--format <type>` | 出力形式 | `--format json` |
| `--output <file>` | ファイル出力 | `--output tweets.json` |
| `--verbose` | 詳細表示 | `--verbose` |
| `--no-media` | メディア非表示 | `--no-media` |
| `--debug` | デバッグ情報 | `--debug` |
| `--headless` | ヘッドレスモードで実行 | `--headless` |
| `--auth-file <path>` | 認証ファイルのパス | `--auth-file /path/to/auth.json` |
| `--profile <path>` | Firefoxプロファイルのパス | `--profile /path/to/firefox/profile` |

## 必要環境

- Deno 1.37以上
- インターネット接続
- Firefoxブラウザ（初回ログイン時のみ）

## トラブルシューティング

### ログインできない場合
```bash
# 認証情報をリセット
./tw-single.ts logout
./tw-single.ts login

# デバッグモードで確認
./tw-single.ts get --debug --limit 1
```

### ツイートが取得できない場合
- 認証が期限切れの可能性があります（7日間有効）
- Twitterの仕様変更により一時的に動作しない可能性があります
- `--debug`オプションで詳細を確認してください

## 注意事項

- **利用規約の遵守**: Twitterの利用規約を必ず守ってください
- **節度ある使用**: 過度なスクレイピングはアカウント制限の原因となります
- **認証情報**: `twitter-auth.json`ファイルは安全に管理してください
- **プライバシー**: 取得したデータの取り扱いには注意してください

## ライセンス

MIT License