/**
 * RV SafeNavigate - Weather & Wind Overlay Manager
 * Features:
 * - Live Doppler Weather Radar Overlay (RainViewer Global API)
 * - Live Wind Speed & Gusts Vector Overlay (Open-Meteo Integration)
 * - Color-coded RV crosswind safety thresholds based on active rig profile
 * - Interactive wind vector arrows indicating direction, sustained speed, and max gusts
 */

const WeatherManager = {
    isRadarActive: false,
    isWindActive: false,
    
    radarLayer: null,
    radarTimestamps: [],
    currentRadarIndex: 0,
    radarHost: 'https://tilecache.rainviewer.com',
    
    windLayerGroup: null,
    windDebounceTimer: null,
    lastRouteWeather: null,
    initialWeatherData: null,

    init() {
        if (!state.map) {
            console.warn('[WeatherManager] Leaflet map not ready yet. Retrying...');
            setTimeout(() => this.init(), 300);
            return;
        }

        this.windLayerGroup = L.layerGroup().addTo(state.map);
        this.setupButtons();
        this.initHUD();
        this.preloadRadarData();

        // Refresh wind vectors on map move if wind overlay is active
        state.map.on('moveend', () => {
            if (this.isWindActive) {
                clearTimeout(this.windDebounceTimer);
                this.windDebounceTimer = setTimeout(() => this.fetchWindForCurrentBounds(), 400);
            }
        });

        console.log('[WeatherManager] Weather & Wind overlays initialized.');
    },

    setupButtons() {
        const radarBtn = document.getElementById('btn-weather-radar');
        const windBtn = document.getElementById('btn-wind-overlay');
        const radarChk = document.getElementById('chk-weather-radar');
        const windChk = document.getElementById('chk-wind-overlay');

        if (radarBtn) {
            radarBtn.addEventListener('click', () => this.toggleRadar());
        }
        if (windBtn) {
            windBtn.addEventListener('click', () => this.toggleWind());
        }
        if (radarChk) {
            radarChk.addEventListener('change', (e) => this.setRadar(e.target.checked));
        }
        if (windChk) {
            windChk.addEventListener('change', (e) => this.setWind(e.target.checked));
        }
    },

    /**
     * Preload RainViewer Radar Frame Data
     */
    async preloadRadarData() {
        try {
            const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
            const data = await res.json();
            if (data && data.radar && data.radar.past) {
                this.radarHost = data.host || 'https://tilecache.rainviewer.com';
                this.radarTimestamps = data.radar.past;
                this.currentRadarIndex = this.radarTimestamps.length - 1;
            }
        } catch (e) {
            console.warn('[WeatherManager] Error loading RainViewer radar data:', e);
        }
    },

    /**
     * LIVE DOPPLER WEATHER RADAR OVERLAY
     */
    toggleRadar() {
        this.setRadar(!this.isRadarActive);
    },

    setRadar(active) {
        this.isRadarActive = active;
        const btn = document.getElementById('btn-weather-radar');
        const chk = document.getElementById('chk-weather-radar');
        const legend = document.getElementById('weather-radar-legend');

        if (btn) btn.classList.toggle('active', active);
        if (chk) chk.checked = active;

        if (active) {
            this.showRadarLayer();
            if (legend) legend.classList.remove('hidden');
            if (typeof showMapLayerNotification === 'function') {
                showMapLayerNotification('Live Doppler Weather Radar Enabled');
            }
        } else {
            this.hideRadarLayer();
            if (legend) legend.classList.add('hidden');
            if (typeof showMapLayerNotification === 'function') {
                showMapLayerNotification('Weather Radar Disabled');
            }
        }
    },

    showRadarLayer() {
        if (!this.radarTimestamps || this.radarTimestamps.length === 0) {
            this.preloadRadarData().then(() => this.createOrUpdateRadarLayer());
        } else {
            this.createOrUpdateRadarLayer();
        }
    },

    createOrUpdateRadarLayer() {
        if (this.radarLayer && state.map.hasLayer(this.radarLayer)) {
            state.map.removeLayer(this.radarLayer);
        }

        const latestFrame = this.radarTimestamps[this.currentRadarIndex] || this.radarTimestamps[this.radarTimestamps.length - 1];
        if (!latestFrame) return;

        // RainViewer Tile Layer with smooth styling and 65% opacity
        const tileUrl = `${this.radarHost}${latestFrame.path}/256/{z}/{x}/{y}/2/1_1.png`;

        this.radarLayer = L.tileLayer(tileUrl, {
            opacity: 0.68,
            zIndex: 1000,
            maxZoom: 18,
            attribution: 'Radar &copy; <a href="https://www.rainviewer.com/" target="_blank">RainViewer</a>'
        });

        this.radarLayer.addTo(state.map);
        this.renderRadarControls(latestFrame.time);
    },

    hideRadarLayer() {
        if (this.radarLayer && state.map.hasLayer(this.radarLayer)) {
            state.map.removeLayer(this.radarLayer);
        }
        const badge = document.getElementById('radar-timestamp-badge');
        if (badge) badge.remove();
    },

    renderRadarControls(timestamp) {
        let badge = document.getElementById('radar-timestamp-badge');
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'radar-timestamp-badge';
            badge.className = 'radar-timestamp-badge';
            document.body.appendChild(badge);
        }

        const dateStr = timestamp ? new Date(timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Live';
        badge.innerHTML = `
            <div class="radar-badge-content">
                <span class="live-dot"></span>
                <span>Doppler Radar (${dateStr})</span>
                <button type="button" class="btn-refresh-radar" onclick="WeatherManager.refreshRadar()" title="Refresh Radar Frame">
                    <i class="fa-solid fa-arrows-rotate"></i>
                </button>
            </div>
        `;
    },

    async refreshRadar() {
        await this.preloadRadarData();
        if (this.isRadarActive) {
            this.createOrUpdateRadarLayer();
        }
    },

    /**
     * LIVE WIND SPEED & GUSTS OVERLAY
     */
    toggleWind() {
        this.setWind(!this.isWindActive);
    },

    setWind(active) {
        this.isWindActive = active;
        const btn = document.getElementById('btn-wind-overlay');
        const chk = document.getElementById('chk-wind-overlay');
        const legend = document.getElementById('wind-speed-legend');

        if (btn) btn.classList.toggle('active', active);
        if (chk) chk.checked = active;

        if (active) {
            if (legend) legend.classList.remove('hidden');
            this.fetchWindForCurrentBounds();
            if (typeof showMapLayerNotification === 'function') {
                showMapLayerNotification('Live Wind Speed & Gust Overlay Active');
            }
        } else {
            this.windLayerGroup.clearLayers();
            if (legend) legend.classList.add('hidden');
            if (typeof showMapLayerNotification === 'function') {
                showMapLayerNotification('Wind Speed Overlay Disabled');
            }
        }
    },

    /**
     * Fetches real-time wind speed, gusts, and direction for visible map grid
     */
    async fetchWindForCurrentBounds() {
        if (!this.isWindActive || !state.map) return;

        const bounds = state.map.getBounds();
        const north = bounds.getNorth();
        const south = bounds.getSouth();
        const east = bounds.getEast();
        const west = bounds.getWest();

        // Calculate a 3x3 or 4x3 geographic grid of sample stations
        const lats = [];
        const lngs = [];
        const latSteps = 3;
        const lngSteps = 4;

        const latStep = (north - south) / (latSteps + 1);
        const lngStep = (east - west) / (lngSteps + 1);

        for (let i = 1; i <= latSteps; i++) {
            for (let j = 1; j <= lngSteps; j++) {
                lats.push((south + i * latStep).toFixed(4));
                lngs.push((west + j * lngStep).toFixed(4));
            }
        }

        // Also add route waypoints if an active route exists on the map
        if (state.currentRoute && state.currentRoute.coordinates) {
            const coords = state.currentRoute.coordinates;
            const stepSize = Math.max(1, Math.floor(coords.length / 5));
            for (let k = 0; k < coords.length; k += stepSize) {
                lats.push(coords[k][0].toFixed(4));
                lngs.push(coords[k][1].toFixed(4));
            }
        }

        const latsStr = lats.join(',');
        const lngsStr = lngs.join(',');
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${latsStr}&longitude=${lngsStr}&current=wind_speed_10m,wind_gusts_10m,wind_direction_10m,weather_code&wind_speed_unit=mph&timezone=auto`;

        try {
            const res = await fetch(url);
            const data = await res.json();
            const results = Array.isArray(data) ? data : [data];

            this.renderWindVectors(results);
        } catch (err) {
            console.warn('[WeatherManager] Failed to fetch live wind data:', err);
        }
    },

    /**
     * Renders animated direction arrows and wind speed badges
     */
    renderWindVectors(stations) {
        this.windLayerGroup.clearLayers();

        const activeProfile = state.activeProfile || (state.profiles && state.profiles[0]) || { windThresholdMph: 25 };
        const threshold = activeProfile.windThresholdMph || 25;

        stations.forEach(station => {
            const current = station.current;
            if (!current) return;

            const lat = station.latitude;
            const lng = station.longitude;
            const speed = Math.round(current.wind_speed_10m || 0);
            const gust = Math.round(current.wind_gusts_10m || speed);
            const dir = Math.round(current.wind_direction_10m || 0);

            // Determine hazard severity based on active rig profile
            let severityClass = 'wind-calm';
            let statusText = 'Safe Wind';
            if (speed >= threshold || gust >= threshold + 5) {
                severityClass = 'wind-danger';
                statusText = 'High Wind Risk!';
            } else if (speed >= 15 || gust >= 22) {
                severityClass = 'wind-moderate';
                statusText = 'Moderate Crosswinds';
            }

            // Wind direction arrow points in the direction wind is blowing toward (meteorological dir + 180)
            const arrowDeg = (dir + 180) % 360;

            const iconHtml = `
                <div class="wind-marker-pin ${severityClass}" title="${speed} mph wind, gusts to ${gust} mph">
                    <div class="wind-arrow-wrapper" style="transform: rotate(${arrowDeg}deg);">
                        <i class="fa-solid fa-arrow-up"></i>
                    </div>
                    <span class="wind-speed-val">${speed}</span>
                    <span class="wind-unit">mph</span>
                </div>
            `;

            const icon = L.divIcon({
                html: iconHtml,
                className: 'wind-div-icon',
                iconSize: [48, 28],
                iconAnchor: [24, 14]
            });

            const marker = L.marker([lat, lng], { icon: icon });

            // Popup with detailed rig impact analysis
            const popupHtml = `
                <div class="wind-popup-card">
                    <div class="wind-popup-header ${severityClass}">
                        <i class="fa-solid fa-wind"></i> <strong>${statusText}</strong>
                    </div>
                    <div class="wind-popup-stats">
                        <div><strong>Sustained:</strong> ${speed} mph</div>
                        <div><strong>Gusts:</strong> ${gust} mph</div>
                        <div><strong>Direction:</strong> ${dir}° (${this.degreesToCardinal(dir)})</div>
                    </div>
                    <div class="wind-popup-rig-advisory">
                        ${speed >= threshold ? `
                            <div class="text-danger"><i class="fa-solid fa-triangle-exclamation"></i> <strong>Exceeds your rig limit (${threshold} mph)!</strong> High risk of trailer sway and bridge buffeting. Consider postponing or taking a sheltered valley route.</div>
                        ` : speed >= 15 ? `
                            <div class="text-warning"><i class="fa-solid fa-circle-exclamation"></i> Feel noticeable lane push on open freeways. Keep both hands on the wheel and reduce speed by 5-10 mph.</div>
                        ` : `
                            <div class="text-safe"><i class="fa-solid fa-circle-check"></i> Calm conditions. Ideal driving weather for large RV profiles.</div>
                        `}
                    </div>
                </div>
            `;

            marker.bindPopup(popupHtml);
            this.windLayerGroup.addLayer(marker);
        });
    },

    degreesToCardinal(deg) {
        const cardinals = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
        const val = Math.floor((deg / 22.5) + 0.5);
        return cardinals[val % 16];
    },

    /**
     * FLOATING MAP HUD & MODAL INTEGRATION (View Weather Without Zooming)
     */
    initHUD() {
        const hud = document.getElementById('map-weather-hud');
        const modalBtn = document.getElementById('btn-open-weather-modal');
        const modalClose = document.getElementById('btn-close-weather-modal');
        const modal = document.getElementById('route-weather-modal');

        if (hud) {
            hud.addEventListener('click', () => this.openWeatherModal());
        }
        if (modalBtn) {
            modalBtn.addEventListener('click', () => this.openWeatherModal());
        }
        if (modalClose) {
            modalClose.addEventListener('click', () => this.closeWeatherModal());
        }
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeWeatherModal();
            });
        }

        // Fetch initial weather for map center / starting location
        this.fetchInitialLocationWeather();
    },

    async fetchInitialLocationWeather() {
        try {
            const center = state.map ? state.map.getCenter() : { lat: 33.7490, lng: -84.3880 };
            const lat = Number(center.lat).toFixed(4);
            const lng = Number(center.lng).toFixed(4);
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;
            
            const res = await fetch(url);
            const data = await res.json();
            if (data && data.current) {
                const cur = data.current;
                const temp = Math.round(cur.temperature_2m);
                const wind = Math.round(cur.wind_speed_10m);
                const gusts = Math.round(cur.wind_gusts_10m || wind);
                const wmo = this.getWmoInfo(cur.weather_code);

                this.updateHUD({
                    title: `Area Weather: ${temp}°F • ${wmo.desc}`,
                    subtitle: `Wind: ${wind} mph (Gusts ${gusts} mph) • Tap for details`,
                    icon: wmo.icon,
                    iconColor: wmo.color
                });

                this.initialWeatherData = {
                    locationName: 'Current Area',
                    current: cur,
                    wmo: wmo
                };
            }
        } catch (e) {
            console.warn('[WeatherManager] Failed to fetch initial location weather:', e);
        }
    },

    updateHUD({ title, subtitle, icon, iconColor }) {
        const hud = document.getElementById('map-weather-hud');
        const mainEl = document.getElementById('hud-weather-main');
        const subEl = document.getElementById('hud-weather-sub');
        const iconEl = hud ? hud.querySelector('.weather-hud-icon i') : null;

        if (mainEl && title) mainEl.textContent = title;
        if (subEl && subtitle) subEl.textContent = subtitle;
        if (iconEl && icon) {
            iconEl.className = icon;
            if (iconColor) iconEl.style.color = iconColor;
        }
    },

    getWmoInfo(code) {
        if (code === 0) return { desc: 'Clear Skies', icon: 'fa-solid fa-sun', color: '#f59e0b', rainProbText: '0% Rain' };
        if (code === 1) return { desc: 'Mainly Clear', icon: 'fa-solid fa-cloud-sun', color: '#f59e0b', rainProbText: 'Dry Roads' };
        if (code === 2) return { desc: 'Partly Cloudy', icon: 'fa-solid fa-cloud-sun', color: '#94a3b8', rainProbText: 'Dry Roads' };
        if (code === 3) return { desc: 'Overcast', icon: 'fa-solid fa-cloud', color: '#94a3b8', rainProbText: 'Dry Roads' };
        if (code === 45 || code === 48) return { desc: 'Foggy', icon: 'fa-solid fa-smog', color: '#cbd5e1', rainProbText: 'Low Visibility' };
        if (code >= 51 && code <= 55) return { desc: 'Light Drizzle', icon: 'fa-solid fa-cloud-rain', color: '#38bdf8', rainProbText: 'Drizzle' };
        if (code === 56 || code === 57) return { desc: 'Freezing Drizzle', icon: 'fa-solid fa-icicles', color: '#67e8f9', rainProbText: 'Icy Roads' };
        if (code === 61 || code === 63) return { desc: 'Rain Showers', icon: 'fa-solid fa-cloud-showers-heavy', color: '#38bdf8', rainProbText: 'Wet Roads' };
        if (code === 65) return { desc: 'Heavy Rain', icon: 'fa-solid fa-cloud-showers-heavy', color: '#0284c7', rainProbText: 'Heavy Rain' };
        if (code === 66 || code === 67) return { desc: 'Freezing Rain', icon: 'fa-solid fa-snowflake', color: '#67e8f9', rainProbText: 'Icy Road Risk' };
        if (code >= 71 && code <= 77) return { desc: 'Snowfall', icon: 'fa-solid fa-snowflake', color: '#e2e8f0', rainProbText: 'Snow on Road' };
        if (code >= 80 && code <= 82) return { desc: 'Passing Showers', icon: 'fa-solid fa-cloud-showers-heavy', color: '#38bdf8', rainProbText: 'Wet Roads' };
        if (code === 85 || code === 86) return { desc: 'Snow Showers', icon: 'fa-solid fa-snowflake', color: '#e2e8f0', rainProbText: 'Snow Showers' };
        if (code >= 95) return { desc: 'Thunderstorms', icon: 'fa-solid fa-bolt', color: '#f59e0b', rainProbText: 'Storm Alert' };
        return { desc: 'Fair Weather', icon: 'fa-solid fa-cloud-sun', color: '#f59e0b', rainProbText: 'Dry Roads' };
    },

    /**
     * Fetches multi-point weather along active route and renders sidebar card + HUD
     */
    async fetchRouteWeather(coordinates, startName, endName) {
        if (!coordinates || coordinates.length < 2) return;

        const getPt = (pt) => {
            if (Array.isArray(pt)) return [pt[0], pt[1]];
            if (pt && typeof pt.lat !== 'undefined') return [pt.lat, pt.lng];
            return [33.7490, -84.3880];
        };

        const startPt = getPt(coordinates[0]);
        const midPt = getPt(coordinates[Math.floor(coordinates.length / 2)]);
        const destPt = getPt(coordinates[coordinates.length - 1]);

        const startLabel = (startName || 'Departure').split(',')[0].trim();
        const midLabel = 'Midway Point';
        const destLabel = (endName || 'Destination').split(',')[0].trim();

        const lats = [startPt[0].toFixed(4), midPt[0].toFixed(4), destPt[0].toFixed(4)].join(',');
        const lngs = [startPt[1].toFixed(4), midPt[1].toFixed(4), destPt[1].toFixed(4)].join(',');

        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&forecast_days=1&timezone=auto`;

        try {
            const res = await fetch(url);
            const data = await res.json();
            const results = Array.isArray(data) ? data : [data];
            if (results.length === 0) return;

            const activeProfile = state.activeProfile || (state.profiles && state.profiles[0]) || { windThresholdMph: 25 };
            const threshold = activeProfile.windThresholdMph || 25;

            const checkpoints = [
                { name: startLabel, type: 'Start', data: results[0] || results[0] },
                { name: midLabel, type: 'Midway', data: results[1] || results[0] },
                { name: destLabel, type: 'Arrival', data: results[2] || results[results.length - 1] }
            ].map(cp => {
                const cur = cp.data?.current || {};
                const temp = Math.round(cur.temperature_2m || 70);
                const wind = Math.round(cur.wind_speed_10m || 5);
                const gust = Math.round(cur.wind_gusts_10m || wind);
                const code = cur.weather_code || 0;
                const wmo = this.getWmoInfo(code);

                let safety = 'safe';
                let safetyLabel = 'Safe';
                if (wind >= threshold || gust >= threshold + 5) {
                    safety = 'danger';
                    safetyLabel = 'High Wind';
                } else if (wind >= 15 || gust >= 22) {
                    safety = 'caution';
                    safetyLabel = 'Caution';
                }

                return {
                    name: cp.name,
                    type: cp.type,
                    temp,
                    wind,
                    gust,
                    code,
                    wmo,
                    safety,
                    safetyLabel
                };
            });

            // Extract Destination Hourly forecast (next 6 hours)
            const destHourly = results[results.length - 1]?.hourly;
            let hourlyList = [];
            if (destHourly && Array.isArray(destHourly.time)) {
                const nowMs = Date.now() - 3600000;
                let startIdx = destHourly.time.findIndex(t => new Date(t).getTime() >= nowMs);
                if (startIdx === -1) startIdx = 0;

                for (let i = startIdx; i < Math.min(startIdx + 6, destHourly.time.length); i++) {
                    const timeDate = new Date(destHourly.time[i]);
                    const timeLabel = timeDate.toLocaleTimeString([], { hour: 'numeric', hour12: true });
                    hourlyList.push({
                        time: timeLabel,
                        temp: Math.round(destHourly.temperature_2m[i]),
                        rainProb: destHourly.precipitation_probability ? destHourly.precipitation_probability[i] : 0,
                        code: destHourly.weather_code[i],
                        wmo: this.getWmoInfo(destHourly.weather_code[i]),
                        wind: Math.round(destHourly.wind_speed_10m[i]),
                        gust: Math.round(destHourly.wind_gusts_10m[i])
                    });
                }
            }

            this.lastRouteWeather = {
                checkpoints,
                hourlyList,
                threshold,
                startName: startLabel,
                destName: destLabel
            };

            // 1. Update Route Weather Card in Sidebar
            this.renderRouteWeatherCard(checkpoints, threshold);

            // 2. Update Map HUD Pill
            const destCP = checkpoints[2];
            this.updateHUD({
                title: `${destCP.name}: ${destCP.temp}°F • ${destCP.wmo.desc}`,
                subtitle: `Wind: ${destCP.wind} mph • ${destCP.safety === 'danger' ? '⚠️ High Wind Risk' : destCP.safety === 'caution' ? '⚡ Caution Crosswinds' : '✅ Road Clear'}`,
                icon: destCP.wmo.icon,
                iconColor: destCP.wmo.color
            });

        } catch (e) {
            console.warn('[WeatherManager] Failed to fetch route weather:', e);
        }
    },

    /**
     * Renders checkpoint cards and safety advisories in the sidebar
     */
    renderRouteWeatherCard(checkpoints, threshold) {
        const container = document.getElementById('route-weather-checkpoints');
        const advisoryBox = document.getElementById('route-weather-advisory');
        if (!container) return;

        container.innerHTML = checkpoints.map(cp => `
            <div class="weather-checkpoint-pill">
                <div class="cp-left">
                    <span class="cp-badge">${cp.type}</span>
                    <span class="cp-name">${cp.name}</span>
                </div>
                <div class="cp-right">
                    <div class="cp-temp-group">
                        <i class="${cp.wmo.icon}" style="color:${cp.wmo.color}"></i>
                        <span>${cp.temp}°F</span>
                    </div>
                    <div class="cp-wind-group">
                        <i class="fa-solid fa-wind"></i>
                        <span>${cp.wind} mph</span>
                    </div>
                    <span class="cp-safety-tag cp-safety-${cp.safety}">${cp.safetyLabel}</span>
                </div>
            </div>
        `).join('');

        const hasDanger = checkpoints.some(c => c.safety === 'danger');
        const hasCaution = checkpoints.some(c => c.safety === 'caution');
        const maxWind = Math.max(...checkpoints.map(c => c.wind));
        const maxGust = Math.max(...checkpoints.map(c => c.gust));

        if (advisoryBox) {
            advisoryBox.className = 'route-weather-advisory';
            if (hasDanger) {
                advisoryBox.classList.add('has-danger');
                advisoryBox.innerHTML = `
                    <i class="fa-solid fa-triangle-exclamation text-danger"></i>
                    <span><strong>High Wind Warning:</strong> Gusts up to ${maxGust} mph exceed your rig limit (${threshold} mph). High rollover & sway risk.</span>
                `;
            } else if (hasCaution) {
                advisoryBox.classList.add('has-warning');
                advisoryBox.innerHTML = `
                    <i class="fa-solid fa-circle-exclamation text-warning"></i>
                    <span><strong>Crosswind Caution:</strong> Gusts up to ${maxGust} mph. Expect bridge sway; reduce speed by 5-10 mph.</span>
                `;
            } else {
                advisoryBox.innerHTML = `
                    <i class="fa-solid fa-shield-halved text-safe"></i>
                    <span><strong>Safe Driving Conditions:</strong> Max sustained winds ${maxWind} mph (gusts ${maxGust} mph) safely below your ${threshold} mph RV limit.</span>
                `;
            }
        }
    },

    /**
     * Opens detailed weather forecast & RV rollover modal
     */
    openWeatherModal() {
        const modal = document.getElementById('route-weather-modal');
        const body = document.getElementById('weather-modal-body');
        if (!modal || !body) return;

        const data = this.lastRouteWeather;
        const activeProfile = state.activeProfile || (state.profiles && state.profiles[0]) || { name: 'Class A Motorhome', windThresholdMph: 25 };
        const threshold = data?.threshold || activeProfile.windThresholdMph || 25;

        let html = '';

        if (data && data.checkpoints) {
            const maxWind = Math.max(...data.checkpoints.map(c => c.wind));
            const maxGust = Math.max(...data.checkpoints.map(c => c.gust));
            const pct = Math.min(100, Math.round((maxWind / threshold) * 100));
            const barColor = maxWind >= threshold ? '#ef4444' : maxWind >= 15 ? '#f59e0b' : '#10b981';

            html += `
                <!-- RV Crosswind Rollover Safety Analysis -->
                <div class="weather-modal-section">
                    <div class="weather-modal-section-title">
                        <i class="fa-solid fa-shield-halved text-primary"></i> RV Rig Wind & Rollover Risk Analysis
                    </div>
                    <div class="wind-risk-meter-box">
                        <div class="wind-risk-header">
                            <div>
                                <span style="font-weight:700;font-size:13px;color:var(--text-primary);">${activeProfile.name || 'Your Rig'} Limit: ${threshold} mph</span>
                                <div style="font-size:11px;color:var(--text-secondary);">Max sustained along route: <strong>${maxWind} mph</strong> (Peak gusts: <strong>${maxGust} mph</strong>)</div>
                            </div>
                            <span class="cp-safety-tag cp-safety-${maxWind >= threshold ? 'danger' : maxWind >= 15 ? 'caution' : 'safe'}" style="font-size:11px;padding:3px 8px;">
                                ${maxWind >= threshold ? 'HIGH RISK' : maxWind >= 15 ? 'MODERATE RISK' : 'SAFE TRAVEL'}
                            </span>
                        </div>
                        <div class="wind-risk-bar-track">
                            <div class="wind-risk-bar-fill" style="width: ${pct}%; background: ${barColor};"></div>
                        </div>
                        <div style="font-size:11px;color:var(--text-secondary);display:flex;justify-content:space-between;">
                            <span>0 mph (Calm)</span>
                            <span>${threshold} mph (Your RV Threshold)</span>
                            <span>50+ mph (Gale)</span>
                        </div>
                    </div>
                </div>

                <!-- Route Weather Checkpoints -->
                <div class="weather-modal-section">
                    <div class="weather-modal-section-title">
                        <i class="fa-solid fa-route text-primary"></i> Route Weather Checkpoints
                    </div>
                    <div style="display:flex;flex-direction:column;gap:8px;">
                        ${data.checkpoints.map(cp => `
                            <div class="weather-checkpoint-pill" style="padding:10px 14px;">
                                <div class="cp-left">
                                    <span class="cp-badge">${cp.type}</span>
                                    <div>
                                        <div class="cp-name" style="font-size:13px;">${cp.name}</div>
                                        <div style="font-size:11px;color:var(--text-secondary);">${cp.wmo.desc} • ${cp.wmo.rainProbText}</div>
                                    </div>
                                </div>
                                <div class="cp-right">
                                    <div class="cp-temp-group" style="font-size:14px;">
                                        <i class="${cp.wmo.icon}" style="color:${cp.wmo.color};font-size:16px;"></i>
                                        <span>${cp.temp}°F</span>
                                    </div>
                                    <div class="cp-wind-group" style="font-size:12px;">
                                        <i class="fa-solid fa-wind"></i>
                                        <span>${cp.wind} mph <span style="font-size:10px;opacity:0.8;">(G ${cp.gust})</span></span>
                                    </div>
                                    <span class="cp-safety-tag cp-safety-${cp.safety}">${cp.safetyLabel}</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- 6-Hour Forecast Timeline -->
                ${data.hourlyList && data.hourlyList.length > 0 ? `
                    <div class="weather-modal-section" style="margin-bottom:10px;">
                        <div class="weather-modal-section-title">
                            <i class="fa-solid fa-clock text-primary"></i> 6-Hour Arrival Forecast (${data.destName})
                        </div>
                        <div class="hourly-timeline-scroll">
                            ${data.hourlyList.map(h => `
                                <div class="hourly-card">
                                    <span class="hourly-time">${h.time}</span>
                                    <i class="hourly-icon ${h.wmo.icon}" style="color:${h.wmo.color}"></i>
                                    <span class="hourly-temp">${h.temp}°F</span>
                                    <span class="hourly-rain"><i class="fa-solid fa-droplet" style="font-size:9px;"></i> ${h.rainProb}%</span>
                                    <span class="hourly-wind"><i class="fa-solid fa-wind" style="font-size:9px;"></i> ${h.wind} mph</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            `;
        } else {
            const initWx = this.initialWeatherData;
            html += `
                <div style="text-align:center;padding:24px 10px;">
                    <i class="fa-solid fa-cloud-sun" style="font-size:38px;color:#f59e0b;margin-bottom:12px;"></i>
                    <h4 style="margin:0 0 6px 0;font-size:16px;">${initWx ? initWx.locationName : 'Map Area Weather'}</h4>
                    <p style="color:var(--text-secondary);font-size:13px;margin:0 0 16px 0;">
                        ${initWx ? `${Math.round(initWx.current.temperature_2m)}°F • ${initWx.wmo.desc} • Wind ${Math.round(initWx.current.wind_speed_10m)} mph` : 'Plan a route to see live checkpoint forecasts and crosswind rollover ratings.'}
                    </p>
                    <p style="font-size:12px;color:var(--text-muted);">
                        Calculate an RV route to automatically view temperatures, precipitation, and crosswind safety along your entire journey.
                    </p>
                </div>
            `;
        }

        // Overlay Toggle Shortcuts
        html += `
            <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;border-top:1px solid var(--border-color);padding-top:14px;">
                <button type="button" class="btn-secondary btn-sm" id="modal-btn-toggle-radar">
                    <i class="fa-solid fa-cloud-showers-heavy"></i> ${this.isRadarActive ? 'Hide Radar' : 'Show Radar Layer'}
                </button>
                <button type="button" class="btn-secondary btn-sm" id="modal-btn-toggle-wind">
                    <i class="fa-solid fa-wind"></i> ${this.isWindActive ? 'Hide Wind Arrows' : 'Show Wind Layer'}
                </button>
            </div>
        `;

        body.innerHTML = html;
        modal.classList.remove('hidden');

        // Hook up quick toggle buttons inside modal
        const modalRadarBtn = document.getElementById('modal-btn-toggle-radar');
        const modalWindBtn = document.getElementById('modal-btn-toggle-wind');
        if (modalRadarBtn) {
            modalRadarBtn.addEventListener('click', () => {
                this.toggleRadar();
                this.openWeatherModal();
            });
        }
        if (modalWindBtn) {
            modalWindBtn.addEventListener('click', () => {
                this.toggleWind();
                this.openWeatherModal();
            });
        }
    },

    closeWeatherModal() {
        const modal = document.getElementById('route-weather-modal');
        if (modal) modal.classList.add('hidden');
    }
};

window.WeatherManager = WeatherManager;
document.addEventListener('DOMContentLoaded', () => {
    // Wait slightly for Leaflet map initialization
    setTimeout(() => WeatherManager.init(), 200);
});
