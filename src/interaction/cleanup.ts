import { permissionManager } from "../permission/manager.js";
import { questionManager } from "../question/manager.js";
import { renameManager } from "../rename/manager.js";
import { taskCreationManager } from "../scheduled-task/creation-manager.js";
import { cancelAllScheduledPermissionPolls } from "../bot/handlers/permission.js";
import { interactionManager } from "./manager.js";
import { logger } from "../utils/logger.js";

export function clearAllInteractionState(reason: string, scopeKey: string = "global"): void {
  const questionActive = questionManager.isActive(scopeKey);
  const permissionActive = permissionManager.isActive(scopeKey);
  const renameActive = renameManager.isWaitingForName(scopeKey);
  const taskActive = taskCreationManager.isActive(scopeKey);
  const interactionSnapshot = interactionManager.getSnapshot(scopeKey);

  questionManager.clear(scopeKey);
  permissionManager.clear(scopeKey);
  renameManager.clear(scopeKey);
  taskCreationManager.clear(scopeKey);
  cancelAllScheduledPermissionPolls(scopeKey);
  interactionManager.clear(reason, scopeKey);

  const hasAnyActiveState =
    questionActive ||
    permissionActive ||
    renameActive ||
    taskActive ||
    interactionSnapshot !== null;

  const message =
    `[InteractionCleanup] Cleared state: reason=${reason}, ` +
    `questionActive=${questionActive}, permissionActive=${permissionActive}, ` +
    `renameActive=${renameActive}, taskActive=${taskActive}, ` +
    `interactionKind=${interactionSnapshot?.kind || "none"}`;

  if (hasAnyActiveState) {
    logger.info(message);
    return;
  }

  logger.debug(message);
}
