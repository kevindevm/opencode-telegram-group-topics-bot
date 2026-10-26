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

/**
 * Splits content into as many code block messages as needed so file content
 * is always readable inline: no .txt document fallback. Binary content still
 * returns null (it cannot render as text).
 */
export function buildCodeBlockMessages(
  caption: string,
  filename: string,
  content: string,
  maxLength: number = TELEGRAM_MESSAGE_LIMIT,
): CodeBlockMessage[] {
  if (looksLikeBinary(content)) {
    return [];
  }

  const language = languageFromFilename(filename);
  const captionPart = caption.trim();
  const separator = captionPart.length > 0 ? "\n\n" : "";
  const firstOverhead = captionPart.length + separator.length;
  const firstLimit = maxLength - firstOverhead;
  if (firstLimit <= 0) {
    return [];
  }

  const chunks = splitContentByLines(content, firstLimit, maxLength);
  return chunks.map((chunk, index) => {
    const prefix = index === 0 ? `${captionPart}${separator}` : "";
    const text = `${prefix}${chunk}`;
    return {
      text,
      language,
      codeOffset: prefix.length,
      codeLength: chunk.length,
    };
  });
}

function splitContentByLines(content: string, firstLimit: number, restLimit: number): string[] {
  const lines = content.split("\n");
  const chunks: string[] = [];
  let current = "";
  let limit = firstLimit;

  const push = () => {
    if (current.length > 0) {
      chunks.push(current);
    }
    current = "";
  };

  for (const line of lines) {
    const candidate = current.length === 0 ? line : `${current}\n${line}`;
    if (candidate.length <= limit) {
      current = candidate;
      continue;
    }

    push();
    if (line.length <= limit) {
      current = line;
    } else {
      // Single huge line: hard-split it with the current chunk budget so the
      // caption prefix never pushes the message over the Telegram limit.
      for (let offset = 0; offset < line.length; offset += limit) {
        chunks.push(line.slice(offset, offset + limit));
      }
    }
    limit = restLimit;
  }
  push();

  return chunks;
}
