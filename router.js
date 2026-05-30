// RV Friendly GPS - Routing & Hazard System

// LOCAL RESTRICTION HAZARDS DATABASE (Atlanta-Savannah-Florida Corridors)
// Seeded with typical actual hazards for realistic calculations and demonstrations
const HAZARDS_DATABASE = [
    {
        id: "hz-1",
        name: "Savannah Historic Rail Bridge Underpass",
        lat: 32.0674,
        lng: -81.1092,
        type: "height",
        limitFt: 12,
        limitIn: 8,
        desc: "Historic brick railroad arch overpass. Low clearance center lane. Extreme risk of contact."
    },
    {
        id: "hz-2",
        name: "E Bay Street Low Clearance arch",
        lat: 32.0801,
        lng: -81.0905,
        type: "height",
        limitFt: 11,
        limitIn: 6,
        desc: "Access archway leading to lower riverfront. Absolutely no motorhomes or big rigs permitted."
    },
    {
        id: "hz-3",
        name: "Macon Route 80 Historic Ocmulgee Crossing",
        lat: 32.8402,
        lng: -83.6184,
        type: "weight",
        limitLbs: 20000, // 10 Tons
        desc: "Weak steel truss bridge. Heavily restricted weight limits. Active police enforcement."
    },
    {
        id: "hz-4",
        name: "Krog Street Tunnel (Atlanta)",
        lat: 33.7531,
        lng: -84.3639,
        type: "height",
        limitFt: 11,
        limitIn: 0,
        desc: "Historic underpass tunnel connecting Inman Park. High traffic, sharp entries, low clearance."
    },
    {
        id: "hz-5",
        name: "Athens North Oconee River Bridge",
        lat: 33.9592,
        lng: -83.3705,
        type: "weight",
        limitLbs: 24000, // 12 Tons
        desc: "Structural deck deterioration has reduced weight limit capacity. RV transit prohibited."
    },
    {
        id: "hz-6",
        name: "Macon I-16 Bypass Low Rail Crossing",
        lat: 32.8315,
        lng: -83.6358,
        type: "height",
        limitFt: 13,
        limitIn: 2,
        desc: "CSX Rail underpass. Clearance warning signs active."
    }
];

// STATE VARIABLES FOR ROUTING
let startLatLng = [33.7490, -84.3880]; // Default Atlanta, GA
let endLatLng = [32.0835, -81.0998];   // Default Savannah, GA
let geocodeDebounceTimer = null;
let activeHazardsOnRoute = [];

// SETUP EVENT LISTENERS FOR INPUTS & CALCULATIONS
document.addEventListener("DOMContentLoaded", () => {
    setupInputSuggestions("route-start", "start-suggestions", (lat, lng) => {
        startLatLng = [lat, lng];
    });
    
    setupInputSuggestions("route-end", "end-suggestions", (lat, lng) => {
        endLatLng = [lat, lng];
    });
    
    const calculateBtn = document.getElementById("btn-calculate-route");
    if (calculateBtn) {
        calculateBtn.addEventListener("click", () => {
            calculateSafeRoute();
        });
    }

    const saveRouteBtn = document.getElementById("btn-save-this-route");
    if (saveRouteBtn) {
        saveRouteBtn.addEventListener("click", () => {
            saveCurrentRoute();
        });
    }

    // Toggle driving directions panel
    const toggleDirectionsBtn = document.getElementById("btn-toggle-directions");
    const directionsContainer = document.getElementById("directions-container");
    if (toggleDirectionsBtn && directionsContainer) {
        toggleDirectionsBtn.addEventListener("click", () => {
            const isHidden = directionsContainer.classList.contains("hidden");
            if (isHidden) {
                directionsContainer.classList.remove("hidden");
                toggleDirectionsBtn.classList.add("active");
            } else {
                directionsContainer.classList.add("hidden");
                toggleDirectionsBtn.classList.remove("active");
            }
        });
    }
});

