import { query } from "./_generated/server";

export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const [stations, shelters] = await Promise.all([
      ctx.db.query("reliefStations")
        .withIndex("by_verificationStatus", (q) => q.eq("verificationStatus", "verified"))
        .collect(),
      ctx.db.query("shelters")
        .withIndex("by_verificationStatus", (q) => q.eq("verificationStatus", "verified"))
        .collect(),
    ]);
    const activeStations = stations.filter((item) => item.archivedAt === undefined);
    const activeShelters = shelters.filter((item) => item.archivedAt === undefined);
    const [stationCards, shelterCards] = await Promise.all([
      Promise.all(activeStations.map(async (station) => ({
        ...station,
        type: "station",
        resources: await ctx.db.query("resources")
          .withIndex("by_reliefStationId", (q) => q.eq("reliefStationId", station._id))
          .collect(),
      }))),
      Promise.all(activeShelters.map(async (shelter) => ({
        ...shelter,
        type: "shelter",
        availableCapacity: Math.max(0, shelter.capacity - shelter.currentOccupancy),
        resources: await ctx.db.query("resources")
          .withIndex("by_shelterId", (q) => q.eq("shelterId", shelter._id))
          .collect(),
      }))),
    ]);
    return [...stationCards, ...shelterCards];
  },
});
