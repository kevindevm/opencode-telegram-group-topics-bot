import { PermissionRequest, PermissionState } from "./types.js";
import { logger } from "../utils/logger.js";

const MAX_SETTLED_REQUEST_IDS = 200;
const SETTLED_TTL_MS = 5 * 60 * 1000;

class PermissionManager {
  private stateByScope: Map<string, PermissionState> = new Map();
  private settledRequestIds: Map<string, number> = new Map();

  private isEquivalentRequest(left: PermissionRequest, right: PermissionRequest): boolean {
    if (!left.tool || !right.tool) {
      return false;
    }

    if (
      left.sessionID !== right.sessionID ||
      left.permission !== right.permission ||
      left.patterns.length !== right.patterns.length
    ) {
      return false;
    }

    for (let index = 0; index < left.patterns.length; index += 1) {
      if (left.patterns[index] !== right.patterns[index]) {
        return false;
      }
    }

    return left.tool.callID === right.tool.callID && left.tool.messageID === right.tool.messageID;
  }

  private peekState(scopeKey: string): PermissionState | undefined {
    return this.stateByScope.get(scopeKey);
  }

  private getState(scopeKey: string): PermissionState {
    const state = this.stateByScope.get(scopeKey);
    if (state) {
      return state;
    }

    const next: PermissionState = {
      requestsByMessageId: new Map(),
    };
    this.stateByScope.set(scopeKey, next);
    return next;
  }

  startPermission(
    request: PermissionRequest,
    messageId: number,
    scopeKey: string = "global",
  ): void {
    const state = this.getState(scopeKey);

    logger.debug(
      `[PermissionManager] startPermission: id=${request.id}, permission=${request.permission}, messageId=${messageId}`,
    );

    if (state.requestsByMessageId.has(messageId)) {
      logger.warn(`[PermissionManager] Message ID already tracked, replacing: ${messageId}`);
    }

    state.requestsByMessageId.set(messageId, request);

    logger.info(
      `[PermissionManager] New permission request: type=${request.permission}, patterns=${request.patterns.join(", ")}, pending=${state.requestsByMessageId.size}`,
    );
  }

  getRequest(messageId: number | null, scopeKey: string = "global"): PermissionRequest | null {
    if (messageId === null) {
      return null;
    }

    return this.peekState(scopeKey)?.requestsByMessageId.get(messageId) ?? null;
  }

  getRequestByID(
    requestID: string,
    scopeKey: string = "global",
  ): { messageId: number; request: PermissionRequest } | null {
    const state = this.peekState(scopeKey);
    if (!state) {
      return null;
    }
    const entries = Array.from(state.requestsByMessageId.entries());
    for (const [messageId, request] of entries) {
      if (request.id === requestID) {
        return { messageId, request };
      }
    }

    return null;
  }

  hasRequestID(requestID: string, scopeKey: string = "global"): boolean {
    return this.getRequestByID(requestID, scopeKey) !== null;
  }

  findEquivalentRequest(
    request: PermissionRequest,
    scopeKey: string = "global",
  ): { messageId: number; request: PermissionRequest } | null {
    const state = this.peekState(scopeKey);
    if (!state) {
      return null;
    }
    const entries = Array.from(state.requestsByMessageId.entries());
    for (const [messageId, activeRequest] of entries) {
      if (this.isEquivalentRequest(activeRequest, request)) {
        return { messageId, request: activeRequest };
      }
    }

    return null;
  }

  getRequestID(messageId: number | null, scopeKey: string = "global"): string | null {
    return this.getRequest(messageId, scopeKey)?.id ?? null;
  }

  getPermissionType(messageId: number | null, scopeKey: string = "global"): string | null {
    return this.getRequest(messageId, scopeKey)?.permission ?? null;
  }

  getPatterns(messageId: number | null, scopeKey: string = "global"): string[] {
    return this.getRequest(messageId, scopeKey)?.patterns ?? [];
  }

