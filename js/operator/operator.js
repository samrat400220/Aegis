import { newRecordId, readAdminData, saveAdminData } from "../data/facilityStore.js?v=dehradun-demo-20261007";

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
const labels = { facilities: "Shelter or relief station", alerts: "Public alert", avoidAreas: "Area to avoid", contacts: "Emergency contact" };
let data = readAdminData();
const templates = {
  facilities: `<div class="operator-field-block"><label for="f-type">Facility type</label><select id="f-type"><option value="shelter">Shelter</option><option value="station">Relief station</option></select><label for="f-name">Facility name</label><input id="f-name" required maxlength="100" placeholder="Official facility name"/><label for="f-address">Address or landmark</label><input id="f-address" required maxlength="180" placeholder="Street, area, city"/><p class="operator-help">Enter verified map coordinates so the location can appear in the nearby list.</p><div class="form-grid"><div><label for="f-lat">Latitude</label><input id="f-lat" type="number" step="any" min="-90" max="90" required placeholder="e.g. 28.6139"/></div><div><label for="f-lon">Longitude</label><input id="f-lon" type="number" step="any" min="-180" max="180" required placeholder="e.g. 77.2090"/></div></div><label for="f-status">Current status</label><select id="f-status"><option>OPEN</option><option>LIMITED</option><option>FULL</option><option>TEMPORARILY_CLOSED</option><option>EMERGENCY</option></select><div id="f-shelter-fields" class="form-grid"><div><label for="f-capacity">Total capacity</label><input id="f-capacity" type="number" min="0" value="0"/></div><div><label for="f-occupancy">Current occupancy</label><input id="f-occupancy" type="number" min="0" value="0"/></div></div><div id="f-station-fields" class="form-grid three-cols" hidden><div><label for="f-water">Water units</label><input id="f-water" type="number" min="0" value="0"/></div><div><label for="f-food">Food units</label><input id="f-food" type="number" min="0" value="0"/></div><div><label for="f-firstaid">First-aid kits</label><input id="f-firstaid" type="number" min="0" value="0"/></div><div><label for="f-blankets">Blankets</label><input id="f-blankets" type="number" min="0" value="0"/></div><div><label for="f-transport">Transport seats</label><input id="f-transport" type="number" min="0" value="0"/></div></div><label for="f-contact">Contact or operating note</label><input id="f-contact" maxlength="160" placeholder="Optional"/></div>`,
  alerts: `<div class="operator-field-block"><label for="f-title">Alert title</label><input id="f-title" required maxlength="100" placeholder="Short, specific warning"/><label for="f-severity">Severity</label><select id="f-severity"><option>LOW</option><option selected>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select><label for="f-instruction">What should people do?</label><textarea id="f-instruction" required maxlength="500" rows="3" placeholder="Clear action and affected area"></textarea></div>`,
  avoidAreas: `<div class="operator-field-block"><label for="f-name">Area name</label><input id="f-name" required maxlength="100" placeholder="e.g. East bridge"/><label for="f-address">Location or landmark</label><input id="f-address" required maxlength="180" placeholder="Road, neighborhood, or landmark"/><label for="f-reason">Why should people avoid it?</label><textarea id="f-reason" required maxlength="300" rows="3" placeholder="Explain the hazard and its extent"></textarea></div>`,
  contacts: `<div class="operator-field-block"><label for="f-name">Service or organization</label><input id="f-name" required maxlength="100" placeholder="e.g. Ambulance"/><label for="f-phone">Verified phone number</label><input id="f-phone" type="tel" required maxlength="40" placeholder="Include area or country code"/><label for="f-organization">Official organization</label><input id="f-organization" required maxlength="100" placeholder="Responsible agency"/></div>`
};

