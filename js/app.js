import { getFacilities, readAdminData } from "./data/facilityStore.js?v=dehradun-demo-20261007";
import { distanceKm, sortNearby } from "./utils/distance.js?v=dehradun-demo-20261007";
import { clearSavedLocation, getSavedLocation, locationErrorMessage, saveLocation, stopDeviceLocationWatch, watchDeviceLocation } from "./location/locationService.js";
import { searchPlaces } from "./location/geocodingService.js";
import { createMap } from "./map/mapService.js?v=dehradun-demo-20261007";
import { createOfflineAction, enqueueAction, pendingActions } from "./offline/queueService.js";
import { sendNewAction, syncPendingActions } from "./offline/syncService.js";
import {
  getDemoRequesterActionIds,
  listDemoRequesterActions,
  rememberDemoRequesterAction,
} from "./services/demoAdapter.js";

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
const elements = {
  connection: $("#connection-status"), locate: $("#locate-button"), searchForm: $("#search-form"), searchInput: $("#place-search"), searchResults: $("#search-results"),
  locationMessage: $("#location-message"), demoLocation: $("#demo-location"), locationDetail: $("#location-detail"), locationError: $("#location-error"), clearLocation: $("#clear-location"), locationSummary: $("#location-summary"),
  radius: $("#radius-filter"), facilityList: $("#facility-list"), allCount: $("#count-all"), filters: [...document.querySelectorAll(".filter-chip")],
  requestForm: $("#request-form"), requestSubmit: $("#request-form button[type=submit]"), requestLocation: $("#request-location-label"), requestMessage: $("#request-message"), myRequestsList: $("#my-requests-list"), myRequestsStatus: $("#my-requests-status"), queueCount: $("#queue-count"), queueStatus: $("#queue-status"), sync: $("#sync-button"), toast: $("#toast"),
  facilityDetail: $("#facility-detail-panel"), detailName: $("#detail-name"), detailAddress: $("#detail-address"), detailStatus: $("#detail-status"), detailDistance: $("#detail-distance"), detailAge: $("#detail-age"), detailSupplies: $("#detail-supplies"), closeDetail: $("#close-facility-detail"), routeButton: $("#route-button"), routeMessage: $("#route-message"),
};

let selectedLocation = getSavedLocation();
// Public Mapbox geocoding searches are temporary. Do not restore or re-cache
// their result after a page refresh; retain GPS/demo locations only.
if (selectedLocation?.source === "manual") {
  clearSavedLocation();
  selectedLocation = null;
}
let facilities = getFacilities();
let activeType = "all";
let map;
let toastTimer;
let selectedFacility = null;
let routeController = null;
let locationWatchId = null;
let hasFreshTrackedLocation = false;

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), 3400);
}

function prettyDistance(km) {
  return km < 1 ? `${Math.max(50, Math.round(km * 1000 / 50) * 50)} m` : `${km.toFixed(1)} km`;
}

function relativeTime(timestamp) {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} hr ago` : `${Math.floor(hours / 24)} day ago`;
}

function statusClass(status) {
  return status === "FULL" || status === "TEMPORARILY_CLOSED" ? "closed" : status === "LIMITED" ? "full" : "";
}

function freshnessLabel(updatedAt) {
  const ageMinutes = Math.max(0, (Date.now() - updatedAt) / 60_000);
  if (ageMinutes >= 60) return `stale · updated ${relativeTime(updatedAt)}`;
  if (ageMinutes >= 15) return `check status · updated ${relativeTime(updatedAt)}`;
  return `updated ${relativeTime(updatedAt)}`;
}

function detailedAge(updatedAt) {
  if (!Number.isFinite(Number(updatedAt))) return "Update time unavailable";
  const seconds = Math.max(0, Math.floor((Date.now() - Number(updatedAt)) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(remainder).padStart(2, "0")}s ago`;
}

