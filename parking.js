// RV Friendly GPS - Parking & Crowdsourced Database

let activeSubmittedPhotoBase64 = null;

// SEEDED HIGH-RELIABILITY RV PARKING DATABASE (Georgia Corridor)
const SEEDED_PARKING_DATA = [
    {
        id: "pk-seed-1",
        name: "Walmart Supercenter #2844 (Pooler)",
        lat: 32.1158,
        lng: -81.2505,
        type: "retail",
        bigRig: true,
        turningRadius: true,
        overnight: true,
        services: false,
        notes: "Huge paved retail lot near I-95. Overnight parking permitted on outer north side of lot. Clean, bright, and safe."
    },
    {
        id: "pk-seed-2",
        name: "Love's Travel Stop #432 (Richmond Hill)",
        lat: 31.9365,
        lng: -81.3325,
        type: "rest_area",
        bigRig: true,
        turningRadius: true,
        overnight: true,
        services: true,
        notes: "Full truck stop with dedicated high-speed diesel lanes. CAT scales, dump station, propane refills, and overnight parking slots."
    },
    {
        id: "pk-seed-3",
        name: "Georgia Welcome Center & Rest Area (I-95 N)",
        lat: 32.2225,
        lng: -81.1685,
        type: "rest_area",
        bigRig: true,
        turningRadius: true,
        overnight: true,
        services: false,
        notes: "Official rest area. Large pull-through parking bays for trucks and big rigs. Grassy pet area and 24/7 security patrol."
    },
    {
        id: "pk-seed-4",
        name: "Cabela's Outdoor Parking (Acworth)",
        lat: 34.0532,
        lng: -84.6738,
        type: "retail",
        bigRig: true,
        turningRadius: true,
        overnight: true,
        services: false,
        notes: "Designated RV/Truck bays. Overnight boondocking allowed for up to 24 hours. Very close to Cabela's store front."
    },
    {
        id: "pk-seed-5",
        name: "Pilot Travel Center (Valdosta I-75 Exit 2)",
        lat: 30.7681,
        lng: -83.2798,
        type: "rest_area",
        bigRig: true,
        turningRadius: true,
        overnight: true,
        services: true,
        notes: "Diesel lanes, dump station, water spigot. Dedicated overnight slots for large travel trailers."
    }
];

// STATE MARKERS CONTAINER FOR LAYERS TOGGLE
let parkingMarkers = [];

// INITIALIZATION CALLBACK CALLED FROM app.js
function initParkingOverlay() {
    loadCustomParkingSpots();
    renderAllParkingMarkers();
    setupParkingEventListeners();
}

// PERSISTENCE
function loadCustomParkingSpots() {
    const stored = localStorage.getItem("rv_custom_parking_spots");
    if (stored) {
        state.customParkingSpots = JSON.parse(stored);
    } else {
        state.customParkingSpots = [];
    }
}

function saveCustomParkingSpots() {
    localStorage.setItem("rv_custom_parking_spots", JSON.stringify(state.customParkingSpots));
}

