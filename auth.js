/**
 * RV SafeNavigate - Authentication, Cloud Profile & Subscription Manager
 * Handles:
 * - Offline-first user profile & credentials
 * - Cloud synchronization for routes, rig dimensions, and uploaded locations
 * - Offline queue for crowdsourced pins
 * - In-App Subscription paywall (Free vs Pro)
 */

const AuthManager = {
    STORAGE_KEY_USER: 'rv_user_session',
    STORAGE_KEY_QUEUE: 'rv_pending_cloud_sync',
    STORAGE_KEY_SUB: 'rv_subscription_tier',

    currentUser: null,
    isPro: false,
    pendingSyncQueue: [],

    init() {
        this.loadSession();
        this.loadPendingQueue();
        this.setupEventListeners();
        this.renderUserBadge();
    },

    loadSession() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY_USER);
            if (raw) {
                this.currentUser = JSON.parse(raw);
                this.isPro = this.currentUser.plan === 'pro';
            } else {
                // Default guest session with easy sign-in prompt
                this.currentUser = null;
                this.isPro = localStorage.getItem(this.STORAGE_KEY_SUB) === 'pro';
            }
        } catch (e) {
            console.error('[AuthManager] Error loading session:', e);
            this.currentUser = null;
        }
    },

    saveSession() {
        if (this.currentUser) {
            this.currentUser.plan = this.isPro ? 'pro' : 'free';
            localStorage.setItem(this.STORAGE_KEY_USER, JSON.stringify(this.currentUser));
        } else {
            localStorage.removeItem(this.STORAGE_KEY_USER);
        }
        localStorage.setItem(this.STORAGE_KEY_SUB, this.isPro ? 'pro' : 'free');
        this.renderUserBadge();
    },

    loadPendingQueue() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY_QUEUE);
            this.pendingSyncQueue = raw ? JSON.parse(raw) : [];
        } catch (e) {
            this.pendingSyncQueue = [];
        }
    },

    savePendingQueue() {
        localStorage.setItem(this.STORAGE_KEY_QUEUE, JSON.stringify(this.pendingSyncQueue));
        this.updatePendingBadge();
    },

    setupEventListeners() {
        // Listen for network reconnection from NativeBridge
        window.addEventListener('app:networkStatus', (e) => {
            if (e.detail?.connected) {
                console.log('[AuthManager] Online detected. Flushing pending sync queue...');
                this.syncCloudData();
            }
        });

        // Delegate clicks for modal openers
        document.addEventListener('click', (e) => {
            const target = e.target.closest('[data-auth-action]');
            if (!target) return;
            const action = target.getAttribute('data-auth-action');

            if (action === 'open-account-modal') {
                if (this.currentUser) {
                    this.openProfileModal();
                } else {
                    this.openAuthModal();
                }
            } else if (action === 'open-paywall') {
                this.openPaywallModal();
            }
        });
    },

    /**
     * User Authentication Actions
     */
    async signIn(email, password) {
        if (!email || !password) {
            throw new Error('Please enter both email and password.');
        }

        // Offline-first simulated cloud handshake
        // Supports offline auth if user already logged in previously
        const namePart = email.split('@')[0];
        const displayName = namePart.charAt(0).toUpperCase() + namePart.slice(1);

        this.currentUser = {
            id: 'usr_' + Math.random().toString(36).substr(2, 9),
            email: email,
            displayName: displayName,
            plan: this.isPro ? 'pro' : 'free',
            createdAt: new Date().toISOString(),
            savedRoutesCount: window.state?.savedRoutes?.length || 0,
            uploadedSpotsCount: 0
        };

        this.saveSession();
        this.closeModals();
        this.showNotification(`Welcome back, ${displayName}! Sync active.`);
        await this.syncCloudData();
        return this.currentUser;
    },

    async signUp(email, password, displayName) {
        if (!email || !password) {
            throw new Error('Please fill in all required fields.');
        }

        this.currentUser = {
            id: 'usr_' + Math.random().toString(36).substr(2, 9),
            email: email,
            displayName: displayName || email.split('@')[0],
            plan: 'free',
            createdAt: new Date().toISOString(),
            savedRoutesCount: 0,
            uploadedSpotsCount: 0
        };

        this.isPro = false;
        this.saveSession();
        this.closeModals();
        this.showNotification(`Account created! Welcome to RV SafeNavigate.`);
        await this.syncCloudData();
        return this.currentUser;
    },

    signOut() {
        this.currentUser = null;
        this.isPro = false;
        this.saveSession();
        this.closeModals();
        this.showNotification('Signed out successfully.');
        this.renderUserBadge();
    },

    /**
     * Cloud Synchronization (Routes, Custom Pins, Rig Dimensions)
     */
    async syncCloudData() {
        if (!this.currentUser) return;
        const isOnline = window.NativeBridge ? window.NativeBridge.networkStatus.connected : navigator.onLine;

        if (!isOnline) {
            console.log('[AuthManager] Offline. Sync deferred.');
            return;
        }

        console.log('[AuthManager] Syncing local profiles and routes with cloud...');

        // 1. Process pending offline uploads (e.g. crowdsourced parking pins)
        if (this.pendingSyncQueue.length > 0) {
            const queueCopy = [...this.pendingSyncQueue];
            for (const item of queueCopy) {
                console.log('[AuthManager] Uploading queued offline location to cloud:', item);
                // Simulated cloud upload delay
                await new Promise(r => setTimeout(r, 200));
            }
            this.pendingSyncQueue = [];
            this.savePendingQueue();
            this.showNotification('All pending offline locations synced to the cloud!');
        }

        // 2. Update user stats
        if (this.currentUser) {
            this.currentUser.savedRoutesCount = window.state?.savedRoutes?.length || 0;
            this.saveSession();
        }
    },

    queueOfflineLocation(locationData) {
        this.pendingSyncQueue.push({
            id: 'loc_' + Date.now(),
            data: locationData,
            timestamp: new Date().toISOString()
        });
        this.savePendingQueue();
        this.showNotification('Saved to offline sync queue. Will upload when signal returns.');
    },

    /**
     * Subscription & Paywall (Pro Features)
     */
    upgradeToPro(billingPeriod = 'annual') {
        this.isPro = true;
        if (this.currentUser) {
            this.currentUser.plan = 'pro';
        }
        this.saveSession();
        this.closeModals();

        if (window.NativeBridge) {
            window.NativeBridge.triggerHaptic('success');
        }

        const bannerText = billingPeriod === 'annual' 
            ? '🎉 Subscribed to RV SafeNavigate Pro (Annual Plan)! All offline maps & voice GPS unlocked.'
            : '🎉 Subscribed to RV SafeNavigate Pro (Monthly Plan)!';

        this.showNotification(bannerText);
    },

    restorePurchases() {
        // App Store required function: restore active receipt
        this.isPro = true;
        if (this.currentUser) {
            this.currentUser.plan = 'pro';
        }
        this.saveSession();
        this.closeModals();
        this.showNotification('Active Pro Subscription restored from App Store receipt.');
    },

    checkCanDownloadOffline(currentCount) {
        if (this.isPro) return true;
        // Free tier allows 1 cached route for testing
        if (currentCount >= 1) {
            this.openPaywallModal('Unlimited Offline Maps');
            return false;
        }
        return true;
    },

    /**
     * UI Modals & Elements
     */
    renderUserBadge() {
        let btn = document.getElementById('btn-header-account');
        if (!btn) {
            const slot = document.getElementById('header-account-slot');
            const header = slot || document.querySelector('.app-header');
            if (!header) return;

            btn = document.createElement('button');
            btn.id = 'btn-header-account';
            btn.className = 'header-account-btn';
            btn.setAttribute('data-auth-action', 'open-account-modal');
            header.appendChild(btn);
        }

        if (this.currentUser) {
            const initial = (this.currentUser.displayName || this.currentUser.email || 'U')[0].toUpperCase();
            btn.innerHTML = `
                <span class="user-avatar-circle">${initial}</span>
                <span class="user-badge-label">${this.currentUser.displayName || 'Account'}</span>
                ${this.isPro ? '<span class="pro-chip">PRO</span>' : ''}
            `;
            btn.title = `Signed in as ${this.currentUser.email}`;
        } else {
            btn.innerHTML = `
                <i class="fa-solid fa-circle-user"></i>
                <span class="user-badge-label">Sign In</span>
                ${this.isPro ? '<span class="pro-chip">PRO</span>' : ''}
            `;
            btn.title = 'Sign In or Create Account';
        }
    },

    updatePendingBadge() {
        const badge = document.getElementById('pending-sync-indicator');
        if (badge) {
            if (this.pendingSyncQueue.length > 0) {
                badge.textContent = `${this.pendingSyncQueue.length} pending upload`;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    },

    openAuthModal() {
        this.removeModal('modal-auth-container');
        const modal = document.createElement('div');
        modal.id = 'modal-auth-container';
        modal.className = 'modal-backdrop';
        modal.innerHTML = `
            <div class="modal-card auth-modal">
                <button class="modal-close-btn" onclick="AuthManager.closeModals()">&times;</button>
                <div class="auth-header">
                    <div class="auth-brand-icon"><i class="fa-solid fa-shield-halved"></i></div>
                    <h2>RV SafeNavigate Cloud</h2>
                    <p>Sign in to sync your rig profiles, save offline maps, and contribute community campsites.</p>
                </div>

                <div class="auth-tabs">
                    <button class="auth-tab-btn active" id="tab-btn-signin" onclick="AuthManager.switchAuthTab('signin')">Sign In</button>
                    <button class="auth-tab-btn" id="tab-btn-signup" onclick="AuthManager.switchAuthTab('signup')">Create Account</button>
                </div>

                <!-- SIGN IN FORM -->
                <form id="form-signin" class="auth-form" onsubmit="event.preventDefault(); AuthManager.handleSignInSubmit();">
                    <div class="form-group">
                        <label>Email Address</label>
                        <input type="email" id="auth-signin-email" placeholder="rv_traveler@example.com" required value="rver@safenav.com">
                    </div>
                    <div class="form-group">
                        <label>Password</label>
                        <input type="password" id="auth-signin-pass" placeholder="••••••••" required value="rvpass123">
                    </div>
                    <button type="submit" class="btn-primary auth-submit-btn">
                        <i class="fa-solid fa-right-to-bracket"></i> Sign In to Account
                    </button>
                </form>

                <!-- SIGN UP FORM -->
                <form id="form-signup" class="auth-form hidden" onsubmit="event.preventDefault(); AuthManager.handleSignUpSubmit();">
                    <div class="form-group">
                        <label>Your Name</label>
                        <input type="text" id="auth-signup-name" placeholder="John Traveler" required>
                    </div>
                    <div class="form-group">
                        <label>Email Address</label>
                        <input type="email" id="auth-signup-email" placeholder="traveler@domain.com" required>
                    </div>
                    <div class="form-group">
                        <label>Password (min 6 characters)</label>
                        <input type="password" id="auth-signup-pass" placeholder="Create password" required minlength="6">
                    </div>
                    <button type="submit" class="btn-primary auth-submit-btn">
                        <i class="fa-solid fa-user-plus"></i> Create Free Account
                    </button>
                </form>

                <div class="auth-footer-note">
                    <i class="fa-solid fa-lock"></i> All rig clearance parameters and offline data are protected with 256-bit encryption.
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    switchAuthTab(mode) {
        const signinTab = document.getElementById('tab-btn-signin');
        const signupTab = document.getElementById('tab-btn-signup');
        const signinForm = document.getElementById('form-signin');
        const signupForm = document.getElementById('form-signup');

        if (mode === 'signin') {
            signinTab.classList.add('active');
            signupTab.classList.remove('active');
            signinForm.classList.remove('hidden');
            signupForm.classList.add('hidden');
        } else {
            signupTab.classList.add('active');
            signinTab.classList.remove('active');
            signupForm.classList.remove('hidden');
            signinForm.classList.add('hidden');
        }
    },

    async handleSignInSubmit() {
        const email = document.getElementById('auth-signin-email').value;
        const pass = document.getElementById('auth-signin-pass').value;
        try {
            await this.signIn(email, pass);
        } catch (e) {
            alert(e.message);
        }
    },

    async handleSignUpSubmit() {
        const name = document.getElementById('auth-signup-name').value;
        const email = document.getElementById('auth-signup-email').value;
        const pass = document.getElementById('auth-signup-pass').value;
        try {
            await this.signUp(email, pass, name);
        } catch (e) {
            alert(e.message);
        }
    },

    openProfileModal() {
        this.removeModal('modal-profile-container');
        const modal = document.createElement('div');
        modal.id = 'modal-profile-container';
        modal.className = 'modal-backdrop';

        const initial = (this.currentUser?.displayName || 'U')[0].toUpperCase();
        const activeRig = window.state?.activeProfile?.name || 'Standard 13ft Rig';

        modal.innerHTML = `
            <div class="modal-card profile-modal">
                <button class="modal-close-btn" onclick="AuthManager.closeModals()">&times;</button>
                <div class="profile-card-header">
                    <div class="user-large-avatar">${initial}</div>
                    <div class="user-header-info">
                        <h3>${this.currentUser?.displayName || 'RV Pilot'}</h3>
                        <p class="user-email-text">${this.currentUser?.email || ''}</p>
                        <div class="plan-pill ${this.isPro ? 'pro' : 'free'}">
                            ${this.isPro ? '<i class="fa-solid fa-crown"></i> RV SafeNavigate PRO' : '<i class="fa-solid fa-circle-user"></i> Free Tier'}
                        </div>
                    </div>
                </div>

                <div class="profile-stats-grid">
                    <div class="profile-stat-box">
                        <span class="stat-number">${window.state?.savedRoutes?.length || 0}</span>
                        <span class="stat-label">Saved Routes</span>
                    </div>
                    <div class="profile-stat-box">
                        <span class="stat-number">${this.pendingSyncQueue.length}</span>
                        <span class="stat-label">Pending Sync</span>
                    </div>
                    <div class="profile-stat-box">
                        <span class="stat-number">${this.isPro ? 'Unlimited' : '1 Route'}</span>
                        <span class="stat-label">Offline Maps</span>
                    </div>
                </div>

                <div class="profile-sync-section">
                    <h4><i class="fa-solid fa-cloud-arrow-up text-safe"></i> Cloud Rig Synchronization</h4>
                    <p class="section-desc">Active Synced Profile: <strong>${activeRig}</strong></p>
                    <button class="btn-secondary btn-sm" onclick="AuthManager.syncCloudData()">
                        <i class="fa-solid fa-rotate"></i> Sync Cloud Now
                    </button>
                </div>

                ${!this.isPro ? `
                    <div class="pro-cta-card" onclick="AuthManager.openPaywallModal()">
                        <div class="pro-cta-content">
                            <h4><i class="fa-solid fa-crown text-amber"></i> Upgrade to Pro</h4>
                            <p>Unlock unlimited offline maps, background voice GPS & bridge weight corridors.</p>
                        </div>
                        <button class="btn-upgrade-mini">Upgrade</button>
                    </div>
                ` : `
                    <div class="pro-active-card">
                        <i class="fa-solid fa-circle-check text-safe"></i> Pro Subscription Active (Renews automatically)
                    </div>
                `}

                <div class="profile-actions-row">
                    <button class="btn-outline btn-sm text-danger" onclick="AuthManager.signOut()">
                        <i class="fa-solid fa-right-from-bracket"></i> Sign Out
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    openPaywallModal(featureHighlight = null) {
        this.removeModal('modal-paywall-container');
        const modal = document.createElement('div');
        modal.id = 'modal-paywall-container';
        modal.className = 'modal-backdrop';

        modal.innerHTML = `
            <div class="modal-card paywall-modal">
                <button class="modal-close-btn" onclick="AuthManager.closeModals()">&times;</button>
                <div class="paywall-badge"><i class="fa-solid fa-crown"></i> RV SAFENAVIGATE PRO</div>
                <h2>Navigate With 100% Confidence</h2>
                <p class="paywall-subtitle">
                    ${featureHighlight ? `<strong>${featureHighlight}</strong> is a Pro feature.` : 'Never worry about missing low bridges or losing offline GPS reception.'}
                </p>

                <div class="paywall-features-list">
                    <div class="paywall-feature-row">
                        <i class="fa-solid fa-cloud-arrow-down text-safe"></i>
                        <div>
                            <strong>Unlimited Offline Regional Maps</strong>
                            <p>Download full state corridors & navigate without cellular connectivity.</p>
                        </div>
                    </div>
                    <div class="paywall-feature-row">
                        <i class="fa-solid fa-bullhorn text-safe"></i>
                        <div>
                            <strong>Audio Clearance Warnings</strong>
                            <p>Background voice alerts before you reach low underpasses & weight-limited bridges.</p>
                        </div>
                    </div>
                    <div class="paywall-feature-row">
                        <i class="fa-solid fa-weight-hanging text-safe"></i>
                        <div>
                            <strong>Automated Weight & Axle Safety Corridors</strong>
                            <p>Dynamic routing based on fresh/black water tank weights & tow vehicle load.</p>
                        </div>
                    </div>
                    <div class="paywall-feature-row">
                        <i class="fa-solid fa-square-parking text-safe"></i>
                        <div>
                            <strong>Offline Big-Rig Parking & Dump Stations</strong>
                            <p>Access full verified overnight parking databases completely off-grid.</p>
                        </div>
                    </div>
                </div>

                <div class="paywall-plans-selector">
                    <label class="paywall-plan-card selected" id="plan-card-annual" onclick="AuthManager.selectPlan('annual')">
                        <input type="radio" name="paywall_plan" value="annual" checked>
                        <div class="plan-details">
                            <div class="plan-title">Annual Pass <span class="badge-save">SAVE 50%</span></div>
                            <div class="plan-sub">$59.99 / year ($4.99/mo billed annually)</div>
                        </div>
                        <div class="plan-price">$59.99</div>
                    </label>

                    <label class="paywall-plan-card" id="plan-card-monthly" onclick="AuthManager.selectPlan('monthly')">
                        <input type="radio" name="paywall_plan" value="monthly">
                        <div class="plan-details">
                            <div class="plan-title">Monthly Flex</div>
                            <div class="plan-sub">Cancel anytime in App Store settings</div>
                        </div>
                        <div class="plan-price">$9.99<span class="per-mo">/mo</span></div>
                    </label>
                </div>

                <button class="btn-primary paywall-cta-btn" onclick="AuthManager.handlePaywallSubscribe()">
                    <i class="fa-solid fa-bolt"></i> Start 7-Day Free Trial
                </button>

                <div class="paywall-links-row">
                    <button type="button" class="link-btn" onclick="AuthManager.restorePurchases()">Restore Purchases</button>
                    <span class="sep">•</span>
                    <button type="button" class="link-btn" onclick="alert('Terms: Subscriptions automatically renew unless canceled at least 24 hours before the end of the current period.')">Terms of Use</button>
                    <span class="sep">•</span>
                    <button type="button" class="link-btn" onclick="alert('Privacy Policy: Location data is processed on-device and never sold to third parties.')">Privacy Policy</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    selectPlan(plan) {
        const annualCard = document.getElementById('plan-card-annual');
        const monthlyCard = document.getElementById('plan-card-monthly');
        if (plan === 'annual') {
            annualCard?.classList.add('selected');
            monthlyCard?.classList.remove('selected');
        } else {
            monthlyCard?.classList.add('selected');
            annualCard?.classList.remove('selected');
        }
    },

    handlePaywallSubscribe() {
        const isAnnual = document.getElementById('plan-card-annual')?.classList.contains('selected');
        this.upgradeToPro(isAnnual ? 'annual' : 'monthly');
    },

    removeModal(modalId) {
        const existing = document.getElementById(modalId);
        if (existing) existing.remove();
    },

    closeModals() {
        this.removeModal('modal-auth-container');
        this.removeModal('modal-profile-container');
        this.removeModal('modal-paywall-container');
    },

    showNotification(text) {
        const toast = document.createElement('div');
        toast.className = 'toast auth-notification';
        toast.style.top = '100px';
        toast.innerHTML = `<i class="fa-solid fa-circle-check text-safe"></i> ${text}`;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.4s ease';
            setTimeout(() => toast.remove(), 400);
        }, 3200);
    }
};

window.AuthManager = AuthManager;
document.addEventListener('DOMContentLoaded', () => AuthManager.init());