// NOMINATIM GEOLOCATION AUTOCOMPLETE
function setupInputSuggestions(inputId, suggestionListId, selectCallback) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(suggestionListId);
    
    if (!input || !list) return;
    
    input.addEventListener("input", () => {
        clearTimeout(geocodeDebounceTimer);
        const query = input.value.trim();
        
        if (query.length < 3) {
            list.classList.remove("show");
            return;
        }
        
        geocodeDebounceTimer = setTimeout(() => {
            fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=us`)
                .then(res => res.json())
                .then(data => {
                    list.innerHTML = "";
                    if (data.length === 0) {
                        list.classList.remove("show");
                        return;
                    }
                    
                    data.forEach(item => {
                        const li = document.createElement("li");
                        li.innerHTML = `<i class="fa-solid fa-map-location-dot"></i> <span>${item.display_name}</span>`;
                        li.addEventListener("click", () => {
                            input.value = item.display_name;
                            list.classList.remove("show");
                            selectCallback(parseFloat(item.lat), parseFloat(item.lon));
                        });
                        list.appendChild(li);
                    });
                    list.classList.add("show");
                })
                .catch(err => {
                    console.error("Geocoding fetch error:", err);
                });
        }, 400); // 400ms debounce
    });
    
    // Close suggestions on outside click
    document.addEventListener("click", (e) => {
        if (!input.contains(e.target) && !list.contains(e.target)) {
            list.classList.remove("show");
        }
    });
}

// EXPOSE COORDINATE SETTER
window.setStartLatLng = function(lat, lng) {
    startLatLng = [lat, lng];
};

// SCENIC DETOUR MIDPOINT SELECTOR
function getScenicDetourWaypoint(start, end) {
    // Direct check for our main Atlanta <-> Savannah corridor
    const isAtlSav = (Math.abs(start[0] - 33.7490) < 0.5 && Math.abs(end[0] - 32.0835) < 0.5) ||
                     (Math.abs(start[0] - 32.0835) < 0.5 && Math.abs(end[0] - 33.7490) < 0.5);
    if (isAtlSav) {
        return [32.7230, -82.4110]; // Swainsboro GA on US-80
    }
    
    // Savannah <-> Brunswick/Jacksonville corridor
    const isSavJax = (Math.abs(start[0] - 32.0835) < 0.5 && Math.abs(end[0] - 30.3322) < 0.5) ||
                     (Math.abs(start[0] - 30.3322) < 0.5 && Math.abs(end[0] - 32.0835) < 0.5);
    if (isSavJax) {
        return [31.2580, -81.4420]; // Darien/Brunswick GA on US-17
    }
    
    // Fallback midpoint: shift midpoint perpendicularly to direct path to bypass freeways
    const midLat = (start[0] + end[0]) / 2;
    const midLng = (start[1] + end[1]) / 2;
    return [midLat + 0.045, midLng - 0.045];
}

// ROUTING CALCULATION LOGIC
function calculateSafeRoute() {
    if (!startLatLng || !endLatLng) {
        alert("Please select starting and destination locations from the suggestions list.");
        return;
    }
    
    // Expand drawer on mobile to show results
    const appPanel = document.getElementById("app-panel");
    if (window.innerWidth < 768 && appPanel) {
        appPanel.classList.remove("collapsed");
    }
    
    // Construct OSRM coordinate driving query with alternatives and steps enabled
    // API Coordinate order: longitude,latitude
    const url = `https://router.project-osrm.org/route/v1/driving/${startLatLng[1]},${startLatLng[0]};${endLatLng[1]},${endLatLng[0]}?geometries=geojson&overview=full&alternatives=true&steps=true`;
    
    // Show spinner or loader on button
    const btn = document.getElementById("btn-calculate-route");
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Analyzing restrictions...`;
    btn.disabled = true;
    
    fetch(url)
        .then(res => res.json())
        .then(data => {
            btn.innerHTML = originalText;
            btn.disabled = false;
            
            if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
                alert("Could not compute route geometry between coordinates.");
                return;
            }
            
            const avoidInterstates = document.getElementById("chk-avoid-interstates")?.checked || false;
            
            const primaryRoute = data.routes[0];
            const coordinates = primaryRoute.geometry.coordinates.map(c => [c[1], c[0]]);
            const primaryHazards = getHazardsForPath(coordinates);
            
            const detourWaypoints = [];
            
            // 1. If hazard exists, generate clearance bypass detour
            if (primaryHazards.length > 0) {
                const firstHazard = primaryHazards[0];
                let detourLat = firstHazard.lat - 0.025;
                let detourLng = firstHazard.lng - 0.035;
                
                // Savannah rail bridge bypass adjustment
                if (Math.abs(firstHazard.lat - 32.0674) < 0.01) {
                    detourLat = 32.0520;
                    detourLng = -81.1450; // SW freeway bypass detour
                }
                detourWaypoints.push({ lat: detourLat, lng: detourLng, label: "Detour Bypass" });
            }
            
            // 2. If avoid interstates toggle is active, generate scenic detour waypoint
            if (avoidInterstates) {
                const scenic = getScenicDetourWaypoint(startLatLng, endLatLng);
                detourWaypoints.push({ lat: scenic[0], lng: scenic[1], label: "Scenic Bypass" });
            }
            
            // Parallel fetches for all mid-way detours
            const detourPromises = detourWaypoints.map(wp => {
                const detourUrl = `https://router.project-osrm.org/route/v1/driving/${startLatLng[1]},${startLatLng[0]};${wp.lng},${wp.lat};${endLatLng[1]},${endLatLng[0]}?geometries=geojson&overview=full&steps=true`;
                return fetch(detourUrl)
                    .then(res => res.json())
                    .then(wpData => {
                        if (wpData.code === "Ok" && wpData.routes && wpData.routes.length > 0) {
                            const r = wpData.routes[0];
                            r.isDetour = true;
                            r.customName = wp.label === "Scenic Bypass" ? "Scenic Path (Non-Interstate)" : "Safe Bypass (Auto Detour)";
                            return r;
                        }
                        return null;
                    })
                    .catch(() => null);
            });
            
            Promise.all(detourPromises)
                .then(detourRoutes => {
                    let allRoutes = [...data.routes];
                    detourRoutes.forEach(dr => {
                        if (dr) allRoutes.push(dr);
                    });
                    processAndRenderRoutesList(allRoutes, avoidInterstates);
                });
        })
        .catch(err => {
            btn.innerHTML = originalText;
            btn.disabled = false;
            console.error("Routing error:", err);
            alert("Error connecting to OSRM routing service. Check internet connection.");
        });
}

