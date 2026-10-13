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
    },
    {
        id: "hz-7",
        name: "State Route 198 Narrow Bridge",
        lat: 32.5512,
        lng: -82.9015,
        type: "width",
        limitFt: 8,
        limitIn: 4,
        desc: "Historic narrow concrete bridge over local creek. Extreme caution for double-wide vehicles or large travel trailers."
    },
    {
        id: "hz-8",
        name: "Tallulah Gorge Loop Narrow Roadway",
        lat: 34.7392,
        lng: -83.3902,
        type: "width",
        limitFt: 8,
        limitIn: 2,
        desc: "Winding state route with vertical rock faces and narrow lanes. RVs exceed safe lane limits."
    },
    {
        id: "hz-9",
        name: "Savannah Canal Street Historic Lane",
        lat: 32.0722,
        lng: -81.1022,
        type: "width",
        limitFt: 8,
        limitIn: 0,
        desc: "Cobblestone road section bordered by iron fences. Restricted lane width."
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

    // Auto-recalculate route when Avoid Interstates toggle changes
    const avoidInterstatesChk = document.getElementById("chk-avoid-interstates");
    if (avoidInterstatesChk) {
        avoidInterstatesChk.addEventListener("change", () => {
            if (startLatLng && endLatLng) {
                calculateSafeRoute();
            }
        });
    }
});

