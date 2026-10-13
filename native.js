/**
 * RV SafeNavigate - Native Bridge & Hardware Integration
 * Handles Capacitor native capabilities with automatic web fallbacks:
 * - Network status monitoring (Online / Offline)
 * - Screen Wake Lock (Keeps navigation active while driving)
 * - Native Geolocation & Background Tracking
 * - Haptic alerts on safety hazard detection
 * - Native Status Bar styling
 */

const NativeBridge = {
    isNative: false,
    networkStatus: {
        connected: navigator.onLine !== undefined ? navigator.onLine : true,
        connectionType: 'unknown'
    },
    wakeLockSentinel: null,

    async init() {
        this.isNative = typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform();
        console.log(`[NativeBridge] Initializing. Native platform: ${this.isNative}`);

        await this.initNetworkListener();
        await this.initWakeLock();
        await this.initStatusBar();
        await this.initBackButton();
    },

    /**
     * Network Status Monitoring
     */
    async initNetworkListener() {
        if (this.isNative && window.Capacitor?.Plugins?.Network) {
            try {
                const status = await window.Capacitor.Plugins.Network.getStatus();
                this.networkStatus = status;
                window.Capacitor.Plugins.Network.addListener('networkStatusChange', status => {
                    this.onNetworkChange(status.connected, status.connectionType);
                });
            } catch (e) {
                console.warn('[NativeBridge] Capacitor Network plugin error:', e);
            }
        } else {
            window.addEventListener('online', () => this.onNetworkChange(true, 'wifi'));
            window.addEventListener('offline', () => this.onNetworkChange(false, 'none'));
        }

        this.updateNetworkUI(this.networkStatus.connected);
    },

    onNetworkChange(connected, connectionType) {
        this.networkStatus = { connected, connectionType };
        console.log(`[NativeBridge] Connection status changed: ${connected ? 'ONLINE' : 'OFFLINE'} (${connectionType})`);
        this.updateNetworkUI(connected);
        window.dispatchEvent(new CustomEvent('app:networkStatus', { detail: { connected, connectionType } }));
    },

    updateNetworkUI(connected) {
        let banner = document.getElementById('offline-status-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'offline-status-banner';
            banner.className = 'offline-status-banner hidden';
            banner.innerHTML = `
                <div class="offline-banner-content">
                    <i class="fa-solid fa-plane-slash"></i>
                    <span><strong>Offline Mode</strong> — Using cached maps & offline hazard engine</span>
                </div>
            `;
            document.body.appendChild(banner);
        }

        if (!connected) {
            banner.classList.remove('hidden');
        } else {
            banner.classList.add('hidden');
        }
    },

    /**
     * Keep Screen Awake while Driving
     */
    async initWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                this.wakeLockSentinel = await navigator.wakeLock.request('screen');
                this.wakeLockSentinel.addEventListener('release', () => {
                    console.log('[NativeBridge] Screen Wake Lock released');
                });
                console.log('[NativeBridge] Screen Wake Lock active');
            }
        } catch (err) {
            console.warn('[NativeBridge] Wake Lock error:', err);
        }
    },

    /**
     * Native Status Bar
     */
    async initStatusBar() {
        if (this.isNative && window.Capacitor?.Plugins?.StatusBar) {
            try {
                const { StatusBar, Style } = window.Capacitor.Plugins;
                await StatusBar.setStyle({ style: 'DARK' });
                await StatusBar.setBackgroundColor({ color: '#0f172a' });
                if (typeof StatusBar.setOverlaysWebView === 'function') {
                    await StatusBar.setOverlaysWebView({ overlay: false });
                }
            } catch (e) {
                console.warn('[NativeBridge] StatusBar error:', e);
            }
        }
    },

    /**
     * Android Hardware Back Button Handler
     */
    async initBackButton() {
        if (this.isNative && window.Capacitor?.Plugins?.App) {
            try {
                window.Capacitor.Plugins.App.addListener('backButton', ({ canGoBack }) => {
                    // 1. Close any visible modal dialog
                    const openModal = document.querySelector('.modal-backdrop:not(.hidden)');
                    if (openModal) {
                        openModal.classList.add('hidden');
                        return;
                    }

                    // 2. Close Turn-by-Turn navigation overlay if active
                    const tbtOverlay = document.getElementById('turn-by-turn-overlay');
                    if (tbtOverlay && !tbtOverlay.classList.contains('hidden')) {
                        tbtOverlay.classList.add('hidden');
                        return;
                    }

                    // 3. If bottom sheet drawer is expanded on mobile, collapse it
                    const appPanel = document.getElementById('app-panel');
                    if (appPanel && !appPanel.classList.contains('collapsed') && window.innerWidth < 768) {
                        appPanel.classList.add('collapsed');
                        return;
                    }

                    // 4. Default: go back in webview history or exit app
                    if (canGoBack) {
                        window.history.back();
                    } else {
                        window.Capacitor.Plugins.App.exitApp();
                    }
                });
                console.log('[NativeBridge] Android Hardware Back Button listener attached');
            } catch (e) {
                console.warn('[NativeBridge] Back button listener error:', e);
            }
        }
    },

    /**
     * Haptic Feedback for hazards and alerts
     */
    async triggerHaptic(type = 'warning') {
        if (this.isNative && window.Capacitor?.Plugins?.Haptics) {
            try {
                const { Haptics, ImpactStyle, NotificationType } = window.Capacitor.Plugins;
                if (type === 'warning' || type === 'error') {
                    await Haptics.notification({ type: NotificationType.Warning });
                } else if (type === 'success') {
                    await Haptics.notification({ type: NotificationType.Success });
                } else {
                    await Haptics.impact({ style: ImpactStyle.Medium });
                }
                return;
            } catch (e) {
                console.warn('[NativeBridge] Haptics error:', e);
            }
        }

        // Web vibration API fallback
        if ('vibrate' in navigator) {
            if (type === 'warning') navigator.vibrate([200, 100, 200]);
            else if (type === 'error') navigator.vibrate([300, 150, 300, 150, 400]);
            else navigator.vibrate(50);
        }
    },

    /**
     * High-Accuracy Geolocation
     */
    async getCurrentPosition() {
        if (this.isNative && window.Capacitor?.Plugins?.Geolocation) {
            try {
                const coordinates = await window.Capacitor.Plugins.Geolocation.getCurrentPosition({
                    enableHighAccuracy: true,
                    timeout: 10000
                });
                return {
                    lat: coordinates.coords.latitude,
                    lng: coordinates.coords.longitude,
                    accuracy: coordinates.coords.accuracy,
                    heading: coordinates.coords.heading,
                    speed: coordinates.coords.speed
                };
            } catch (e) {
                console.warn('[NativeBridge] Native Geolocation error, falling back to browser:', e);
            }
        }

        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation not supported'));
                return;
            }
            navigator.geolocation.getCurrentPosition(
                pos => resolve({
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    heading: pos.coords.heading,
                    speed: pos.coords.speed
                }),
                err => reject(err),
                { enableHighAccuracy: true, timeout: 10000 }
            );
        });
    }
};

window.NativeBridge = NativeBridge;
document.addEventListener('DOMContentLoaded', () => NativeBridge.init());