// ROUTE PROCESSOR & SCORER
function processAndRenderRoutesList(osrmRoutes, avoidInterstates) {
    const analyzedRoutes = osrmRoutes.map((route, index) => {
        const coordinates = route.geometry.coordinates.map(c => [c[1], c[0]]);
        const hazards = getHazardsForPath(coordinates);
        
        // Scan steps for interstates
        let containsInterstate = false;
        if (route.legs) {
            route.legs.forEach(leg => {
                if (leg.steps) {
                    leg.steps.forEach(step => {
                        const name = (step.name || "").toUpperCase();
                        const ref = (step.ref || "").toUpperCase();
                        const isInterstate = name.startsWith("I-") || name.includes("INTERSTATE") || 
                                             ref.startsWith("I-") || ref.includes("INTERSTATE") ||
                                             /^I\s\d+/.test(name) || /^I\s\d+/.test(ref);
                        if (isInterstate) {
                            containsInterstate = true;
                        }
                    });
                }
            });
        }
        
        return {
            index: index,
            name: route.customName ? route.customName : (index === 0 ? "Primary Route" : `Alternative Route ${index}`),
            routeData: route,
            coordinates: coordinates,
            hazards: hazards,
            isSafe: hazards.length === 0,
            hasInterstate: containsInterstate
        };
    });
    
    // Render selector DOM element
    renderRouteAlternativesSelector(analyzedRoutes);
    
    // Scorer logic: Select active path
    let selected = null;
    if (avoidInterstates) {
        // Priority 1: Safe and has no interstates
        selected = analyzedRoutes.find(r => r.isSafe && !r.hasInterstate);
        // Priority 2: Non-interstate even with hazards
        if (!selected) selected = analyzedRoutes.find(r => !r.hasInterstate);
        // Priority 3: Safe even with interstates
        if (!selected) selected = analyzedRoutes.find(r => r.isSafe);
    } else {
        // Priority 1: Safe routes
        selected = analyzedRoutes.find(r => r.isSafe);
    }
    
    // Fallback
    if (!selected) selected = analyzedRoutes[0];
    
    selectActiveRouteOption(selected, analyzedRoutes);
}

