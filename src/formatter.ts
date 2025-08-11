import type { TwitterPost } from "./types.ts";

export function formatOutput(
  posts: TwitterPost[], 
  format: "table" | "json",
  options: { verbose?: boolean; includeMedia?: boolean } = {}
): string {
  if (format === "json") {
    return JSON.stringify(posts, null, 2);
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