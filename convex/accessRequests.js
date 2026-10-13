import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { currentUser, requireRole } from "./lib/auth";

const requestedRole = v.union(v.literal("volunteer"), v.literal("operator"));

export const request = mutation({
  args: { requestedRole, note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    if (user.role !== "requester" && user.role !== "victim") {
      throw new Error("Only requester accounts can apply for a volunteer or operator role.");
    }
    const applications = await ctx.db.query("accessRequests")
      .withIndex("by_userId_createdAt", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
    if (applications.some((application) => application.status === "pending")) {
      throw new Error("You already have a role request awaiting admin review.");
    }
    const note = args.note?.trim();
    if (note && note.length > 500) throw new Error("The application note cannot exceed 500 characters.");
    const now = Date.now();
    return await ctx.db.insert("accessRequests", {
      userId: user._id,
      requestedRole: args.requestedRole,
      note: note || undefined,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    return await ctx.db.query("accessRequests")
      .withIndex("by_userId_createdAt", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
  },
});

export const pendingForAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    const applications = await ctx.db.query("accessRequests")
      .withIndex("by_status_createdAt", (q) => q.eq("status", "pending"))
      .order("asc")
      .collect();
    return await Promise.all(applications.map(async (application) => ({
      ...application,
      user: await ctx.db.get(application.userId),
    })));
  },
});

export const review = mutation({
  args: {
    requestId: v.id("accessRequests"),
    decision: v.union(v.literal("approved"), v.literal("rejected")),
    reviewNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, "admin");
    const application = await ctx.db.get(args.requestId);
    if (!application || application.status !== "pending") {
      throw new Error("Role request is no longer pending.");
    }
    const target = await ctx.db.get(application.userId);
    if (!target) throw new Error("Applicant account was not found.");
    if (args.decision === "approved" && target.role !== "requester" && target.role !== "victim") {
      throw new Error("The applicant's role changed before this request was reviewed.");
    }
    const reviewNote = args.reviewNote?.trim();
    if (reviewNote && reviewNote.length > 500) throw new Error("The review note cannot exceed 500 characters.");
    const now = Date.now();
    if (args.decision === "approved") {
      await ctx.db.patch(target._id, { role: application.requestedRole, updatedAt: now });
    }
    await ctx.db.patch(application._id, {
      status: args.decision,
      reviewedBy: admin._id,
      reviewedAt: now,
      reviewNote: reviewNote || undefined,
      updatedAt: now,
    });
  },
});
