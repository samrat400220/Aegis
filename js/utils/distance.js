const EARTH_RADIUS_KM = 6371.0088;

export function distanceKm(from, to) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude))
    * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export function sortNearby(facilities, location, radiusKm = 5, type = "all") {
  if (!location) return [];
  return facilities
    .filter((facility) => Number.isFinite(facility.location?.latitude) && Number.isFinite(facility.location?.longitude))
    .filter((facility) => type === "all" || facility.type === type)
    .map((facility) => ({ ...facility, distanceKm: distanceKm(location, facility.location) }))
    .filter((facility) => facility.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}
