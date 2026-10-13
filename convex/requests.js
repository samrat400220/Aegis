import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { currentUser, validatePoint } from "./lib/auth";

const requestType = v.union(
  v.literal("food"), v.literal("water"), v.literal("first_aid"),
  v.literal("transport"), v.literal("evacuation"), v.literal("shelter"),
  v.literal("other"),
);
const point = v.object({
  latitude: v.number(), longitude: v.number(),
  address: v.optional(v.string()), accuracy: v.optional(v.number()),
  capturedAt: v.optional(v.number()),
});

export const create = mutation({
  args: {
    clientActionId: v.string(),
    type: requestType,
    description: v.optional(v.string()),
    peopleCount: v.number(),
    location: point,
  },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    if (!args.clientActionId.trim()) throw new Error("Request ID is required for safe retry.");
    if (!Number.isInteger(args.peopleCount) || args.peopleCount < 1 || args.peopleCount > 100) {
      throw new Error("People count must be a whole number from 1 to 100.");
    }
    validatePoint(args.location);
    const existing = await ctx.db.query("requests")
      .withIndex("by_clientActionId", (q) => q.eq("clientActionId", args.clientActionId))
      .unique();
    if (existing) {
      if (existing.victimId !== user._id) throw new Error("Request ID is already in use.");
      return existing._id;
    }
    const now = Date.now();
    return await ctx.db.insert("requests", {
      victimId: user._id,
      clientActionId: args.clientActionId,
      type: args.type,
      description: args.description?.trim() || undefined,
      peopleCount: args.peopleCount,
      location: args.location,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const myRequests = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    return await ctx.db.query("requests")
      .withIndex("by_victimId_createdAt", (q) => q.eq("victimId", user._id))
      .order("desc")
      .collect();
  },
});

export const openSummariesForVolunteer = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    const volunteer = await ctx.db.query("volunteers")
      .withIndex("by_userId", (q) => q.eq("userId", user._id)).unique();
    if (!volunteer || volunteer.verificationStatus !== "verified") {
      throw new Error("A verified volunteer profile is required.");
    }
    const requests = await ctx.db.query("requests")
      .withIndex("by_status_createdAt", (q) => q.eq("status", "pending"))
      .order("desc")
      .collect();
    // Do not expose a requester's precise coordinates before a volunteer accepts.
    return requests.map((request) => ({
      id: request._id,
      type: request.type,
      description: request.description,
      peopleCount: request.peopleCount,
      area: request.location.address ?? "Area withheld until acceptance",
      createdAt: request.createdAt,
      status: request.status,
    }));
  },
});

export const accept = mutation({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    const volunteer = await ctx.db.query("volunteers")
      .withIndex("by_userId", (q) => q.eq("userId", user._id)).unique();
    if (!volunteer || volunteer.verificationStatus !== "verified" || volunteer.availability !== "available") {
      throw new Error("A verified, available volunteer profile is required.");
    }
    const request = await ctx.db.get(args.requestId);
    if (!request || request.status !== "pending") throw new Error("This request is no longer open.");
    const now = Date.now();
    await ctx.db.patch(request._id, {
      volunteerId: volunteer._id,
      status: "accepted",
      acceptedAt: now,
      updatedAt: now,
    });
    return { ...request, volunteerId: volunteer._id, status: "accepted", acceptedAt: now, updatedAt: now };
  },
});

export const myAssignedRequests = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    const volunteer = await ctx.db.query("volunteers")
      .withIndex("by_userId", (q) => q.eq("userId", user._id)).unique();
    if (!volunteer) return [];
    const [accepted, inProgress] = await Promise.all([
      ctx.db.query("requests").withIndex("by_volunteerId_status", (q) => q.eq("volunteerId", volunteer._id).eq("status", "accepted")).collect(),
      ctx.db.query("requests").withIndex("by_volunteerId_status", (q) => q.eq("volunteerId", volunteer._id).eq("status", "in_progress")).collect(),
    ]);
    return [...accepted, ...inProgress].sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const startWork = mutation({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    const volunteer = await ctx.db.query("volunteers")
      .withIndex("by_userId", (q) => q.eq("userId", user._id)).unique();
    const request = await ctx.db.get(args.requestId);
    if (!volunteer || !request || request.volunteerId !== volunteer._id || request.status !== "accepted") {
      throw new Error("Only the assigned volunteer can start this accepted request.");
    }
    await ctx.db.patch(request._id, { status: "in_progress", updatedAt: Date.now() });
  },
});

export const complete = mutation({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    const volunteer = await ctx.db.query("volunteers")
      .withIndex("by_userId", (q) => q.eq("userId", user._id)).unique();
    const request = await ctx.db.get(args.requestId);
    if (!volunteer || !request || request.volunteerId !== volunteer._id || request.status !== "in_progress") {
      throw new Error("Only the assigned volunteer can complete an in-progress request.");
    }
    const now = Date.now();
    await ctx.db.patch(request._id, { status: "completed", completedAt: now, updatedAt: now });
  },
});

export const cancelMine = mutation({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request || request.victimId !== user._id) throw new Error("Request not found.");
    if (request.status !== "pending" && request.status !== "accepted") {
      throw new Error("Only pending or accepted requests can be cancelled.");
    }
    const now = Date.now();
    await ctx.db.patch(request._id, { status: "cancelled", cancelledAt: now, updatedAt: now });
  },
});
