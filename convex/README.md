# AEGIS Convex backend (Phase 1)

This folder contains the Phase 1 Convex schema and authenticated functions. It belongs to the Member 5 backend/auth/admin boundary. The public, requester, volunteer, operator, and map pages remain browser-local demos until their owners connect them through the contracts below.

## Development setup

1. From the project root, run `npm install`.
2. In Clerk, activate the Convex integration for the AEGIS development application and copy its Frontend API URL. The current Clerk integration supplies the Convex audience claim; do not create a custom JWT template unless Clerk's current dashboard specifically requires one for your account.
3. Create/select the Convex development deployment by running `npm run convex:dev -- --once`.
4. Set the development deployment environment variable to the Clerk Frontend API URL:
   `npx convex env set CLERK_JWT_ISSUER_DOMAIN https://your-app.clerk.accounts.dev`
   You can also set this variable in the Convex dashboard for the selected development deployment.
5. Run `npm run convex:dev` to deploy the schema, functions, and auth provider configuration. The `convex/auth.config.js` file reads the deployment variable and configures the `convex` application ID.
6. Do not change `config.js` to `syncMode: "convex"` until the frontend has Clerk sign-in, an authenticated Convex client, and a real adapter. `js/services/convexAdapter.js` is still a placeholder.

For production, configure the production Clerk Frontend API URL on the Convex production deployment, then run `npm run convex:deploy` after the frontend integration is ready. Keep development and production Clerk values separate.

## Team integration contracts

- **Member 2 / requester:** `requests:create` is authenticated and accepts `clientActionId`, `type`, `peopleCount`, `location`, and optional `description`. `location` is `{ latitude, longitude, address?, accuracy?, capturedAt? }`. Map the offline queue's `offlineActionId` to `clientActionId`; retain the same value on every retry. The backend uses lowercase statuses: `pending`, `accepted`, `in_progress`, `completed`, `cancelled`, `expired`.
- **Member 3 / volunteer:** call `volunteers:register` for a profile, `volunteers:setAvailability` after verification, and the request accept/start/complete mutations for work. The account must have the single `role: "volunteer"`; backend checks also enforce verification and availability.
- **Member 4 / station and shelter:** `submissions:submit` currently accepts create/update proposals for relief stations and shelters. Admin inventory is updated by `resources:replaceInventory`; it is not yet part of operator facility proposals. The UI owner and Member 5 must map its resource names/units to the backend resource enum and decide whether operator inventory updates need their own submission type.
- **Member 6 / maps and offline:** `facilities:listPublic` returns facility records with nested `location`, Convex `_id`, status values in lowercase, resources, and computed shelter `availableCapacity`. Convert these to the UI's display shape in the adapter; Mapbox coordinate arrays must be `[longitude, latitude]`. `requests:create` is the server retry boundary; the offline queue is not cross-device sync until the adapter calls it.
- **Member 1 / public UI:** public facilities are available from `facilities:listPublic`. Alerts, areas to avoid, and emergency contacts are not yet represented in this Phase 1 Convex schema/functions.
- **Role access:** new accounts start as requesters. Use `accessRequests:request` to apply for volunteer or operator access; an administrator must approve the request before the account role changes and its protected workspace opens.

## Decisions to confirm with the team

The original Phase 1 schema marks `users.phone` required and `volunteers.location` required. This backend currently makes phone optional and volunteer location optional so Clerk profile creation and location privacy do not force a phone/location claim. Decide this with Members 2, 3, and 5 before locking production schema. The backend uses lowercase status identifiers; map them at the UI boundary if the team keeps uppercase display labels.

## Functions included

- `users:ensureCurrentUser`, `users:me`, `users:updateMyContact`, and admin-only `users:setRole`
- `accessRequests:request`, `accessRequests:mine`, and admin-only `accessRequests:pendingForAdmin` / `accessRequests:review`
- `volunteers:register`, `volunteers:setAvailability`, `volunteers:updateMyLocation`, `volunteers:clearMyLocation`, `volunteers:myProfile`, and admin-only `volunteers:reviewVerification`
- `facilities:listPublic`
- admin-only `resources:replaceInventory`
- `requests:create`, `requests:myRequests`, `requests:openSummariesForVolunteer`, `requests:accept`, `requests:myAssignedRequests`, `requests:startWork`, `requests:complete`, and `requests:cancelMine`
- `submissions:submit`, `submissions:mySubmissions`, `submissions:pendingForAdmin`, and `submissions:review`

The first admin must be provisioned manually after their authenticated user profile is created. Never accept a role from a public signup form. Resource quantities are non-negative numbers, shelter availability is computed from capacity minus occupancy, and precise requester coordinates are withheld from open volunteer request summaries until acceptance.
