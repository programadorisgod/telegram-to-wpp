/**
 * Converts Telegram HTML tags to WhatsApp markdown.
 *
 * Handles: <b>, <strong>, <i>, <em>, <s>, <strike>, <del>,
 *          <code>, <pre>, <blockquote>, <a>, and HTML entities.
 */
export function htmlToWppMarkdown(html: string): string {
  let result = html;

  // <pre><code>...</code></pre> or <pre>...</pre> — must run before <code>
  result = result.replace(/<pre>([\s\S]*?)<\/pre>/g, (_, content: string) => {
    const code = content.replace(/<\/?code>/g, "").trim();
    return "```\n" + code + "\n```";
  });

  // <code>...</code>
  result = result.replace(/<code>([^<]+)<\/code>/g, "`$1`");

  // <blockquote>...</blockquote>
  result = result.replace(
    /<blockquote>([\s\S]*?)<\/blockquote>/g,
    (_, content: string) => {
      return content
        .split("\n")
        .map((line: string) => (line.trim() ? "> " + line : ""))
        .join("\n");
    },
  );

  // Bold
  result = result.replace(/<\/(?:b|strong)>/g, "*");
  result = result.replace(/<(?:b|strong)>/g, "*");

  // Italic
  result = result.replace(/<\/(?:i|em)>/g, "_");
  result = result.replace(/<(?:i|em)>/g, "_");

  // Strikethrough
  result = result.replace(/<\/(?:s|strike|del)>/g, "~");
  result = result.replace(/<(?:s|strike|del)>/g, "~");

  // <a href="url">text</a>  →  text (enlace: url)
  result = result.replace(
    /<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g,
    "$2 (enlace: $1)",
  );

  // Strip any remaining HTML tags
  result = result.replace(/<[^>]+>/g, "");

  // Decode HTML entities
  result = result
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(parseInt(code, 10)),
    );

  return result;
}

/**
 * Converts WhatsApp markdown to Telegram HTML.
 *
 * Handles: *bold*, _italic_, ~strikethrough~, `inline code`,
 *          ```code blocks```.
 *
 * IMPORTANT: Call this AFTER escapeHtml() — WhatsApp markdown
 * characters (* _ ~ `) are not HTML-special, so escaping first
 * prevents injection of raw HTML tags.
 */
export function wppMarkdownToHtml(text: string): string {
  let result = text;

  // Code block (triple backticks) — must come before inline code
  result = result.replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>");

  // Inline code (single backtick)
  result = result.replace(/`([^`\n]+)`/g, "<code>$1</code>");

  // Bold: *text* — content must start and end with non-space
  result = result.replace(/\*(\S[^*\n]*?\S|\S)\*/g, "<b>$1</b>");

  // Italic: _text_ — word-boundary guarded to avoid _inside_words_
  result = result.replace(
    /(?<!\w)_(\S[^_\n]*?\S|\S)_(?!\w)/g,
    "<i>$1</i>",
  );

  // Strikethrough: ~text~
  result = result.replace(/~(\S[^~\n]*?\S|\S)~/g, "<s>$1</s>");

  return result;
}
