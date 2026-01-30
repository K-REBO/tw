/**
 * Twitter GraphQL API Client
 * ブラウザ操作なしで直接APIを叩いて高速化
 */

import type { AuthData } from "./types.ts";
import { ClientTransaction, getOndemandFileUrl, generateHeaders } from "npm:xclienttransaction@0.0.2";

interface TweetResult {
  success: boolean;
  tweetId?: string;
  error?: string;
}

// Bearer token (公開されているWebクライアント用のトークン)
const BEARER_TOKEN = "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

// GraphQL Query IDs (これらは変更される可能性がある)
const QUERY_IDS = {
  CreateTweet: "oB-5XsHNAbjvARJEc8CZFw",
  CreateRetweet: "ojPdsZsimiJrUGLR1sjUtA",
  DeleteTweet: "VaenaVgh5q5ih7kvyVjgtg",
};

export class TwitterAPI {
  private authToken: string;
  private csrfToken: string;
  private userAgent: string;
  private clientTransaction: ClientTransaction | null = null;
  private initialized = false;

  constructor(authData: AuthData) {
    const authTokenCookie = authData.cookies.find(c => c.name === "auth_token");
    const csrfTokenCookie = authData.cookies.find(c => c.name === "ct0");

    if (!authTokenCookie || !csrfTokenCookie) {
      throw new Error("Missing required cookies (auth_token or ct0)");
    }

    this.authToken = authTokenCookie.value;
    this.csrfToken = csrfTokenCookie.value;
    this.userAgent = authData.userAgent;
  }

