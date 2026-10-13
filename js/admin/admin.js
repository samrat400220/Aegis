import { newRecordId, readAdminData, saveAdminData } from "../data/facilityStore.js?v=dehradun-demo-20261007";
import { searchPlaces } from "../location/geocodingService.js";

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
let data = readAdminData();
let toastTimer;

function notify(message) {
  const toast = $("#admin-toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2800);
}

function message(selector, text, error = false) {
  const target = $(selector);
  target.textContent = text;
  target.style.color = error ? "#a44539" : "#738179";
}

function active(kind) {
  return (data[kind] ?? []).filter((record) => !record.archived);
}

function save() {
  saveAdminData(data);
  renderAll();
}

function setTab(name) {
  document.querySelectorAll(".admin-tab").forEach((tab) => {
    const selected = tab.dataset.tab === name;
    tab.classList.toggle("is-active", selected);
    tab.setAttribute("aria-selected", String(selected));
  });
  document.querySelectorAll("[data-panel]").forEach((panel) => { panel.hidden = panel.dataset.panel !== name; });
}

document.querySelectorAll(".admin-tab").forEach((tab) => tab.addEventListener("click", () => setTab(tab.dataset.tab)));

function renderStats() {
  $("#stat-facilities").textContent = String(active("facilities").length);
  $("#stat-alerts").textContent = String(active("alerts").length);
  $("#stat-avoid").textContent = String(active("avoidAreas").length);
  $("#stat-contacts").textContent = String(active("contacts").length);
  const pending = (data.proposals ?? []).filter((proposal) => proposal.status === "pending").length;
  $("#stat-pending").textContent = String(pending);
  $("#inbox-count").textContent = String(pending);
}

function renderFacilities() {
  const records = active("facilities");
  $("#facility-record-count").textContent = `${records.length} records`;
  $("#facility-records").innerHTML = records.length ? records.map((record) => {
    const detail = record.type === "shelter"
      ? `${Math.max(0, Number(record.capacity ?? 0) - Number(record.currentOccupancy ?? 0))} spaces available · ${record.location?.address ?? "Address unavailable"}`
      : `${(record.resources ?? []).filter((item) => Number(item.quantity) > 0).map((item) => `${item.type}: ${item.quantity}`).join(" · ") || record.detail || "No resources reported"} · ${record.location?.address ?? "Address unavailable"}`;
    return `<article class="admin-record"><div class="admin-record-main"><strong>${escapeHtml(record.name)}</strong><small>${escapeHtml(detail)}</small><div class="admin-record-meta"><span class="admin-tag">${escapeHtml(record.type)}</span><span class="admin-tag ${record.status === "OPEN" ? "" : "warning"}">${escapeHtml(String(record.status).replaceAll("_", " "))}</span></div></div><div class="admin-record-actions"><button type="button" data-edit-facility="${escapeHtml(record.id)}">Edit</button><button type="button" data-archive="facilities" data-record-id="${escapeHtml(record.id)}">Remove</button></div></article>`;
  }).join("") : `<div class="admin-empty">No facilities yet. Add one with the form.</div>`;
  document.querySelectorAll("[data-edit-facility]").forEach((button) => button.addEventListener("click", () => editFacility(button.dataset.editFacility)));
  document.querySelectorAll('[data-archive="facilities"]').forEach((button) => button.addEventListener("click", () => archiveRecord("facilities", button.dataset.recordId)));
}

function renderRecords(kind, selector, editAttribute, details) {
  const records = active(kind);
  $(selector).innerHTML = records.length ? records.map((record) => {
    const title = record.title ?? record.name;
    const severity = record.severity ? `<div class="admin-record-meta"><span class="admin-tag ${["HIGH", "CRITICAL"].includes(record.severity) ? "warning" : ""}">${escapeHtml(record.severity)}</span></div>` : "";
    return `<article class="admin-record"><div class="admin-record-main"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(details(record))}</small>${severity}</div><div class="admin-record-actions"><button type="button" ${editAttribute}="${escapeHtml(record.id)}">Edit</button><button type="button" data-archive="${escapeHtml(kind)}" data-record-id="${escapeHtml(record.id)}">Remove</button></div></article>`;
  }).join("") : `<div class="admin-empty">Nothing added yet. Use the form to add a record.</div>`;
  document.querySelectorAll(`[${editAttribute}]`).forEach((button) => button.addEventListener("click", () => editRecord(kind, button.getAttribute(editAttribute))));
  document.querySelectorAll(`[data-archive="${kind}"]`).forEach((button) => button.addEventListener("click", () => archiveRecord(kind, button.dataset.recordId)));
}

function archiveRecord(kind, id) {
  const record = data[kind].find((item) => item.id === id);
  if (!record) return;
  record.archived = true;
  record.updatedAt = Date.now();
  try {
    save();
    notify("Record removed from the active list.");
  } catch {
    record.archived = false;
    message("#facility-message", "Could not save. Check browser storage settings.", true);
  }
}

function renderAll() {
  renderStats();
  renderFacilities();
  renderRecords("alerts", "#alert-records", "data-edit-alert", (record) => `${record.severity} · ${record.instruction}`);
  renderRecords("avoidAreas", "#avoid-records", "data-edit-avoid", (record) => `${record.reason} · ${record.address}`);
  renderRecords("contacts", "#contact-records", "data-edit-contact", (record) => `${record.organization} · ${record.phone}`);
  renderProposals();
}

function renderProposals() {
  const pending = (data.proposals ?? []).filter((proposal) => proposal.status === "pending");
  $("#proposal-pending-label").textContent = `${pending.length} pending`;
  $("#proposal-records").innerHTML = pending.length ? pending.map((proposal) => {
    const fields = Object.entries(proposal.submission ?? {}).filter(([key, value]) => !["id", "resources", "archived", "updatedAt"].includes(key) && value !== "" && value != null).map(([key, value]) => {
      const displayValue = key === "location" && value && typeof value === "object"
        ? `${value.address ?? "Address unavailable"} (${value.latitude}, ${value.longitude})`
        : value;
      return `<div><span>${escapeHtml(key.replace(/([A-Z])/g, " $1"))}</span><strong>${escapeHtml(displayValue)}</strong></div>`;
    }).join("");
    const supplies = (proposal.submission?.resources ?? []).map((item) => `${escapeHtml(item.type)}: ${escapeHtml(item.quantity)}`).join(" · ");
    return `<article class="proposal-card" data-proposal-card="${escapeHtml(proposal.id)}"><div class="proposal-head"><div><span class="proposal-kind">${escapeHtml(proposal.operation)} · ${escapeHtml(proposal.kind.replace(/([A-Z])/g, " $1"))}</span><h3>${escapeHtml(proposal.submission?.name ?? proposal.submission?.title ?? "Operator update")}</h3></div><span class="admin-tag warning">PENDING</span></div><div class="proposal-fields">${fields}${supplies ? `<div><span>Supplies</span><strong>${supplies}</strong></div>` : ""}</div>${proposal.notes ? `<div class="proposal-notes"><strong>Operator’s source or context</strong><p>${escapeHtml(proposal.notes)}</p></div>` : ""}<p class="proposal-date">Submitted ${new Date(proposal.submittedAt).toLocaleString()}${proposal.operatorName ? ` · by ${escapeHtml(proposal.operatorName)}` : ""}</p><label class="verify-check"><input type="checkbox" data-verify="${escapeHtml(proposal.id)}" /> I verified this information with a trusted source.</label><div class="proposal-actions"><button class="button button-primary" type="button" data-approve="${escapeHtml(proposal.id)}" disabled>Approve and publish</button><button class="button button-light" type="button" data-reject="${escapeHtml(proposal.id)}">Reject</button></div></article>`;
  }).join("") : `<div class="admin-empty">You’re all caught up. New operator submissions will appear here.</div>`;
  document.querySelectorAll("[data-verify]").forEach((checkbox) => checkbox.addEventListener("change", () => { const button = document.querySelector(`[data-approve="${checkbox.dataset.verify}"]`); if (button) button.disabled = !checkbox.checked; }));
  document.querySelectorAll("[data-approve]").forEach((button) => button.addEventListener("click", () => reviewProposal(button.dataset.approve, "approved")));
  document.querySelectorAll("[data-reject]").forEach((button) => button.addEventListener("click", () => reviewProposal(button.dataset.reject, "rejected")));
}

function reviewProposal(id, decision) {
  const proposal = (data.proposals ?? []).find((item) => item.id === id && item.status === "pending");
  if (!proposal) return;
  if (decision === "approved") {
    const record = { ...proposal.submission, id: proposal.operation === "update" ? proposal.targetId : newRecordId(proposal.kind), updatedAt: Date.now(), archived: false };
    if (proposal.kind === "facilities") {
      if (!Number.isFinite(Number(record.location?.latitude)) || !Number.isFinite(Number(record.location?.longitude))) { notify("This facility needs valid coordinates before approval."); return; }
      record.location = { ...record.location, latitude: Number(record.location.latitude), longitude: Number(record.location.longitude) };
      if (record.type === "shelter") record.detail = `${Math.max(0, Number(record.capacity ?? 0) - Number(record.currentOccupancy ?? 0))} spaces available`;
      else record.detail = (record.resources ?? []).filter((item) => Number(item.quantity) > 0).map((item) => item.type).join(" · ") || "No resources reported";
    }
    const records = data[proposal.kind] ?? (data[proposal.kind] = []);
    const index = records.findIndex((item) => item.id === record.id);
    if (index < 0) records.push(record); else records[index] = { ...records[index], ...record };
  }
  proposal.status = decision;
  proposal.reviewedAt = Date.now();
  try { save(); notify(decision === "approved" ? "Verified update approved and published." : "Submission rejected."); }
  catch { data = readAdminData(); renderAll(); notify("Could not save the review. Check browser storage."); }
}

function setFacilityType(type) {
  $("#shelter-fields").hidden = type !== "shelter";
  $("#station-fields").hidden = type !== "station";
  const statuses = type === "shelter"
    ? ["OPEN", "LIMITED", "FULL", "TEMPORARILY_CLOSED", "EMERGENCY"]
    : ["OPEN", "LIMITED", "TEMPORARILY_CLOSED", "EMERGENCY"];
  const current = $("#facility-status").value;
  $("#facility-status").innerHTML = statuses.map((status) => `<option>${status}</option>`).join("");
  if (statuses.includes(current)) $("#facility-status").value = current;
}

$("#facility-type").addEventListener("change", (event) => setFacilityType(event.target.value));

function resetFacility() {
  $("#facility-form").reset();
  $("#facility-id").value = "";
  ["#facility-capacity", "#facility-occupancy", "#resource-water", "#resource-food", "#resource-first-aid", "#resource-blankets", "#resource-transport"].forEach((selector) => { $(selector).value = "0"; });
  $("#facility-latitude").value = "";
  $("#facility-longitude").value = "";
  $("#selected-address").textContent = "Choose a search result to set its map location.";
  $("#facility-form-title").textContent = "Add a shelter or relief station";
  $("#facility-save").textContent = "Save facility";
  $("#facility-cancel").hidden = true;
  setFacilityType("shelter");
  message("#facility-message", "");
}

function editFacility(id) {
  const record = data.facilities.find((item) => item.id === id);
  if (!record) return;
  $("#facility-id").value = record.id;
  $("#facility-type").value = record.type;
  setFacilityType(record.type);
  $("#facility-name").value = record.name ?? "";
  $("#facility-address").value = record.location?.address ?? "";
  $("#facility-latitude").value = String(record.location?.latitude ?? "");
  $("#facility-longitude").value = String(record.location?.longitude ?? "");
  $("#selected-address").textContent = `Saved map point: ${record.location?.latitude}, ${record.location?.longitude}`;
  $("#facility-status").value = record.status;
  $("#facility-capacity").value = String(record.capacity ?? 0);
  $("#facility-occupancy").value = String(record.currentOccupancy ?? 0);
  $("#resource-water").value = String(record.resources?.find((item) => item.type === "Water")?.quantity ?? 0);
  $("#resource-food").value = String(record.resources?.find((item) => item.type === "Food")?.quantity ?? 0);
  $("#resource-first-aid").value = String(record.resources?.find((item) => item.type === "First aid")?.quantity ?? 0);
  $("#resource-blankets").value = String(record.resources?.find((item) => item.type === "Blankets")?.quantity ?? 0);
  $("#resource-transport").value = String(record.resources?.find((item) => item.type === "Transport")?.quantity ?? 0);
  $("#facility-contact").value = record.contact ?? "";
  $("#facility-form-title").textContent = `Edit ${record.type === "shelter" ? "shelter" : "relief station"}`;
  $("#facility-save").textContent = "Save changes";
  $("#facility-cancel").hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

$("#facility-cancel").addEventListener("click", resetFacility);

$("#facility-search-button").addEventListener("click", async () => {
  const query = $("#facility-address").value.trim();
  if (query.length < 3) {
    message("#facility-message", "Enter an address or landmark first.", true);
    return;
  }
  const button = $("#facility-search-button");
  button.disabled = true;
  button.textContent = "Searching…";
  try {
    const places = await searchPlaces(query, window.AEGIS_CONFIG?.mapboxToken, null, true);
    if (!places.length) throw new Error("No matching places found. Try a nearby landmark.");
    $("#facility-search-results").innerHTML = places.map((place, index) => `<button class="admin-search-option" type="button" data-place-index="${index}"><strong>${escapeHtml(place.label)}</strong><small>${escapeHtml(place.context)}</small></button>`).join("");
    $("#facility-search-results").hidden = false;
    document.querySelectorAll("#facility-search-results [data-place-index]").forEach((option) => option.addEventListener("click", () => {
      const place = places[Number(option.dataset.placeIndex)];
      $("#facility-address").value = place.label;
      $("#facility-latitude").value = String(place.latitude);
      $("#facility-longitude").value = String(place.longitude);
      $("#selected-address").textContent = `Selected map point: ${place.latitude.toFixed(5)}, ${place.longitude.toFixed(5)}`;
      $("#facility-search-results").hidden = true;
      message("#facility-message", "Location selected. Review it before saving.");
    }));
  } catch (error) {
    message("#facility-message", error instanceof Error ? error.message : "Address search failed.", true);
  } finally {
    button.disabled = false;
    button.textContent = "Find on map";
  }
});

$("#facility-sample-location").addEventListener("click", () => {
  $("#facility-latitude").value = "30.3255";
  $("#facility-longitude").value = "78.0413";
  if (!$("#facility-address").value) $("#facility-address").value = "Sample location, Dehradun";
  $("#selected-address").textContent = "Sample demo coordinates selected. Search for a real address for actual data.";
});

$("#facility-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const type = $("#facility-type").value;
  const latitude = Number($("#facility-latitude").value);
  const longitude = Number($("#facility-longitude").value);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    message("#facility-message", "Find an address or use the sample point before saving.", true);
    return;
  }
  const id = $("#facility-id").value || newRecordId(type);
  const existing = data.facilities.find((item) => item.id === id);
  const record = { ...existing, id, type, name: $("#facility-name").value.trim(), location: { latitude, longitude, address: $("#facility-address").value.trim() }, status: $("#facility-status").value, updatedAt: Date.now(), contact: $("#facility-contact").value.trim(), archived: false };
  if (type === "shelter") {
    record.capacity = Number($("#facility-capacity").value);
    record.currentOccupancy = Number($("#facility-occupancy").value);
    record.detail = `${Math.max(0, record.capacity - record.currentOccupancy)} spaces available`;
    delete record.resources;
  } else {
    record.resources = [
      { type: "Water", quantity: Number($("#resource-water").value) },
      { type: "Food", quantity: Number($("#resource-food").value) },
      { type: "First aid", quantity: Number($("#resource-first-aid").value) },
      { type: "Blankets", quantity: Number($("#resource-blankets").value) },
      { type: "Transport", quantity: Number($("#resource-transport").value) },
    ];
    record.detail = record.resources.filter((item) => item.quantity > 0).map((item) => item.type).join(" · ") || "No resources reported";
    delete record.capacity;
    delete record.currentOccupancy;
  }
  const index = data.facilities.findIndex((item) => item.id === id);
  if (index < 0) data.facilities.push(record); else data.facilities[index] = record;
  try {
    save();
    resetFacility();
    notify("Facility saved in this browser. Refresh the public page to see it.");
  } catch {
    message("#facility-message", "Could not save. Check browser storage settings.", true);
  }
});

