# AEGIS Member 6 module

This standalone prototype covers the Member 6 boundary from the AEGIS specification: Mapbox visualization, device/manual location, nearby facility filtering, IndexedDB request queuing, connectivity handling, and duplicate-aware synchronization.

## What is included

- Foreground device GPS tracking with permission, timeout, and unavailable-location messages. Tracking starts only when the user taps **Use my location**, updates the map and nearby distances as the device moves, and stops when they tap **Stop live location**, clear their location, choose a searched/demo location, or leave the page.
- Manual address/place search through the Mapbox Geocoding API.
- Confirmed location saved in `localStorage` for this browser.
- Map markers and popups for sample relief stations and shelters.
- Haversine distance, radius filtering, nearest-first sorting, and approximate distance labels.
- `AEGIS_DB` IndexedDB database with a `pendingActions` store and status/time indexes; pending work is loaded through the status index and ordered by creation time.
- Offline request queue with a stable `offlineActionId`, retry timing, failure state, retryable database-open failures, and a manual Sync button.
- A local **demo adapter** that simulates a server in this browser. It makes no server request and does not connect to Convex.
- A Convex adapter placeholder for the integration contract with Member 5.
- A local Volunteer Desk demo that filters synced open requests by volunteer device location, selected capabilities, and radius. It intentionally omits victim identity and exact coordinates; it reads only this browser's demo storage and is not connected to Convex or volunteer authentication.
- Demo volunteers can accept a matching request; acceptance reveals its location and a Google Maps directions link, while the requester's Public view shows the assigned volunteer. This is local browser state only, not authenticated or atomic backend assignment.
- A browser-based Admin Console with forms for facilities, alerts, areas to avoid, and emergency contacts.

Facility names, conditions, coordinates, and counts are fictional sample data, including the Dehradun demo relief stations and shelters. The Dehradun map pins are illustrative points near Clock Tower, Paltan Bazaar, Survey Chowk, and Dalanwala, not real or verified service locations. This prototype is not an emergency service. Do not travel to a demo pin for aid; urgent emergencies should use verified local emergency services.

## Run it

1. Double-click `start.bat`. It starts the local server and opens the page after the server is ready. Keep the console window open while using the preview; press Ctrl+C there to stop it. The page must be served from localhost; opening `index.html` directly as a `file://` URL prevents the browser from loading its JavaScript modules.
2. Open `config.js` and paste a Mapbox **public** access token into `mapboxToken` when you have one. Restrict the token to the development/production website origins in your Mapbox account. This token is intentionally visible to the browser; never put a secret token in frontend code.

   ```powershell
   py -m http.server 8000
   ```

   If `py` is not installed, use an equivalent local static server.
3. Open `http://localhost:8000` in a modern browser. Location permission works on localhost and HTTPS. Map tiles and address search need internet access and a valid Mapbox token.
4. Choose **Preview with a sample Dehradun location** to explore the sample facilities without GPS or a token. Dehradun relief pins are fictional demos, not real or verified aid services. For your actual position, choose **Use my location** and allow browser location access; GPS tracking then updates while this page is open. Choose **Stop live location** to stop tracking. The live GPS is kept in this browser and is not sent to a server unless you submit a request or ask Mapbox for directions. Address search and real Mapbox tiles require the token.
5. To demonstrate offline queuing, use the browser developer tools to simulate offline mode, submit a request, then restore connectivity. The queue drains into the local demo adapter. The interface states that the request has not reached volunteers while it is offline.
6. Open `http://127.0.0.1:8000/volunteer.html` for the Volunteer Desk demo. Set your device location, select the help types you can provide, and choose a radius to see matching open requests synced into this browser's local demo storage.

Open `http://127.0.0.1:8000/operator.html` for the Operator Desk. Operators can submit new or updated shelters/stations, alerts, avoid areas, and emergency contacts, plus source notes. Requests remain pending until an admin reviews them. Open `http://127.0.0.1:8000/admin.html`, choose **Operator inbox**, inspect the submission, verify it with a trusted source, then check the verification box to enable **Approve and publish** (or reject). Approval updates the local public demo immediately, including any already-open public tab; the operator history reflects the decision.

