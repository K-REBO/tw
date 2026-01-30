#!/usr/bin/env bash
set -euo pipefail

# 設定
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
USER_LIST="${SCRIPT_DIR}/user.list"
REPLIED_CACHE="${SCRIPT_DIR}/replied.url"
REPLY_TEXT="中大引退は2/12(木)です"  # 固定リプライテキスト

# 自身のフォロワーを取得してuser.listを更新
echo "Fetching my followers..."
my_username=$(tw user)
echo "Logged in as: @${my_username}"

"${SCRIPT_DIR}/get-follow-list.ts" "$my_username" followers | sed 's/^/@/' > "$USER_LIST"
echo "Updated $USER_LIST with $(wc -l < "$USER_LIST") followers"

# キャッシュファイルがなければ作成
touch "$REPLIED_CACHE"

# user.listの各ユーザーを処理
while IFS= read -r username || [[ -n "$username" ]]; do
    # 空行やコメント行をスキップ
    [[ -z "$username" || "$username" =~ ^# ]] && continue

    # @を除去
    clean_username="${username#@}"

    echo "Checking @${clean_username}..."

    # 最新ツイートを取得
    if ! tweet_json=$("${SCRIPT_DIR}/get-latest-tweet.ts" "$clean_username" --json 2>/dev/null); then
        echo "  Failed to get tweet for @${clean_username}" >&2
        continue
    fi

    # JSONからURLを抽出
    tweet_url=$(echo "$tweet_json" | jq -r '.url // empty')

    if [[ -z "$tweet_url" ]]; then
        echo "  No tweet found for @${clean_username}"
        continue
    fi

    # キャッシュ確認（既にリプライ済みかチェック）
    if grep -qF "$tweet_url" "$REPLIED_CACHE"; then
        echo "  Already replied: $tweet_url"
        continue
    fi

    # リプライ実行
    echo "  Replying to: $tweet_url"
    if tw reply "$tweet_url" "$REPLY_TEXT"; then
        # 成功したらキャッシュに追加
        echo "$tweet_url" >> "$REPLIED_CACHE"
        echo "  Done!"
    else
        echo "  Failed to reply" >&2
    fi

done < "$USER_LIST"

echo "Completed."
