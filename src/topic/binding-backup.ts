import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getRuntimePaths } from "../runtime/paths.js";
import type { TopicSessionBinding } from "../settings/manager.js";
import { logger } from "../utils/logger.js";

/**
 * The Bot API cannot list forum topics, so a topic deleted or forgotten
 * server-side cannot be rediscovered. This sidecar mirrors every topic
 * binding (created or removed) into a tiny standalone file, so a wiped
 * settings.json can be re-seeded on the next boot instead of losing
 * every session-to-topic link at once.
 *
 * Best effort only: backup failures are logged and never break the caller.
 * Ephemeral (transcript-only subagent) topics are never backed up.
 */

const BACKUP_FILE_NAME = "topic-bindings.backup.json";
const BACKUP_VERSION = 1;

type BindingBackupFile = {
  version: number;
  bindings: Record<string, TopicSessionBinding>;
};

function backupFilePath(): string {
  return path.join(getRuntimePaths().appHome, BACKUP_FILE_NAME);
}

function readBackupFile(filePath: string): BindingBackupFile | null {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<BindingBackupFile>;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      parsed.version !== BACKUP_VERSION ||
      typeof parsed.bindings !== "object" ||
      parsed.bindings === null
    ) {
      return null;
    }
    return { version: BACKUP_VERSION, bindings: parsed.bindings as Record<string, TopicSessionBinding> };
  } catch {
    return null;
  }
}

function isRestorableBinding(binding: TopicSessionBinding | null | undefined): binding is TopicSessionBinding {
  return (
    !!binding &&
    typeof binding.scopeKey === "string" &&
    typeof binding.chatId === "number" &&
    typeof binding.threadId === "number" &&
    typeof binding.sessionId === "string" &&
    binding.sessionId.length > 0 &&
    !binding.ephemeral
  );
}

/** Records (or refreshes) one binding. No-op for ephemeral topics. */
export function snapshotBinding(binding: TopicSessionBinding): void {
  if (!isRestorableBinding(binding)) {
    return;
  }

  try {
    const filePath = backupFilePath();
    const current = readBackupFile(filePath) ?? { version: BACKUP_VERSION, bindings: {} };
    current.bindings[binding.scopeKey] = { ...binding };
    mkdirSync(path.dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.${process.pid}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(current, null, 2), "utf8");
    renameSync(tmpPath, filePath);
  } catch (error) {
    logger.warn("[BindingBackup] Failed to snapshot topic binding:", error);
  }
}

/** Forgets one binding by scope key. Missing entries are fine. */
export function forgetBinding(scopeKey: string): void {
  try {
    const filePath = backupFilePath();
    const current = readBackupFile(filePath);
    if (!current || !(scopeKey in current.bindings)) {
      return;
    }
    delete current.bindings[scopeKey];
    const tmpPath = `${filePath}.${process.pid}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(current, null, 2), "utf8");
    renameSync(tmpPath, filePath);
  } catch (error) {
    logger.warn("[BindingBackup] Failed to forget topic binding:", error);
  }
}

/** All backed-up bindings, validated. Never throws. */
export function loadBindingBackup(): TopicSessionBinding[] {
  try {
    const current = readBackupFile(backupFilePath());
    if (!current) {
      return [];
    }
    return Object.values(current.bindings).filter(isRestorableBinding);
  } catch (error) {
    logger.warn("[BindingBackup] Failed to load topic binding backup:", error);
    return [];
  }
}
