import { logger } from "../utils/logger.js";
import { getTopicBindingBySessionId, updateTopicBindingNameBySessionId } from "./manager.js";
import { formatTopicTitle } from "./title-format.js";

interface TopicEditApi {
  editForumTopic: (
    chatId: number,
    messageThreadId: number,
    payload: { name: string },
  ) => Promise<unknown>;
}

export async function syncTopicTitleForSession(
  api: TopicEditApi,
  sessionId: string,
  sessionTitle: string,
): Promise<boolean> {
  const binding = getTopicBindingBySessionId(sessionId);
  if (!binding) {
    return false;
  }

  // Ephemeral transcripts keep the ✅/❌ name set at finalize time; the
  // regular title sync must not overwrite it.
  if (binding.ephemeral) {
    return false;
  }

  const topicName = formatTopicTitle(sessionTitle);
  if (!topicName || binding.topicName === topicName) {
    return false;
  }

  try {
    await api.editForumTopic(binding.chatId, binding.threadId, { name: topicName });
  } catch (error) {
    if (error instanceof Error && error.message.includes("TOPIC_NOT_MODIFIED")) {
      updateTopicBindingNameBySessionId(sessionId, topicName);
      return false;
    }

    // Single attempt: api.editForumTopic runs through the shared queue,
    // which already owns 429 backoff with its own budget. Retrying here
    // would stack a second budget on top; on exhaustion the error
    // propagates to the caller's safeBackgroundTask instead of hanging
    // event processing.
    throw error;
  }

  updateTopicBindingNameBySessionId(sessionId, topicName);

  logger.info(
    `[TopicTitle] Synced topic title for session ${sessionId}: thread=${binding.threadId}, title=${topicName}`,
  );

  return true;
}
