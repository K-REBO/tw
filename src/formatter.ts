import type { TwitterPost } from "./types.ts";

export function formatOutput(
  posts: TwitterPost[],
  format: "table" | "json" | "markdown",
  options: { verbose?: boolean; includeMedia?: boolean } = {}
): string {
  if (format === "json") {
    return JSON.stringify(posts, null, 2);
  }

  if (format === "markdown") {
    return formatMarkdown(posts, options);
  }
  
  // Table format
  let output = "";
  
  posts.forEach((post, index) => {
    if (index > 0) output += "\n" + "─".repeat(80) + "\n";
    
    // Header
    const verifiedMark = post.author.verified ? " ✓" : "";
    output += `@${post.author.username}${verifiedMark} (${post.author.displayName})\n`;
    output += `📅 ${new Date(post.timestamp).toLocaleString()}\n`;
    
    // Content
    output += `\n${post.text}\n`;
    
    // Media
    if (options.includeMedia && post.mediaUrls.length > 0) {
      output += `\n📷 Media: ${post.mediaUrls.length} item(s)\n`;
      post.mediaUrls.forEach((url, idx) => {
        output += `Media ${idx + 1}: ${url}\n`;
      });
    }
    
    // Engagement
    output += `\n💖 ${post.likes}  🔄 ${post.retweets}  💬 ${post.replies}`;
    
    // Tags
    if (post.hashtags.length > 0) {
      output += `\n🏷️  ${post.hashtags.join(" ")}`;
    }
    
    if (options.verbose) {
      if (post.mentions.length > 0) {
        output += `\n👥 ${post.mentions.join(" ")}`;
      }
      
      const flags = [];
      if (post.isRetweet) flags.push("RT");
      if (post.isReply) flags.push("Reply");
      if (flags.length > 0) {
        output += `\n🏳️  ${flags.join(", ")}`;
      }
    }
  });
  
  if (posts.length === 0) {
    output = "No posts found matching the criteria.";
  } else {
    output = `Found ${posts.length} post(s):\n\n${output}`;
  }
  
  return output;
}

function formatMarkdown(
  posts: TwitterPost[],
  options: { verbose?: boolean; includeMedia?: boolean } = {}
): string {
  if (posts.length === 0) {
    return "No posts found matching the criteria.\n";
  }

  let output = `# Twitter Posts (${posts.length} posts)\n\n`;

  posts.forEach((post, index) => {
    // Header with author info
    const verifiedMark = post.author.verified ? " ✓" : "";
    output += `## ${index + 1}. [@${post.author.username}](https://x.com/${post.author.username})${verifiedMark}\n\n`;
    output += `**${post.author.displayName}**\n\n`;

    // Timestamp
    const date = new Date(post.timestamp);
    output += `📅 ${date.toLocaleString()} | [View Tweet](https://x.com/${post.author.username}/status/${post.id})\n\n`;

    // Content
    output += `${post.text}\n\n`;

    // Media
    if (options.includeMedia && post.mediaUrls.length > 0) {
      output += `### 📷 Media (${post.mediaUrls.length})\n\n`;
      post.mediaUrls.forEach((url, idx) => {
        output += `${idx + 1}. ![Media ${idx + 1}](${url})\n`;
      });
      output += `\n`;
    }

    // Engagement metrics
    output += `### 📊 Engagement\n\n`;
    output += `- 💖 Likes: **${post.likes.toLocaleString()}**\n`;
    output += `- 🔄 Retweets: **${post.retweets.toLocaleString()}**\n`;
    output += `- 💬 Replies: **${post.replies.toLocaleString()}**\n\n`;

    // Hashtags
    if (post.hashtags.length > 0) {
      output += `**Tags:** ${post.hashtags.map(tag => `\`${tag}\``).join(" ")}\n\n`;
    }

    // Verbose info
    if (options.verbose) {
      if (post.mentions.length > 0) {
        output += `**Mentions:** ${post.mentions.map(m => `[@${m}](https://x.com/${m})`).join(" ")}\n\n`;
      }

      const flags = [];
      if (post.isRetweet) flags.push("🔄 Retweet");
      if (post.isReply) flags.push("💬 Reply");
      if (flags.length > 0) {
        output += `**Type:** ${flags.join(", ")}\n\n`;
      }
    }

    output += `---\n\n`;
  });

  return output;
}