  /**
   * 初期化: Twitterのホームページからトランザクション生成に必要なデータを取得
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      const headers = {
        ...generateHeaders(),
        "User-Agent": this.userAgent,
        "Cookie": `auth_token=${this.authToken}; ct0=${this.csrfToken}`,
      };

      // ホームページを取得
      const homeResponse = await fetch("https://x.com", {
        headers,
      });
      const homeHtml = await homeResponse.text();

      // ondemand.s ファイルのURLを抽出
      const ondemandUrl = getOndemandFileUrl(homeHtml);
      if (!ondemandUrl) {
        throw new Error("Could not find ondemand.s file URL");
      }

      // ondemand.s ファイルを取得
      const ondemandResponse = await fetch(ondemandUrl, { headers });
      const ondemandJs = await ondemandResponse.text();

      // ClientTransaction を初期化
      this.clientTransaction = new ClientTransaction(homeHtml, ondemandJs);
      this.initialized = true;

    } catch (error) {
      console.error("Failed to initialize ClientTransaction:", error);
      // 初期化に失敗してもフォールバックで動作するようにする
      this.initialized = true;
    }
  }

  private generateTransactionId(method: string, path: string): string {
    if (this.clientTransaction) {
      try {
        return this.clientTransaction.generateTransactionId(method, path);
      } catch {
        // フォールバック: ランダムID
      }
    }

    // フォールバック: ランダムなトランザクションID
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let result = "";
    for (let i = 0; i < 86; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private getHeaders(method: string, path: string): Record<string, string> {
    return {
      "Authorization": `Bearer ${BEARER_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": this.userAgent,
      "X-Csrf-Token": this.csrfToken,
      "X-Twitter-Active-User": "yes",
      "X-Twitter-Auth-Type": "OAuth2Session",
      "X-Twitter-Client-Language": "ja",
      "X-Client-Transaction-Id": this.generateTransactionId(method, path),
      "Cookie": `auth_token=${this.authToken}; ct0=${this.csrfToken}`,
      "Referer": "https://x.com/compose/post",
      "Origin": "https://x.com",
      "Accept": "*/*",
      "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "Sec-Ch-Ua-Platform": '"Linux"',
    };
  }

  async post(text: string): Promise<TweetResult> {
    await this.init();

    const path = `/i/api/graphql/${QUERY_IDS.CreateTweet}/CreateTweet`;
    const url = `https://x.com${path}`;

    const payload = {
      variables: {
        tweet_text: text,
        dark_request: false,
        media: {
          media_entities: [],
          possibly_sensitive: false,
        },
        semantic_annotation_ids: [],
      },
      features: {
        communities_web_enable_tweet_community_results_fetch: true,
        c9s_tweet_anatomy_moderator_badge_enabled: true,
        tweetypie_unmention_optimization_enabled: true,
        responsive_web_edit_tweet_api_enabled: true,
        graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
        view_counts_everywhere_api_enabled: true,
        longform_notetweets_consumption_enabled: true,
        responsive_web_twitter_article_tweet_consumption_enabled: true,
        tweet_awards_web_tipping_enabled: false,
        creator_subscriptions_quote_tweet_preview_enabled: false,
        longform_notetweets_rich_text_read_enabled: true,
        longform_notetweets_inline_media_enabled: true,
        articles_preview_enabled: true,
        rweb_video_timestamps_enabled: true,
        rweb_tipjar_consumption_enabled: true,
        responsive_web_graphql_exclude_directive_enabled: true,
        verified_phone_label_enabled: false,
        freedom_of_speech_not_reach_fetch_enabled: true,
        standardized_nudges_misinfo: true,
        tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
        responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
        responsive_web_graphql_timeline_navigation_enabled: true,
        responsive_web_enhance_cards_enabled: false,
      },
      queryId: QUERY_IDS.CreateTweet,
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: this.getHeaders("POST", path),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `HTTP ${response.status}: ${errorText}` };
      }

      const data = await response.json();

      if (data.errors) {
        return { success: false, error: data.errors[0]?.message || "Unknown error" };
      }

      const tweetId = data.data?.create_tweet?.tweet_results?.result?.rest_id;
      return { success: true, tweetId };

    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async reply(tweetId: string, text: string): Promise<TweetResult> {
    await this.init();

    const path = `/i/api/graphql/${QUERY_IDS.CreateTweet}/CreateTweet`;
    const url = `https://x.com${path}`;

    const payload = {
      variables: {
        tweet_text: text,
        reply: {
          in_reply_to_tweet_id: tweetId,
          exclude_reply_user_ids: [],
        },
        dark_request: false,
        media: {
          media_entities: [],
          possibly_sensitive: false,
        },
        semantic_annotation_ids: [],
      },
      features: {
        communities_web_enable_tweet_community_results_fetch: true,
        c9s_tweet_anatomy_moderator_badge_enabled: true,
        tweetypie_unmention_optimization_enabled: true,
        responsive_web_edit_tweet_api_enabled: true,
        graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
        view_counts_everywhere_api_enabled: true,
        longform_notetweets_consumption_enabled: true,
        responsive_web_twitter_article_tweet_consumption_enabled: true,
        tweet_awards_web_tipping_enabled: false,
        creator_subscriptions_quote_tweet_preview_enabled: false,
        longform_notetweets_rich_text_read_enabled: true,
        longform_notetweets_inline_media_enabled: true,
        articles_preview_enabled: true,
        rweb_video_timestamps_enabled: true,
        rweb_tipjar_consumption_enabled: true,
        responsive_web_graphql_exclude_directive_enabled: true,
        verified_phone_label_enabled: false,
        freedom_of_speech_not_reach_fetch_enabled: true,
        standardized_nudges_misinfo: true,
        tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
        responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
        responsive_web_graphql_timeline_navigation_enabled: true,
        responsive_web_enhance_cards_enabled: false,
      },
      queryId: QUERY_IDS.CreateTweet,
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: this.getHeaders("POST", path),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `HTTP ${response.status}: ${errorText}` };
      }

      const data = await response.json();

      if (data.errors) {
        return { success: false, error: data.errors[0]?.message || "Unknown error" };
      }

      const newTweetId = data.data?.create_tweet?.tweet_results?.result?.rest_id;
      return { success: true, tweetId: newTweetId };

    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async quote(tweetUrl: string, text: string): Promise<TweetResult> {
    await this.init();

    const path = `/i/api/graphql/${QUERY_IDS.CreateTweet}/CreateTweet`;
    const url = `https://x.com${path}`;

    const payload = {
      variables: {
        tweet_text: text,
        attachment_url: tweetUrl,
        dark_request: false,
        media: {
          media_entities: [],
          possibly_sensitive: false,
        },
        semantic_annotation_ids: [],
      },
      features: {
        communities_web_enable_tweet_community_results_fetch: true,
        c9s_tweet_anatomy_moderator_badge_enabled: true,
        tweetypie_unmention_optimization_enabled: true,
        responsive_web_edit_tweet_api_enabled: true,
        graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
        view_counts_everywhere_api_enabled: true,
        longform_notetweets_consumption_enabled: true,
        responsive_web_twitter_article_tweet_consumption_enabled: true,
        tweet_awards_web_tipping_enabled: false,
        creator_subscriptions_quote_tweet_preview_enabled: false,
        longform_notetweets_rich_text_read_enabled: true,
        longform_notetweets_inline_media_enabled: true,
        articles_preview_enabled: true,
        rweb_video_timestamps_enabled: true,
        rweb_tipjar_consumption_enabled: true,
        responsive_web_graphql_exclude_directive_enabled: true,
        verified_phone_label_enabled: false,
        freedom_of_speech_not_reach_fetch_enabled: true,
        standardized_nudges_misinfo: true,
        tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
        responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
        responsive_web_graphql_timeline_navigation_enabled: true,
        responsive_web_enhance_cards_enabled: false,
      },
      queryId: QUERY_IDS.CreateTweet,
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: this.getHeaders("POST", path),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `HTTP ${response.status}: ${errorText}` };
      }

      const data = await response.json();

      if (data.errors) {
        return { success: false, error: data.errors[0]?.message || "Unknown error" };
      }

      const newTweetId = data.data?.create_tweet?.tweet_results?.result?.rest_id;
      return { success: true, tweetId: newTweetId };

    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // URLからツイートIDを抽出
  static extractTweetId(url: string): string | null {
    const match = url.match(/status\/(\d+)/);
    return match ? match[1] : null;
  }

  // 認証状態を確認し、ユーザー情報を取得
  async verifyCredentials(): Promise<{ valid: boolean; username?: string; error?: string }> {
    await this.init();

    const path = "/i/api/1.1/account/verify_credentials.json";
    const url = `https://x.com${path}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders("GET", path),
      });

      if (!response.ok) {
        if (response.status === 401) {
          return { valid: false, error: "Unauthorized" };
        }
        const errorText = await response.text();
        return { valid: false, error: `HTTP ${response.status}: ${errorText}` };
      }

      const data = await response.json();
      return { valid: true, username: data.screen_name };

    } catch (error) {
      return { valid: false, error: (error as Error).message };
    }
  }
}
