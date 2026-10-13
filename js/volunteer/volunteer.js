import { distanceKm } from "../utils/distance.js";
import { getDeviceLocation } from "../location/locationService.js";
import { acceptDemoRequest, listDemoServerActions } from "../services/demoAdapter.js";

const locationButton = document.querySelector("#volunteer-location-button");
const locationStatus = document.querySelector("#volunteer-location-status");
const radiusSelect = document.querySelector("#volunteer-radius");
const capabilityInputs = [...document.querySelectorAll("#volunteer-capabilities input")];
const refreshButton = document.querySelector("#volunteer-refresh");
const requestList = document.querySelector("#volunteer-request-list");
const resultCount = document.querySelector("#volunteer-result-count");
const volunteerNameInput = document.querySelector("#volunteer-name");
const DEMO_SERVER_KEY = "aegis:demo-server-actions:v1";
const VOLUNTEER_ID_KEY = "aegis:demo-volunteer-id:v1";
const VOLUNTEER_NAME_KEY = "aegis:demo-volunteer-name:v1";

let volunteerLocation = null;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}

function getVolunteerId() {
  let id = localStorage.getItem(VOLUNTEER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(VOLUNTEER_ID_KEY, id);
  }
  return id;
}

function displayAge(timestamp) {
  if (!Number.isFinite(timestamp)) return "Time unavailable";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} hr ago` : `${Math.floor(hours / 24)} day ago`;
}

function selectedCapabilities() {
  return new Set(capabilityInputs.filter((input) => input.checked).map((input) => input.value.toLowerCase()));
}

function acceptedRequestMarkup(action) {
  const latitude = action.location.latitude;
  const longitude = action.location.longitude;
  const origin = volunteerLocation
    ? `${volunteerLocation.latitude},${volunteerLocation.longitude}`
    : "";
  const directionsUrl = new URL("https://www.google.com/maps/dir/");
  directionsUrl.searchParams.set("api", "1");
  if (origin) directionsUrl.searchParams.set("origin", origin);
  directionsUrl.searchParams.set("destination", `${latitude},${longitude}`);
  directionsUrl.searchParams.set("travelmode", "driving");
  const label = action.location.label || "Confirmed request location";

  return `<div class="volunteer-request-location">
    <strong>Request location (visible after acceptance)</strong>
    <span>${escapeHtml(label)}</span><br />
    <span>${latitude.toFixed(5)}, ${longitude.toFixed(5)}</span><br />
    <a href="${escapeHtml(directionsUrl.href)}" target="_blank" rel="noopener noreferrer">Open route in Google Maps ↗</a>
  </div>`;
}

function requestCard(action, distance, accepted) {
  const type = escapeHtml(action.payload?.assistanceType ?? "Assistance");
  const peopleCount = Number(action.payload?.peopleCount);
  const peopleText = Number.isFinite(peopleCount) && peopleCount > 0
    ? `${peopleCount} ${peopleCount === 1 ? "person" : "people"} need help`
    : "People count unavailable";
  const topRight = accepted
    ? `<time class="volunteer-request-time">Accepted ${escapeHtml(displayAge(action.acceptedAt))}</time>`
    : `<time class="volunteer-request-time">${escapeHtml(displayAge(action.createdAt))}</time>`;
  const meta = accepted
    ? `<div class="volunteer-request-meta"><span>Accepted · ${escapeHtml(action.assignedVolunteer?.name ?? "Volunteer")}</span></div>`
    : `<div class="volunteer-request-meta"><span class="request-distance">About ${distance.toFixed(1)} km away</span><span>Open request</span></div>`;
  const actionControl = accepted
    ? `<p>Requester can see your volunteer name in Public view.</p>`
    : `<button class="volunteer-accept-button" type="button" data-accept-id="${escapeHtml(action.offlineActionId)}" ${volunteerNameInput.value.trim() ? "" : "disabled"}>Accept request</button><p class="volunteer-action-message" id="accept-message-${escapeHtml(action.offlineActionId)}" role="status"></p>`;
  const location = accepted ? acceptedRequestMarkup(action) : "";

  return `<article class="volunteer-request-card${accepted ? " is-accepted" : ""}">
    <div><h3>${type} assistance</h3><p>${escapeHtml(peopleText)}</p></div>
    ${topRight}
    ${meta}
    ${actionControl}
    ${location}
  </article>`;
}

function renderRequests(actions) {
  const volunteerId = getVolunteerId();
  const acceptedByMe = actions.filter((action) =>
    action?.type === "CREATE_ASSISTANCE_REQUEST"
    && action.status === "ACCEPTED"
    && action.assignedVolunteer?.id === volunteerId
    && Number.isFinite(action.location?.latitude)
    && Number.isFinite(action.location?.longitude));
  const openRequests = actions.filter((action) =>
    action?.type === "CREATE_ASSISTANCE_REQUEST" && action.status === "PENDING");
  const cards = acceptedByMe.map((action) => requestCard(action, 0, true));

  if (openRequests.length === 0 && acceptedByMe.length === 0) {
    requestList.innerHTML = '<p class="volunteer-empty">No demo requests have synced in this browser yet. Create one from the <a href="./index.html">Public view</a>, then return here.</p>';
    resultCount.textContent = "0";
    return;
  }

  const capabilities = selectedCapabilities();
  if (volunteerLocation && capabilities.size > 0) {
    const radiusKm = Number(radiusSelect.value);
    const matches = openRequests
      .filter((action) => capabilities.has(String(action.payload?.assistanceType ?? "").toLowerCase()))
      .filter((action) => Number.isFinite(action.location?.latitude) && Number.isFinite(action.location?.longitude))
      .map((action) => ({ action, distance: distanceKm(volunteerLocation, action.location) }))
      .filter(({ distance }) => distance <= radiusKm)
      .sort((a, b) => a.distance - b.distance);
    cards.push(...matches.map(({ action, distance }) => requestCard(action, distance, false)));
  }

  resultCount.textContent = String(cards.length);
  if (cards.length > acceptedByMe.length) {
    requestList.innerHTML = cards.join("");
    return;
  }
  if (acceptedByMe.length) {
    requestList.innerHTML = cards.join("");
    if (!volunteerLocation) locationStatus.textContent = "Your accepted requests are shown. Set a device location to get routes from your current position.";
    return;
  }
  const message = !volunteerLocation
    ? "Share your device location to find requests nearby."
    : capabilities.size === 0
      ? "Choose at least one type of help you can provide."
      : "No open requests match those capabilities and this radius.";
  requestList.innerHTML = `${cards.join("")}<p class="volunteer-empty">${message}</p>`;
  resultCount.textContent = String(acceptedByMe.length);
}

async function refreshRequests() {
  refreshButton.disabled = true;
  try {
    renderRequests(await listDemoServerActions());
  } catch (error) {
    requestList.innerHTML = `<p class="volunteer-empty">${escapeHtml(error instanceof Error ? error.message : "Could not load demo requests.")}</p>`;
    resultCount.textContent = "0";
  } finally {
    refreshButton.disabled = false;
  }
}

locationButton.addEventListener("click", async () => {
  locationButton.disabled = true;
  locationStatus.textContent = "Getting your location…";
  try {
    volunteerLocation = await getDeviceLocation();
    locationStatus.textContent = "Location set for this session. Exact request locations are shown only for requests you accept.";
    await refreshRequests();
  } catch (error) {
    locationStatus.textContent = error instanceof Error ? error.message : "Could not get your location.";
  } finally {
    locationButton.disabled = false;
  }
});

volunteerNameInput.value = localStorage.getItem(VOLUNTEER_NAME_KEY) ?? "";
volunteerNameInput.addEventListener("input", () => {
  localStorage.setItem(VOLUNTEER_NAME_KEY, volunteerNameInput.value.trim().slice(0, 80));
  void refreshRequests();
});

requestList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-accept-id]");
  if (!button || button.disabled) return;
  button.disabled = true;
  try {
    await acceptDemoRequest(button.dataset.acceptId, {
      id: getVolunteerId(),
      name: volunteerNameInput.value,
    });
    await refreshRequests();
  } catch (error) {
    const message = requestList.querySelector(`#accept-message-${CSS.escape(button.dataset.acceptId)}`);
    if (message) message.textContent = error instanceof Error ? error.message : "Could not accept this request.";
    button.disabled = false;
  }
});

refreshButton.addEventListener("click", refreshRequests);
radiusSelect.addEventListener("change", refreshRequests);
capabilityInputs.forEach((input) => input.addEventListener("change", refreshRequests));
window.addEventListener("storage", (event) => {
  if (event.key === DEMO_SERVER_KEY) void refreshRequests();
});

void refreshRequests();
setInterval(() => { void refreshRequests(); }, 10_000);