// EVENTS Setup
function setupParkingEventListeners() {
    // Toggles for checkboxes
    const c1 = document.getElementById("layer-truck-stops");
    const c2 = document.getElementById("layer-rest-areas");
    const c3 = document.getElementById("layer-custom-pins");
    
    if (c1) c1.addEventListener("change", (e) => { state.mapLayers.truckStops = e.target.checked; renderAllParkingMarkers(); });
    if (c2) c2.addEventListener("change", (e) => { state.mapLayers.restAreas = e.target.checked; renderAllParkingMarkers(); });
    if (c3) c3.addEventListener("change", (e) => { state.mapLayers.customPins = e.target.checked; renderAllParkingMarkers(); });
    
    // Drop Pin Action Triggers
    const triggerBtn = document.getElementById("btn-start-pin-drop");
    const shortcutBtn = document.getElementById("btn-add-pin-mode");
    
    if (triggerBtn) triggerBtn.addEventListener("click", () => togglePinDropMode());
    if (shortcutBtn) shortcutBtn.addEventListener("click", () => togglePinDropMode());
    
    // Form action listeners
    const cancelBtn = document.getElementById("btn-cancel-parking");
    const submitBtn = document.getElementById("btn-submit-parking");
    
    if (cancelBtn) cancelBtn.addEventListener("click", () => exitPinDropMode());
    if (submitBtn) submitBtn.addEventListener("click", () => submitCustomParkingPin());
    
    // Photo Uploader listeners
    const photoInput = document.getElementById("parking-photo");
    const removePhotoBtn = document.getElementById("btn-remove-photo");
    
    if (photoInput) {
        photoInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (event) => {
                activeSubmittedPhotoBase64 = event.target.result;
                const preview = document.getElementById("parking-photo-preview");
                const container = document.getElementById("parking-photo-preview-container");
                if (preview && container) {
                    preview.src = activeSubmittedPhotoBase64;
                    container.classList.remove("hidden");
                }
            };
            reader.readAsDataURL(file);
        });
    }
    
    if (removePhotoBtn) {
        removePhotoBtn.addEventListener("click", () => {
            clearSubmittedPhoto();
        });
    }
    
    // Query Live OSM Data on map drag end (real Overpass call!)
    state.map.on('dragend', () => {
        // Query if map zoomed in close enough to avoid massive downloads
        if (state.map.getZoom() >= 10) {
            queryLiveOverpassData();
        }
    });
}

function togglePinDropMode() {
    if (state.isPinDropMode) {
        exitPinDropMode();
    } else {
        enterPinDropMode();
    }
}

// CROWDSOURCING INTERACTION ENGINE (Phase 3 Blueprint)
function enterPinDropMode() {
    state.isPinDropMode = true;
    
    // Styling/instruction hints
    document.getElementById("map").style.cursor = "crosshair";
    document.getElementById("pin-instruction").classList.remove("hidden");
    
    // Toggle active state on floating control button
    document.getElementById("btn-add-pin-mode").classList.add("active");
    
    // Bind click event on leaflet map canvas
    state.map.on('click', handleMapClickForPinDrop);
    
    // Collapse bottom drawer on mobile to allow map viewport clicking
    if (window.innerWidth < 768) {
        document.getElementById("app-panel").classList.add("collapsed");
    }
}

function exitPinDropMode() {
    state.isPinDropMode = false;
    document.getElementById("map").style.cursor = "";
    document.getElementById("pin-instruction").classList.add("hidden");
    document.getElementById("parking-submission-form").classList.add("hidden");
    document.getElementById("btn-add-pin-mode").classList.remove("active");
    
    // Unbind map click
    state.map.off('click', handleMapClickForPinDrop);
    
    // Reset file photo uploader
    clearSubmittedPhoto();
}

function clearSubmittedPhoto() {
    activeSubmittedPhotoBase64 = null;
    const photoInput = document.getElementById("parking-photo");
    const preview = document.getElementById("parking-photo-preview");
    const container = document.getElementById("parking-photo-preview-container");
    if (photoInput) photoInput.value = "";
    if (preview) preview.src = "";
    if (container) container.classList.add("hidden");
}

