# RV SafeNavigate - RV Friendly GPS & Route Planner

A premium, responsive, dark-theme web application designed to navigate RV rigs safely by calculating routing geometries, intersecting paths with low clearances and bridge weight hazards, and sourcing parking amenities.

Optimized for mobile viewports (iOS/Android), tablets, and desktop browsers.

---

## Technical Stack & Architecture

- **Core Map Engine:** [Leaflet.js](https://leafletjs.com/) with premium styled [CartoDB Dark Matter](https://carto.com/basemaps/) tile layers.
- **Routing Engine:** Client-side OSRM (Open Source Routing Machine) API query builder.
- **Geocoding & Location Search:** OpenStreetMap Nominatim API integration.
- **Live Parking Sourcing:** OpenStreetMap Overpass QL API integration for truck stops and highway rest areas.
- **State Management & Storage:** Local-first routing, profile switcher, and crowdsourced pins stored in standard browser `localStorage`.

---

## Blueprint Implementation Breakdown

### 1. Route Clearance & Overlap Canvas (Phase 1)
- Routes are drawn in **Emerald Green** to indicate a clean route.
- If the routing geometry intersects within a 350m radius of a clearance/weight restriction under your active rig's profile, the path triggers a glowing **Crimson Safety Banner** at the top of the map.
- Red warning pins (`L.divIcon` pins) with warning rings are rendered on the map, allowing users to click a hazard to read restrictions and descriptions.
- The sidebar displays a list of active hazards; clicking a hazard snaps the map directly to its coordinates.

### 2. User Profiles & "Human Error Penalty" Buffers (Phase 2)
Rig dimensions are programmatically increased before any restriction checks occur to protect against user underestimation, tire pressure updates, or recent road repaving:
- **Max Height:** Automatically adds a **+4 inches** safety buffer (e.g., entering $13'6''$ stores a buffered value of $13'10''$ for clearance checks).
- **Weight Limit:** Automatically scales weight up by **+5%** (e.g., entering $24,000 \text{ lbs}$ scales up to $25,200 \text{ lbs}$ to account for full black/gray/fresh water tanks, cargo, and supplies).
- Supports creating, naming, deleting, and hot-swapping multiple profiles (e.g., "Fifth Wheel Mode" vs. "Unhitched Truck Mode").

### 3. Parking Crowdsourcing & Live Amenities Layer (Phase 3)
- **Live Map Feeds:** Queries the Overpass API in real-time as the user drags/zooms around coordinates, showing active truck stops (`hgv=yes`) and rest areas.
- **Community Sourced Pin Dropping:** Users can trigger "Add Pin Mode" from the map button or parking tab, double-click/long-press anywhere on the map to place a pin, fill out a detailed accommodation card, and save it.
- Pin cards track rig accommodations: Big Rig Friendly (40ft+), turning radius, overnight allowed, and dump stations.

### 4. Saved Routes Log
- Once a route is calculated, users can click "Save this Route" to assign it a name (e.g., "Savannah Getaway").
- The route log is synced to `localStorage`. Clicking a saved route in the list automatically reloads the start address, end destination, and vehicle profile, and recalculates the hazard intersections.

---

## How to Run the App

### Option 1: Double-Click
Simply double-click/open the [index.html](file:///c:/Users/erich/OneDrive/Documents/GitHubRepos/RV%20Friendly%20GPS/index.html) file in any standard web browser (Chrome, Safari, Edge, Firefox).

### Option 2: Run a Local Dev Server (Recommended for API queries)
For local development, spin up a simple static file server in the workspace:

**Using Python:**
```bash
python -m http.server 8000
```
Open `http://localhost:8000` in your browser.

**Using Node.js:**
```bash
npx live-server
```

### Mobile / Tablet Testing
To test on a mobile device:
1. Ensure your laptop and mobile device are on the same local Wi-Fi network.
2. Run your local server (e.g., `python -m http.server 8000`).
3. Find your laptop's local IP address (e.g., `192.168.1.50`).
4. On your mobile phone/tablet, navigate to `http://192.168.1.50:8000`. The responsive CSS media queries will automatically transition the sidebar panel into a slide-up thumb-friendly sheet.
