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

## Install & offline

- Installable PWA: one-tap install on Android/Chrome/Edge, guided "Add to Home Screen" on iPhone (menu → Install app)
- Home-screen shortcuts: Add a place, Search
- Offline from first launch: app, your places, Cambodia boundaries and the province→village search index are precached (~860 files)
- Map tiles you view are cached automatically; menu → Offline & storage can save "this area in detail" or a Cambodia overview (zoom 5–10)
- Asks before applying updates; requests persistent storage when installed

## Your own places

Save homes, offices, family and friends (as many of each as you like): tap a shortcut in the
places panel or in search, or pick "Or save as" when adding any place. Add who lives or works there
("Grandma", "Uncle Sok"). They get their own pins, don't count as "been / want to go", and tapping a
shortcut flies to it (or shows them all if you have several).

## App-like behaviour

The phone's Back button / swipe-back closes the top panel (search, place card, expanded list,
drawers) instead of leaving the app. Swipe a place card down to close it; typing expands the panel
above the keyboard; inputs never trigger iPhone zoom; no text-selection or long-press callouts on
the map and buttons; status bar follows light/dark; light haptic ticks on Android.

## Languages

English and Khmer (ភាសាខ្មែរ): menu (…) → ភាសាខ្មែរ / English. Defaults to Khmer when the phone is set to Khmer,
and remembers your choice. All app text lives in `app/i18n/messages.ts`; Cambodian area names switch to
their Khmer form, and Noto Sans Khmer is bundled so Khmer looks the same on every phone, offline too.

## Hidden country

Thailand is hidden: its land is turned into sea (each style's own water colour) on every map style, basemap labels naming it are removed,
search results there are dropped, searches about Thailand (Thai, Bangkok, ไทย, ថៃ, Thai cities…) are blocked
before anything is sent, results whose names mention it are removed, and pins can't be added there. Places already saved inside it stay
in your backup but are not shown. The shape (`public/geo/hidden-th.json`) is Thailand's land from
geoBoundaries minus Cambodia's territory, so nothing inside Cambodia is ever covered.
Logic lives in `app/composables/useHidden.ts`.

## Discover & photos

- **Discover Cambodia** (✨ button next to the filters, or ⋯ menu): 78 hand-picked famous and beautiful places — Angkor temples, Preah Vihear, Koh Ker, Phnom Penh landmarks, Kampot/Kep, Koh Kong (Tatai, Peam Krasaop mangroves, Koh Kong Island, Koh Sdach islands and Ghost Island, Koh Yor / Bak Khlong, the Koh Kong Bridge, Chhay Chrei, Chhay Khpuos and Chhay Keur waterfalls, Chi Phat, Areng, Mrech Kangkep), the islands, waterfalls in Mondulkiri and Ratanakiri. 13 are marked 🔥 **Trending** (picked from 2026 social media and travel news: Kampot's seahorse statue, Koh Rong's viral dead tree, Chaktomuk Walk Street, Factory Phnom Penh, Koh Pich, Techo airport, Kampong Khleang, Mondulkiri's Sea Forest, Phnom 1500, Khnorng Phsar, the salt fields…) and have their own filter. Save one with **+** or all at once to *Want to go* (with Undo).
  - The list lives in `public/discover/cambodia.json` (names in English and Khmer, short notes, coordinates checked against province and commune boundaries). Pins that could only be placed roughly carry a `geo` hint: the phone asks OpenStreetMap (Photon) once and moves the pin to a nearby match.
  - On the phone, Wikipedia adds a photo, a short description and exact coordinates (only when they agree with ours within 8 km). Answers are cached for 30 days; photos are cached by the service worker for offline use.
- **Photos on any place**: add from the camera/gallery (shrunk to 1600 px WebP and kept on the device in IndexedDB) or paste an image link. Tap to view full-screen, swipe, make cover, remove (with Undo). Backups include device photos.

## Routing & measuring

- **Route** on any place or search result: start from your location, one of your saved homes/offices/family, or the map centre; choose car, moto, bike or walk. Shows time, distance, arrival time and turn-by-turn steps (English or Khmer), then hands off to Google Maps for live navigation.
- Routes come from the free community [Valhalla](https://valhalla1.openstreetmap.de) server, falling back to [OSRM](https://routing.openstreetmap.de). Both allow about one request per second and need a connection. Routes never pass through the hidden country (`public/geo/route-avoid-th.json`).
- **Measure** (ruler button or ⋯ menu): tap points to measure a path, drag points to adjust, tap the first point to close the shape and get its area and perimeter. Back closes it.

## Speed

- Thai labels are removed with a two-step outline check (an ~80-point outline first, then a ~700-point one) plus a Thai-letter check on label names. The old single 3,000-point outline made every tile in western Cambodia about 16× slower to prepare.
- The map draws at most 2× the screen resolution: no visible difference on 3× phones, about half the drawing work.
- The map library, its worker, the map style and the label outline download at the same time; connections to the tile servers open before the map starts.
- Recently seen tiles stay in memory longer, and the tile index refreshes in the background instead of being stuck on an old version.

## Map styles

Layers button → 12 looks with live previews: Auto (follows light/dark), Liberty, Positron, Bright,
3D City (extruded buildings, tilt and rotate), Phaenti themes **Angkor**, **Mekong Night** and **Rice Paddy**
(OpenFreeMap data repainted in `app/utils/mapStyles.ts`), Dark, Fiord, and VersaTiles Colorful & Natural
(style JSON pinned in `public/styles`, generated with `@versatiles/style`). Picking a dark map switches the
app's panels to dark too. Saved offline areas work with every style.

## Cambodia layers

- Province, district and commune boundaries as static vector tiles (`public/admin/tiles`, z4–z11, ~2 MB, cached offline)
- Tap an area to see its Khmer and Latin name, parents, your places there, and how many of its districts/communes you've explored
- "Cambodia explored" progress: provinces, districts and communes where you have a "been" place, tinted green on the map
- Search all 25 provinces, 197 districts, 1,633 communes and 14,578 villages in Latin or Khmer, offline
- Villages have no public boundary data; selecting one highlights its commune and can look the village up on OpenStreetMap

Rebuild the data (needs Python with `shapely` + `pyyaml`, and Node):

```bash
python3 scripts/build_admin.py <data dir> <out dir>   # geoBoundaries KHM ADM1-3 + Pumi YAML in <data dir>
node scripts/build_tiles.mjs <out dir> public/admin/tiles
```

Sources: boundaries from Open Development Cambodia (2014) via geoBoundaries, CC BY 4.0;
codes, Khmer names and villages from [Pumi](https://github.com/dwilkie/pumi) (MIT).

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
