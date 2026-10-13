export async function searchPlaces(query, token, proximity, permanent = false) {
  if (!token) throw new Error("Add a Mapbox public access token in config.js to search addresses.");
  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.searchParams.set("q", query);
  url.searchParams.set("access_token", token);
  url.searchParams.set("limit", "5");
  url.searchParams.set("country", "IN");
  url.searchParams.set("language", "en");
  url.searchParams.set("autocomplete", "false");
  if (permanent) url.searchParams.set("permanent", "true");
  if (proximity) url.searchParams.set("proximity", `${proximity.longitude},${proximity.latitude}`);

  const response = await fetch(url);
  if (!response.ok) throw new Error(response.status === 401 ? "Mapbox rejected the token. Check config.js and the token URL restrictions." : `Place search failed (${response.status}). Try again.`);
  const data = await response.json();
  return (data.features ?? []).map((feature) => ({
    id: feature.id,
    label: feature.properties?.name_preferred ?? feature.properties?.full_address ?? feature.properties?.name ?? "Matched place",
    context: feature.properties?.place_formatted ?? "",
    longitude: feature.geometry.coordinates[0],
    latitude: feature.geometry.coordinates[1],
    accuracy: null,
    timestamp: Date.now(),
    source: "manual",
  }));
}
