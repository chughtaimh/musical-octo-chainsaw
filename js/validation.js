/**
 * validation.js
 * Input validation, sanitization, and DOM validation utilities
 */

// ============================================================
// CONSTANTS
// ============================================================

const VALID_USERS = new Set(['Moe', 'Trish']);
const VALID_DRINK_TYPES = new Set(['beer', 'wine', 'cocktail', 'other']);

// Critical DOM element IDs that must exist for the app to function
const CRITICAL_DOM_IDS = [
    'view-login',
    'view-tracker',
    'view-analytics',
    'btn-login',
    'pass-input',
    'c-moe',
    'c-trish',
    'main-nav',
    'tab-tracker',
    'tab-analytics'
];

// Warning-level DOM element IDs (app works but features may be broken)
const WARNING_DOM_IDS = [
    'btn-settings',
    'settings-modal',
    'profile-modal',
    'drinktype-modal',
    'adjusttoday-modal',
    'query-input',
    'query-submit',
    'query-text'
];

// ============================================================
// DOM VALIDATION
// ============================================================

/**
 * Validate that all critical DOM elements exist
 * @returns {{valid: boolean, missing: string[], warnings: string[]}}
 */
export function validateDOM() {
    const missing = [];
    const warnings = [];

    for (const id of CRITICAL_DOM_IDS) {
        if (!document.getElementById(id)) {
            missing.push(id);
        }
    }

    for (const id of WARNING_DOM_IDS) {
        if (!document.getElementById(id)) {
            warnings.push(id);
        }
    }

    if (missing.length > 0) {
        console.error('[Validation] Missing critical DOM elements:', missing);
    }

    if (warnings.length > 0) {
        console.warn('[Validation] Missing optional DOM elements:', warnings);
    }

    return {
        valid: missing.length === 0,
        missing,
        warnings
    };
}

/**
 * Safely get a DOM element by ID with null check
 * @param {string} id - Element ID
 * @param {boolean} required - If true, logs error when element not found
 * @returns {HTMLElement|null}
 */
export function safeGetElement(id, required = false) {
    const element = document.getElementById(id);
    if (!element && required) {
        console.error(`[Validation] Required element not found: #${id}`);
    }
    return element;
}

/**
 * Safely query select with error logging
 * @param {string} selector - CSS selector
 * @param {Element} context - Parent element (default: document)
 * @returns {Element|null}
 */
export function safeQuerySelector(selector, context = document) {
    try {
        return context.querySelector(selector);
    } catch (e) {
        console.error('[Validation] Invalid selector:', selector, e.message);
        return null;
    }
}

// ============================================================
// INPUT SANITIZATION
// ============================================================

/**
 * Sanitize a string to prevent XSS attacks
 * Escapes HTML entities
 * @param {string} input - String to sanitize
 * @returns {string} Sanitized string
 */
export function sanitizeHtml(input) {
    if (typeof input !== 'string') {
        return String(input ?? '');
    }

    const escapeMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '/': '&#x2F;',
        '`': '&#x60;'
    };

    return input.replace(/[&<>"'\/`]/g, char => escapeMap[char]);
}

/**
 * Sanitize input for display in DOM (creates text node)
 * This is the safest method - use when inserting user content
 * @param {string} input - String to display
 * @returns {Text} Text node safe for insertion
 */
export function safeTextNode(input) {
    return document.createTextNode(String(input ?? ''));
}

/**
 * Strip all HTML tags from a string
 * Use for cleaning up input before processing
 * @param {string} input - String to clean
 * @returns {string} String with HTML tags removed
 */
export function stripHtml(input) {
    if (typeof input !== 'string') {
        return String(input ?? '');
    }
    return input.replace(/<[^>]*>/g, '');
}

/**
 * Normalize whitespace in a string
 * @param {string} input - String to normalize
 * @returns {string} String with normalized whitespace
 */
export function normalizeWhitespace(input) {
    if (typeof input !== 'string') {
        return String(input ?? '');
    }
    return input.replace(/\s+/g, ' ').trim();
}

// ============================================================
// NUMBER VALIDATION
// ============================================================

/**
 * Safely parse an integer with bounds checking
 * @param {*} value - Value to parse
 * @param {number} fallback - Fallback value if parsing fails
 * @param {Object} bounds - Optional min/max bounds
 * @param {number} bounds.min - Minimum value
 * @param {number} bounds.max - Maximum value
 * @returns {number} Parsed integer or fallback
 */
export function safeParseInt(value, fallback = 0, bounds = {}) {
    const parsed = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);

    if (!Number.isFinite(parsed) || isNaN(parsed)) {
        return fallback;
    }

    let result = parsed;

    if (typeof bounds.min === 'number' && result < bounds.min) {
        result = bounds.min;
    }

    if (typeof bounds.max === 'number' && result > bounds.max) {
        result = bounds.max;
    }

    return result;
}

