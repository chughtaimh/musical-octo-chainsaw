/**
 * error-handler.js
 * Centralized error handling, toast notifications, and safe wrappers
 */

// ============================================================
// TOAST NOTIFICATION SYSTEM
// ============================================================

const TOAST_DURATION = 4000;
const TOAST_CONTAINER_ID = 'toast-container';

/**
 * Ensures the toast container exists in the DOM
 */
function ensureToastContainer() {
    let container = document.getElementById(TOAST_CONTAINER_ID);
    if (!container) {
        container = document.createElement('div');
        container.id = TOAST_CONTAINER_ID;
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    return container;
}

/**
 * Show a toast notification to the user
 * @param {string} message - Message to display
 * @param {'info'|'success'|'warning'|'error'} type - Toast type
 * @param {number} duration - Duration in ms (default 4000)
 */
export function showToast(message, type = 'info', duration = TOAST_DURATION) {
    const container = ensureToastContainer();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');

    // Icon based on type
    const icons = {
        info: 'ℹ️',
        success: '✅',
        warning: '⚠️',
        error: '❌'
    };

    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-message">${escapeHtml(message)}</span>
        <button class="toast-close" aria-label="Dismiss">&times;</button>
    `;

    // Close button handler
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => removeToast(toast));

    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('toast-visible');
    });

    // Auto-remove after duration
    setTimeout(() => removeToast(toast), duration);

    return toast;
}

function removeToast(toast) {
    if (!toast || !toast.parentNode) return;
    toast.classList.remove('toast-visible');
    toast.classList.add('toast-hiding');
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 300);
}

/**
 * Escape HTML to prevent XSS in toast messages
 */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ============================================================
// GLOBAL ERROR BOUNDARY
// ============================================================

let errorHandlerInitialized = false;

/**
 * Initialize the global error handler
 * Should be called once at app startup
 */
export function initGlobalErrorHandler() {
    if (errorHandlerInitialized) return;
    errorHandlerInitialized = true;

    // Catch unhandled errors
    window.addEventListener('error', (event) => {
        console.error('[Global Error]', event.error);
        showToast('Something went wrong. Please try again.', 'error');
        // Prevent default browser error handling
        event.preventDefault();
    });

    // Catch unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
        console.error('[Unhandled Promise Rejection]', event.reason);
        showToast('A background operation failed. Please try again.', 'error');
        event.preventDefault();
    });

    console.log('[ErrorHandler] Global error handler initialized');
}

// ============================================================
// SAFE LOCALSTORAGE WRAPPER
// ============================================================

/**
 * Safely get a value from localStorage
 * Handles private browsing mode and quota errors
 * @param {string} key - Storage key
 * @param {*} fallback - Value to return if storage fails
 * @returns {string|null|*} Stored value or fallback
 */
export function safeGetItem(key, fallback = null) {
    try {
        const value = localStorage.getItem(key);
        return value !== null ? value : fallback;
    } catch (e) {
        console.warn('[Storage] Failed to read:', key, e.message);
        return fallback;
    }
}

/**
 * Safely set a value in localStorage
 * Handles private browsing mode and quota errors
 * @param {string} key - Storage key
 * @param {string} value - Value to store
 * @returns {boolean} Whether the operation succeeded
 */
export function safeSetItem(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (e) {
        console.warn('[Storage] Failed to write:', key, e.message);
        // Notify user only for quota errors (likely to affect them)
        if (e.name === 'QuotaExceededError') {
            showToast('Storage is full. Some changes may not be saved.', 'warning');
        }
        return false;
    }
}

/**
 * Safely remove a value from localStorage
 * @param {string} key - Storage key
 * @returns {boolean} Whether the operation succeeded
 */
export function safeRemoveItem(key) {
    try {
        localStorage.removeItem(key);
        return true;
    } catch (e) {
        console.warn('[Storage] Failed to remove:', key, e.message);
        return false;
    }
}

// ============================================================
// SAFE ASYNC WRAPPER WITH RETRY
// ============================================================

/**
 * Wrap an async function with retry logic and error handling
 * @param {Function} asyncFn - Async function to wrap
 * @param {Object} options - Configuration options
 * @param {number} options.maxRetries - Maximum retry attempts (default 3)
 * @param {number} options.baseDelay - Base delay in ms for exponential backoff (default 1000)
 * @param {string} options.errorMessage - User-facing error message
 * @param {boolean} options.showErrorToast - Whether to show error toast on failure (default true)
 * @returns {Promise<{success: boolean, data?: *, error?: Error}>}
 */
export async function safeAsync(asyncFn, options = {}) {
    const {
        maxRetries = 3,
        baseDelay = 1000,
        errorMessage = 'Operation failed. Please try again.',
        showErrorToast = true
    } = options;

    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const data = await asyncFn();
            return { success: true, data };
        } catch (error) {
            lastError = error;
            console.warn(`[SafeAsync] Attempt ${attempt}/${maxRetries} failed:`, error.message);

            if (attempt < maxRetries) {
                // Exponential backoff with jitter
                const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 500;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    console.error('[SafeAsync] All retries exhausted:', lastError);

    if (showErrorToast) {
        showToast(errorMessage, 'error');
    }

    return { success: false, error: lastError };
}

// ============================================================
// LOADING STATE MANAGEMENT
// ============================================================

const loadingElements = new Set();

/**
 * Show a loading indicator on an element
 * @param {HTMLElement} element - Element to show loading on
 * @param {string} loadingText - Optional loading text
 */
export function showLoading(element, loadingText = '') {
    if (!element) return;

    element.classList.add('is-loading');
    element.setAttribute('aria-busy', 'true');

    if (loadingText) {
        element.dataset.originalText = element.textContent;
        element.textContent = loadingText;
    }

    loadingElements.add(element);
}

/**
 * Hide the loading indicator on an element
 * @param {HTMLElement} element - Element to hide loading on
 */
export function hideLoading(element) {
    if (!element) return;

    element.classList.remove('is-loading');
    element.removeAttribute('aria-busy');

    if (element.dataset.originalText) {
        element.textContent = element.dataset.originalText;
        delete element.dataset.originalText;
    }

    loadingElements.delete(element);
}

/**
 * Check if any loading operations are in progress
 * @returns {boolean}
 */
export function isAnyLoading() {
    return loadingElements.size > 0;
}

// ============================================================
// DEBOUNCE UTILITY
// ============================================================

/**
 * Debounce a function to prevent rapid-fire calls
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in ms
 * @returns {Function} Debounced function
 */
export function debounce(fn, delay = 300) {
    let timeoutId = null;

    return function debounced(...args) {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            fn.apply(this, args);
            timeoutId = null;
        }, delay);
    };
}

/**
 * Throttle a function to limit call frequency
 * @param {Function} fn - Function to throttle
 * @param {number} limit - Minimum time between calls in ms
 * @returns {Function} Throttled function
 */
export function throttle(fn, limit = 300) {
    let lastCall = 0;
    let timeoutId = null;

    return function throttled(...args) {
        const now = Date.now();
        const remaining = limit - (now - lastCall);

        if (remaining <= 0) {
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            lastCall = now;
            fn.apply(this, args);
        } else if (!timeoutId) {
            timeoutId = setTimeout(() => {
                lastCall = Date.now();
                timeoutId = null;
                fn.apply(this, args);
            }, remaining);
        }
    };
}
