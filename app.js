// RV Friendly GPS - Core Application Controller

// GLOBAL STATE
const state = {
    map: null,
    activeProfileId: null,
    profiles: [],
    savedRoutes: [],
    customParkingSpots: [],
    activeRoutePolyline: null,
    activeRouteMarkers: [],
    isPinDropMode: false,
    selectedPinLatLng: null,
    mapLayers: {
        truckStops: true,
        restAreas: true,
        customPins: true
    },
    baseLayers: {
        dark: null,
        satellite: null,
        topo: null
    },
    activeBaseLayerName: 'dark',
    followUser: false,
    watchPositionId: null,
    userMarker: null
};

// INITIALIZATION
document.addEventListener("DOMContentLoaded", () => {
    initMap();
    initProfiles();
    initSavedRoutes();
    setupEventListeners();
    initTheme(); // Initialize theme options
    
    // Initial UI render
    renderProfiles();
    renderSavedRoutes();
});

// MAP SETUP
function initMap() {
    // Savannah, GA coordinates as default center
    const defaultCenter = [32.0835, -81.0998];
    const defaultZoom = 8;
    
    state.map = L.map('map', {
        zoomControl: true,
        maxZoom: 18,
        minZoom: 4
    }).setView(defaultCenter, defaultZoom);
    
    // Extend TileLayer to check Cache Storage first
    const OfflineTileLayer = L.TileLayer.extend({
        createTile: function (coords, done) {
            const tile = document.createElement('img');
            L.DomEvent.on(tile, 'load', L.Util.bind(this._tileOnLoad, this, done, tile));
            L.DomEvent.on(tile, 'error', L.Util.bind(this._tileOnError, this, done, tile));
            
            if (this.options.crossOrigin || this.options.crossOrigin === '') {
                tile.crossOrigin = this.options.crossOrigin === true ? '' : this.options.crossOrigin;
            }
            
            const src = this.getTileUrl(coords);
            
            // Query the Cache Storage API
            if (window.caches) {
                caches.match(src).then(response => {
                    if (response) {
                        response.blob().then(blob => {
                            const url = URL.createObjectURL(blob);
                            tile.src = url;
                        });
                    } else {
                        tile.src = src; // Fallback to network
                    }
                }).catch(() => {
                    tile.src = src;
                });
            } else {
                tile.src = src;
            }
            
            return tile;
        }
    });
    
    // Create base layers
    state.baseLayers.dark = new OfflineTileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    });
    
    state.baseLayers.light = new OfflineTileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    });
    
    state.baseLayers.satellite = new OfflineTileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 18
    });
    
    state.baseLayers.topo = new OfflineTileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
        subdomains: 'abc',
        maxZoom: 17
    });
    
    // Default base layer tracker name
    state.activeBaseLayerName = 'vector';
    
    // Trigger map load callback in parking.js
    if (typeof initParkingOverlay === "function") {
        initParkingOverlay();
    }
}

// PROFILE MANAGEMENT
function initProfiles() {
    const stored = localStorage.getItem("rv_profiles");
    if (stored) {
        state.profiles = JSON.parse(stored);
    } else {
        // Seed default rig profiles (as described in Phase 2 blueprint)
        state.profiles = [
            {
                id: "prof-1",
                name: "Grand Design Solitude 390RK (Fifth Wheel)",
                heightFt: 13,
                heightIn: 6,
                weight: 16800, // dry weight
                length: 41,
                bufferedHeightFt: 13,
                bufferedHeightIn: 10, // +4 inches
                bufferedWeight: 17640  // +5%
            },
            {
                id: "prof-2",
                name: "Unhitched Ford F-350 (Truck Mode)",
                heightFt: 6,
                heightIn: 8,
                weight: 8000,
                length: 22,
                bufferedHeightFt: 7,
                bufferedHeightIn: 0,  // +4 inches
                bufferedWeight: 8400   // +5%
            }
        ];
        saveProfiles();
    }
    
    // Set active profile
    const activeId = localStorage.getItem("rv_active_profile_id");
    if (activeId && state.profiles.some(p => p.id === activeId)) {
        state.activeProfileId = activeId;
    } else {
        state.activeProfileId = state.profiles[0].id;
        localStorage.setItem("rv_active_profile_id", state.activeProfileId);
    }
    
    updateActiveProfileBadge();
}

function saveProfiles() {
    localStorage.setItem("rv_profiles", JSON.stringify(state.profiles));
}