const configs = {
  alert: { kind: "alerts", tab: "alerts", form: "#alert-form", id: "#alert-id", title: "#alert-title", titleKey: "title", message: "#alert-message", heading: "#alert-form-title", headingText: "Publish a verified alert", submitText: "Save alert", fields: { "#alert-severity": "severity", "#alert-instruction": "instruction" }, editAttribute: "data-edit-alert" },
  avoid: { kind: "avoidAreas", tab: "avoidAreas", form: "#avoid-form", id: "#avoid-id", title: "#avoid-name", titleKey: "name", message: "#avoid-message", heading: "#avoid-form-title", headingText: "Mark an area to avoid", submitText: "Save area", fields: { "#avoid-address": "address", "#avoid-reason": "reason" }, editAttribute: "data-edit-avoid" },
  contact: { kind: "contacts", tab: "contacts", form: "#contact-form", id: "#contact-id", title: "#contact-name", titleKey: "name", message: "#contact-message", heading: "#contact-form-title", headingText: "Add an emergency contact", submitText: "Save contact", fields: { "#contact-phone": "phone", "#contact-organization": "organization" }, editAttribute: "data-edit-contact" },
};

function clearSimple(key) {
  const config = configs[key];
  $(config.form).reset();
  $(config.id).value = "";
  $(config.heading).textContent = config.headingText;
  $(config.form).querySelector("button[type=submit]").textContent = config.submitText;
  $(config.form).querySelector("[data-cancel]").hidden = true;
  message(config.message, "");
}