// POLYLINE6 DECODER FOR VALHALLA ROUTING GEOMETRY
function decodeValhallaPolyline6(str) {
    let index = 0, lat = 0, lng = 0, coordinates = [];
    while (index < str.length) {
        let b, shift = 0, result = 0;
        do {
            b = str.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        lat += ((result & 1) ? ~(result >> 1) : (result >> 1));

        shift = 0;
        result = 0;
        do {
            b = str.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        lng += ((result & 1) ? ~(result >> 1) : (result >> 1));

        coordinates.push([lat * 1e-6, lng * 1e-6]);
    }
    return coordinates;
}

// GEOLOCATION AUTOCOMPLETE (Stadia Pelias with Nominatim Fallback)
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
            const stadiaKey = window.APP_CONFIG?.STADIA_API_KEY;
            
            if (stadiaKey) {
                // High-speed Stadia Pelias search with USA boundary preference
                fetch(`https://api.stadiamaps.com/geocoding/v1/autocomplete?api_key=${stadiaKey}&text=${encodeURIComponent(query)}&boundary.country=USA`)
                    .then(res => res.json())
                    .then(data => {
                        list.innerHTML = "";
                        const features = data.features || [];
                        if (features.length === 0) {
                            list.classList.remove("show");
                            return;
                        }
                        
                        features.forEach(feat => {
                            const label = feat.properties?.label || feat.properties?.name || "Unknown Location";
                            const lon = feat.geometry?.coordinates[0];
                            const lat = feat.geometry?.coordinates[1];
                            
                            const li = document.createElement("li");
                            li.innerHTML = `<i class="fa-solid fa-map-location-dot"></i> <span>${label}</span>`;
                            li.addEventListener("click", () => {
                                input.value = label;
                                list.classList.remove("show");
                                selectCallback(parseFloat(lat), parseFloat(lon));
                            });
                            list.appendChild(li);
                        });
                        list.classList.add("show");
                    })
                    .catch(err => {
                        console.warn("Stadia autocomplete error, trying Nominatim fallback:", err);
                        fetchNominatimFallback(query, list, input, selectCallback);
                    });
            } else {
                fetchNominatimFallback(query, list, input, selectCallback);
            }
        }, 300); // 300ms debounce
    });

    function fetchNominatimFallback(query, list, input, selectCallback) {
        fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=us`)
            .then(res => res.json())
            .then(data => {
                list.innerHTML = "";
                if (!data || data.length === 0) {
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
    }
    
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

// HELPER: Convert Valhalla trip object to standard route format
function formatValhallaTrip(tripObj, customName) {
    if (!tripObj?.legs?.[0]?.shape) return null;
    const shapeCoords = decodeValhallaPolyline6(tripObj.legs[0].shape);
    const hasHwy = tripObj.summary ? tripObj.summary.has_highway : false;
    return {
        geometry: {
            coordinates: shapeCoords.map(c => [c[1], c[0]])
        },
        distance: (tripObj.summary?.length || 0) * 1609.34,
        duration: tripObj.summary?.time || 0,
        isValhallaTruck: true,
        hasHighway: hasHwy,
        customName: customName,
        legs: tripObj.legs.map(leg => ({
            steps: (leg.maneuvers || []).map(m => ({
                name: m.street_names ? m.street_names.join(" / ") : (m.instruction || ""),
                distance: (m.length || 0) * 1609.34,
                duration: m.time || 0,
                maneuver: { 
                    instruction: m.instruction,
                    type: m.type,
                    modifier: m.modifier
                }
            }))
        }))
    };
}

// HELPER: Extract major road names from route maneuvers/steps
function getMajorRoadsSummary(route) {
    const roadCounts = {};
    if (route.legs) {
        route.legs.forEach(leg => {
            (leg.steps || []).forEach(step => {
                const name = step.name || "";
                const matches = name.match(/\b(I[- ]?\d+|US[- ]?\d+|GA[- ]?\d+|FL[- ]?\d+|SC[- ]?\d+|NC[- ]?\d+|State Route \d+)\b/gi);
                if (matches) {
                    matches.forEach(m => {
                        const standard = m.toUpperCase().replace(/\s+/g, "-");
                        roadCounts[standard] = (roadCounts[standard] || 0) + (step.distance || 1);
                    });
                }
            });
        });
    }
    const sorted = Object.keys(roadCounts).sort((a, b) => roadCounts[b] - roadCounts[a]);
    return sorted.slice(0, 2).join(" & ");
}

// HELPER: Rigorous Interstate & Freeway detection
function checkIfRouteHasInterstate(route) {
    if (route.isValhallaTruck && route.hasHighway !== undefined) {
        return route.hasHighway;
    }
    let hasInterstate = false;
    if (route.legs) {
        route.legs.forEach(leg => {
            if (leg.steps) {
                leg.steps.forEach(step => {
                    const name = (step.name || "").toUpperCase();
                    const ref = (step.ref || "").toUpperCase();
                    const instruction = (step.maneuver?.instruction || "").toUpperCase();
                    if (
                        name.includes("INTERSTATE") || ref.includes("INTERSTATE") ||
                        name.includes("FREEWAY") || ref.includes("FREEWAY") ||
                        /\bI[- ]*\d+\b/.test(name) || /\bI[- ]*\d+\b/.test(ref) ||
                        /\bI[- ]*\d+\b/.test(instruction)
                    ) {
                        hasInterstate = true;
                    }
                });
            }
        });
    }
    return hasInterstate;
}

// ROUTING CALCULATION LOGIC
function calculateSafeRoute() {
    if (!startLatLng || !endLatLng) {
        alert("Please select starting and destination locations from the suggestions list.");
        return;
    }

    // Check avoid interstates / prefer scenic toggle
    const avoidInterstates = document.getElementById("chk-avoid-interstates")?.checked || false;
    
    // Expand drawer on mobile to show results
    const appPanel = document.getElementById("app-panel");
    if (window.innerWidth < 768 && appPanel) {
        appPanel.classList.remove("collapsed");
    }
    
    // Show spinner or loader on button
    const btn = document.getElementById("btn-calculate-route");
    const originalText = btn.innerHTML;
    btn.innerHTML = avoidInterstates 
        ? `<i class="fa-solid fa-tree fa-spin"></i> Finding 100% scenic non-interstate route...`
        : `<i class="fa-solid fa-circle-notch fa-spin"></i> Calculating RV safe route (Stadia Valhalla)...`;
    btn.disabled = true;

    // Check Stadia Maps API Key for True Valhalla RV Routing
    const stadiaKey = window.APP_CONFIG?.STADIA_API_KEY;
    const activeProf = (state.profiles && state.profiles.find(p => p.id === state.activeProfileId)) || state.profiles?.[0];
    const bufferedH = activeProf ? (activeProf.bufferedHeightFt * 0.3048 + activeProf.bufferedHeightIn * 0.0254) : 4.15;
    const bufferedW = activeProf ? ((activeProf.bufferedWeight || activeProf.weight || 20000) * 0.000453592) : 11.5;
    const bufferedWidth = activeProf ? (activeProf.bufferedWidthFt * 0.3048 + activeProf.bufferedWidthIn * 0.0254) : 2.6;
    const lengthM = activeProf ? ((activeProf.length || activeProf.lengthFt || 40) * 0.3048) : 12.0;

    const truckCosting = {
        height: parseFloat(bufferedH.toFixed(2)),
        weight: parseFloat(bufferedW.toFixed(2)),
        width: parseFloat(bufferedWidth.toFixed(2)),
        length: parseFloat(lengthM.toFixed(2)),
        hazmat: false
    };

    if (stadiaKey) {
        if (avoidInterstates) {
            // MODE A: EXCLUSIVE SCENIC (AVOID INTERSTATES)
            // Query Stadia Valhalla with use_highways: 0.0, use_tolls: 0.0 and request 2 alternates
            fetch(`https://api.stadiamaps.com/route/v1?api_key=${stadiaKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    locations: [
                        { lat: startLatLng[0], lon: startLatLng[1] },
                        { lat: endLatLng[0], lon: endLatLng[1] }
                    ],
                    costing: "truck",
                    costing_options: {
                        truck: {
                            ...truckCosting,
                            use_highways: 0.0,
                            use_tolls: 0.0
                        }
                    },
                    alternates: 2,
                    directions_options: { units: "miles" }
                })
            })
            .then(r => r.json())
            .then(vData => {
                btn.innerHTML = originalText;
                btn.disabled = false;

                const candidateRoutes = [];
                if (vData?.trip?.legs?.[0]?.shape) {
                    const mainScenic = formatValhallaTrip(vData.trip, "Scenic Route");
                    if (mainScenic && !checkIfRouteHasInterstate(mainScenic)) {
                        candidateRoutes.push(mainScenic);
                    }
                }
                if (vData?.alternates && Array.isArray(vData.alternates)) {
                    vData.alternates.forEach(alt => {
                        if (alt?.trip?.legs?.[0]?.shape) {
                            const altScenic = formatValhallaTrip(alt.trip, "Scenic Alternative");
                            if (altScenic && !checkIfRouteHasInterstate(altScenic)) {
                                candidateRoutes.push(altScenic);
                            }
                        }
                    });
                }

                if (candidateRoutes.length > 0) {
                    // Sort candidate scenic routes so the fastest/shortest is first
                    candidateRoutes.sort((a, b) => a.duration - b.duration);

                    // Name each scenic route based on its actual primary highway corridor
                    candidateRoutes.forEach((r, idx) => {
                        const roads = getMajorRoadsSummary(r);
                        if (idx === 0) {
                            r.customName = `Scenic Secondary Highway (${roads || 'Secondary Roads'} - No Interstates)`;
                        } else if (idx === 1) {
                            r.customName = `Scenic Country Byway (${roads || 'State Routes'} - No Interstates)`;
                        } else {
                            r.customName = `Scenic Coastal/Rural Route (${roads || 'Scenic Highway'} - No Interstates)`;
                        }
                    });

                    processAndRenderRoutesList(candidateRoutes, true);
                    return;
                }

                // If Valhalla had no pure scenic routes, fallback to OSRM
                fetchOsrmFallback(truckCosting, true, originalText);
            })
            .catch(err => {
                console.warn("Valhalla scenic error, falling back to OSRM:", err);
                fetchOsrmFallback(truckCosting, true, originalText);
            });
        } else {
            // MODE B: NORMAL FAST ROUTING
            // Query Valhalla for fast truck route AND query a scenic alternative in parallel
            Promise.all([
                fetch(`https://api.stadiamaps.com/route/v1?api_key=${stadiaKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        locations: [
                            { lat: startLatLng[0], lon: startLatLng[1] },
                            { lat: endLatLng[0], lon: endLatLng[1] }
                        ],
                        costing: "truck",
                        costing_options: {
                            truck: {
                                ...truckCosting,
                                use_highways: 1.0,
                                use_tolls: 0.8
                            }
                        },
                        alternates: 1,
                        directions_options: { units: "miles" }
                    })
                }).then(r => r.json()).catch(() => null),
                fetch(`https://api.stadiamaps.com/route/v1?api_key=${stadiaKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        locations: [
                            { lat: startLatLng[0], lon: startLatLng[1] },
                            { lat: endLatLng[0], lon: endLatLng[1] }
                        ],
                        costing: "truck",
                        costing_options: {
                            truck: {
                                ...truckCosting,
                                use_highways: 0.0,
                                use_tolls: 0.0
                            }
                        },
                        alternates: 1,
                        directions_options: { units: "miles" }
                    })
                }).then(r => r.json()).catch(() => null)
            ])
            .then(([fastData, scenicData]) => {
                btn.innerHTML = originalText;
                btn.disabled = false;

                const allRoutes = [];

                // Fast Valhalla Primary
                if (fastData?.trip?.legs?.[0]?.shape) {
                    const fastRoute = formatValhallaTrip(fastData.trip, "Stadia Valhalla (Fast Route - Clearances Safe)");
                    const roads = getMajorRoadsSummary(fastRoute);
                    if (roads) {
                        fastRoute.customName = `Stadia Valhalla Fast RV Route (${roads})`;
                    }
                    allRoutes.push(fastRoute);
                }

                // Fast Alternate
                if (fastData?.alternates?.[0]?.trip?.legs?.[0]?.shape) {
                    const fastAlt = formatValhallaTrip(fastData.alternates[0].trip, "Fast Alternative Route");
                    allRoutes.push(fastAlt);
                }

                // Scenic Alternative (100% Non-Interstate)
                let bestScenic = null;
                if (scenicData?.trip?.legs?.[0]?.shape) {
                    bestScenic = formatValhallaTrip(scenicData.trip, "Scenic Alternative");
                }
                if (scenicData?.alternates?.[0]?.trip?.legs?.[0]?.shape) {
                    const altScenic = formatValhallaTrip(scenicData.alternates[0].trip, "Scenic Alternative");
                    if (!bestScenic || (altScenic.duration < bestScenic.duration)) {
                        bestScenic = altScenic;
                    }
                }
                if (bestScenic && !checkIfRouteHasInterstate(bestScenic)) {
                    const roads = getMajorRoadsSummary(bestScenic);
                    bestScenic.customName = `Scenic Secondary Alternative (${roads || 'No Interstates'})`;
                    allRoutes.push(bestScenic);
                }

                if (allRoutes.length > 0) {
                    processAndRenderRoutesList(allRoutes, false);
                    return;
                }

                fetchOsrmFallback(truckCosting, false, originalText);
            })
            .catch(err => {
                console.warn("Valhalla routing error, falling back to OSRM:", err);
                fetchOsrmFallback(truckCosting, false, originalText);
            });
        }
    } else {
        fetchOsrmFallback(truckCosting, avoidInterstates, originalText);
    }
}