/**
 * Safely parse a float with bounds checking
 * @param {*} value - Value to parse
 * @param {number} fallback - Fallback value if parsing fails
 * @param {Object} bounds - Optional min/max bounds
 * @returns {number} Parsed float or fallback
 */
export function safeParseFloat(value, fallback = 0, bounds = {}) {
    const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? ''));

    if (!Number.isFinite(parsed) || isNaN(parsed)) {
        return fallback;
    }

    let result = parsed;

    if (typeof bounds.min === 'number' && result < bounds.min) {
        result = bounds.min;
    }

    if (typeof bounds.max === 'number' && result > bounds.max) {
        result = bounds.max;
    }

    return result;
}

// ============================================================
// USER & DRINK TYPE VALIDATION
// ============================================================

/**
 * Validate and normalize a user name
 * @param {string} user - User name to validate
 * @returns {{valid: boolean, user: string|null}}
 */
export function validateUser(user) {
    if (typeof user !== 'string') {
        return { valid: false, user: null };
    }

    // Normalize case for comparison
    const normalized = user.charAt(0).toUpperCase() + user.slice(1).toLowerCase();

    if (VALID_USERS.has(normalized)) {
        return { valid: true, user: normalized };
    }

    return { valid: false, user: null };
}

/**
 * Check if a user is valid
 * @param {string} user - User to check
 * @returns {boolean}
 */
export function isValidUser(user) {
    return validateUser(user).valid;
}

/**
 * Validate and normalize a drink type
 * @param {string} type - Drink type to validate
 * @returns {string} Valid drink type (defaults to 'other')
 */
export function validateDrinkType(type) {
    if (typeof type !== 'string') {
        return 'other';
    }

    const normalized = type.trim().toLowerCase();
    return VALID_DRINK_TYPES.has(normalized) ? normalized : 'other';
}

/**
 * Check if a drink type is valid
 * @param {string} type - Drink type to check
 * @returns {boolean}
 */
export function isValidDrinkType(type) {
    if (typeof type !== 'string') return false;
    return VALID_DRINK_TYPES.has(type.trim().toLowerCase());
}

// ============================================================
// DATE VALIDATION
// ============================================================

/**
 * Validate a timestamp is a reasonable date
 * @param {number} ts - Timestamp to validate
 * @returns {boolean}
 */
export function isValidTimestamp(ts) {
    if (typeof ts !== 'number' || !Number.isFinite(ts)) {
        return false;
    }

    // Reasonable range: 2020 to 2100
    const minTs = new Date('2020-01-01').getTime();
    const maxTs = new Date('2100-01-01').getTime();

    return ts >= minTs && ts <= maxTs;
}

/**
 * Validate a day key format (YYYY-MM-DD)
 * @param {string} dayKey - Day key to validate
 * @returns {boolean}
 */
export function isValidDayKey(dayKey) {
    if (typeof dayKey !== 'string') return false;

    const match = dayKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return false;

    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);

    // Basic range validation
    if (year < 2020 || year > 2100) return false;
    if (month < 1 || month > 12) return false;
    if (day < 1 || day > 31) return false;

    return true;
}

// ============================================================
// QUERY INPUT VALIDATION
// ============================================================

/**
 * Validate and sanitize a query string
 * @param {string} query - Query to validate
 * @returns {{valid: boolean, query: string, error?: string}}
 */
export function validateQuery(query) {
    if (typeof query !== 'string') {
        return { valid: false, query: '', error: 'Query must be a string' };
    }

    // Strip HTML and normalize whitespace
    let cleaned = stripHtml(query);
    cleaned = normalizeWhitespace(cleaned);

    // Check length
    if (cleaned.length === 0) {
        return { valid: false, query: '', error: 'Query is empty' };
    }

    if (cleaned.length > 500) {
        return { valid: false, query: '', error: 'Query is too long' };
    }

    return { valid: true, query: cleaned };
}
