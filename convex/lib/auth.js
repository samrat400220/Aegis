export async function currentUser(ctx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Authentication required.");
  const user = await ctx.db.query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();
  if (!user) throw new Error("User profile missing. Call users:ensureCurrentUser first.");
  return user;
}

export async function requireRole(ctx, role) {
  const user = await currentUser(ctx);
  if (user.role !== role) throw new Error(`Permission denied: ${role} role required.`);
  return user;
}

export function validatePoint(location) {
  if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
    throw new Error("A valid latitude and longitude are required.");
  }
  if (location.latitude < -90 || location.latitude > 90 || location.longitude < -180 || location.longitude > 180) {
    throw new Error("Coordinates are outside the valid range.");
  }
}