// OSRM FALLBACK ROUTING
function fetchOsrmFallback(truckCosting, avoidInterstates, originalText) {
    const btn = document.getElementById("btn-calculate-route");
    const url = `https://router.project-osrm.org/route/v1/driving/${startLatLng[1]},${startLatLng[0]};${endLatLng[1]},${endLatLng[0]}?geometries=geojson&overview=full&alternatives=true&steps=true`;
    
    fetch(url)
        .then(r => r.json())
        .then(osrmData => {
            if (btn) {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
            if (!osrmData || osrmData.code !== "Ok" || !osrmData.routes || osrmData.routes.length === 0) {
                alert("Could not compute route geometry. Check internet connection.");
                return;
            }
            const routes = osrmData.routes;
            processAndRenderRoutesList(routes, avoidInterstates);
        })
        .catch(err => {
            if (btn) {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
            console.error("OSRM fallback error:", err);
            alert("Error connecting to routing service. Please try again.");
        });
}

// ROUTE PROCESSOR & SCORER
function processAndRenderRoutesList(routesList, avoidInterstates) {
    const analyzedRoutes = routesList.map((route, index) => {
        const coordinates = route.geometry.coordinates.map(c => [c[1], c[0]]);
        const hazards = getHazardsForPath(coordinates);
        const containsInterstate = checkIfRouteHasInterstate(route);
        
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

    let displayRoutes = analyzedRoutes;
    let selected = null;

    if (avoidInterstates) {
        // STRICT FILTERING: When Avoid Interstates is checked, do NOT show routes with interstates!
        const nonInterstateRoutes = analyzedRoutes.filter(r => !r.hasInterstate);
        if (nonInterstateRoutes.length > 0) {
            displayRoutes = nonInterstateRoutes;
            // Pick safest non-interstate route (or shortest/fastest)
            selected = nonInterstateRoutes.find(r => r.isSafe) || nonInterstateRoutes[0];
        } else {
            // Extreme fallback if every route touched an interstate
            selected = analyzedRoutes.find(r => r.isSafe) || analyzedRoutes[0];
        }
    } else {
        // Normal Mode: Prefer safest fast route
        selected = analyzedRoutes.find(r => r.isSafe) || analyzedRoutes[0];
    }

    // Re-index display routes for clean UI IDs
    displayRoutes.forEach((r, i) => {
        r.index = i;
    });

    renderRouteAlternativesSelector(displayRoutes);
    selectActiveRouteOption(selected || displayRoutes[0], displayRoutes);
}

// HAZARD EVALUATION HELPER
function getHazardsForPath(coordinates) {
    const activeProfile = state.profiles.find(p => p.id === state.activeProfileId);
    if (!activeProfile) return [];
    
    const activeHeightFt = activeProfile.bufferedHeightFt;
    const activeHeightIn = activeProfile.bufferedHeightIn;
    const activeWeight = activeProfile.bufferedWeight;
    const activeTotalHeightIn = (activeHeightFt * 12) + activeHeightIn;
    
    const activeWidthFt = activeProfile.bufferedWidthFt || 8;
    const activeWidthIn = activeProfile.bufferedWidthIn || 6;
    const activeTotalWidthIn = (activeWidthFt * 12) + activeWidthIn;
    
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
            } else if (hazard.type === "width") {
                const hzTotalWidthIn = (hazard.limitFt * 12) + hazard.limitIn;
                if (activeTotalWidthIn >= hzTotalWidthIn) {
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
                    <span style="color:${routeOpt.hasInterstate ? 'var(--color-info)' : 'var(--color-safe)'}; font-weight: 600;">
                        <i class="fa-solid ${routeOpt.hasInterstate ? 'fa-road' : 'fa-tree'}"></i> ${routeOpt.hasInterstate ? 'Interstate Highway' : 'Scenic / Secondary'}
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
    
    // Store in global state for references
    state.activeRouteData = routeOption.routeData;
    state.staticHazards = routeOption.hazards;
    state.weatherAlerts = []; // Reset on new route selection
    
    // Toggle active selectors classes
    allRoutes.forEach(r => {
        const card = document.getElementById(`alt-card-${r.index}`);
        if (card) card.classList.remove("active");
    });
    
    const activeCard = document.getElementById(`alt-card-${routeOption.index}`);
    if (activeCard) activeCard.classList.add("active");
    
    // Draw on Map Canvas
    renderRouteOnMap(routeOption.coordinates, routeOption.hazards);
    
    // Update route type badge
    const badgeEl = document.getElementById("route-type-badge");
    if (badgeEl) {
        if (routeOption.hasInterstate) {
            badgeEl.className = "route-badge badge-interstate";
            badgeEl.innerHTML = `<i class="fa-solid fa-road"></i> Interstate Highway Route`;
        } else {
            badgeEl.className = "route-badge badge-scenic";
            badgeEl.innerHTML = `<i class="fa-solid fa-tree"></i> 100% Non-Interstate Scenic Route`;
        }
    }
    
    // Display results in sidebar (initially with static hazards)
    displayRouteResults(routeOption.routeData, routeOption.hazards);
    
    // Fetch weather asynchronously along the route
    checkWeatherForRoute(routeOption.coordinates);
    
    // Fetch multi-checkpoint route weather, crosswind analysis & destination forecast
    if (window.WeatherManager && typeof window.WeatherManager.fetchRouteWeather === 'function') {
        const startName = document.getElementById("route-start")?.value || "Departure";
        const endName = document.getElementById("route-end")?.value || "Destination";
        window.WeatherManager.fetchRouteWeather(routeOption.coordinates, startName, endName);
    }
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
        
        let restrictionStr = "";
        let alertTitle = "Clearance Alert";
        if (hazard.type === 'height') {
            restrictionStr = `${hazard.limitFt}' ${hazard.limitIn}" Max Height`;
            alertTitle = "Height Restriction Alert";
        } else if (hazard.type === 'weight') {
            restrictionStr = `${hazard.limitLbs.toLocaleString()} lbs Weight Limit`;
            alertTitle = "Weight Restriction Alert";
        } else if (hazard.type === 'width') {
            restrictionStr = `${hazard.limitFt}' ${hazard.limitIn}" Max Width`;
            alertTitle = "Width Restriction Alert";
        }
        
        const popupContent = `
            <div>
                <h4><i class="fa-solid fa-triangle-exclamation" style="color:var(--color-danger)"></i> ${alertTitle}</h4>
                <p><b>${hazard.name}</b></p>
                <p>Restriction: <span style="color:var(--color-danger);font-weight:700;">
                    ${restrictionStr}
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
        
        if (routeData.legs && routeData.legs.length > 0) {
            routeData.legs.forEach(leg => {
                const steps = leg.steps || [];
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
        
        let iconClass = "fa-triangle-exclamation";
        let colorClass = "hz-icon-warn";
        let restrictionStr = "";
        let colorVar = "--color-warning";
        
        if (hazard.type === 'height') {
            iconClass = "fa-arrows-up-down";
            colorClass = "hz-icon-danger";
            restrictionStr = `${hazard.limitFt}' ${hazard.limitIn}"`;
            colorVar = "--color-danger";
        } else if (hazard.type === 'weight') {
            iconClass = "fa-weight-hanging";
            colorClass = "hz-icon-warn";
            restrictionStr = `${hazard.limitLbs.toLocaleString()} lbs`;
            colorVar = "--color-warning";
        } else if (hazard.type === 'width') {
            iconClass = "fa-arrows-left-right";
            colorClass = "hz-icon-danger";
            restrictionStr = `${hazard.limitFt}' ${hazard.limitIn}"`;
            colorVar = "--color-danger";
        }
        
        li.innerHTML = `
            <div class="hz-icon ${colorClass}">
                <i class="fa-solid ${iconClass}"></i>
            </div>
            <div class="hz-info">
                <div class="hz-title">${hazard.name}</div>
                <div class="hz-desc">
                    Restriction Limit: <strong style="color:var(${colorVar})">
                        ${restrictionStr}
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
    
    if (hazards.length === 1) {
        const hz = hazards[0];
        if (hz.type === "wind" || hz.type === "weather") {
            descText.textContent = `Caution: High wind forecast along your route (${hz.windSpeed} mph).`;
        } else {
            let limitStr = "";
            if (hz.type === 'height') {
                limitStr = `${hz.limitFt}' ${hz.limitIn}"`;
            } else if (hz.type === 'width') {
                limitStr = `${hz.limitFt}' ${hz.limitIn}"`;
            } else {
                limitStr = `${hz.limitLbs.toLocaleString()} lbs`;
            }
            descText.textContent = `Caution: ${hz.name} restricts paths under ${limitStr}.`;
        }
    } else {
        descText.textContent = `Route contains ${hazards.length} vehicle restriction or weather warnings for your active configuration.`;
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

// WEATHER & SUSTAINED WIND API CHECKER (Open-Meteo Integration)
function checkWeatherForRoute(coordinates) {
    if (!coordinates || coordinates.length === 0) return;
    
    // Sample coordinates along the route (around 8-10 points)
    const numPoints = coordinates.length;
    const sampleSize = Math.min(10, numPoints);
    const sampledCoords = [];
    const step = Math.max(1, Math.floor(numPoints / sampleSize));
    
    for (let i = 0; i < numPoints; i += step) {
        sampledCoords.push(coordinates[i]);
        if (sampledCoords.length >= sampleSize) break;
    }
    // Always include the destination point if not already added
    if (sampledCoords.indexOf(coordinates[numPoints - 1]) === -1) {
        sampledCoords.push(coordinates[numPoints - 1]);
    }
    
    const lats = sampledCoords.map(c => c[0].toFixed(4)).join(",");
    const lns = sampledCoords.map(c => c[1].toFixed(4)).join(",");
    
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lns}&current=wind_speed_10m,wind_gusts_10m,weather_code&wind_speed_unit=mph&timezone=auto`;
    
    fetch(url)
        .then(res => res.json())
        .then(data => {
            let results = [];
            if (Array.isArray(data)) {
                results = data;
            } else if (data && data.latitude !== undefined) {
                results = [data];
            } else if (data && data.current) {
                results = [data];
            }
            
            if (results.length > 0) {
                processWeatherResults(results, sampledCoords);
            }
        })
        .catch(err => {
            console.error("Open-Meteo weather fetch error:", err);
        });
}

function processWeatherResults(results, sampledCoords) {
    const activeProfile = state.profiles.find(p => p.id === state.activeProfileId);
    if (!activeProfile) return;
    
    const threshold = activeProfile.windThresholdMph || 25;
    state.weatherAlerts = [];
    
    results.forEach((res, idx) => {
        if (!res.current) return;
        
        const windSpeed = res.current.wind_speed_10m;
        const windGust = res.current.wind_gusts_10m;
        const code = res.current.weather_code;
        
        const isSevereWeather = [56, 57, 65, 66, 67, 75, 77, 82, 86, 95, 96, 99].includes(code);
        const isHighWind = windSpeed > threshold;
        
        if (isHighWind || isSevereWeather) {
            let type = "wind";
            let name = "High Wind Advisory";
            if (isSevereWeather) {
                type = "weather";
                name = getWeatherConditionName(code);
            }
            
            const weatherAlert = {
                id: `wx-${idx}-${Date.now()}`,
                name: name,
                lat: res.latitude,
                lng: res.longitude,
                type: type, // "wind" or "weather"
                windSpeed: windSpeed,
                windGust: windGust,
                weatherCode: code,
                desc: getWeatherDescription(code, windSpeed, windGust, threshold)
            };
            
            state.weatherAlerts.push(weatherAlert);
        }
    });
    
    // Draw weather alerts on map and rebuild sidebar UI
    if (state.weatherAlerts.length > 0) {
        renderWeatherAlertsOnMap(state.weatherAlerts);
        rebuildCombinedHazardsList();
    }
}

function getWeatherConditionName(code) {
    if (code === 56 || code === 57) return "Freezing Drizzle Advisory";
    if (code === 65) return "Heavy Rain Warning";
    if (code === 66 || code === 67) return "Freezing Rain Warning";
    if (code === 75) return "Heavy Snow Warning";
    if (code === 82) return "Violent Rain Showers Warning";
    if (code === 86) return "Heavy Snow Showers Warning";
    if (code === 95 || code === 96 || code === 99) return "Severe Thunderstorm Warning";
    return "Severe Weather Warning";
}

function getWeatherDescription(code, windSpeed, windGust, threshold) {
    let condition = "Unknown Weather";
    if (code === 0) condition = "Clear sky";
    else if ([1, 2, 3].includes(code)) condition = "Partly cloudy";
    else if ([45, 48].includes(code)) condition = "Foggy";
    else if ([51, 53, 55].includes(code)) condition = "Drizzle";
    else if ([56, 57].includes(code)) condition = "Freezing Drizzle";
    else if ([61, 63].includes(code)) condition = "Light Rain";
    else if (code === 65) condition = "Heavy Rain";
    else if ([66, 67].includes(code)) condition = "Freezing Rain";
    else if ([71, 73].includes(code)) condition = "Light Snow";
    else if (code === 75) condition = "Heavy Snow";
    else if (code === 77) condition = "Snow grains";
    else if ([80, 81, 82].includes(code)) condition = "Rain Showers";
    else if ([85, 86].includes(code)) condition = "Snow Showers";
    else if ([95, 96, 99].includes(code)) condition = "Thunderstorm";
    
    let desc = `Condition: ${condition}. Wind: ${windSpeed} mph (gusts up to ${windGust} mph).`;
    if (windSpeed > threshold) {
        desc += ` WARNING: Sustained winds exceed your profile threshold of ${threshold} mph. Large RV rigs have high rollover risk.`;
    }
    return desc;
}

function getWeatherIcon(code, windSpeed, threshold) {
    if (windSpeed > threshold) {
        return "fa-wind";
    }
    if ([95, 96, 99].includes(code)) return "fa-cloud-bolt";
    if ([65, 82].includes(code)) return "fa-cloud-showers-heavy";
    if ([75, 86].includes(code)) return "fa-snowflake";
    if ([56, 57, 66, 67].includes(code)) return "fa-icicles";
    return "fa-cloud";
}

function renderWeatherAlertsOnMap(alerts) {
    alerts.forEach(alert => {
        const isSevere = alert.type === "weather";
        const userProfile = state.profiles && state.profiles.find(p => p.id === state.activeProfileId);
        const threshold = userProfile?.windThresholdMph || 25;
        const iconClass = getWeatherIcon(alert.weatherCode, alert.windSpeed, threshold);
        
        const alertMarker = L.marker([alert.lat, alert.lng], {
            icon: L.divIcon({
                className: `custom-map-pin ${pinClass}`,
                html: `<i class="fa-solid ${iconClass}"></i>`,
                iconSize: [30, 30]
            })
        }).addTo(state.map);
        
        const popupContent = `
            <div>
                <h4><i class="fa-solid ${iconClass}" style="color:${isSevere ? 'var(--color-danger)' : 'var(--color-warning)'}"></i> ${alert.name}</h4>
                <p><b>Location Alert</b></p>
                <p>Wind Forecast: <span style="color:${isSevere ? 'var(--color-danger)' : 'var(--color-warning)'};font-weight:700;">
                    ${alert.windSpeed} mph (${alert.windGust} mph gusts)
                </span></p>
                <p style="font-size:11px;margin-top:6px;">${alert.desc}</p>
            </div>
        `;
        
        alertMarker.bindPopup(popupContent);
        state.activeRouteMarkers.push(alertMarker);
        
        // Render local warning ring (8km radius for weather)
        const warningRing = L.circle([alert.lat, alert.lng], {
            color: varColorHex(isSevere ? '--color-danger' : '--color-warning'),
            fillColor: varColorHex(isSevere ? '--color-danger' : '--color-warning'),
            fillOpacity: 0.1,
            radius: 8000
        }).addTo(state.map);
        state.activeRouteMarkers.push(warningRing);
    });
}

function rebuildCombinedHazardsList() {
    const staticHazards = state.staticHazards || [];
    const weatherAlerts = state.weatherAlerts || [];
    const allHazards = [...staticHazards, ...weatherAlerts];
    
    // Update counts
    const hazardStat = document.getElementById("route-hazards");
    if (hazardStat) hazardStat.textContent = allHazards.length;
    
    const summaryBox = document.querySelector(".route-summary");
    if (summaryBox) {
        if (allHazards.length > 0) {
            summaryBox.classList.add("has-hazards");
            showGlobalSafetyAlert(allHazards);
        } else {
            summaryBox.classList.remove("has-hazards");
            hideGlobalSafetyAlert();
        }
    }
    
    // Re-populate list
    const hazardList = document.getElementById("hazard-list");
    if (!hazardList) return;
    
    hazardList.innerHTML = "";
    
    if (allHazards.length === 0) {
        hazardList.innerHTML = `<li class="no-hazards"><i class="fa-solid fa-circle-check"></i> Clean route! No restrictions or weather warnings.</li>`;
        return;
    }
    
    allHazards.forEach(hazard => {
        const li = document.createElement("li");
        
        let iconClass = "fa-triangle-exclamation";
        let colorClass = "hz-icon-warn";
        let restrictionStr = "";
        let colorVar = "--color-warning";
        
        const isWeather = hazard.type === "wind" || hazard.type === "weather";
        
        if (isWeather) {
            const activeProfile = state.profiles.find(p => p.id === state.activeProfileId);
            const threshold = activeProfile ? activeProfile.windThresholdMph : 25;
            iconClass = getWeatherIcon(hazard.weatherCode, hazard.windSpeed, threshold);
            colorClass = hazard.type === "weather" ? "hz-icon-weather-danger" : "hz-icon-weather-warn";
            restrictionStr = `Wind: ${hazard.windSpeed} mph`;
            colorVar = hazard.type === "weather" ? "--color-danger" : "--color-warning";
        } else {
            if (hazard.type === 'height') {
                iconClass = "fa-arrows-up-down";
                colorClass = "hz-icon-danger";
                restrictionStr = `${hazard.limitFt}' ${hazard.limitIn}"`;
                colorVar = "--color-danger";
            } else if (hazard.type === 'weight') {
                iconClass = "fa-weight-hanging";
                colorClass = "hz-icon-warn";
                restrictionStr = `${hazard.limitLbs.toLocaleString()} lbs`;
                colorVar = "--color-warning";
            } else if (hazard.type === 'width') {
                iconClass = "fa-arrows-left-right";
                colorClass = "hz-icon-danger";
                restrictionStr = `${hazard.limitFt}' ${hazard.limitIn}"`;
                colorVar = "--color-danger";
            }
        }
        
        li.innerHTML = `
            <div class="hz-icon ${colorClass}">
                <i class="fa-solid ${iconClass}"></i>
            </div>
            <div class="hz-info">
                <div class="hz-title">${hazard.name}</div>
                <div class="hz-desc">
                    ${isWeather ? 'Current Conditions' : 'Restriction Limit'}: <strong style="color:var(${colorVar})">
                        ${restrictionStr}
                    </strong><br>
                    ${hazard.desc}
                    ${isWeather && hazard.type === "wind" ? `<br><button class="btn-avoid-wind-inline" onclick="event.stopPropagation(); calculateWindBypass()"><i class="fa-solid fa-arrows-split-up-and-left"></i> Reroute to Avoid Wind</button>` : ''}
                </div>
            </div>
        `;
        
        li.style.cursor = "pointer";
        li.addEventListener("click", () => {
            state.map.setView([hazard.lat, hazard.lng], isWeather ? 11 : 15);
            // Highlight popup
            state.activeRouteMarkers.forEach(m => {
                if (m instanceof L.Marker && Math.abs(m.getLatLng().lat - hazard.lat) < 0.0001 && Math.abs(m.getLatLng().lng - hazard.lng) < 0.0001) {
                    m.openPopup();
                }
            });
        });
        
        hazardList.appendChild(li);
    });
}

