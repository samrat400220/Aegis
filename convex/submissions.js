import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { currentUser, requireRole, validatePoint } from "./lib/auth";

const status = v.union(
  v.literal("open"), v.literal("limited"), v.literal("full"),
  v.literal("temporarily_closed"), v.literal("emergency"),
);
const point = v.object({
  latitude: v.number(), longitude: v.number(),
  address: v.optional(v.string()), accuracy: v.optional(v.number()),
  capturedAt: v.optional(v.number()),
});
const proposal = v.union(
  v.object({ name: v.string(), location: point, status, contactPhone: v.optional(v.string()) }),
  v.object({ name: v.string(), location: point, capacity: v.number(), currentOccupancy: v.number(), status, contactPhone: v.optional(v.string()) }),
);

export const submit = mutation({
  args: {
    entityType: v.union(v.literal("reliefStation"), v.literal("shelter")),
    operation: v.union(v.literal("create"), v.literal("update")),
    targetStationId: v.optional(v.id("reliefStations")),
    targetShelterId: v.optional(v.id("shelters")),
    proposedData: proposal,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    if (user.role !== "operator" && user.role !== "admin") {
      throw new Error("Operator role required to submit facility changes.");
    }
    const isStation = args.entityType === "reliefStation";
    const targetId = isStation ? args.targetStationId : args.targetShelterId;
    if ((args.operation === "create" && (args.targetStationId || args.targetShelterId))
      || (args.operation === "update" && !targetId)
      || (isStation && args.targetShelterId)
      || (!isStation && args.targetStationId)) {
      throw new Error("Submission operation and target do not match.");
    }
    validatePoint(args.proposedData.location);
    if (isStation && "capacity" in args.proposedData) {
      throw new Error("Relief-station submissions cannot include shelter capacity fields.");
    }
    if (!args.proposedData.name.trim() || args.proposedData.name.length > 120) {
      throw new Error("Facility name must contain 1 to 120 characters.");
    }
    if (!isStation) {
      const data = args.proposedData;
      if (!Number.isInteger(data.capacity) || data.capacity < 0
        || !Number.isInteger(data.currentOccupancy) || data.currentOccupancy < 0
        || data.currentOccupancy > data.capacity) {
        throw new Error("Shelter occupancy must be a whole number between zero and capacity.");
      }
    }
    if (args.operation === "update") {
      const existing = await ctx.db.get(targetId);
      if (!existing || (existing.operatorId && existing.operatorId !== user._id && user.role !== "admin")) {
        throw new Error("You cannot update this facility.");
      }
    }
    const now = Date.now();
    return await ctx.db.insert("submissions", {
      submittedBy: user._id,
      entityType: args.entityType,
      operation: args.operation,
      targetStationId: args.targetStationId,
      targetShelterId: args.targetShelterId,
      proposedData: args.proposedData,
      notes: args.notes?.trim() || undefined,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const mySubmissions = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    return await ctx.db.query("submissions")
      .withIndex("by_submittedBy_createdAt", (q) => q.eq("submittedBy", user._id))
      .order("desc")
      .collect();
  },
});

export const pendingForAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    return await ctx.db.query("submissions")
      .withIndex("by_status_createdAt", (q) => q.eq("status", "pending"))
      .order("asc")
      .collect();
  },
});

export const review = mutation({
  args: {
    submissionId: v.id("submissions"),
    decision: v.union(v.literal("approved"), v.literal("rejected")),
    reviewNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, "admin");
    const item = await ctx.db.get(args.submissionId);
    if (!item || item.status !== "pending") throw new Error("Submission is no longer pending.");
    const now = Date.now();
    if (args.decision === "approved") {
      const data = item.proposedData;
      validatePoint(data.location);
      if (item.entityType === "reliefStation") {
        if ("capacity" in data) throw new Error("Stored station submission has shelter-only fields.");
        const record = {
          name: data.name.trim(), operatorId: item.submittedBy, location: data.location,
          status: data.status, verificationStatus: "verified", contactPhone: data.contactPhone,
          verifiedBy: admin._id, verifiedAt: now, rejectionReason: undefined, archivedAt: undefined,
          updatedAt: now,
        };
        if (item.operation === "create") await ctx.db.insert("reliefStations", { ...record, createdAt: now });
        else await ctx.db.patch(item.targetStationId, record);
      } else {
        if (!Number.isInteger(data.capacity) || !Number.isInteger(data.currentOccupancy)
          || data.capacity < 0 || data.currentOccupancy < 0 || data.currentOccupancy > data.capacity) {
          throw new Error("Shelter occupancy must be between zero and capacity.");
        }
        const record = {
          name: data.name.trim(), operatorId: item.submittedBy, location: data.location,
          capacity: data.capacity, currentOccupancy: data.currentOccupancy, status: data.status,
          verificationStatus: "verified", contactPhone: data.contactPhone,
          verifiedBy: admin._id, verifiedAt: now, rejectionReason: undefined, archivedAt: undefined,
          updatedAt: now,
        };
        if (item.operation === "create") await ctx.db.insert("shelters", { ...record, createdAt: now });
        else await ctx.db.patch(item.targetShelterId, record);
      }
    }
    await ctx.db.patch(item._id, {
      status: args.decision,
      reviewedBy: admin._id,
      reviewedAt: now,
      reviewNote: args.reviewNote?.trim() || undefined,
      updatedAt: now,
    });
  },
});
