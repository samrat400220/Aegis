export function createMap(token, initialLocation, facilities, callbacks) {
  const fallback = document.querySelector("#map-fallback");
  if (!token || !window.mapboxgl) {
    fallback.hidden = false;
    return { ready: Promise.resolve(false), setLocation() {}, setFacilities() {}, focusFacility() {}, showRoute() {}, clearRoute() {}, destroy() {} };
  }

  const map = new window.mapboxgl.Map({
    accessToken: token,
    container: "map",
    style: "mapbox://styles/mapbox/streets-v12",
    center: [initialLocation?.longitude ?? 78.0413, initialLocation?.latitude ?? 30.3255],
    zoom: initialLocation ? 12 : 10,
  });
  map.addControl(new window.mapboxgl.NavigationControl({ showCompass: false }), "top-right");
  const markers = new Map();
  let currentFacilities = facilities;
  let userMarker;
  let currentLocation = initialLocation;

  const ready = new Promise((resolve) => {
    map.once("load", () => {
      currentFacilities.forEach(addFacilityMarker);
      if (currentLocation) setLocation(currentLocation, false);
      resolve(true);
    });
    map.on("error", (event) => {
      if (event.error) callbacks.onMapError?.("Mapbox could not load the map. Check your public token and internet connection.");
    });
  });

  function setLocation(location, fly = true) {
    currentLocation = location;
    if (!location) {
      userMarker?.remove();
      userMarker = undefined;
      return;
    }
    if (!map.loaded()) return;
    const position = [location.longitude, location.latitude];
    if (!userMarker) {
      const element = document.createElement("div");
      element.className = "selected-marker";
      element.setAttribute("aria-label", "Selected location");
      userMarker = new window.mapboxgl.Marker({ element, anchor: "center" }).setLngLat(position).addTo(map);
    } else userMarker.setLngLat(position);
    if (fly) map.flyTo({ center: position, zoom: 13, duration: 700 });
  }

  function focusFacility(id) {
    const marker = markers.get(id);
    if (!marker) return;
    const point = marker.getLngLat();
    map.flyTo({ center: [point.lng, point.lat], zoom: 14, duration: 600 });
    marker.togglePopup();
  }

  function clearRoute() {
    if (!map.getSource("aegis-route")) return;
    if (map.getLayer("aegis-route-line")) map.removeLayer("aegis-route-line");
    map.removeSource("aegis-route");
  }

  async function showRoute(geometry) {
    await ready;
    clearRoute();
    map.addSource("aegis-route", { type: "geojson", data: { type: "Feature", properties: {}, geometry } });
    map.addLayer({
      id: "aegis-route-line",
      type: "line",
      source: "aegis-route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#bd8133", "line-width": 5, "line-opacity": 0.9 },
    });
    const coordinates = geometry.coordinates;
    if (coordinates?.length) {
      const bounds = coordinates.reduce((result, point) => result.extend(point), new window.mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));
      map.fitBounds(bounds, { padding: 70, maxZoom: 14, duration: 650 });
    }
  }

  function addFacilityMarker(facility) {
    const latitude = facility?.location?.latitude;
    const longitude = facility?.location?.longitude;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
      || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return;
    const element = document.createElement("div");
    element.className = `facility-marker ${facility.type}`;
    element.innerHTML = `<span aria-hidden="true">${facility.type === "shelter" ? "⌂" : "＋"}</span>`;
    element.setAttribute("aria-label", facility.type === "shelter" ? "Shelter" : "Relief station");
    const popup = new window.mapboxgl.Popup({ offset: 17, closeButton: false }).setHTML(
      `<div class="popup-title">${escapeHtml(facility.name)}</div><div class="popup-copy">${escapeHtml(facility.detail)} · ${escapeHtml(facility.status.replaceAll("_", " "))}</div>`,
    );
    const marker = new window.mapboxgl.Marker({ element }).setLngLat([longitude, latitude]).setPopup(popup).addTo(map);
    markers.set(facility.id, marker);
    element.addEventListener("click", () => callbacks.onFacilitySelect?.(facility));
  }

  function setFacilities(nextFacilities) {
    currentFacilities = nextFacilities;
    for (const marker of markers.values()) marker.remove();
    markers.clear();
    if (map.loaded()) currentFacilities.forEach(addFacilityMarker);
  }

  return { ready, setLocation, setFacilities, focusFacility, showRoute, clearRoute, destroy: () => map.remove() };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}