// WIND BYPASS REROUTING FUNCTION (User Triggered)
window.calculateWindBypass = function() {
    const windHazard = state.weatherAlerts.find(a => a.type === "wind" || a.type === "weather");
    if (!windHazard) return;
    
    // Offset from the wind hazard to force OSRM to calculate a bypass route
    const detourLat = windHazard.lat - 0.06;
    const detourLng = windHazard.lng - 0.12; 
    
    const url = `https://router.project-osrm.org/route/v1/driving/${startLatLng[1]},${startLatLng[0]};${detourLng},${detourLat};${endLatLng[1]},${endLatLng[0]}?geometries=geojson&overview=full&steps=true`;
    
    const btn = document.getElementById("btn-calculate-route");
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Calculating wind bypass...`;
    btn.disabled = true;
    
    fetch(url)
        .then(res => res.json())
        .then(data => {
            btn.innerHTML = originalText;
            btn.disabled = false;
            
            if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
                alert("Could not compute wind bypass route. Try selecting another alternative.");
                return;
            }
            
            const bypassRoute = data.routes[0];
            bypassRoute.customName = "Wind Avoidance Route";
            
            const coordinates = bypassRoute.geometry.coordinates.map(c => [c[1], c[0]]);
            const hazards = getHazardsForPath(coordinates);
            
            const routeOption = {
                index: 99,
                name: "Wind Avoidance Route (Manual Bypass)",
                routeData: bypassRoute,
                coordinates: coordinates,
                hazards: hazards,
                isSafe: hazards.length === 0,
                hasInterstate: false
            };
            
            selectActiveRouteOption(routeOption, [routeOption]);
            showMapLayerNotification("Bypass Route Loaded (Avoiding High Winds)");
        })
        .catch(err => {
            btn.innerHTML = originalText;
            btn.disabled = false;
            console.error("Wind bypass route error:", err);
            alert("Error connecting to routing service. Please try again.");
        });
};
