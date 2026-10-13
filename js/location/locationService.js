const SELECTED_LOCATION_KEY = "aegis:selected-location:v1";

export function getSavedLocation() {
  try {
    const saved = localStorage.getItem(SELECTED_LOCATION_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

export function saveLocation(location) {
  localStorage.setItem(SELECTED_LOCATION_KEY, JSON.stringify(location));
}

export function clearSavedLocation() {
  localStorage.removeItem(SELECTED_LOCATION_KEY);
}

export function getDeviceLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This browser does not provide location. Search for a place instead."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(toDeviceLocation(position)),
      (error) => reject(createLocationError(error)),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  });
}

export function watchDeviceLocation(onLocation, onError) {
  if (!navigator.geolocation) {
    throw new Error("This browser does not provide location. Search for a place instead.");
  }
  return navigator.geolocation.watchPosition(
    (position) => onLocation(toDeviceLocation(position)),
    (error) => onError(createLocationError(error), error.code),
    { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
  );
}

export function stopDeviceLocationWatch(watchId) {
  navigator.geolocation?.clearWatch(watchId);
}

export function locationErrorMessage(error) {
  return error instanceof Error ? error.message : "Location could not be determined.";
}

function toDeviceLocation({ coords, timestamp }) {
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy,
    timestamp,
    source: "device",
    label: "Device location",
  };
}

function createLocationError(error) {
  const message = error.code === error.PERMISSION_DENIED
    ? "Location permission was denied. Search for a place to choose your location."
    : error.code === error.POSITION_UNAVAILABLE
      ? "Your device could not determine a location. Try again or search for a place."
      : "Location took too long. Try again or search for a place.";
  return new Error(message);
}
