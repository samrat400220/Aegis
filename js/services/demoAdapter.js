const DEMO_SERVER_KEY = "aegis:demo-server-actions:v1";
const DEMO_REQUESTER_IDS_KEY = "aegis:demo-requester-action-ids:v1";

// A local-only stand-in for Convex. It is intentionally labeled as demo mode:
// it proves queue/idempotency behavior but does not send anything to a server.
export async function listDemoServerActions() {
  const actions = JSON.parse(localStorage.getItem(DEMO_SERVER_KEY) ?? "[]");
  if (!Array.isArray(actions)) throw new Error("Demo request storage is invalid. Clear this site's demo request data and try again.");
  return actions;
}

export function getDemoRequesterActionIds() {
  const ids = JSON.parse(localStorage.getItem(DEMO_REQUESTER_IDS_KEY) ?? "[]");
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    throw new Error("Demo request ownership data is invalid. Clear this site's demo data and try again.");
  }
  return ids;
}

export function rememberDemoRequesterAction(id) {
  if (typeof id !== "string" || !id) throw new Error("Cannot track a request without its ID.");
  const ids = getDemoRequesterActionIds();
  if (!ids.includes(id)) {
    ids.push(id);
    localStorage.setItem(DEMO_REQUESTER_IDS_KEY, JSON.stringify(ids));
  }
}

export async function listDemoRequesterActions(ids) {
  const ownedIds = new Set(ids);
  return (await listDemoServerActions()).filter((action) => ownedIds.has(action.offlineActionId));
}

export async function acceptDemoRequest(id, volunteer) {
  const volunteerId = typeof volunteer?.id === "string" ? volunteer.id : "";
  const volunteerName = typeof volunteer?.name === "string" ? volunteer.name.trim().slice(0, 80) : "";
  if (!volunteerId || !volunteerName) throw new Error("Enter a volunteer name before accepting a request.");

  const actions = await listDemoServerActions();
  const action = actions.find((candidate) => candidate.offlineActionId === id);
  if (!action) throw new Error("This request is no longer available. Refresh the request list.");
  if (action.status !== "PENDING") throw new Error("This request has already been accepted or is no longer open.");
  if (!Number.isFinite(action.location?.latitude) || !Number.isFinite(action.location?.longitude)) {
    throw new Error("This request has no usable location.");
  }

  const acceptedAction = {
    ...action,
    status: "ACCEPTED",
    assignedVolunteer: { id: volunteerId, name: volunteerName },
    acceptedAt: Date.now(),
    updatedAt: Date.now(),
  };
  localStorage.setItem(DEMO_SERVER_KEY, JSON.stringify(actions.map((candidate) =>
    candidate.offlineActionId === id ? acceptedAction : candidate)));
  window.dispatchEvent(new CustomEvent("aegis:demo-requests-updated"));
  return acceptedAction;
}

export async function sendActionToDemoServer(action) {
  const actions = await listDemoServerActions();
  const alreadyPresent = actions.some((saved) => saved.offlineActionId === action.offlineActionId);
  if (!alreadyPresent) {
    actions.push({ ...action, receivedAt: Date.now() });
    localStorage.setItem(DEMO_SERVER_KEY, JSON.stringify(actions));
  }
  return { duplicate: alreadyPresent };
}
