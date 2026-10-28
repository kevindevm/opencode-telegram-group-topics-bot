import type { Context } from "grammy";
import { interactionManager } from "./manager.js";
import { questionManager } from "../question/manager.js";
import { permissionManager } from "../permission/manager.js";
import { getScopeKeyFromContext } from "../bot/scope.js";
import { MODEL_SEARCH_CANCEL_CALLBACK } from "../bot/handlers/model.js";
import type {
  BlockReason,
  ExpectedInput,
  GuardDecision,
  IncomingInputType,
  InteractionState,
} from "./types.js";
import { INTERACTION_CLEAR_REASON } from "./constants.js";

function normalizeIncomingCommand(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  const token = trimmed.split(/\s+/)[0];
  const withoutMention = token.split("@")[0].toLowerCase();

  if (withoutMention.length <= 1) {
    return null;
  }

  return withoutMention;
}

function classifyIncomingInput(ctx: Context): {
  inputType: IncomingInputType;
  command?: string;
} {
  if (ctx.callbackQuery?.data) {
    return { inputType: "callback" };
  }

  const text = ctx.message?.text;
  if (typeof text === "string") {
    const command = normalizeIncomingCommand(text);
    if (command) {
      return { inputType: "command", command };
    }

    return { inputType: "text" };
  }

  // Photo, voice, audio, and other non-text messages are classified as "other"
  if (ctx.message?.photo) {
    return { inputType: "other" };
  }

  return { inputType: "other" };
}

function isVoiceOrAudioInput(ctx: Context): boolean {
  return Boolean(ctx.message?.voice || ctx.message?.audio);
}

function getExpectedInputBlockReason(expectedInput: ExpectedInput): BlockReason {
  switch (expectedInput) {
    case "callback":
      return "expected_callback";
    case "command":
      return "expected_command";
    case "text":
    case "mixed":
      return "expected_text";
  }
}

function createAllowDecision(
  inputType: IncomingInputType,
  state: InteractionState | null,
  command?: string,
): GuardDecision {
  return {
    allow: true,
    inputType,
    state,
    command,
  };
}

function createBlockDecision(
  inputType: IncomingInputType,
  state: InteractionState,
  reason: BlockReason,
  command?: string,
): GuardDecision {
  return {
    allow: false,
    inputType,
    state,
    reason,
    command,
  };
}

function isAllowedRenameCancelCallback(ctx: Context, state: InteractionState): boolean {
  return (
    state.kind === "rename" &&
    state.expectedInput === "text" &&
    ctx.callbackQuery?.data === "rename:cancel"
  );
}

function isAllowedSearchCancelCallback(ctx: Context, state: InteractionState): boolean {
  return (
    state.kind === "custom" &&
    state.expectedInput === "text" &&
    state.metadata.flow === "model-search" &&
    ctx.callbackQuery?.data === MODEL_SEARCH_CANCEL_CALLBACK
  );
}

export function resolveInteractionGuardDecision(ctx: Context): GuardDecision {
  const scopeKey = getScopeKeyFromContext(ctx);
  // Opportunistically drop TTL-elapsed interactions of other scopes (deleted
  // topics, ignored menus) so they cannot accumulate between messages.
  interactionManager.purgeExpired(Date.now(), scopeKey);
  const state = interactionManager.getSnapshot(scopeKey);
  const { inputType, command } = classifyIncomingInput(ctx);

  if (!state) {
    return createAllowDecision(inputType, null, command);
  }

  // The prompt/answer already settled outside Telegram (answered on PC,
  // error path, topic finalized) but the interaction snapshot lingered:
  // there is no active question/permission, so holding the block makes no
  // sense. Release the scope instead of blocking the user's next message.
  if (state.kind === "question" && !questionManager.isActive(scopeKey)) {
    interactionManager.clear(INTERACTION_CLEAR_REASON.STALE_FLOW, scopeKey);
    return createAllowDecision(inputType, state, command);
  }

  if (state.kind === "permission" && !permissionManager.isActive(scopeKey)) {
    interactionManager.clear(INTERACTION_CLEAR_REASON.STALE_FLOW, scopeKey);
    return createAllowDecision(inputType, state, command);
  }

  if (interactionManager.isExpired(scopeKey)) {
    interactionManager.clear(INTERACTION_CLEAR_REASON.EXPIRED, scopeKey);
    return createBlockDecision(inputType, state, "expired", command);
  }

  if (inputType === "command") {
    if (command === "/start") {
      return createAllowDecision(inputType, state, command);
    }

    if (command && state.allowedCommands.includes(command)) {
      return createAllowDecision(inputType, state, command);
    }

    return createBlockDecision(inputType, state, "command_not_allowed", command);
  }

  if (state.expectedInput === "mixed") {
    if (
      inputType === "callback" ||
      inputType === "text" ||
      (state.kind === "question" && isVoiceOrAudioInput(ctx))
    ) {
      return createAllowDecision(inputType, state, command);
    }

    return createBlockDecision(inputType, state, "expected_text", command);
  }

  if (
    inputType === "callback" &&
    (isAllowedRenameCancelCallback(ctx, state) || isAllowedSearchCancelCallback(ctx, state))
  ) {
    return createAllowDecision(inputType, state, command);
  }

  if (state.expectedInput === inputType) {
    return createAllowDecision(inputType, state, command);
  }

  return createBlockDecision(
    inputType,
    state,
    getExpectedInputBlockReason(state.expectedInput),
    command,
  );
}