function handleMapClickForPinDrop(e) {
    const latlng = e.latlng;
    state.selectedPinLatLng = latlng;
    
    // Show coordinates in submission box
    document.getElementById("submit-coords").textContent = `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
    
    // Show submission panel form
    document.getElementById("parking-submission-form").classList.remove("hidden");
    
    // Expand drawer on mobile and switch to Parking tab
    const appPanel = document.getElementById("app-panel");
    if (appPanel) appPanel.classList.remove("collapsed");
    switchTab("tab-parking");
    
    // Create a temporary marker to preview location on map
    const tempMarker = L.marker(latlng, {
        icon: L.divIcon({
            className: 'custom-map-pin temp-preview-pin',
            html: '<i class="fa-solid fa-square-plus"></i>',
            iconSize: [28, 28]
        })
    }).addTo(state.map);
    
    // Automatically delete temp marker after exiting mode or submitting
    state.map.on('click', function cleanupTemp() {
        state.map.removeLayer(tempMarker);
        state.map.off('click', cleanupTemp);
    });
}

function submitCustomParkingPin() {
    if (!state.selectedPinLatLng) return;
    
    const type = document.getElementById("parking-type").value;
    const bigRig = document.getElementById("acc-bigrig").checked;
    const turningRadius = document.getElementById("acc-turning").checked;
    const overnight = document.getElementById("acc-overnight").checked;
    const services = document.getElementById("acc-services").checked;
    const notes = document.getElementById("parking-notes").value.trim();
    
    const defaultName = `${type.toUpperCase().replace('_', ' ')} Lot at Pin`;
    const name = prompt("Enter parking location name:", defaultName);
    
    if (name === null) return; // user cancelled
    
    const newSpot = {
        id: "pk-custom-" + Date.now(),
        name: name || defaultName,
        lat: state.selectedPinLatLng.lat,
        lng: state.selectedPinLatLng.lng,
        type: type,
        bigRig: bigRig,
        turningRadius: turningRadius,
        overnight: overnight,
        services: services,
        notes: notes || "No additional comments added by user.",
        photo: activeSubmittedPhotoBase64 // Save Base64 photo string
    };
    
    state.customParkingSpots.push(newSpot);
    saveCustomParkingSpots();
    
    // Sync to cloud or queue for offline sync
    if (window.AuthManager) {
        const isOnline = window.NativeBridge ? window.NativeBridge.networkStatus.connected : (navigator.onLine !== undefined ? navigator.onLine : true);
        if (!isOnline) {
            window.AuthManager.queueOfflineLocation(newSpot);
        } else {
            window.AuthManager.syncCloudData();
        }
    }
    
    // Clean up interface
    exitPinDropMode();
    renderAllParkingMarkers();
    
    // Reset form elements
    document.getElementById("parking-notes").value = "";
    document.getElementById("acc-services").checked = false;
}

// RENDER ALL DATA LAYERS
function renderAllParkingMarkers() {
    // Clear old markers from map
    parkingMarkers.forEach(m => state.map.removeLayer(m));
    parkingMarkers = [];
    
    // Helper function to create popup HTML
    const getPopupHtml = (spot, isUserGenerated = false) => {
        return `
            <div>
                <h4><i class="fa-solid ${spot.type === 'retail' ? 'fa-shop' : 'fa-square-parking'}" style="color:var(--color-info)"></i> ${spot.name}</h4>
                ${isUserGenerated ? '<span class="badge badge-ok" style="background:rgba(14,165,233,0.15);color:var(--color-info);">Crowdsourced Spot</span>' : '<span class="badge badge-ok">Verified Facility</span>'}
                
                <div style="font-size:11px;margin-top:8px;color:var(--text-secondary);">
                    <div><i class="fa-solid ${spot.bigRig ? 'fa-check text-safe' : 'fa-xmark text-danger'}"></i> Big Rig Friendly (40ft+)</div>
                    <div><i class="fa-solid ${spot.turningRadius ? 'fa-check text-safe' : 'fa-xmark text-danger'}"></i> Wide turning radius</div>
                    <div><i class="fa-solid ${spot.overnight ? 'fa-check text-safe' : 'fa-xmark text-danger'}"></i> Overnight permitted</div>
                    <div><i class="fa-solid ${spot.services ? 'fa-check text-safe' : 'fa-xmark text-danger'}"></i> Dump/Water available</div>
                </div>
                <p style="font-size:11px;margin-top:8px;font-style:italic;color:var(--text-secondary);">"${spot.notes}"</p>
                ${spot.photo ? `<img src="${spot.photo}" alt="${spot.name}">` : ''}
            </div>
        `;
    };
    
    // 1. Render Seeded Static Parking Lots
    SEEDED_PARKING_DATA.forEach(spot => {
        // Toggle filter validation
        if (spot.type === "retail" && !state.mapLayers.customPins) return; // Retail category grouped in custom/community display
        if (spot.type === "rest_area" && !state.mapLayers.restAreas) return;
        
        let markerClass = 'parking-pin-retail';
        let markerIcon = '<i class="fa-solid fa-shop"></i>';
        
        if (spot.type === 'rest_area') {
            markerClass = 'parking-pin-rest';
            markerIcon = '<i class="fa-solid fa-gas-pump"></i>';
        }
        
        const m = L.marker([spot.lat, spot.lng], {
            icon: L.divIcon({
                className: `custom-map-pin ${markerClass}`,
                html: markerIcon,
                iconSize: [26, 26]
            })
        }).addTo(state.map).bindPopup(getPopupHtml(spot, false));
        
        parkingMarkers.push(m);
    });
    
    // 2. Render Custom Crowdsourced Parking spots from LocalStorage
    if (state.mapLayers.customPins) {
        state.customParkingSpots.forEach(spot => {
            const m = L.marker([spot.lat, spot.lng], {
                icon: L.divIcon({
                    className: 'custom-map-pin parking-pin-custom',
                    html: '<i class="fa-solid fa-users"></i>',
                    iconSize: [28, 28]
                })
            }).addTo(state.map).bindPopup(getPopupHtml(spot, true));
            
            parkingMarkers.push(m);
        });
    }
}

// FALLBACK LIVE OVERPASS API ENGINE
function queryLiveOverpassData() {
    if (!state.mapLayers.truckStops && !state.mapLayers.restAreas) return;
    
    const bounds = state.map.getBounds();
    const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
    
    // Query rest areas and truck fuels specifically marked with high-heavy vehicle tags
    const query = `[out:json][timeout:15];(node["amenity"="fuel"]["hgv"="yes"](${bbox});node["amenity"="rest_area"](${bbox}););out body;`;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    
    fetch(url)
        .then(res => res.json())
        .then(data => {
            if (!data.elements) return;
            
            data.elements.forEach(el => {
                // Ensure spot is not already drawn
                const exists = SEEDED_PARKING_DATA.some(s => Math.abs(s.lat - el.lat) < 0.0005 && Math.abs(s.lng - el.lon) < 0.0005);
                if (exists) return;
                
                const isRest = el.tags.amenity === "rest_area";
                
                if (isRest && !state.mapLayers.restAreas) return;
                if (!isRest && !state.mapLayers.truckStops) return;
                
                const name = el.tags.name || (isRest ? "Highway Rest Area" : "Truck Fueling Depot");
                
                const spot = {
                    id: "pk-live-" + el.id,
                    name: name,
                    lat: el.lat,
                    lng: el.lon,
                    type: isRest ? "rest_area" : "rest_area", // Group as rest stop
                    bigRig: true,
                    turningRadius: true,
                    overnight: true,
                    services: el.tags.sanitary_dump_station === "yes",
                    notes: `OSM Live Node. Tagged HGV lanes. ${el.tags.brand ? `Brand: ${el.tags.brand}` : ''}`
                };
                
                const m = L.marker([spot.lat, spot.lng], {
                    icon: L.divIcon({
                        className: `custom-map-pin ${isRest ? 'parking-pin-rest' : 'parking-pin-live-osm'}`,
                        html: `<i class="fa-solid ${isRest ? 'fa-tree' : 'fa-gas-pump'}"></i>`,
                        iconSize: [26, 26]
                    })
                }).addTo(state.map).bindPopup(getPopupHtml(spot, false));
                
                parkingMarkers.push(m);
            });
        })
        .catch(err => {
            console.warn("Overpass API rate limited or offline. Using local databases.", err);
        });
}
