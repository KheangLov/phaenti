# Phaenti (ផែនទី) — travel map

A free, offline-capable web app (PWA) for places you've been and places you want to go.
All data stays on the device (IndexedDB). No accounts, no server, no paid APIs.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # static site in .output/public
npm run preview    # serve the built site
```

To test on your phone during development: `npx nuxt dev --host`, then open the
shown network address from a phone on the same Wi-Fi.
(Location and install only work over HTTPS or localhost.)

## Deploy free (Cloudflare Pages)

1. Push this folder to a GitHub repo.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → connect the repo.
3. Build command `npm run build`, output directory `.output/public`.
4. Open the `*.pages.dev` URL on your phone → Share → **Add to Home Screen**.
   Installing keeps iPhone from clearing the app's storage.

## What's in phase 1

- MapLibre GL map with OpenFreeMap tiles (light/dark follows the system; switch in the menu)
- All pins drawn as one GPU layer with clustering; clusters coloured by been/planned mix
- Add places: long-press the map (right-click on desktop), the **+** button (move-the-map pin), search, or "Add my current location"
- Search via Photon (OpenStreetMap), biased to where you're looking; also finds your saved places and accepts `lat, lng`
- Place details: Been / Want to go, visit date, 1–5 rating, notes (autosave), directions in Google Maps, share, delete with undo
- Draggable bottom sheet with spring snapping (peek / half / full)
- Backup to a JSON file and restore (merges by id, newest edit wins); also imports GeoJSON
- PWA: installable, app shell and viewed map tiles cached for offline use

## Layout

```
app/
  app.vue                     screen layout, menu, pick mode, backup
  components/
    MapView.client.vue        MapLibre map, layers, gestures, camera
    BottomSheet.vue           draggable sheet (motion-v springs)
    SearchBar.vue             search + results
    DraftCard.vue             save a new place
    PlaceDetail.vue           view/edit a saved place
    PlaceList.vue             list + empty state
    StatusToggle.vue          animated segmented control
    AnimatedNumber.vue
  composables/
    usePlaces.ts              Dexie live data, add/update/delete, import/export
    useAppState.ts            selection, draft, sheet, map API
    useGeocode.ts             Photon search, reverse geocode, helpers
  utils/db.ts                 Dexie schema
nuxt.config.ts                SSR off, PWA + tile caching
```

## Next (phase 2)

Smart paste for Google Maps links (incl. `maps.app.goo.gl` via a tiny Cloudflare Worker),
share links with data in the URL fragment, QR codes, import preview with duplicate checks,
Android share target, Google Takeout import.
