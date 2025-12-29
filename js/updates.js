
import { safeGetItem, safeSetItem } from "./error-handler.js";

let userActive = false;
let lastActivity = Date.now();

// Track user activity to prevent reloading while they are doing something
function trackActivity() {
    const activityEvents = ['click', 'touchstart', 'keydown', 'scroll'];
    const markActive = () => {
        userActive = true;
        lastActivity = Date.now();
    };
    activityEvents.forEach(e => document.addEventListener(e, markActive, { passive: true }));

    // Check idle status periodically
    setInterval(() => {
        if (Date.now() - lastActivity > 5000) {
            userActive = false;
        }
    }, 2000);
}

export async function initUpdates() {
    if (!('serviceWorker' in navigator)) return;

    trackActivity();

    // 1. Check for stored version vs live version (for "See what's changed" feature)
    // We fetch checks for the *deployed* version (if we are online).
    // If the deployed version matches what we are running, but we haven't seen it, we show the changelog.
    // If the deployed version is NEWER, the SW update process will catch it below.
    try {
        // Cache-busting to get the real latest version
        const response = await fetch('./version.json?t=' + Date.now());
        if (response.ok) {
            const data = await response.json();
            handleVersionCheck(data);
        }
    } catch (e) {
        console.warn("[Updates] Failed to fetch version info", e);
    }

    // 2. Register Service Worker
    navigator.serviceWorker.register('./sw.js')
        .then(reg => {
            // Check for updates periodically
            reg.update();
            setInterval(() => reg.update(), 60 * 60 * 1000); // Check every hour
        })
        .catch(err => console.warn('[SW] Registration failed:', err));

    // 3. Handle Updates (when a new SW is waiting to activate)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        // If user hasn't interacted recently, safe to reload automatically
        if (!userActive && Date.now() - lastActivity > 5000) {
            window.location.reload();
        } else {
            // Otherwise show notification
            showUpdateNotification();
        }
    });
}

function handleVersionCheck(serverData) {
    const currentVersion = serverData.version;
    const lastSeen = safeGetItem('last_seen_version');

    // Logic: "displayed once per user, unless something material has changed"
    // If we have a lastSeen version, and it differs from current, show the log.
    if (lastSeen && currentVersion !== lastSeen) {
        showChangelogModal(serverData);
    }

    // Update last seen so we don't show it again for this version
    if (currentVersion !== lastSeen) {
        safeSetItem('last_seen_version', currentVersion);
    }
}

function showUpdateNotification() {
    // Constraint: "only be made available once per user session"
    if (sessionStorage.getItem('update_notification_shown')) return;
    if (document.getElementById('update-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'update-banner';
    banner.className = 'update-banner';
    banner.innerHTML = `
      <span class="update-banner-text">✨ New version available!</span>
      <button class="update-banner-btn">Refresh</button>
      <button class="update-banner-dismiss" aria-label="Dismiss">✕</button>
    `;

    document.body.appendChild(banner);

    // Initial animation frame
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            banner.classList.add('visible');
        });
    });

    const refreshBtn = banner.querySelector('.update-banner-btn');
    const dismissBtn = banner.querySelector('.update-banner-dismiss');

    refreshBtn.onclick = () => location.reload();

    dismissBtn.onclick = () => {
        banner.classList.remove('visible');
        setTimeout(() => banner.remove(), 400); // wait for transition
        // Mark as shown for this session
        sessionStorage.setItem('update_notification_shown', 'true');
    };
}

function showChangelogModal(data) {
    if (document.getElementById('changelog-modal')) return;

    const changesList = (data.changes || []).map(c => `<li>${c}</li>`).join('');

    const modal = document.createElement('div');
    modal.id = 'changelog-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
      <div class="changelog-backdrop"></div>
      <div class="changelog-card">
        <div class="changelog-header">
           <h2 class="changelog-title">What's New</h2>
           <span class="changelog-version">v${data.version}</span>
        </div>
        <div style="margin-bottom:12px; color:#888; font-weight:700;">We've made some improvements!</div>
        <ul class="changelog-list">
           ${changesList}
        </ul>
        <div class="changelog-actions">
           <button class="btn-main" id="btn-changelog-close">Awesome!</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = modal.querySelector('#btn-changelog-close');
    const backdrop = modal.querySelector('.changelog-backdrop');

    const close = () => {
        modal.remove();
        // Ensure we marked version as seen (already done in handleVersionCheck, but good to be safe)
    };

    closeBtn.onclick = close;
    backdrop.onclick = close;
}
