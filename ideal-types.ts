// 理想的なJSON出力の型定義

export interface TwitterPost {
  id: string;                    // 短縮された一意ID
  url?: string;                  // ツイートのURL（取得可能なら）
  text: string;
  author: {
    username: string;            // @username
    displayName: string;         // 表示名
    verified: boolean;
    profileImageUrl?: string;    // プロフィール画像URL
  };
  createdAt: string;            // ISO 8601形式
  engagement: {
    likes: number;
    retweets: number;
    replies: number;
  };
  media: Array<{               // mediaUrlsより構造化
    type: "image" | "video";
    url: string;
    width?: number;
    height?: number;
  }>;
  entities: {                  // hashtagsとmentionsを統合
    hashtags: string[];        // #を除いた値
    mentions: string[];        // @を除いた値
    urls?: Array<{             // 外部リンク
      url: string;
      expandedUrl: string;
      displayUrl: string;
    }>;
  };
  flags: {                     // フラグを統合
    isRetweet: boolean;
    isReply: boolean;
    isQuoted?: boolean;
    lang?: string;             // 検出された言語
  };
}

// 使用例のJSON
const exampleJson: TwitterPost[] = [
  {
    "id": "user_abc123_helloworld",
    "url": "https://x.com/user/status/1234567890",
    "text": "Hello world! #typescript",
    "author": {
      "username": "example_user",
      "displayName": "Example User",
      "verified": true
    },
    "createdAt": "2025-08-12T10:30:00.000Z",
    "engagement": {
      "likes": 42,
      "retweets": 7,
      "replies": 3
    },
    "media": [
      {
        "type": "image",
        "url": "https://pbs.twimg.com/media/example.jpg"
      }
    ],
    "entities": {
      "hashtags": ["typescript"],
      "mentions": ["someone"]
    },
    "flags": {
      "isRetweet": false,
      "isReply": false,
      "lang": "en"
    }
  }
];