function recordsFor(kind) { return (data[kind] ?? []).filter((record) => !record.archived); }
function syncFacilityFields() {
  if (!$("#f-type")) return;
  const shelter = $("#f-type").value === "shelter";
  $("#f-shelter-fields").hidden = !shelter;
  $("#f-station-fields").hidden = shelter;
  if ($("#f-status")) $("#f-status").querySelector('option[value="FULL"]')?.toggleAttribute("hidden", !shelter);
  if (!shelter && $("#f-status").value === "FULL") $("#f-status").value = "OPEN";
}
function populate(record) {
  if (!record) return;
  const kind = $("#proposal-kind").value;
  const value = (id, val) => { const input = $(id); if (input) input.value = val ?? ""; };
  if (kind === "facilities") {
    value("#f-type", record.type); syncFacilityFields();
    value("#f-name", record.name); value("#f-address", record.location?.address); value("#f-lat", record.location?.latitude); value("#f-lon", record.location?.longitude); value("#f-status", record.status); value("#f-capacity", record.capacity ?? 0); value("#f-occupancy", record.currentOccupancy ?? 0); value("#f-water", record.resources?.find((x) => x.type === "Water")?.quantity ?? 0); value("#f-food", record.resources?.find((x) => x.type === "Food")?.quantity ?? 0); value("#f-firstaid", record.resources?.find((x) => x.type === "First aid")?.quantity ?? 0); value("#f-blankets", record.resources?.find((x) => x.type === "Blankets")?.quantity ?? 0); value("#f-transport", record.resources?.find((x) => x.type === "Transport")?.quantity ?? 0); value("#f-contact", record.contact);
  } else if (kind === "alerts") { value("#f-title", record.title); value("#f-severity", record.severity); value("#f-instruction", record.instruction); }
  else if (kind === "avoidAreas") { value("#f-name", record.name); value("#f-address", record.address); value("#f-reason", record.reason); }
  else { value("#f-name", record.name); value("#f-phone", record.phone); value("#f-organization", record.organization); }
}
function renderForm() {
  const kind = $("#proposal-kind").value;
  const updating = $("#proposal-operation").value === "update";
  const records = recordsFor(kind);
  $("#proposal-fields").innerHTML = templates[kind];
  $("#proposal-target-wrap").hidden = !updating;
  $("#proposal-target").innerHTML = records.map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.name ?? r.title ?? "Unnamed record")}</option>`).join("");
  if (updating && records.length) populate(records.find((r) => r.id === $("#proposal-target").value));
  if ($("#f-type")) $("#f-type").disabled = updating;
  if (updating && !records.length) $("#proposal-fields").insertAdjacentHTML("afterbegin", `<p class="admin-empty">There are no active ${escapeHtml(labels[kind].toLowerCase())} records to update yet. Choose “Add new” to submit one.</p>`);
  $("#proposal-target").disabled = !records.length;
  $("#operator-form").querySelector('button[type="submit"]').disabled = updating && !records.length;
  $("#f-type")?.addEventListener("change", syncFacilityFields);
  if (kind === "facilities") syncFacilityFields();
}
function collect() {
  const kind = $("#proposal-kind").value;
  const value = (id) => $(id)?.value.trim() ?? "";
  if (kind === "facilities") {
    const type = value("#f-type");
    const record = { type, name: value("#f-name"), location: { address: value("#f-address"), latitude: Number(value("#f-lat")), longitude: Number(value("#f-lon")) }, status: value("#f-status"), contact: value("#f-contact") };
    if (type === "shelter") { record.capacity = Number(value("#f-capacity")); record.currentOccupancy = Number(value("#f-occupancy")); }
    else record.resources = [{ type: "Water", quantity: Number(value("#f-water")) }, { type: "Food", quantity: Number(value("#f-food")) }, { type: "First aid", quantity: Number(value("#f-firstaid")) }, { type: "Blankets", quantity: Number(value("#f-blankets")) }, { type: "Transport", quantity: Number(value("#f-transport")) }];
    return record;
  }
  if (kind === "alerts") return { title: value("#f-title"), severity: value("#f-severity"), instruction: value("#f-instruction") };
  if (kind === "avoidAreas") return { name: value("#f-name"), address: value("#f-address"), reason: value("#f-reason") };
  return { name: value("#f-name"), phone: value("#f-phone"), organization: value("#f-organization") };
}
function statusLabel(status) { return status === "approved" ? "Approved" : status === "rejected" ? "Not approved" : "Waiting for admin"; }
function renderHistory() {
  const name = $("#operator-name").value.trim();
  const proposals = (data.proposals ?? []).filter((p) => !name || p.operatorName === name).sort((a, b) => b.submittedAt - a.submittedAt);
  $("#operator-submission-count").textContent = `${proposals.length} submission${proposals.length === 1 ? "" : "s"}`;
  $("#operator-submissions").innerHTML = proposals.length ? proposals.slice(0, 12).map((p) => {
    const subject = p.submission?.name ?? p.submission?.title ?? "Update";
    return `<article class="submission-row"><div><strong>${escapeHtml(subject)}</strong><span>${escapeHtml(p.operation === "create" ? "New" : "Update")} · ${escapeHtml(labels[p.kind])} · ${new Date(p.submittedAt).toLocaleString()}</span></div><span class="submission-status status-${escapeHtml(p.status)}"><i></i>${escapeHtml(statusLabel(p.status))}</span></article>`;
  }).join("") : `<div class="admin-empty">Your submissions and their review status will appear here.</div>`;
}

$("#proposal-kind").addEventListener("change", renderForm);
$("#proposal-operation").addEventListener("change", renderForm);
$("#proposal-target").addEventListener("change", () => populate(recordsFor($("#proposal-kind").value).find((r) => r.id === $("#proposal-target").value)));
$("#operator-name").value = localStorage.getItem("aegis:operator-name") ?? "";
$("#operator-name").addEventListener("input", (event) => { localStorage.setItem("aegis:operator-name", event.target.value.trim()); renderHistory(); });
$("#operator-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const kind = $("#proposal-kind").value;
  const operation = $("#proposal-operation").value;
  const record = collect();
  if (kind === "facilities" && (!Number.isFinite(record.location.latitude) || !Number.isFinite(record.location.longitude) || record.location.latitude < -90 || record.location.latitude > 90 || record.location.longitude < -180 || record.location.longitude > 180)) { $("#operator-message").textContent = "Enter valid latitude and longitude for this location."; return; }
  if (kind === "facilities" && record.type === "shelter" && record.currentOccupancy > record.capacity) { $("#operator-message").textContent = "Occupancy cannot exceed the shelter’s capacity."; return; }
  const proposals = data.proposals ?? (data.proposals = []);
  proposals.unshift({ id: newRecordId("proposal"), kind, operation, targetId: operation === "update" ? $("#proposal-target").value : null, submission: record, operatorName: $("#operator-name").value.trim() || "Field operator", notes: $("#proposal-notes").value.trim(), submittedAt: Date.now(), status: "pending" });
  try { saveAdminData(data); data = readAdminData(); $("#proposal-notes").value = ""; renderHistory(); $("#operator-message").textContent = "Sent for review. The public directory changes only after admin approval."; }
  catch { $("#operator-message").textContent = "Could not save. Check browser storage settings."; }
});
window.addEventListener("storage", (event) => { if (event.key === "aegis:admin-data:v1") { data = readAdminData(); renderForm(); renderHistory(); } });
renderForm(); renderHistory();
