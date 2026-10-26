import type { ModelInfo } from "../model/types.js";

export type ScheduledTaskKind = "cron" | "once";

export type ScheduledTaskStatus = "idle" | "running" | "success" | "error";

export interface ScheduledTaskDeliveryTarget {
  chatId: number;
  threadId: number | null;
}

export interface ScheduledTaskTopicBinding {
  chatId: number;
  projectId: string;
  projectWorktree: string;
  threadId: number;
  topicName: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledTaskModel {
  providerID: string;
  modelID: string;
  variant: string | null;
}

export interface ScheduledTaskBase {
  id: string;
  projectId: string;
  projectWorktree: string;
  createdFromScopeKey: string;
  agent: string | null;
  model: ScheduledTaskModel;
  delivery: ScheduledTaskDeliveryTarget;
  scheduleText: string;
  scheduleSummary: string;
  timezone: string;
  prompt: string;
  createdAt: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  runCount: number;
  lastStatus: ScheduledTaskStatus;
  lastError: string | null;
  /** Paused tasks are skipped by the runtime poll. */
  paused?: boolean;
  /** Trimmed result text of the last run, for the log view. */
  lastResult?: string | null;
}

export interface ScheduledCronTask extends ScheduledTaskBase {
  kind: "cron";
  cron: string;
  runAt?: undefined;
}

export interface ScheduledOnceTask extends ScheduledTaskBase {
  kind: "once";
  cron?: undefined;
  runAt: string;
}

export type ScheduledTask = ScheduledCronTask | ScheduledOnceTask;

export interface ParsedCronSchedule {
  kind: "cron";
  cron: string;
  timezone: string;
  summary: string;
  nextRunAt: string;
}

export interface ParsedOnceSchedule {
  kind: "once";
  runAt: string;
  timezone: string;
  summary: string;
  nextRunAt: string;
}

export type ParsedTaskSchedule = ParsedCronSchedule | ParsedOnceSchedule;

export interface TaskCreationState {
  stage: "awaiting_schedule" | "parsing_schedule" | "awaiting_prompt";
  projectId: string;
  projectWorktree: string;
  createdFromScopeKey: string;
  agent: string | null;
  model: ScheduledTaskModel;
  scheduleText: string | null;
  parsedSchedule: ParsedTaskSchedule | null;
  scheduleRequestMessageId: number | null;
  previewMessageId: number | null;
  promptRequestMessageId: number | null;
}

export interface ScheduledTaskExecutionResult {
  taskId: string;
  status: "success" | "error";
  startedAt: string;
  finishedAt: string;
  resultText: string | null;
  errorMessage: string | null;
}

export interface QueuedScheduledTaskDelivery {
  taskId: string;
  scheduleSummary: string;
  prompt: string;
  runAt: string;
  status: "success" | "error";
  notificationText: string;
  resultText?: string;
}

export function createScheduledTaskModel(model: ModelInfo): ScheduledTaskModel {
  return {
    providerID: model.providerID,
    modelID: model.modelID,
    variant: model.variant ?? null,
  };
}

export function cloneParsedTaskSchedule(schedule: ParsedTaskSchedule): ParsedTaskSchedule {
  return { ...schedule };
}

export function cloneScheduledTaskModel(model: ScheduledTaskModel): ScheduledTaskModel {
  return { ...model };
}

export function cloneScheduledTaskDeliveryTarget(
  delivery: ScheduledTaskDeliveryTarget,
): ScheduledTaskDeliveryTarget {
  return { ...delivery };
}

export function cloneScheduledTaskTopicBinding(
  binding: ScheduledTaskTopicBinding,
): ScheduledTaskTopicBinding {
  return { ...binding };
}

export function cloneScheduledTask(task: ScheduledTask): ScheduledTask {
  return {
    ...task,
    model: cloneScheduledTaskModel(task.model),
    delivery: cloneScheduledTaskDeliveryTarget(task.delivery),
  };
}
