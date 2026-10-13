import { addAction, deleteAction, listActionsByStatus, updateAction } from "./idb.js";

const QUEUED_STATUSES = ["PENDING", "SYNCING", "FAILED"];

export function createOfflineAction(payload, location) {
  return {
    offlineActionId: `AF-REQ-${crypto.randomUUID()}`,
    type: "CREATE_ASSISTANCE_REQUEST",
    payload,
    location,
    status: "PENDING",
    attempts: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    nextRetryAt: Date.now(),
    lastError: null,
  };
}

export async function enqueueAction(action) {
  await addAction(action);
  return action;
}

export async function markAction(action, status, changes = {}) {
  const next = { ...action, ...changes, status, updatedAt: Date.now() };
  await updateAction(next);
  return next;
}

export async function removeAction(id) {
  return deleteAction(id);
}

export async function pendingActions() {
  const actionsByStatus = await Promise.all(QUEUED_STATUSES.map((status) => listActionsByStatus(status)));
  return actionsByStatus.flat().sort((a, b) => a.createdAt - b.createdAt);
}

export function retryDelayMs(attempts) {
  return Math.min(60_000, 1_000 * (2 ** Math.min(attempts, 6)));
}
