import { describe, expect, it } from "vitest";
import { buildTopicMessageLink, buildTopicThreadLink } from "../../../src/bot/utils/topic-link.js";

describe("bot/utils/topic-link", () => {
  it("points thread links at the topic, not at a message inside it", () => {
    const chat = { id: -1001234567890, type: "supergroup" } as never;

    // Same builder shape, but callers pass the thread id (topic root) for
    // "go to topic" links instead of a notice message id: different ids,
    // different landing spots.
    expect(buildTopicThreadLink(chat, 777)).toBe("https://t.me/c/1234567890/777");
    expect(buildTopicMessageLink(chat, 555)).toBe("https://t.me/c/1234567890/555");
    expect(buildTopicThreadLink(chat, 777)).not.toBe(buildTopicThreadLink(chat, 555));
  });

  it("resolves public chats by username for both link kinds", () => {
    const chat = { id: -100123, type: "supergroup", username: "mygroup" } as never;

    expect(buildTopicThreadLink(chat, 777)).toBe("https://t.me/mygroup/777");
    expect(buildTopicMessageLink(chat, 555)).toBe("https://t.me/mygroup/555");
  });

  it("returns null without a chat or for non-supergroups without username", () => {
    expect(buildTopicThreadLink(undefined, 777)).toBeNull();
    expect(buildTopicThreadLink({ id: 123, type: "private" } as never, 777)).toBeNull();
    expect(buildTopicMessageLink(undefined, 1)).toBeNull();
  });
});
