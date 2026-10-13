import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const role = v.union(
  v.literal("requester"),
  v.literal("victim"),
  v.literal("volunteer"),
  v.literal("operator"),
  v.literal("stationOp"),
  v.literal("admin"),
);
const verificationStatus = v.union(
  v.literal("pending"),
  v.literal("verified"),
  v.literal("rejected"),
);
const facilityStatus = v.union(
  v.literal("open"),
  v.literal("limited"),
  v.literal("full"),
  v.literal("temporarily_closed"),
  v.literal("emergency"),
);
const point = v.object({
  latitude: v.number(),
  longitude: v.number(),
  address: v.optional(v.string()),
  accuracy: v.optional(v.number()),
  capturedAt: v.optional(v.number()),
});
const stationProposal = v.object({
  name: v.string(),
  location: point,
  status: facilityStatus,
  contactPhone: v.optional(v.string()),
});
const shelterProposal = v.object({
  name: v.string(),
  location: point,
  capacity: v.number(),
  currentOccupancy: v.number(),
  status: facilityStatus,
  contactPhone: v.optional(v.string()),
});

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    role,
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  }).index("by_clerkId", ["clerkId"])
    .index("by_email", ["email"]),

  volunteers: defineTable({
    userId: v.id("users"),
    verificationStatus,
    availability: v.union(v.literal("available"), v.literal("unavailable")),
    capabilities: v.array(v.union(
      v.literal("food_water_distribution"),
      v.literal("first_aid"),
      v.literal("transportation"),
      v.literal("evacuation"),
      v.literal("shelter_assistance"),
      v.literal("other"),
    )),
    location: v.optional(point),
    locationSharingEnabled: v.boolean(),
    rejectionReason: v.optional(v.string()),
    lastActiveAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"])
    .index("by_verification_availability", ["verificationStatus", "availability"]),

  reliefStations: defineTable({
    name: v.string(),
    operatorId: v.optional(v.id("users")),
    location: point,
    status: facilityStatus,
    verificationStatus,
    contactPhone: v.optional(v.string()),
    verifiedBy: v.optional(v.id("users")),
    verifiedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_verificationStatus", ["verificationStatus"])
    .index("by_operatorId", ["operatorId"]),

  resources: defineTable({
    reliefStationId: v.optional(v.id("reliefStations")),
    shelterId: v.optional(v.id("shelters")),
    type: v.union(
      v.literal("food"), v.literal("water"), v.literal("first_aid"),
      v.literal("medicine"), v.literal("blankets"), v.literal("vehicles"),
      v.literal("other"),
    ),
    quantity: v.number(),
    unit: v.string(),
    updatedAt: v.number(),
  }).index("by_reliefStationId", ["reliefStationId"])
    .index("by_shelterId", ["shelterId"]),

  shelters: defineTable({
    name: v.string(),
    operatorId: v.optional(v.id("users")),
    location: point,
    capacity: v.number(),
    currentOccupancy: v.number(),
    status: facilityStatus,
    verificationStatus,
    contactPhone: v.optional(v.string()),
    verifiedBy: v.optional(v.id("users")),
    verifiedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_verificationStatus", ["verificationStatus"])
    .index("by_operatorId", ["operatorId"]),

  requests: defineTable({
    victimId: v.id("users"),
    volunteerId: v.optional(v.id("volunteers")),
    clientActionId: v.string(),
    type: v.union(
      v.literal("food"), v.literal("water"), v.literal("first_aid"),
      v.literal("transport"), v.literal("evacuation"), v.literal("shelter"),
      v.literal("other"),
    ),
    description: v.optional(v.string()),
    peopleCount: v.number(),
    location: point,
    status: v.union(
      v.literal("pending"), v.literal("accepted"), v.literal("in_progress"),
      v.literal("completed"), v.literal("cancelled"), v.literal("expired"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    acceptedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
  }).index("by_clientActionId", ["clientActionId"])
    .index("by_victimId_createdAt", ["victimId", "createdAt"])
    .index("by_volunteerId_status", ["volunteerId", "status"])
    .index("by_status_createdAt", ["status", "createdAt"]),

  submissions: defineTable({
    submittedBy: v.id("users"),
    entityType: v.union(v.literal("reliefStation"), v.literal("shelter")),
    operation: v.union(v.literal("create"), v.literal("update")),
    targetStationId: v.optional(v.id("reliefStations")),
    targetShelterId: v.optional(v.id("shelters")),
    proposedData: v.union(stationProposal, shelterProposal),
    notes: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    reviewNote: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_status_createdAt", ["status", "createdAt"])
    .index("by_submittedBy_createdAt", ["submittedBy", "createdAt"]),

});
