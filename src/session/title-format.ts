import { t } from "../i18n/index.js";

/**
 * Format a session title for display, falling back to the default
 * session title when OpenCode reports an empty/untitled session
 * (adapted from upstream OTB-127 session-title-formatter).
 */
export function formatSessionDisplayTitle(title: string | null | undefined): string {
  if (title && title.trim().length > 0) {
    return title;
  }
  return t("pinned.default_session_title");
}