// HAZARD EVALUATION HELPER
function getHazardsForPath(coordinates) {
    const activeProfile = state.profiles.find(p => p.id === state.activeProfileId);
    if (!activeProfile) return [];
    
    const activeHeightFt = activeProfile.bufferedHeightFt;
    const activeHeightIn = activeProfile.bufferedHeightIn;
    const activeWeight = activeProfile.bufferedWeight;
    const activeTotalHeightIn = (activeHeightFt * 12) + activeHeightIn;
    
    const triggeredHazards = [];
    
    HAZARDS_DATABASE.forEach(hazard => {
        const closeToRoute = coordinates.some(coord => {
            const latDiff = Math.abs(coord[0] - hazard.lat);
            const lngDiff = Math.abs(coord[1] - hazard.lng);
            // Approx 350 meters threshold
            return latDiff < 0.0035 && lngDiff < 0.0035;
        });
        
        if (closeToRoute) {
            let isTriggered = false;
            
            if (hazard.type === "height") {
                const hzTotalHeightIn = (hazard.limitFt * 12) + hazard.limitIn;
                if (activeTotalHeightIn >= hzTotalHeightIn) {
                    isTriggered = true;
                }
            } else if (hazard.type === "weight") {
                if (activeWeight >= hazard.limitLbs) {
                    isTriggered = true;
                }
            }
            
            if (isTriggered) {
                triggeredHazards.push(hazard);
            }
        }
    });
    
    return triggeredHazards;
}

// RENDER ALTERNATIVES SELECTOR UI
function renderRouteAlternativesSelector(analyzedRoutes) {
    const container = document.getElementById("route-selector-container");
    const list = document.getElementById("route-alternatives-list");
    
    if (!container || !list) return;
    
    if (analyzedRoutes.length <= 1) {
        container.classList.add("hidden");
        return;
    }
    
    container.classList.remove("hidden");
    list.innerHTML = "";
    
    analyzedRoutes.forEach(routeOpt => {
        const card = document.createElement("div");
        const hasHazards = routeOpt.hazards.length > 0;
        card.className = `route-alternative-card ${hasHazards ? 'has-warnings' : ''}`;
        card.id = `alt-card-${routeOpt.index}`;
        
        const distanceMiles = (routeOpt.routeData.distance * 0.000621371).toFixed(1);
        const totalMinutes = Math.round(routeOpt.routeData.duration / 60);
        const hrs = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        const durationStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
        
        card.innerHTML = `
            <div class="alt-info">
                <h5>${routeOpt.name}</h5>
                <div class="alt-meta">
                    <span>${distanceMiles} mi • ${durationStr}</span> • 
                    <span style="color:${routeOpt.hasInterstate ? 'var(--text-muted)' : 'var(--color-safe)'}; font-weight: 600;">
                        ${routeOpt.hasInterstate ? 'Interstate' : 'Scenic'}
                    </span>
                </div>
            </div>
            <span class="alt-status ${hasHazards ? 'status-warning' : 'status-safe'}">
                ${hasHazards ? `<i class="fa-solid fa-triangle-exclamation"></i> ${routeOpt.hazards.length} Alert${routeOpt.hazards.length > 1 ? 's' : ''}` : '<i class="fa-solid fa-check"></i> Clear'}
            </span>
        `;
        
        card.addEventListener("click", () => {
            selectActiveRouteOption(routeOpt, analyzedRoutes);
        });
        
        list.appendChild(card);
    });
}

