import { markAction, pendingActions, retryDelayMs, removeAction } from "./queueService.js";
import { sendActionToDemoServer } from "../services/demoAdapter.js";
import { sendActionToConvex } from "../services/convexAdapter.js";

let syncing = false;

function sendAction(action) {
  return window.AEGIS_CONFIG?.syncMode === "convex"
    ? sendActionToConvex(action)
    : sendActionToDemoServer(action);
}

export async function sendNewAction(action) {
  try {
    const result = await sendAction(action);
    return { sent: true, result };
  } catch (error) {
    return { sent: false, error };
  }
}

export async function syncPendingActions(onProgress = () => {}, { retryFailed = false } = {}) {
  if (syncing) return { synced: 0, remaining: (await pendingActions()).length };
  if (!navigator.onLine) return { synced: 0, remaining: (await pendingActions()).length, offline: true };
  syncing = true;
  let synced = 0;
  try {
    const actions = await pendingActions();
    for (const originalAction of actions) {
      if (originalAction.status === "FAILED" && originalAction.attempts >= 6 && !retryFailed) continue;
      if (originalAction.nextRetryAt > Date.now() && !retryFailed) continue;
      const action = originalAction.status === "FAILED" && retryFailed
        ? await markAction(originalAction, "PENDING", { attempts: 0, nextRetryAt: Date.now(), lastError: null })
        : originalAction;
      await markAction(action, "SYNCING");
      onProgress({ phase: "syncing", action });
      try {
        await sendAction(action);
        await markAction(action, "SYNCED", { lastError: null });
        await removeAction(action.offlineActionId);
        synced += 1;
        onProgress({ phase: "synced", action });
      } catch (error) {
        const attempts = action.attempts + 1;
        const delay = retryDelayMs(attempts);
        await markAction(action, attempts >= 6 ? "FAILED" : "PENDING", {
          attempts,
          nextRetryAt: Date.now() + delay,
          lastError: error instanceof Error ? error.message : "Sync failed",
        });
        onProgress({ phase: "failed", action, error, delay });
      }
    }
    return { synced, remaining: (await pendingActions()).length };
  } finally {
    syncing = false;
  }
}