function calculateBuffer(heightFt, heightIn, weightLbs) {
    // Programmatic safety buffer to height (+4 inches)
    let totalInches = (parseInt(heightFt) * 12) + parseInt(heightIn) + 4;
    const bufFt = Math.floor(totalInches / 12);
    const bufIn = totalInches % 12;
    
    // Programmatic safety buffer to weight (+5% to account for water, supplies, etc.)
    const bufWeight = Math.round(parseInt(weightLbs) * 1.05);
    
    return {
        bufferedHeightFt: bufFt,
        bufferedHeightIn: bufIn,
        bufferedWeight: bufWeight
    };
}

function renderProfiles() {
    const listContainer = document.getElementById("profile-cards-list");
    if (!listContainer) return;
    
    listContainer.innerHTML = "";
    
    state.profiles.forEach(prof => {
        const isActive = prof.id === state.activeProfileId;
        const card = document.createElement("div");
        card.className = `profile-card ${isActive ? 'active' : ''}`;
        card.setAttribute("data-id", prof.id);
        
        card.innerHTML = `
            <div class="prof-meta">
                <h4>${prof.name} ${isActive ? '<span class="prof-badge-lbl">Active</span>' : ''}</h4>
                <div class="prof-specs">
                    <span><i class="fa-solid fa-arrows-up-down"></i> Max Height: ${prof.heightFt}' ${prof.heightIn}" <strong>(Buf: ${prof.bufferedHeightFt}' ${prof.bufferedHeightIn}")</strong></span><br>
                    <span><i class="fa-solid fa-weight-hanging"></i> Weight: ${prof.weight.toLocaleString()} lbs <strong>(Buf: ${prof.bufferedWeight.toLocaleString()} lbs)</strong></span><br>
                    <span><i class="fa-solid fa-ruler-horizontal"></i> Length: ${prof.length} ft</span>
                </div>
            </div>
            ${state.profiles.length > 1 ? `
                <button class="delete-prof-btn" data-id="${prof.id}" title="Delete profile">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            ` : ''}
        `;
        
        // Switch profile click (avoid trigger on delete)
        card.addEventListener("click", (e) => {
            if (e.target.closest('.delete-prof-btn')) return;
            setActiveProfile(prof.id);
        });
        
        // Delete button listener
        const delBtn = card.querySelector('.delete-prof-btn');
        if (delBtn) {
            delBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                deleteProfile(prof.id);
            });
        }
        
        listContainer.appendChild(card);
    });
}

function setActiveProfile(id) {
    state.activeProfileId = id;
    localStorage.setItem("rv_active_profile_id", id);
    renderProfiles();
    updateActiveProfileBadge();
    
    // Re-calculate route if one is loaded to update restriction warnings
    if (state.activeRoutePolyline) {
        if (typeof recalculateRouteWithNewProfile === "function") {
            recalculateRouteWithNewProfile();
        }
    }
}

function deleteProfile(id) {
    state.profiles = state.profiles.filter(p => p.id !== id);
    if (state.activeProfileId === id) {
        state.activeProfileId = state.profiles[0].id;
        localStorage.setItem("rv_active_profile_id", state.activeProfileId);
    }
    saveProfiles();
    renderProfiles();
    updateActiveProfileBadge();
}

function updateActiveProfileBadge() {
    const current = state.profiles.find(p => p.id === state.activeProfileId);
    if (current) {
        document.getElementById("badge-name").textContent = current.name.split(" (")[0];
    }
}

// SAVED ROUTES MANAGEMENT
function initSavedRoutes() {
    const stored = localStorage.getItem("rv_saved_routes");
    if (stored) {
        state.savedRoutes = JSON.parse(stored);
    } else {
        state.savedRoutes = [];
    }
}

function saveSavedRoutes() {
    localStorage.setItem("rv_saved_routes", JSON.stringify(state.savedRoutes));
}