// SELECT OPTION HANDLER
function selectActiveRouteOption(routeOption, allRoutes) {
    state.activeRoutePolylineCoordinates = routeOption.coordinates;
    activeHazardsOnRoute = routeOption.hazards;
    
    // Toggle active selectors classes
    allRoutes.forEach(r => {
        const card = document.getElementById(`alt-card-${r.index}`);
        if (card) card.classList.remove("active");
    });
    
    const activeCard = document.getElementById(`alt-card-${routeOption.index}`);
    if (activeCard) activeCard.classList.add("active");
    
    // Draw on Map Canvas
    renderRouteOnMap(routeOption.coordinates, routeOption.hazards);
    
    // Display results in sidebar
    displayRouteResults(routeOption.routeData, routeOption.hazards);
}

// MAP CANVAS RENDERER
function renderRouteOnMap(coordinates, hazards) {
    // Clear old polylines and markers
    if (state.activeRoutePolyline) {
        state.map.removeLayer(state.activeRoutePolyline);
    }
    state.activeRouteMarkers.forEach(m => state.map.removeLayer(m));
    state.activeRouteMarkers = [];
    
    const isSafe = hazards.length === 0;
    
    // Render base route line with warning colors
    state.activeRoutePolyline = L.polyline(coordinates, {
        color: isSafe ? varColorHex('--color-safe') : varColorHex('--color-danger'),
        weight: 6,
        opacity: 0.85,
        lineCap: 'round',
        lineJoin: 'round'
    }).addTo(state.map);
    
    // Create markers for Start and Destination
    const startMarker = L.marker(coordinates[0], {
        icon: L.divIcon({
            className: 'custom-map-pin start-pin',
            html: '<i class="fa-solid fa-circle-dot"></i>',
            iconSize: [24, 24]
        })
    }).addTo(state.map).bindPopup("<b>Trip Start</b>");
    
    const endMarker = L.marker(coordinates[coordinates.length - 1], {
        icon: L.divIcon({
            className: 'custom-map-pin end-pin',
            html: '<i class="fa-solid fa-location-dot"></i>',
            iconSize: [24, 24]
        })
    }).addTo(state.map).bindPopup("<b>Trip Destination</b>");
    
    state.activeRouteMarkers.push(startMarker, endMarker);
    
    // If hazards exist, draw Red Warning Markers and overlays on top
    hazards.forEach(hazard => {
        const hazardMarker = L.marker([hazard.lat, hazard.lng], {
            icon: L.divIcon({
                className: 'custom-map-pin hazard-pin',
                html: '<i class="fa-solid fa-triangle-exclamation"></i>',
                iconSize: [30, 30]
            })
        }).addTo(state.map);
        
        const popupContent = `
            <div>
                <h4><i class="fa-solid fa-triangle-exclamation" style="color:var(--color-danger)"></i> Clearance Alert</h4>
                <p><b>${hazard.name}</b></p>
                <p>Restriction: <span style="color:var(--color-danger);font-weight:700;">
                    ${hazard.type === 'height' ? `${hazard.limitFt}' ${hazard.limitIn}" Max Height` : `${hazard.limitLbs.toLocaleString()} lbs Weight Limit`}
                </span></p>
                <p style="font-size:11px;margin-top:6px;">${hazard.desc}</p>
            </div>
        `;
        
        hazardMarker.bindPopup(popupContent);
        state.activeRouteMarkers.push(hazardMarker);
        
        // Render local alert visual ring overlay
        const warningRing = L.circle([hazard.lat, hazard.lng], {
            color: varColorHex('--color-danger'),
            fillColor: varColorHex('--color-danger'),
            fillOpacity: 0.15,
            radius: 350 // meters
        }).addTo(state.map);
        state.activeRouteMarkers.push(warningRing);
    });
    
    // Fit map viewport bounds to route coordinates
    state.map.fitBounds(state.activeRoutePolyline.getBounds(), {
        padding: [40, 40]
    });
}

// HELPER TO MAP OSRM MANEUVERS TO ICONS
function getDirectionIcon(maneuver) {
    const type = maneuver.type;
    const modifier = maneuver.modifier || "";
    
    if (type === "depart") return "fa-play text-safe";
    if (type === "arrive") return "fa-flag-checkered text-danger";
    
    if (modifier.includes("left")) {
        if (modifier.includes("sharp")) return "fa-reply";
        return "fa-arrow-left";
    }
    if (modifier.includes("right")) {
        if (modifier.includes("sharp")) return "fa-share";
        return "fa-arrow-right";
    }
    if (type === "roundabout") return "fa-circle-notch";
    if (type === "merge") return "fa-code-branch";
    if (modifier === "straight") return "fa-arrow-up";
    
    return "fa-arrow-up"; // default
}

// HELPER TO GENERATE INSTRUCTION TEXTS
function getDirectionText(step) {
    const maneuver = step.maneuver;
    if (maneuver.instruction) return maneuver.instruction;
    
    // Fallback generation if instruction field is missing
    const type = maneuver.type;
    const modifier = maneuver.modifier || "";
    const name = step.name || "";
    
    if (type === "depart") {
        return `Start route heading ${modifier} on ${name || 'unnamed road'}`;
    }
    if (type === "arrive") {
        return `Arrive at destination`;
    }
    
    let action = "Continue";
    if (type === "turn") {
        action = `Turn ${modifier}`;
    } else if (type === "new name") {
        action = "Continue onto";
    } else if (type === "merge") {
        action = `Merge ${modifier}`;
    } else if (type === "ramp") {
        action = `Take the ramp ${modifier}`;
    } else if (type === "roundabout") {
        action = "Enter the roundabout";
    }
    
    if (name) {
        return `${action} onto <strong>${name}</strong>`;
    } else {
        return `${action}`;
    }
}

// HELPER TO FORMAT METER DISTANCES
function formatStepDistance(meters) {
    if (meters < 1) return "";
    const feet = Math.round(meters * 3.28084);
    if (feet < 528) {
        return `${feet} ft`;
    } else {
        const miles = (meters * 0.000621371).toFixed(1);
        return `${miles} mi`;
    }
}

// ROUTE DETAILS RENDERER (Side Panel list update)
function displayRouteResults(routeData, hazards) {
    const resultsContainer = document.getElementById("route-results");
    if (!resultsContainer) return;
    
    resultsContainer.classList.remove("hidden");
    
    // Convert distance (meters to miles)
    const distanceMiles = (routeData.distance * 0.000621371).toFixed(1);
    
    // Convert duration (seconds to hours/minutes)
    const totalMinutes = Math.round(routeData.duration / 60);
    const hrs = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const durationStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
    
    // Update stats
    document.getElementById("route-distance").textContent = `${distanceMiles} mi`;
    document.getElementById("route-duration").textContent = durationStr;
    
    const hazardStat = document.getElementById("route-hazards");
    hazardStat.textContent = hazards.length;
    
    const summaryBox = document.querySelector(".route-summary");
    if (hazards.length > 0) {
        summaryBox.classList.add("has-hazards");
        showGlobalSafetyAlert(hazards);
    } else {
        summaryBox.classList.remove("has-hazards");
        hideGlobalSafetyAlert();
    }

    // Populate turn-by-turn directions list
    const directionsList = document.getElementById("directions-list");
    if (directionsList) {
        directionsList.innerHTML = "";
        
        if (routeData.legs && routeData.legs[0] && routeData.legs[0].steps) {
            const steps = routeData.legs[0].steps;
            steps.forEach(step => {
                const li = document.createElement("li");
                
                const iconClass = getDirectionIcon(step.maneuver);
                const text = getDirectionText(step);
                const distStr = formatStepDistance(step.distance);
                
                li.innerHTML = `
                    <div class="dir-icon"><i class="fa-solid ${iconClass}"></i></div>
                    <div class="dir-text">${text}</div>
                    <div class="dir-dist">${distStr}</div>
                `;
                
                directionsList.appendChild(li);
            });
        } else {
            directionsList.innerHTML = `<li><div class="dir-text">No step-by-step directions available for this route.</div></li>`;
        }
    }
    
    // Render hazard description items in tab
    const hazardList = document.getElementById("hazard-list");
    hazardList.innerHTML = "";
    
    if (hazards.length === 0) {
        hazardList.innerHTML = `<li class="no-hazards"><i class="fa-solid fa-circle-check"></i> Clean route! No clearance or bridge weight warnings.</li>`;
        return;
    }
    
    hazards.forEach(hazard => {
        const li = document.createElement("li");
        li.innerHTML = `
            <div class="hz-icon ${hazard.type === 'height' ? 'hz-icon-danger' : 'hz-icon-warn'}">
                <i class="fa-solid ${hazard.type === 'height' ? 'fa-arrows-up-down' : 'fa-weight-hanging'}"></i>
            </div>
            <div class="hz-info">
                <div class="hz-title">${hazard.name}</div>
                <div class="hz-desc">
                    Restriction Limit: <strong style="color:var(${hazard.type === 'height' ? '--color-danger' : '--color-warning'})">
                        ${hazard.type === 'height' ? `${hazard.limitFt}' ${hazard.limitIn}"` : `${hazard.limitLbs.toLocaleString()} lbs`}
                    </strong><br>
                    ${hazard.desc}
                </div>
            </div>
        `;
        
        // Clicking hazard centers map on it
        li.style.cursor = "pointer";
        li.addEventListener("click", () => {
            state.map.setView([hazard.lat, hazard.lng], 15);
            // Highlight popup
            state.activeRouteMarkers.forEach(m => {
                if (m instanceof L.Marker && m.getLatLng().lat === hazard.lat) {
                    m.openPopup();
                }
            });
        });
        
        hazardList.appendChild(li);
    });
}

// GLOBAL BANNER NOTIFIER (Top of Map Screen)
function showGlobalSafetyAlert(hazards) {
    const alertBanner = document.getElementById("safety-alert");
    const descText = document.getElementById("alert-desc-text");
    
    if (!alertBanner || !descText) return;
    
    const activeProfile = state.profiles.find(p => p.id === state.activeProfileId);
    
    if (hazards.length === 1) {
        const hz = hazards[0];
        descText.textContent = `Caution: ${hz.name} restricts paths under ${hz.type === 'height' ? `${hz.limitFt}' ${hz.limitIn}"` : `${hz.limitLbs.toLocaleString()} lbs`}.`;
    } else {
        descText.textContent = `Route contains ${hazards.length} vehicle restriction warnings for your active configuration.`;
    }
    
    alertBanner.classList.remove("hidden");
}

function hideGlobalSafetyAlert() {
    const alertBanner = document.getElementById("safety-alert");
    if (alertBanner) {
        alertBanner.classList.add("hidden");
    }
}

// ROUTE RECALCULATION WITH PROFILE TRIGGER
function recalculateRouteWithNewProfile() {
    // Re-check warnings with current coordinates and active profile
    if (state.activeRoutePolyline) {
        calculateSafeRoute();
    }
}

// SAVE CURRENT ROUTE DATA
function saveCurrentRoute() {
    const startName = document.getElementById("route-start").value;
    const endName = document.getElementById("route-end").value;
    const activeProfile = state.profiles.find(p => p.id === state.activeProfileId);
    
    if (!startName || !endName || !activeProfile) return;
    
    const defaultName = `${startName.split(',')[0]} to ${endName.split(',')[0]}`;
    const customName = prompt("Enter a name for this route:", defaultName);
    
    if (customName === null) return; // user cancelled
    
    const routeToSave = {
        name: customName || defaultName,
        startName: startName,
        endName: endName,
        startLat: startLatLng[0],
        startLng: startLatLng[1],
        endLat: endLatLng[0],
        endLng: endLatLng[1],
        profileId: activeProfile.id,
        profileName: activeProfile.name
    };
    
    state.savedRoutes.push(routeToSave);
    saveSavedRoutes();
    renderSavedRoutes();
    
    // Switch tab to saved panel to view
    switchTab("tab-saved");
}

// LOAD ROUTE CALLBACK FROM LIST CLICK
function drawSavedRouteCoordinates(savedRoute) {
    startLatLng = [savedRoute.startLat, savedRoute.startLng];
    endLatLng = [savedRoute.endLat, savedRoute.endLng];
    
    calculateSafeRoute();
}

// Helper to pull hex code color tokens from CSS variables
function varColorHex(varName) {
    const dummy = document.documentElement;
    const val = getComputedStyle(dummy).getPropertyValue(varName).trim();
    return val;
}