function renderFacilityDetail() {
  if (!selectedFacility) return;
  const facility = facilities.find((item) => item.id === selectedFacility.id) ?? selectedFacility;
  selectedFacility = facility;
  elements.detailName.textContent = facility.name;
  elements.detailAddress.textContent = facility.location?.address ?? facility.detail ?? "Address unavailable";
  elements.detailStatus.className = `facility-status ${statusClass(facility.status)}`;
  elements.detailStatus.innerHTML = `<i class="status-dot"></i>${escapeHtml(facility.status.replaceAll("_", " "))}`;
  elements.detailAge.textContent = detailedAge(facility.updatedAt);
  elements.detailDistance.textContent = selectedLocation
    ? `${prettyDistance(distanceKm(selectedLocation, facility.location))} away`
    : "Confirm a location for distance";
  if (facility.type === "shelter") {
    const capacity = Number(facility.capacity);
    const occupied = Number(facility.currentOccupancy);
    const available = Number.isFinite(capacity) && Number.isFinite(occupied) ? Math.max(0, capacity - occupied) : null;
    elements.detailSupplies.innerHTML = `<strong>Shelter capacity</strong><div class="supply-row"><span>Spaces available</span><b>${available === null ? "Not reported" : available}</b></div><div class="supply-row"><span>Current occupancy</span><b>${Number.isFinite(occupied) ? occupied : "Not reported"}${Number.isFinite(capacity) ? ` / ${capacity}` : ""}</b></div>`;
  } else {
    const supplies = (facility.resources ?? []).filter((item) => Number(item.quantity) > 0);
    elements.detailSupplies.innerHTML = `<strong>Available supplies</strong>${supplies.length ? supplies.map((item) => `<div class="supply-row"><span>${escapeHtml(item.type)}</span><b>${escapeHtml(item.quantity)}</b></div>`).join("") : `<div class="supply-row"><span>Availability not reported</span><b>—</b></div>`}`;
  }
}

function showFacilityDetails(facility) {
  if (selectedFacility?.id !== facility.id) {
    map?.clearRoute();
    elements.routeMessage.textContent = "";
  }
  selectedFacility = facility;
  elements.facilityDetail.hidden = false;
  renderFacilityDetail();
}

