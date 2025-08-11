export interface TwitterPost {
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

export interface GetOptions {
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
}

export interface AuthData {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
  }>;
  userAgent: string;
  loginTime: string;
}