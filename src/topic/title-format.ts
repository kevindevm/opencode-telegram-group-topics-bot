import { TOPIC_NAME_MAX_LENGTH, TOPIC_NAME_TRUNCATION_SUFFIX } from "./title-constants.js";

const TOPIC_TITLE_FALLBACK = "Session";

/**
 * Forum topic names are plain text: any markdown the model puts in a session
 * title (`**bold**`, `# heading`, `[x](url)`...) would show literally, so it
 * is stripped before truncating.
 */
export function stripMarkdownForTopicTitle(text: string): string {
  let result = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  result = result.replace(/(\*\*|__)(.*?)\1/g, "$2");
  result = result.replace(/(^|[\s([{*])\*([^*\n]+?)\*(?=[\s).,\]}!?:;]|$)/g, "$1$2");
  result = result.replace(/(^|[\s([{])_([^_\n]+?)_(?=[\s).,\]}!?:;]|$)/g, "$1$2");
  result = result.replace(/~~(.+?)~~/g, "$1");
  result = result.replace(/`{1,3}([^`\n]*)`{1,3}/g, "$1");
  result = result.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  result = result.replace(/^\s{0,3}>\s?/gm, "");
  result = result.replace(/^\s{0,3}(?:[-+*]|\d+[.)])\s+/gm, "");
  return result.replace(/\s+/g, " ").trim();
}

export function formatTopicTitle(rawTitle: string, fallbackTitle?: string): string {
  const stripped = stripMarkdownForTopicTitle(rawTitle);
  const baseTitle = stripped || fallbackTitle?.trim() || TOPIC_TITLE_FALLBACK;

  // Truncate by code points so surrogate pairs (emoji) are never split, and
  // also cap UTF-16 length since Telegram counts message text that way.
  const codePoints = Array.from(baseTitle);
  if (
    codePoints.length <= TOPIC_NAME_MAX_LENGTH &&
    baseTitle.length <= TOPIC_NAME_MAX_LENGTH
  ) {
    return baseTitle;
  }

  const allowedLength = TOPIC_NAME_MAX_LENGTH - TOPIC_NAME_TRUNCATION_SUFFIX.length;
  let truncated = "";
  for (const point of codePoints) {
    if (truncated.length + point.length > Math.max(0, allowedLength)) {
      break;
    }
    truncated += point;
  }

  return `${truncated.trimEnd()}${TOPIC_NAME_TRUNCATION_SUFFIX}`;
}