function renderSavedRoutes() {
    const container = document.getElementById("saved-routes-list");
    if (!container) return;
    
    if (state.savedRoutes.length === 0) {
        container.innerHTML = `
            <div class="empty-list">
                <i class="fa-solid fa-route"></i>
                <p>No saved routes yet. Create a route, verify clearances, and click "Save this Route" to build your log.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = "";
    state.savedRoutes.forEach((route, idx) => {
        const card = document.createElement("div");
        card.className = "saved-route-card";
        const isDownloaded = route.offlineDownloaded;
        card.innerHTML = `
            <div class="sv-info">
                <h4>${route.name} ${isDownloaded ? '<span class="badge-offline"><i class="fa-solid fa-cloud-arrow-down"></i> Offline Cached</span>' : ''}</h4>
                <div class="sv-path">
                    <span>${route.startName.split(',')[0]}</span>
                    <i class="fa-solid fa-chevron-right"></i>
                    <span>${route.endName.split(',')[0]}</span>
                </div>
                <div class="sv-profile">
                    <i class="fa-solid fa-shield-halved"></i> Profile: ${route.profileName.split(' (')[0]}
                </div>
            </div>
            <div class="sv-actions">
                <button class="sv-download-btn ${isDownloaded ? 'downloaded' : ''}" data-idx="${idx}" title="${isDownloaded ? 'Offline Map Cached' : 'Download Map Offline'}">
                    <i class="fa-solid ${isDownloaded ? 'fa-circle-check' : 'fa-cloud-arrow-down'}"></i>
                </button>
                <button class="delete-prof-btn" data-idx="${idx}" title="Delete Saved Route">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `;
        
        card.addEventListener("click", (e) => {
            if (e.target.closest('.delete-prof-btn') || e.target.closest('.sv-download-btn')) return;
            loadSavedRoute(route);
        });
        
        card.querySelector('.delete-prof-btn').addEventListener("click", (e) => {
            e.stopPropagation();
            deleteSavedRoute(idx);
        });
        
        card.querySelector('.sv-download-btn').addEventListener("click", (e) => {
            e.stopPropagation();
            if (isDownloaded) {
                alert("Offline map tiles are already downloaded for this route.");
                return;
            }
            downloadRouteMapOffline(route, idx);
        });
        
        container.appendChild(card);
    });
}

function deleteSavedRoute(idx) {
    state.savedRoutes.splice(idx, 1);
    saveSavedRoutes();
    renderSavedRoutes();
}

function loadSavedRoute(savedRoute) {
    // Populate form fields
    document.getElementById("route-start").value = savedRoute.startName;
    document.getElementById("route-end").value = savedRoute.endName;
    
    // Switch to active profile if available
    const matchedProfile = state.profiles.find(p => p.name === savedRoute.profileName || p.id === savedRoute.profileId);
    if (matchedProfile) {
        setActiveProfile(matchedProfile.id);
    }
    
    // Switch tab to routing
    switchTab("tab-routing");
    
    // Trigger route drawing in router.js
    if (typeof drawSavedRouteCoordinates === "function") {
        drawSavedRouteCoordinates(savedRoute);
    }
}

// TABS SWITCHER helper
function switchTab(tabId) {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    
    const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    const activePanel = document.getElementById(tabId);
    
    if (activeBtn && activePanel) {
        activeBtn.classList.add("active");
        activePanel.classList.add("active");
    }
}

// EVENT LISTENERS & DRAWER SWIPE
function setupEventListeners() {
    // Tab switching
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            switchTab(btn.getAttribute("data-tab"));
            
            // Expand drawer on mobile if tab clicked
            if (window.innerWidth < 768) {
                document.getElementById("app-panel").classList.remove("collapsed");
            }
        });
    });
    
    // Collapsible Mobile Sheet (Drag Handle Click Toggle)
    const dragHandle = document.getElementById("drag-handle");
    const appPanel = document.getElementById("app-panel");
    
    if (dragHandle && appPanel) {
        dragHandle.addEventListener("click", () => {
            appPanel.classList.toggle("collapsed");
        });
        
        // Touch events to support simple drag/swipe toggle
        let startY = 0;
        dragHandle.addEventListener("touchstart", (e) => {
            startY = e.touches[0].clientY;
        }, { passive: true });
        
        dragHandle.addEventListener("touchend", (e) => {
            const endY = e.changedTouches[0].clientY;
            const diffY = endY - startY;
            
            if (diffY > 50) {
                // Swiped down -> Collapse sheet
                appPanel.classList.add("collapsed");
            } else if (diffY < -50) {
                // Swiped up -> Expand sheet
                appPanel.classList.remove("collapsed");
            }
        }, { passive: true });
    }
    
    // Profile Creation Form Listener
    const profileForm = document.getElementById("profile-form");
    if (profileForm) {
        profileForm.addEventListener("submit", (e) => {
            e.preventDefault();
            
            const name = document.getElementById("prof-name").value;
            const heightFt = parseInt(document.getElementById("prof-height-ft").value);
            const heightIn = parseInt(document.getElementById("prof-height-in").value);
            const weight = parseInt(document.getElementById("prof-weight").value);
            const length = parseInt(document.getElementById("prof-length").value);
            
            // Calculate buffers
            const buffers = calculateBuffer(heightFt, heightIn, weight);
            
            const newProfile = {
                id: "prof-" + Date.now(),
                name: name,
                heightFt: heightFt,
                heightIn: heightIn,
                weight: weight,
                length: length,
                ...buffers
            };
            
            state.profiles.push(newProfile);
            saveProfiles();
            renderProfiles();
            
            // Auto switch to newly created profile
            setActiveProfile(newProfile.id);
            
            // Reset form fields
            profileForm.reset();
            updateFormBufferPreview();
        });
        
        // Dynamic input listener to update buffer previews in real-time
        document.getElementById("prof-height-ft").addEventListener("input", updateFormBufferPreview);
        document.getElementById("prof-height-in").addEventListener("input", updateFormBufferPreview);
        document.getElementById("prof-weight").addEventListener("input", updateFormBufferPreview);
    }
    
    // Geolocation Floating button
    const locateBtn = document.getElementById("btn-locate");
    if (locateBtn) {
        locateBtn.addEventListener("click", () => {
            if (!navigator.geolocation) {
                alert("Geolocation is not supported by your browser.");
                return;
            }

            if (state.watchPositionId !== null) {
                // Already tracking
                if (!state.followUser) {
                    // Locked is off (because user dragged). Lock back on!
                    state.followUser = true;
                    locateBtn.classList.add("tracking-active");
                    if (state.userMarker) {
                        state.map.setView(state.userMarker.getLatLng(), state.map.getZoom() || 13);
                    }
                } else {
                    // Locked is on. Stop tracking entirely.
                    navigator.geolocation.clearWatch(state.watchPositionId);
                    state.watchPositionId = null;
                    state.followUser = false;
                    locateBtn.classList.remove("tracking-active");
                    if (state.userMarker) {
                        state.map.removeLayer(state.userMarker);
                        state.userMarker = null;
                    }
                }
            } else {
                // Not tracking. Start tracking!
                locateBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i>`;
                state.followUser = true;
                
                state.watchPositionId = navigator.geolocation.watchPosition(
                    (pos) => {
                        // Reset icon to crosshairs when position is found
                        locateBtn.innerHTML = `<i class="fa-solid fa-crosshairs"></i>`;
                        locateBtn.classList.add("tracking-active");
                        
                        const latlng = [pos.coords.latitude, pos.coords.longitude];
                        
                        if (state.userMarker) {
                            state.userMarker.setLatLng(latlng);
                        } else {
                            state.userMarker = L.marker(latlng, {
                                icon: L.divIcon({
                                    className: 'user-location-dot',
                                    html: '<div class="user-pulse-dot"></div>',
                                    iconSize: [30, 30]
                                })
                            }).addTo(state.map);
                            state.userMarker.bindPopup("<b>Your Location</b>");
                        }
                        
                        if (state.followUser) {
                            state.map.setView(latlng, state.map.getZoom() || 13);
                        }
                    },
                    (err) => {
                        locateBtn.innerHTML = `<i class="fa-solid fa-crosshairs"></i>`;
                        locateBtn.classList.remove("tracking-active");
                        state.followUser = false;
                        if (state.watchPositionId !== null) {
                            navigator.geolocation.clearWatch(state.watchPositionId);
                            state.watchPositionId = null;
                        }
                        alert("Could not retrieve current location: " + err.message);
                    },
                    {
                        enableHighAccuracy: true,
                        timeout: 10000,
                        maximumAge: 0
                    }
                );
            }
        });
    }

    // Geolocation input shortcut button
    const gpsStartBtn = document.getElementById("btn-gps-start");
    if (gpsStartBtn) {
        gpsStartBtn.addEventListener("click", () => {
            if (navigator.geolocation) {
                gpsStartBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i>`;
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        gpsStartBtn.innerHTML = `<i class="fa-solid fa-location-arrow"></i>`;
                        const lat = pos.coords.latitude;
                        const lng = pos.coords.longitude;
                        // Set coords in router.js global space
                        if (typeof setStartLatLng === "function") {
                            setStartLatLng(lat, lng);
                        }
                        document.getElementById("route-start").value = "My Location (GPS)";
                        
                        // Recenter map
                        state.map.setView([lat, lng], 12);
                    },
                    (err) => {
                        gpsStartBtn.innerHTML = `<i class="fa-solid fa-location-arrow"></i>`;
                        alert("Could not retrieve current location: " + err.message);
                    }
                );
            } else {
                alert("Geolocation is not supported by your browser.");
            }
        });
    }

    // Cycle Base Map Layers (Vector -> Satellite -> Topo -> Vector)
    const toggleLayerBtn = document.getElementById("btn-toggle-layers");
    if (toggleLayerBtn) {
        toggleLayerBtn.addEventListener("click", () => {
            if (state.activeBaseLayerName === 'vector') {
                if (state.map.hasLayer(state.baseLayers.dark)) {
                    state.map.removeLayer(state.baseLayers.dark);
                } else if (state.map.hasLayer(state.baseLayers.light)) {
                    state.map.removeLayer(state.baseLayers.light);
                }
                state.baseLayers.satellite.addTo(state.map);
                state.activeBaseLayerName = 'satellite';
                toggleLayerBtn.classList.add("active");
                toggleLayerBtn.title = "Switch to Topo View";
                showMapLayerNotification("Satellite Imagery Enabled");
            } else if (state.activeBaseLayerName === 'satellite') {
                state.map.removeLayer(state.baseLayers.satellite);
                state.baseLayers.topo.addTo(state.map);
                state.activeBaseLayerName = 'topo';
                toggleLayerBtn.title = "Switch to Vector View";
                showMapLayerNotification("Topographic Map Enabled");
            } else {
                state.map.removeLayer(state.baseLayers.topo);
                
                const isLight = document.body.classList.contains("light-theme");
                if (isLight) {
                    state.baseLayers.light.addTo(state.map);
                } else {
                    state.baseLayers.dark.addTo(state.map);
                }
                
                state.activeBaseLayerName = 'vector';
                toggleLayerBtn.classList.remove("active");
                toggleLayerBtn.title = "Switch to Satellite View";
                showMapLayerNotification("Vector Map Enabled");
            }
        });
    }

    // Release active tracking on user map drag
    if (state.map) {
        state.map.on("dragstart", () => {
            if (state.watchPositionId !== null && state.followUser) {
                state.followUser = false;
                if (locateBtn) {
                    locateBtn.classList.remove("tracking-active");
                }
            }
        });
    }
}

function updateFormBufferPreview() {
    const ftInput = document.getElementById("prof-height-ft");
    const inInput = document.getElementById("prof-height-in");
    const wtInput = document.getElementById("prof-weight");
    
    if (!ftInput || !inInput || !wtInput) return;
    
    const ft = parseInt(ftInput.value || 0);
    const inch = parseInt(inInput.value || 0);
    const wt = parseInt(wtInput.value || 0);
    
    const previews = calculateBuffer(ft, inch, wt);
    
    document.getElementById("preview-buffered-height").textContent = `${previews.bufferedHeightFt}' ${previews.bufferedHeightIn}"`;
    document.getElementById("preview-buffered-weight").textContent = `${previews.bufferedWeight.toLocaleString()} lbs`;
}

// OFFLINE MAP TILE DOWNLOADER (Phase 6 Bounding Box Calculation)
function downloadRouteMapOffline(route, idx) {
    if (!window.caches) {
        alert("Your browser does not support offline map caching.");
        return;
    }
    
    const progressToast = document.getElementById("offline-download-progress");
    const progressText = document.getElementById("download-progress-text");
    
    if (progressToast && progressText) {
        progressText.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-safe"></i> Preparing offline maps...`;
        progressToast.classList.remove("hidden");
    }
    
    // 1. Calculate bounding box padding (adds 0.05 degrees grid margin)
    const minLat = Math.min(route.startLat, route.endLat) - 0.05;
    const maxLat = Math.max(route.startLat, route.endLat) + 0.05;
    const minLng = Math.min(route.startLng, route.endLng) - 0.05;
    const maxLng = Math.max(route.startLng, route.endLng) + 0.05;
    
    // Helper tile calculations
    const lon2tile = (lon, zoom) => Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
    const lat2tile = (lat, zoom) => Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
    
    // Generate urls list
    const urlsToCache = [];
    const subdomains = ['a', 'b', 'c', 'd'];
    
    // Caching zooms 7 to 11
    for (let z = 7; z <= 11; z++) {
        const xMin = lon2tile(minLng, z);
        const xMax = lon2tile(maxLng, z);
        const yMin = lat2tile(maxLat, z);
        const yMax = lat2tile(minLat, z);
        
        for (let x = xMin; x <= xMax; x++) {
            for (let y = yMin; y <= yMax; y++) {
                // Distribute across subdomains to prevent load throttling
                const s = subdomains[Math.abs(x + y) % 4];
                urlsToCache.push(`https://${s}.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`);
            }
        }
    }
    
    if (urlsToCache.length === 0) {
        if (progressToast) progressToast.classList.add("hidden");
        return;
    }
    
    // Limit to safety threshold to protect browser storage
    const totalTiles = Math.min(urlsToCache.length, 500);
    const tileQueue = urlsToCache.slice(0, totalTiles);
    
    caches.open('rv-offline-tiles')
        .then(cache => {
            let downloadedCount = 0;
            
            const promises = tileQueue.map(url => {
                return fetch(url, { mode: 'cors' })
                    .then(response => {
                        if (response.ok) {
                            return cache.put(url, response);
                        }
                    })
                    .then(() => {
                        downloadedCount++;
                        const percent = Math.round((downloadedCount / totalTiles) * 100);
                        if (progressText) {
                            progressText.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-safe"></i> Caching tiles: ${percent}% (${downloadedCount}/${totalTiles})`;
                        }
                    })
                    .catch(() => {});
            });
            
            return Promise.all(promises);
        })
        .then(() => {
            if (progressText) {
                progressText.innerHTML = `<i class="fa-solid fa-circle-check text-safe"></i> Caching Complete!`;
            }
            
            // Mark route offline downloaded
            state.savedRoutes[idx].offlineDownloaded = true;
            saveSavedRoutes();
            renderSavedRoutes();
            
            setTimeout(() => {
                if (progressToast) progressToast.classList.add("hidden");
            }, 2500);
        })
        .catch(err => {
            console.error("Offline map cache failed:", err);
            if (progressToast) progressToast.classList.add("hidden");
            alert("Error downloading offline tiles. Please try again.");
        });
}

// PREMIUM FLOATING NOTIFICATION BANNER
function showMapLayerNotification(text) {
    // Remove existing notifications if user clicks rapidly
    const existing = document.querySelectorAll(".layer-notification");
    existing.forEach(n => document.body.removeChild(n));

    const toast = document.createElement("div");
    toast.className = "toast layer-notification";
    toast.style.top = "140px"; // Offset to slide beautifully below alerts
    toast.innerHTML = `<i class="fa-solid fa-layer-group text-safe"></i> ${text}`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transition = "opacity 0.4s ease";
        setTimeout(() => {
            if (toast.parentNode) {
                document.body.removeChild(toast);
            }
        }, 400);
    }, 1800);
}

// THEME & APPEARANCE SYSTEM (Phase 7)
let systemThemeMediaListener = null;

function initTheme() {
    // Read from localStorage
    const savedTheme = localStorage.getItem("rv_theme_setting") || "system";
    setTheme(savedTheme);
    
    // Bind click listeners on theme buttons
    document.querySelectorAll(".theme-select-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const theme = btn.getAttribute("data-theme");
            setTheme(theme);
        });
    });
}

