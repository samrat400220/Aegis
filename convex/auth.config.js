const clerkIssuerDomain = process.env.CLERK_JWT_ISSUER_DOMAIN;

export default {
  // Keep the initial schema deploy possible before Clerk is configured.
  // Once set, Convex validates Clerk tokens for the `convex` audience.
  providers: clerkIssuerDomain
    ? [{ domain: clerkIssuerDomain, applicationID: "convex" }]
    : [],
};
