import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireRole } from "./lib/auth";

const resourceType = v.union(
  v.literal("food"), v.literal("water"), v.literal("first_aid"),
  v.literal("medicine"), v.literal("blankets"), v.literal("vehicles"),
  v.literal("other"),
);
const inventoryItem = v.object({ type: resourceType, quantity: v.number(), unit: v.string() });

export const replaceInventory = mutation({
  args: {
    facilityType: v.union(v.literal("reliefStation"), v.literal("shelter")),
    stationId: v.optional(v.id("reliefStations")),
    shelterId: v.optional(v.id("shelters")),
    items: v.array(inventoryItem),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const isStation = args.facilityType === "reliefStation";
    const facilityId = isStation ? args.stationId : args.shelterId;
    if (!facilityId || (isStation && args.shelterId) || (!isStation && args.stationId)) {
      throw new Error("Choose exactly one matching facility.");
    }
    const facility = await ctx.db.get(facilityId);
    if (!facility) throw new Error("Facility not found.");
    for (const item of args.items) {
      if (!Number.isFinite(item.quantity) || item.quantity < 0 || !item.unit.trim()) {
        throw new Error("Resource quantities must be non-negative numbers with a unit.");
      }
    }
    const existing = isStation
      ? await ctx.db.query("resources").withIndex("by_reliefStationId", (q) => q.eq("reliefStationId", facilityId)).collect()
      : await ctx.db.query("resources").withIndex("by_shelterId", (q) => q.eq("shelterId", facilityId)).collect();
    for (const item of existing) await ctx.db.delete(item._id);
    const now = Date.now();
    for (const item of args.items) {
      await ctx.db.insert("resources", {
        ...(isStation ? { reliefStationId: facilityId } : { shelterId: facilityId }),
        type: item.type,
        quantity: item.quantity,
        unit: item.unit.trim(),
        updatedAt: now,
      });
    }
    await ctx.db.patch(facilityId, { updatedAt: now });
  },
});
