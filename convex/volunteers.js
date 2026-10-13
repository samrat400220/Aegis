import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { currentUser, requireRole, validatePoint } from "./lib/auth";

const capability = v.union(
  v.literal("food_water_distribution"), v.literal("first_aid"),
  v.literal("transportation"), v.literal("evacuation"),
  v.literal("shelter_assistance"), v.literal("other"),
);
const point = v.object({
  latitude: v.number(), longitude: v.number(),
  address: v.optional(v.string()), accuracy: v.optional(v.number()),
  capturedAt: v.optional(v.number()),
});

export const register = mutation({
  args: { capabilities: v.array(capability) },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    const now = Date.now();
    const existing = await ctx.db.query("volunteers")
      .withIndex("by_userId", (q) => q.eq("userId", user._id)).unique();
    if (user.role !== "volunteer") {
      throw new Error("Your account must have the volunteer role before registering a volunteer profile.");
    }
    if (existing) {
      await ctx.db.patch(existing._id, { capabilities: args.capabilities, updatedAt: now, lastActiveAt: now });
      return existing._id;
    }
    return await ctx.db.insert("volunteers", {
      userId: user._id,
      verificationStatus: "pending",
      availability: "unavailable",
      capabilities: args.capabilities,
      locationSharingEnabled: false,
      lastActiveAt: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const setAvailability = mutation({
  args: { availability: v.union(v.literal("available"), v.literal("unavailable")) },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    const volunteer = await ctx.db.query("volunteers")
      .withIndex("by_userId", (q) => q.eq("userId", user._id)).unique();
    if (!volunteer || volunteer.verificationStatus !== "verified") {
      throw new Error("A verified volunteer profile is required.");
    }
    const now = Date.now();
    await ctx.db.patch(volunteer._id, { availability: args.availability, lastActiveAt: now, updatedAt: now });
  },
});

export const updateMyLocation = mutation({
  args: { location: point },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    const volunteer = await ctx.db.query("volunteers")
      .withIndex("by_userId", (q) => q.eq("userId", user._id)).unique();
    if (!volunteer || volunteer.verificationStatus !== "verified") {
      throw new Error("A verified volunteer profile is required.");
    }
    validatePoint(args.location);
    const now = Date.now();
    await ctx.db.patch(volunteer._id, {
      location: { ...args.location, capturedAt: now },
      locationSharingEnabled: true,
      lastActiveAt: now,
      updatedAt: now,
    });
  },
});

export const clearMyLocation = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    const volunteer = await ctx.db.query("volunteers")
      .withIndex("by_userId", (q) => q.eq("userId", user._id)).unique();
    if (!volunteer) return;
    await ctx.db.patch(volunteer._id, {
      location: undefined,
      locationSharingEnabled: false,
      updatedAt: Date.now(),
    });
  },
});

export const myProfile = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    return await ctx.db.query("volunteers")
      .withIndex("by_userId", (q) => q.eq("userId", user._id)).unique();
  },
});

export const reviewVerification = mutation({
  args: {
    volunteerId: v.id("volunteers"),
    decision: v.union(v.literal("verified"), v.literal("rejected")),
    rejectionReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const volunteer = await ctx.db.get(args.volunteerId);
    if (!volunteer) throw new Error("Volunteer profile not found.");
    const now = Date.now();
    await ctx.db.patch(volunteer._id, {
      verificationStatus: args.decision,
      rejectionReason: args.decision === "rejected" ? args.rejectionReason?.trim() || "Verification was not approved." : undefined,
      updatedAt: now,
      lastActiveAt: now,
    });
  },
});
