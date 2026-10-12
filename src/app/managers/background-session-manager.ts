import { getCurrentSession } from "../../settings/manager.js";
import { logger } from "../../utils/logger.js";

export type BackgroundSessionNotificationKind =
  | "assistant_response"
  | "question_asked"
  | "permission_asked";

export interface BackgroundSessionNotification {
  kind: BackgroundSessionNotificationKind;
  sessionId: string;
  sessionTitle?: string | undefined;
  requestId?: string | undefined;
  messageId?: string | undefined;
}

type NotificationCallback = (notification: BackgroundSessionNotification) => void | Promise<void>;

interface PendingAssistantResponse {
  messageId: string;
}

class BackgroundSessionTracker {
  private directory: string | null = null;
  private onNotification: NotificationCallback | null = null;
  private sessionTitles = new Map<string, string>();
  private childSessionIds = new Set<string>();
  private completedAssistantMessageIds = new Set<string>();
  private pendingAssistantResponsesBySessionId = new Map<string, PendingAssistantResponse>();
  private questionRequestIds = new Set<string>();
  private permissionRequestIds = new Set<string>();

  setDirectory(directory: string): void {
    if (this.directory === directory) {
      return;
    }

    this.clear();
    this.directory = directory;
  }

  setOnNotification(callback: NotificationCallback): void {
    this.onNotification = callback;
  }

  clear(): void {
    this.directory = null;
    this.sessionTitles.clear();
    this.childSessionIds.clear();
    this.completedAssistantMessageIds.clear();
    this.pendingAssistantResponsesBySessionId.clear();
    this.questionRequestIds.clear();
    this.permissionRequestIds.clear();
  }

  processEvent(event: { type: string; properties?: unknown }, currentSessionId: string | null): void {
    switch (event.type) {
      case "session.created":
      case "session.updated": {
        const props = event as { properties?: unknown };
        this.handleSessionInfo(props.properties);
        break;
      }
      case "message.updated": {
        const props = event as { properties?: { info: unknown } };
        this.handleMessageUpdated(props.properties, currentSessionId);
        break;
      }
      case "session.idle": {
        const props = event as { properties?: { sessionID: string } };
        this.handleSessionIdle(props.properties, currentSessionId);
        break;
      }
      case "question.asked": {
        const props = event as { properties?: { id: string; sessionID: string } };
        this.handleRequestEvent("question_asked", props.properties, currentSessionId);
        break;
      }
      case "permission.asked": {
        const props = event as { properties?: { id: string; sessionID: string } };
        this.handleRequestEvent("permission_asked", props.properties, currentSessionId);
        break;
      }
      default:
        break;
    }
  }

  private handleSessionInfo(properties?: unknown): void {
    if (!properties) {
      return;
    }
    const info = properties as { id?: string; title?: string; parentID?: string } | undefined;
    if (!info?.id) {
      return;
    }

    const title = info.title?.trim();
    if (title) {
      this.sessionTitles.set(info.id, title);
    }

    if (info.parentID) {
      this.childSessionIds.add(info.id);
    }
  }

  private handleMessageUpdated(
    properties?: unknown,
    currentSessionId: string | null = null,
  ): void {
    if (!properties) {
      return;
    }
    const info = properties as {
      id?: string;
      sessionID?: string;
      role?: string;
      time?: { completed?: number };
    } | undefined;
    const sessionId = info?.sessionID;
    const messageId = info?.id;
    if (!sessionId || !messageId || info?.role !== "assistant" || !info.time?.completed) {
      return;
    }

    if (this.shouldIgnoreSession(sessionId, currentSessionId)) {
      return;
    }

    if (this.completedAssistantMessageIds.has(messageId)) {
      return;
    }

    this.completedAssistantMessageIds.add(messageId);
    this.pendingAssistantResponsesBySessionId.set(sessionId, { messageId });
  }

  private handleSessionIdle(
    properties?: unknown,
    currentSessionId: string | null = null,
  ): void {
    if (!properties) {
      return;
    }
    const info = properties as { sessionID: string } | undefined;
    const sessionId = info?.sessionID;
    if (!sessionId || this.shouldIgnoreSession(sessionId, currentSessionId)) {
      return;
    }

    const pendingResponse = this.pendingAssistantResponsesBySessionId.get(sessionId);
    if (!pendingResponse) {
      return;
    }

    this.pendingAssistantResponsesBySessionId.delete(sessionId);
    logger.info(
      `[BackgroundSessionTracker] Assistant replied in a background session: session=${sessionId}, followed=${getCurrentSession()?.id ?? "none"}`,
    );
    this.emitNotification({
      kind: "assistant_response",
      sessionId,
      sessionTitle: this.sessionTitles.get(sessionId),
      messageId: pendingResponse.messageId,
    });
  }

  private handleRequestEvent(
    kind: Extract<BackgroundSessionNotificationKind, "question_asked" | "permission_asked">,
    properties?: unknown,
    currentSessionId: string | null = null,
  ): void {
    if (!properties) {
      return;
    }
    const { id, sessionID: sessionId } = properties as { id: string; sessionID: string };
    if (!id || !sessionId) {
      return;
    }

    if (this.shouldIgnoreSession(sessionId, currentSessionId)) {
      return;
    }

    const deliveredRequestIds =
      kind === "question_asked" ? this.questionRequestIds : this.permissionRequestIds;
    if (deliveredRequestIds.has(id)) {
      return;
    }

    deliveredRequestIds.add(id);
    this.emitNotification({
      kind,
      sessionId,
      sessionTitle: this.sessionTitles.get(sessionId),
      requestId: id,
    });
  }

  private shouldIgnoreSession(sessionId: string, currentSessionId: string | null): boolean {
    return (
      sessionId === currentSessionId ||
      this.childSessionIds.has(sessionId)
    );
  }

  private emitNotification(notification: BackgroundSessionNotification): void {
    if (!this.onNotification) {
      return;
    }

    const callback = this.onNotification;
    setImmediate(() => {
      Promise.resolve(callback(notification)).catch((error) => {
        logger.error("[BackgroundSessionTracker] Failed to deliver notification:", error);
      });
    });
  }
}

export { BackgroundSessionTracker };