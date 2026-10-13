import { sampleFacilities } from "./facilities.js?v=dehradun-demo-20261007";

const STORAGE_KEY = "aegis:admin-data:v1";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function validCoordinate(value, min, max) {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : undefined;
}

function normalizeLocation(location, legacy = {}) {
  const latitude = validCoordinate(location?.latitude ?? legacy.latitude, -90, 90);
  const longitude = validCoordinate(location?.longitude ?? legacy.longitude, -180, 180);
  if (latitude === undefined || longitude === undefined) return undefined;
  return {
    ...location,
    latitude,
    longitude,
    address: location?.address ?? legacy.address ?? "",
  };
}

export function readAdminData() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = { proposals: [], ...JSON.parse(stored) };
      const sampleById = new Map(sampleFacilities.map((facility) => [facility.id, facility]));
      data.facilities = (data.facilities ?? []).map((facility) => {
        const merged = { ...(sampleById.get(facility.id) ?? {}), ...facility };
        // Prefer valid nested schema coordinates, migrate old flat coordinates,
        // then fall back to the bundled sample location for known sample IDs.
        merged.location = normalizeLocation(facility.location, facility)
          ?? normalizeLocation(sampleById.get(facility.id)?.location);
        delete merged.latitude;
        delete merged.longitude;
        delete merged.address;
        return merged;
      });
      const savedFacilityIds = new Set(data.facilities.map((facility) => facility.id));
      data.facilities.push(...clone(sampleFacilities.filter((facility) => !savedFacilityIds.has(facility.id))));
      data.proposals = (data.proposals ?? []).map((proposal) => {
        if (proposal.kind !== "facilities" || !proposal.submission) return proposal;
        const submission = proposal.submission;
        if (!submission.location) {
          submission.location = {
            latitude: Number(submission.latitude),
            longitude: Number(submission.longitude),
            address: submission.address ?? "",
          };
        }
        delete submission.latitude;
        delete submission.longitude;
        delete submission.address;
        return proposal;
      });
      return data;
    }
  } catch {
    // Recover with the bundled sample records when storage is unavailable.
  }
  return { facilities: clone(sampleFacilities), alerts: [], avoidAreas: [], contacts: [], proposals: [] };
}

export function saveAdminData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getFacilities() {
  const data = readAdminData();
  return (data.facilities ?? []).filter((facility) => !facility.archived
    && normalizeLocation(facility.location));
}

export function newRecordId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}