async function requestWalkingRoute() {
  if (!selectedFacility) return;
  if (!selectedLocation) {
    elements.routeMessage.textContent = "Confirm your location first to request a route.";
    return;
  }
  const token = window.AEGIS_CONFIG?.mapboxToken;
  if (!token) {
    elements.routeMessage.textContent = "Walking directions need a public Mapbox token in config.js.";
    return;
  }
  routeController?.abort();
  routeController = new AbortController();
  elements.routeButton.disabled = true;
  elements.routeMessage.textContent = "Requesting a walking route from Mapbox…";
  try {
    const origin = `${selectedLocation.longitude},${selectedLocation.latitude}`;
    const destination = `${selectedFacility.location.longitude},${selectedFacility.location.latitude}`;
    const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/walking/${origin};${destination}`);
    url.search = new URLSearchParams({ geometries: "geojson", overview: "full", access_token: token }).toString();
    const response = await fetch(url, { signal: routeController.signal });
    const data = await response.json();
    if (!response.ok || !data.routes?.length) throw new Error(data.message || "No walking route is available for these locations.");
    const route = data.routes[0];
    await map?.showRoute(route.geometry);
    const minutes = Math.max(1, Math.round(route.duration / 60));
    const duration = minutes >= 60 ? `${Math.floor(minutes / 60)} hr ${minutes % 60} min` : `${minutes} min`;
    elements.routeMessage.textContent = `Walking route: ${prettyDistance(route.distance / 1000)} · about ${duration}.`;
  } catch (error) {
    if (error.name !== "AbortError") elements.routeMessage.textContent = error instanceof Error ? error.message : "Could not get a walking route.";
  } finally {
    elements.routeButton.disabled = false;
  }
}

function renderFacilities() {
  elements.allCount.textContent = String(facilities.length);
  const nearby = sortNearby(facilities, selectedLocation, Number(elements.radius.value), activeType);
  if (!selectedLocation) {
    elements.facilityList.innerHTML = `<div class="facility-empty">Select a location to sort nearby places by distance.</div>`;
    return;
  }
  if (!nearby.length) {
    elements.facilityList.innerHTML = `<div class="facility-empty">No sample locations within ${elements.radius.value} km. Try a wider distance.</div>`;
    return;
  }
  elements.facilityList.innerHTML = nearby.map((facility) => `
    <button class="facility-card" data-facility-id="${facility.id}" type="button" aria-label="Show ${facility.name} on map">
      <span class="facility-icon ${facility.type}" aria-hidden="true">${facility.type === "shelter" ? "⌂" : "＋"}</span>
      <span class="facility-info"><strong>${facility.name}</strong><small>${facility.detail} · ${freshnessLabel(facility.updatedAt)}</small><span class="facility-status ${statusClass(facility.status)}"><i class="status-dot"></i>${facility.status.replaceAll("_", " ")}</span></span>
      <span class="facility-distance">${prettyDistance(facility.distanceKm)}</span>
    </button>`).join("");
  elements.facilityList.querySelectorAll("[data-facility-id]").forEach((button) => button.addEventListener("click", () => {
    const facility = facilities.find((item) => item.id === button.dataset.facilityId);
    if (facility) showFacilityDetails(facility);
    map?.focusFacility(button.dataset.facilityId);
  }));
}

function renderPublicInformation() {
  const data = readAdminData();
  const renderItems = (selector, records, kind) => {
    const active = (records ?? []).filter((record) => !record.archived);
    $(selector).innerHTML = active.length ? active.map((record) => {
      const extra = kind === "alerts" ? `${record.severity} · ${record.instruction}`
        : kind === "avoidAreas" ? `${record.reason} · ${record.address}`
          : `${record.organization} · ${record.phone}`;
      return `<div class="public-update-item ${kind === "alerts" && record.severity === "HIGH" ? "public-urgent" : kind === "avoidAreas" ? "public-info-warning" : ""}"><strong>${escapeHtml(record.name ?? record.title)}</strong><small>${escapeHtml(extra)}</small></div>`;
    }).join("") : `<p class="public-empty">No demo ${kind === "alerts" ? "alerts" : kind === "avoidAreas" ? "avoid areas" : "contacts"} have been added.</p>`;
  };
  renderItems("#public-alerts", data.alerts, "alerts");
  renderItems("#public-avoid-areas", data.avoidAreas, "avoidAreas");
  renderItems("#public-contacts", data.contacts, "contacts");
}

function renderLocation() {
  const location = selectedLocation;
  const isLive = locationWatchId !== null && hasFreshTrackedLocation && location?.source === "device";
  elements.locationError.hidden = true;
  elements.locationDetail.hidden = !location;
  elements.locationMessage.hidden = Boolean(location);
  elements.demoLocation.hidden = Boolean(location);
  elements.clearLocation.hidden = !location;
  elements.requestLocation.textContent = location
    ? locationWatchId !== null && !hasFreshTrackedLocation ? "Waiting for live GPS…" : location.label
    : "Not selected";
  elements.requestSubmit.disabled = !location || (locationWatchId !== null && !hasFreshTrackedLocation);
  if (!location) {
    elements.locationSummary.textContent = "Choose a location to see distances";
  } else {
    const source = isLive ? "Live GPS" : location.source === "device" ? "Device GPS" : location.source === "manual" ? "Mapbox search" : "Sample location";
    const accuracy = location.accuracy ? ` · ±${Math.round(location.accuracy)} m` : "";
    const freshness = isLive ? "updated just now" : `confirmed ${relativeTime(location.timestamp)}`;
    elements.locationDetail.innerHTML = `<div class="location-name">${escapeHtml(location.label)}</div><div class="location-meta">${source}${accuracy} · ${freshness}</div>${location.accuracy ? `<div class="accuracy-bar"><span style="width:${Math.max(8, Math.min(100, 100 - location.accuracy / 20))}%"></span></div>` : ""}`;
    elements.locationSummary.textContent = `${isLive ? "Live location" : location.label} · nearby locations sorted by distance`;
  }
  map?.setLocation(location);
  renderFacilities();
  if (selectedFacility) renderFacilityDetail();
}

function chooseLocation(location) {
  stopLocationTracking();
  setSelectedLocation(location);
  showToast("Location confirmed. Check the map and nearby list.");
  elements.searchResults.hidden = true;
  elements.searchInput.value = "";
}

function setSelectedLocation(location) {
  map?.clearRoute();
  elements.routeMessage.textContent = "";
  selectedLocation = location;
  if (location.source === "manual") clearSavedLocation();
  else saveLocation(location);
  renderLocation();
}

function stopLocationTracking() {
  if (locationWatchId === null) return;
  stopDeviceLocationWatch(locationWatchId);
  locationWatchId = null;
  hasFreshTrackedLocation = false;
  elements.locate.setAttribute("aria-pressed", "false");
  elements.locate.innerHTML = '<span aria-hidden="true">◎</span> Use my location';
}

function startLocationTracking() {
  let watchId;
  watchId = watchDeviceLocation((location) => {
    if (locationWatchId !== watchId) return;
    hasFreshTrackedLocation = true;
    setSelectedLocation(location);
  }, (error, code) => {
    if (locationWatchId !== watchId) return;
    if (code === 1) {
      stopLocationTracking();
      renderLocation();
    }
    showLocationError(error);
  });
  locationWatchId = watchId;
  hasFreshTrackedLocation = false;
  elements.locate.setAttribute("aria-pressed", "true");
  elements.locate.innerHTML = '<span aria-hidden="true">■</span> Stop live location';
  renderLocation();
}

function updateConnection() {
  const online = navigator.onLine;
  elements.connection.classList.toggle("online", online);
  elements.connection.classList.toggle("offline", !online);
  elements.connection.querySelector("span").textContent = online ? "Online" : "Offline · actions saved here";
  elements.queueStatus.textContent = online
    ? (window.AEGIS_CONFIG?.syncMode === "convex" ? "Syncing with Convex when available" : "Demo mode · saved to this browser only")
    : "Requests wait on this device until connection returns";
}

async function refreshQueue() {
  try {
    const actions = await pendingActions();
    const failed = actions.filter((action) => action.status === "FAILED").length;
    elements.queueCount.textContent = `${actions.length} pending${failed ? ` · ${failed} need attention` : ""}`;
    elements.sync.disabled = !navigator.onLine || actions.length === 0;
    if (actions.length && navigator.onLine) {
      const result = await syncPendingActions((event) => {
        if (event.phase === "failed") elements.queueStatus.textContent = `Retry scheduled · ${event.error.message}`;
      });
      if (result.synced) showToast(`${result.synced} pending request${result.synced === 1 ? "" : "s"} synchronized.`);
      const remaining = await pendingActions();
      elements.queueCount.textContent = `${remaining.length} pending`;
    }
  } catch (error) {
    elements.queueStatus.textContent = error instanceof Error ? error.message : "Local queue unavailable";
  }
}

async function refreshMyRequests() {
  try {
    if (window.AEGIS_CONFIG?.syncMode === "convex") {
      elements.myRequestsStatus.textContent = "Your requests will appear here after the authenticated backend integration is connected.";
      elements.myRequestsList.innerHTML = "";
      return;
    }

    const ids = getDemoRequesterActionIds();
    const [syncedActions, queuedActions] = await Promise.all([
      listDemoRequesterActions(ids),
      pendingActions(),
    ]);
    const requests = new Map(syncedActions.map((action) => [action.offlineActionId, action]));
    for (const action of queuedActions) {
      if (ids.includes(action.offlineActionId) && !requests.has(action.offlineActionId)) {
        requests.set(action.offlineActionId, action);
      }
    }
    const ownedRequests = [...requests.values()].sort((a, b) => b.createdAt - a.createdAt);

    if (ownedRequests.length === 0) {
      elements.myRequestsStatus.textContent = "Requests you submit from this browser will appear here.";
      elements.myRequestsList.innerHTML = "";
      return;
    }

    elements.myRequestsStatus.textContent = "Demo request history is local to this browser and site address.";
    elements.myRequestsList.innerHTML = ownedRequests.map((action) => {
      const status = action.status === "ACCEPTED"
        ? `Accepted by ${action.assignedVolunteer?.name ?? "a volunteer"}`
        : action.status === "PENDING" && action.offlineActionId && !syncedActions.some((saved) => saved.offlineActionId === action.offlineActionId)
          ? "Waiting to sync"
          : action.status === "PENDING" ? "Waiting for a volunteer" : action.status;
      const people = Number(action.payload?.peopleCount);
      const peopleText = Number.isFinite(people) && people > 0
        ? `${people} ${people === 1 ? "person" : "people"}`
        : "People count unavailable";
      return `<article class="my-request-card">
        <div><strong>${escapeHtml(action.payload?.assistanceType ?? "Assistance")}</strong><small>${escapeHtml(peopleText)}</small></div>
        <span class="my-request-status">${escapeHtml(status)}</span>
      </article>`;
    }).join("");
  } catch (error) {
    elements.myRequestsStatus.textContent = error instanceof Error ? error.message : "Could not load your demo requests.";
    elements.myRequestsList.innerHTML = "";
  }
}

function showLocationError(error) {
  elements.locationError.textContent = locationErrorMessage(error);
  elements.locationError.hidden = false;
}

elements.locate.addEventListener("click", () => {
  if (locationWatchId !== null) {
    stopLocationTracking();
    renderLocation();
    showToast("Live location sharing stopped.");
    return;
  }
  try {
    startLocationTracking();
  } catch (error) {
    showLocationError(error);
  }
});

window.addEventListener("pagehide", stopLocationTracking);

elements.searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = elements.searchInput.value.trim();
  if (query.length < 3) {
    showToast("Enter at least 3 characters to search.");
    return;
  }
  const submit = elements.searchForm.querySelector("button");
  submit.disabled = true;
  submit.textContent = "Searching…";
  try {
    const places = await searchPlaces(query, window.AEGIS_CONFIG?.mapboxToken, selectedLocation);
    if (!places.length) throw new Error("No matching places found. Try a nearby landmark or area name.");
    elements.searchResults.innerHTML = places.map((place, index) => `<button class="search-result" data-place-index="${index}" type="button"><strong>${escapeHtml(place.label)}</strong><small>${escapeHtml(place.context)}</small></button>`).join("");
    elements.searchResults.hidden = false;
    elements.searchResults.querySelectorAll("[data-place-index]").forEach((button) => button.addEventListener("click", () => chooseLocation(places[Number(button.dataset.placeIndex)])));
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Place search failed.");
  } finally {
    submit.disabled = false;
    submit.textContent = "Search";
  }
});

document.addEventListener("click", (event) => {
  if (!elements.searchResults.contains(event.target) && !elements.searchForm.contains(event.target)) elements.searchResults.hidden = true;
});

elements.clearLocation.addEventListener("click", () => {
  stopLocationTracking();
  selectedLocation = null;
  clearSavedLocation();
  renderLocation();
});

elements.demoLocation.addEventListener("click", () => chooseLocation({
  latitude: 30.3255,
  longitude: 78.0413,
  accuracy: null,
  timestamp: Date.now(),
  source: "demo",
  label: "Sample location · Dehradun",
}));

elements.radius.addEventListener("change", renderFacilities);
elements.closeDetail.addEventListener("click", () => {
  selectedFacility = null;
  routeController?.abort();
  map?.clearRoute();
  elements.facilityDetail.hidden = true;
});
elements.routeButton.addEventListener("click", requestWalkingRoute);
elements.filters.forEach((button) => button.addEventListener("click", () => {
  elements.filters.forEach((filter) => filter.classList.toggle("is-active", filter === button));
  activeType = button.dataset.filter;
  renderFacilities();
}));

elements.requestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (locationWatchId !== null && !hasFreshTrackedLocation) {
    elements.requestMessage.textContent = "Wait for your current GPS location before saving this request.";
    return;
  }
  if (!selectedLocation) {
    elements.requestMessage.textContent = "Choose and confirm a location before saving a request.";
    showToast("A request needs a confirmed location.");
    return;
  }
  const submit = elements.requestForm.querySelector("button[type=submit]");
  submit.disabled = true;
  const action = createOfflineAction({
    assistanceType: $("#request-type").value,
    peopleCount: Number($("#people-count").value),
    description: $("#request-description").value.trim(),
  }, selectedLocation);
  try {
    if (navigator.onLine) {
      const result = await sendNewAction(action);
      if (result.sent) {
        elements.requestMessage.textContent = window.AEGIS_CONFIG?.syncMode === "convex"
          ? "Sent to Convex. The server will enforce the offlineActionId."
          : "Saved to this browser's demo server. Convex is not connected.";
        showToast("Request saved. Keep emergency services available for urgent danger.");
      } else {
        await enqueueAction(action);
        elements.requestMessage.textContent = "Connection failed. Request saved locally for retry.";
        showToast("Request saved on this device and will retry when online.");
      }
    } else {
      await enqueueAction(action);
      elements.requestMessage.textContent = "Offline: request saved on this device, pending synchronization.";
      showToast("Request saved on this device. It has not reached volunteers yet.");
    }
    if (window.AEGIS_CONFIG?.syncMode !== "convex") rememberDemoRequesterAction(action.offlineActionId);
    elements.requestForm.reset();
    $("#people-count").value = "1";
    await refreshMyRequests();
  } catch (error) {
    elements.requestMessage.textContent = error instanceof Error ? error.message : "Could not save the request.";
    showToast("Could not save the request. Check browser storage settings.");
  } finally {
    submit.disabled = !selectedLocation || (locationWatchId !== null && !hasFreshTrackedLocation);
    await refreshQueue();
  }
});

elements.sync.addEventListener("click", async () => {
  const result = await syncPendingActions(undefined, { retryFailed: true });
  elements.queueStatus.textContent = result.offline ? "Still offline. The queue is saved on this device." : result.remaining ? "Some actions remain queued for retry." : "Queue is up to date.";
  await refreshQueue();
});

window.addEventListener("online", () => { updateConnection(); void refreshQueue(); });
window.addEventListener("offline", updateConnection);
window.addEventListener("aegis:queue-updated", () => { void refreshQueue(); });
window.addEventListener("storage", (event) => {
  if (event.key === "aegis:demo-server-actions:v1") void refreshMyRequests();
  if (event.key === "aegis:admin-data:v1") {
    facilities = getFacilities();
    map?.setFacilities(facilities);
    renderFacilities();
    renderPublicInformation();
  }
});
window.addEventListener("aegis:demo-requests-updated", () => { void refreshMyRequests(); });

updateConnection();
map = createMap(window.AEGIS_CONFIG?.mapboxToken, selectedLocation, facilities, {
  onFacilitySelect: showFacilityDetails,
  onMapError: (message) => showToast(message),
});
renderLocation();
renderPublicInformation();
void refreshMyRequests();
setInterval(() => { if (!elements.facilityDetail.hidden) renderFacilityDetail(); }, 1000);
void refreshQueue();
setInterval(() => { void refreshMyRequests(); }, 10_000);
setInterval(() => { void refreshQueue(); }, 15_000);