This operator/admin workflow uses this browser's local storage, so the two pages must be used in the same browser profile and origin. It does not identify users, sync between devices, or protect the admin route. Before real operations, connect the operator/admin pages to the team's Convex backend, add Clerk authentication, and enforce operator/admin roles and approval rules in Convex. Facility coordinates can be entered from a verified map location. The Admin Console's address lookup uses Mapbox permanent geocoding because saved facility coordinates are retained; Mapbox requires an eligible account for permanent storage. Public user searches stay temporary and are not persisted across page reloads.

The prototype uses CDN hosted Mapbox GL JS and a Google font, so the visual application shell itself is not fully available offline. IndexedDB preserves queued request actions across a page refresh; it does not provide live server updates or contact volunteers until synchronization succeeds.

## Folder map

```text
index.html                         Page structure and accessible controls
volunteer.html                     Local demo view of nearby assistance requests
styles.css                         Responsive visual styles
volunteer.css                      Volunteer Desk styles
config.js                          Public Mapbox token and sync mode
js/app.js                          UI events and connections between services
js/data/facilities.js              Fictional demo facilities
js/location/locationService.js     GPS, selected location, and local persistence
js/location/geocodingService.js    Mapbox place search
js/map/mapService.js               Map initialization, markers, and popups
js/utils/distance.js               Haversine distance and nearby sorting
js/offline/idb.js                  IndexedDB open/read/write/delete operations
js/offline/queueService.js         Offline action records and retry metadata
js/offline/syncService.js          Online synchronization coordinator
js/services/demoAdapter.js         Browser-local idempotent demo server
js/services/convexAdapter.js       Integration placeholder for Member 5
js/volunteer/volunteer.js          Capability- and distance-filtered request list
```

## Before merging with the team

Ask Member 5 for:

- The Convex request creation mutation name and required argument fields.
- Whether requests need an authenticated user ID or Clerk subject in the payload.
- The request location shape (this prototype uses `{ latitude, longitude, accuracy, timestamp, source, label }`).
- The request state enum (the specification lists `PENDING`, `ACCEPTED`, `IN_PROGRESS`, `COMPLETED`, with optional `CANCELLED`).
- Confirmation that the backend stores and checks `offlineActionId` atomically. The client key alone cannot stop duplicates if the backend does not enforce it.
- The Convex query used to retrieve public shelters and relief stations, including status and `updatedAt`.

Then implement `sendActionToConvex` in `js/services/convexAdapter.js`, set `syncMode: "convex"` in `config.js`, and map the agreed query results into the facility fields in `js/data/facilities.js` or replace that sample module with a query adapter. Keep server authorization and idempotency checks inside Convex; frontend checks are not security controls.

## Source boundary

The AEGIS specification describes internet available actions going to Convex and offline actions being stored in IndexedDB until connectivity returns. It explicitly says offline mode does not provide immediate server communication or cross-user synchronization. This module follows that model. Device-to-device Offline SOS or mesh relay is not included.

## Official references

- [Mapbox GL JS getting started](https://docs.mapbox.com/mapbox-gl-js/guides/get-started/)
- [Mapbox markers and controls](https://docs.mapbox.com/mapbox-gl-js/api/markers/)
- [Mapbox Geocoding API v6](https://docs.mapbox.com/api/search/geocoding/)
- [MDN Geolocation](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition)
- [MDN IndexedDB guide](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB)
- [MDN `navigator.onLine`](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine)
- [Convex JavaScript client](https://docs.convex.dev/client/javascript/overview)
- [Convex mutations](https://docs.convex.dev/functions/mutation-functions)

## Phase 1 Convex backend

The `convex/` folder contains the Phase 1 schema and authenticated Convex functions for users, volunteers, facilities, inventory, requests, and operator submissions. See `convex/README.md` for setup and deployment steps. The current public/admin/operator/volunteer pages still use browser-local demo storage; do not change `syncMode` to `convex` until Clerk sign-in and the authenticated Convex browser client are connected.
