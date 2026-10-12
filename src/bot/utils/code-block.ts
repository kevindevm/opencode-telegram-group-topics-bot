const TELEGRAM_MESSAGE_LIMIT = 4096;

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  cs: "csharp",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  sh: "bash",
  bash: "bash",
  ps1: "powershell",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  sql: "sql",
  html: "html",
  css: "css",
  scss: "scss",
  vue: "vue",
  zig: "zig",
  lua: "lua",
  r: "r",
  diff: "diff",
  patch: "diff",
  toml: "toml",
};

export function languageFromFilename(filename: string): string {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  return LANGUAGE_BY_EXTENSION[extension] ?? "";
}

export function looksLikeBinary(content: string): boolean {
  const nullByte = String.fromCharCode(0);
  const replacementChar = String.fromCharCode(0xfffd);
  return content.includes(nullByte) || content.includes(replacementChar);
}

export interface CodeBlockMessage {
  text: string;
  language: string;
  codeOffset: number;
  codeLength: number;
}

export function buildCodeBlockMessage(
  caption: string,
  filename: string,
  content: string,
  maxLength: number = TELEGRAM_MESSAGE_LIMIT,
): CodeBlockMessage | null {
  if (looksLikeBinary(content)) {
    return null;
  }

  const captionPart = caption.trim();
  const separator = captionPart.length > 0 ? "\n\n" : "";
  const text = `${captionPart}${separator}${content}`;

  if (text.length > maxLength) {
    return null;
  }

  return {
    text,
    language: languageFromFilename(filename),
    codeOffset: captionPart.length + separator.length,
    codeLength: content.length,
  };
}