function setTheme(themeName) {
    // Clear active selector states
    document.querySelectorAll(".theme-select-btn").forEach(b => b.classList.remove("active"));
    const activeBtn = document.querySelector(`.theme-select-btn[data-theme="${themeName}"]`);
    if (activeBtn) activeBtn.classList.add("active");
    
    // Remove previous listeners
    if (systemThemeMediaListener) {
        window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', systemThemeMediaListener);
        systemThemeMediaListener = null;
    }
    
    localStorage.setItem("rv_theme_setting", themeName);
    
    if (themeName === "system") {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        applyTheme(mq.matches ? "dark" : "light");
        
        // Listen to dynamic changes
        systemThemeMediaListener = (e) => {
            applyTheme(e.matches ? "dark" : "light");
        };
        mq.addEventListener('change', systemThemeMediaListener);
    } else {
        applyTheme(themeName);
    }
}

function applyTheme(theme) {
    if (theme === "light") {
        document.body.classList.add("light-theme");
        document.body.classList.remove("dark-theme");
    } else {
        document.body.classList.add("dark-theme");
        document.body.classList.remove("light-theme");
    }
    
    // Update active vector map layer dynamically
    if (state.map && state.activeBaseLayerName === 'vector') {
        if (theme === "light") {
            if (state.map.hasLayer(state.baseLayers.dark)) {
                state.map.removeLayer(state.baseLayers.dark);
            }
            state.baseLayers.light.addTo(state.map);
        } else {
            if (state.map.hasLayer(state.baseLayers.light)) {
                state.map.removeLayer(state.baseLayers.light);
            }
            state.baseLayers.dark.addTo(state.map);
        }
    }
}