  isActiveMessage(messageId: number | null, scopeKey: string = "global"): boolean {
    return messageId !== null && (this.peekState(scopeKey)?.requestsByMessageId.has(messageId) ?? false);
  }

  getMessageId(scopeKey: string = "global"): number | null {
    const messageIds = this.getMessageIds(scopeKey);
    if (messageIds.length === 0) {
      return null;
    }

    return messageIds[messageIds.length - 1];
  }

  getMessageIds(scopeKey: string = "global"): number[] {
    return Array.from(this.peekState(scopeKey)?.requestsByMessageId.keys() ?? []);
  }

  removeByMessageId(
    messageId: number | null,
    scopeKey: string = "global",
  ): PermissionRequest | null {
    const state = this.peekState(scopeKey);
    const request = this.getRequest(messageId, scopeKey);
    if (!state || !request || messageId === null) {
      return null;
    }

    state.requestsByMessageId.delete(messageId);

    logger.debug(
      `[PermissionManager] Removed permission request: id=${request.id}, messageId=${messageId}, pending=${state.requestsByMessageId.size}`,
    );

    if (state.requestsByMessageId.size === 0) {
      this.stateByScope.delete(scopeKey);
    }

    return request;
  }

  removeByRequestID(requestID: string, scopeKey: string = "global"): PermissionRequest | null {
    const match = this.getRequestByID(requestID, scopeKey);
    if (!match) {
      return null;
    }

    return this.removeByMessageId(match.messageId, scopeKey);
  }

  getPendingCount(scopeKey: string = "global"): number {
    return this.peekState(scopeKey)?.requestsByMessageId.size ?? 0;
  }

  getActiveScopeKeys(): string[] {
    const scopeKeys: string[] = [];
    for (const [scopeKey, state] of this.stateByScope.entries()) {
      if (state.requestsByMessageId.size > 0) {
        scopeKeys.push(scopeKey);
      }
    }
    return scopeKeys;
  }

  /**
   * Remembers a request the server already settled (e.g. auto-accepted on
   * PC) so late polls are never shown for it. Sticky with a TTL: the SSE
   * fan-out delivers every event several times, so one-shot consumption
   * would lose to the second duplicate.
   */
  markSettled(requestID: string): void {
    if (!requestID) {
      return;
    }

    this.settledRequestIds.set(requestID, Date.now());
    this.pruneSettled();
  }

  wasSettledRecently(requestID: string, ttlMs: number = SETTLED_TTL_MS): boolean {
    if (!requestID) {
      return false;
    }

    const settledAt = this.settledRequestIds.get(requestID);
    if (settledAt === undefined) {
      return false;
    }

    if (Date.now() - settledAt >= ttlMs) {
      this.settledRequestIds.delete(requestID);
      return false;
    }

    return true;
  }

  consumeSettled(requestID: string): boolean {
    return this.wasSettledRecently(requestID);
  }

  private pruneSettled(): void {
    const now = Date.now();
    for (const [requestID, settledAt] of this.settledRequestIds) {
      if (now - settledAt >= SETTLED_TTL_MS) {
        this.settledRequestIds.delete(requestID);
      }
    }

    while (this.settledRequestIds.size > MAX_SETTLED_REQUEST_IDS) {
      const oldest = this.settledRequestIds.keys().next();
      if (oldest.done) {
        return;
      }

      this.settledRequestIds.delete(oldest.value);
    }
  }

  isActive(scopeKey: string = "global"): boolean {
    return (this.peekState(scopeKey)?.requestsByMessageId.size ?? 0) > 0;
  }

  clear(scopeKey: string = "global"): void {
    const pending = this.peekState(scopeKey)?.requestsByMessageId.size ?? 0;

    logger.debug(`[PermissionManager] Clearing permission state: pending=${pending}`);

    this.stateByScope.delete(scopeKey);
  }

  __resetForTests(): void {
    this.stateByScope.clear();
    this.settledRequestIds.clear();
  }
}

export const permissionManager = new PermissionManager();
