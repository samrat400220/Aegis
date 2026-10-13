import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { currentUser, requireRole } from "./lib/auth";

const role = v.union(
  v.literal("requester"), v.literal("victim"), v.literal("volunteer"),
  v.literal("operator"), v.literal("stationOp"), v.literal("admin"),
);

export const ensureCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in before creating a profile.");
    if (typeof identity.email !== "string" || !identity.email) {
      throw new Error("Clerk must include an email claim for the signed-in user.");
    }
    const now = Date.now();
    const existing = await ctx.db.query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    const name = typeof identity.name === "string" && identity.name.trim()
      ? identity.name.trim()
      : identity.email.split("@")[0];
    if (existing) {
      await ctx.db.patch(existing._id, { name, email: identity.email, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("users", {
      clerkId: identity.subject,
      name,
      email: identity.email,
      role: "requester",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    try { return await currentUser(ctx); }
    catch (error) {
      if (error instanceof Error && error.message === "Authentication required.") return null;
      throw error;
    }
  },
});

export const updateMyContact = mutation({
  args: { name: v.string(), phone: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    const name = args.name.trim();
    if (!name || name.length > 100) throw new Error("Name must contain 1 to 100 characters.");
    const phone = args.phone?.trim();
    await ctx.db.patch(user._id, {
      name,
      phone: phone || undefined,
      updatedAt: Date.now(),
    });
  },
});

export const setRole = mutation({
  args: { userId: v.id("users"), role },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("User not found.");
    if (target.role === "admin" && args.role !== "admin") {
      const admins = await ctx.db.query("users").collect();
      if (admins.filter((user) => user.role === "admin").length <= 1) {
        throw new Error("The last admin cannot be demoted.");
      }
    }
    await ctx.db.patch(target._id, { role: args.role, updatedAt: Date.now() });
  },
});