for (const [key, config] of Object.entries(configs)) {
  $(config.form).addEventListener("submit", (event) => {
    event.preventDefault();
    const id = $(config.id).value || newRecordId(key);
    const existing = data[config.kind].find((item) => item.id === id) ?? {};
    const record = { ...existing, id, updatedAt: Date.now(), archived: false, [config.titleKey]: $(config.title).value.trim() };
    for (const [selector, field] of Object.entries(config.fields)) record[field] = $(selector).value.trim();
    const index = data[config.kind].findIndex((item) => item.id === id);
    if (index < 0) data[config.kind].push(record); else data[config.kind][index] = record;
    try {
      save();
      clearSimple(key);
      notify("Saved in this browser. Refresh the public page to see the change.");
    } catch {
      message(config.message, "Could not save. Check browser storage settings.", true);
    }
  });
}

function editRecord(kind, id) {
  const key = kind === "alerts" ? "alert" : kind === "avoidAreas" ? "avoid" : "contact";
  const config = configs[key];
  const record = data[kind].find((item) => item.id === id);
  if (!record) return;
  $(config.id).value = record.id;
  $(config.title).value = record[config.titleKey] ?? "";
  for (const [selector, field] of Object.entries(config.fields)) $(selector).value = record[field] ?? "";
  $(config.heading).textContent = `Edit ${key === "alert" ? "alert" : key === "avoid" ? "area warning" : "contact"}`;
  $(config.form).querySelector("button[type=submit]").textContent = "Save changes";
  $(config.form).querySelector("[data-cancel]").hidden = false;
  setTab(config.tab);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll("[data-cancel]").forEach((button) => button.addEventListener("click", () => clearSimple(button.dataset.cancel)));
window.addEventListener("storage", (event) => { if (event.key === "aegis:admin-data:v1") { data = readAdminData(); renderAll(); } });
setFacilityType("shelter");
renderAll();
