/**
 * firebase-ops.js
 * Reliable Firebase operations with retry logic, connection monitoring, and offline queue
 */

import { db, historyRef, weeklyPlansRef, commitmentsRef, push, set, ref, onValue } from "./firebase-config.js";
import { showToast, safeAsync } from "./error-handler.js";

// ============================================================
// CONNECTION STATUS MONITORING
// ============================================================

let isConnected = false;
let connectionListeners = [];

/**
 * Get the current Firebase connection status
 * @returns {boolean}
 */
export function isFirebaseConnected() {
    return isConnected;
}

/**
 * Add a listener for connection status changes
 * @param {Function} callback - Called with (isConnected: boolean)
 * @returns {Function} Unsubscribe function
 */
export function onConnectionChange(callback) {
    connectionListeners.push(callback);
    // Immediately call with current status
    callback(isConnected);

    return () => {
        connectionListeners = connectionListeners.filter(cb => cb !== callback);
    };
}

/**
 * Initialize Firebase connection monitoring
 * Must be called after Firebase is initialized
 */
export function initConnectionMonitor() {
    try {
        const connectedRef = ref(db, '.info/connected');

        onValue(connectedRef, (snapshot) => {
            const wasConnected = isConnected;
            isConnected = snapshot.val() === true;

            if (wasConnected !== isConnected) {
                console.log('[Firebase] Connection status:', isConnected ? 'Connected' : 'Disconnected');

                // Notify listeners
                connectionListeners.forEach(cb => {
                    try {
                        cb(isConnected);
                    } catch (e) {
                        console.error('[Firebase] Connection listener error:', e);
                    }
                });

                // Process offline queue when reconnecting
                if (isConnected && !wasConnected) {
                    processOfflineQueue();
                }
            }
        }, (error) => {
            console.error('[Firebase] Connection monitor error:', error);
            isConnected = false;
        });

        console.log('[Firebase] Connection monitor initialized');
    } catch (error) {
        console.error('[Firebase] Failed to initialize connection monitor:', error);
    }
}

// ============================================================
// OFFLINE QUEUE
// ============================================================

const OFFLINE_QUEUE_KEY = 'firebase_offline_queue';
let isProcessingQueue = false;

/**
 * Get the offline queue from storage
 * @returns {Array}
 */
function getOfflineQueue() {
    try {
        const data = localStorage.getItem(OFFLINE_QUEUE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error('[Firebase] Failed to read offline queue:', e);
        return [];
    }
}

/**
 * Save the offline queue to storage
 * @param {Array} queue
 */
function saveOfflineQueue(queue) {
    try {
        localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    } catch (e) {
        console.error('[Firebase] Failed to save offline queue:', e);
    }
}

/**
 * Add an operation to the offline queue
 * @param {string} type - Operation type ('push' | 'set')
 * @param {string} path - Firebase path
 * @param {Object} data - Data to write
 */
function queueOfflineOperation(type, path, data) {
    const queue = getOfflineQueue();
    queue.push({
        type,
        path,
        data,
        timestamp: Date.now()
    });
    saveOfflineQueue(queue);
    console.log('[Firebase] Queued offline operation:', type, path);
}

/**
 * Process all queued offline operations
 */
async function processOfflineQueue() {
    if (isProcessingQueue) return;

    const queue = getOfflineQueue();
    if (queue.length === 0) return;

    isProcessingQueue = true;
    console.log(`[Firebase] Processing ${queue.length} queued operations...`);

    const failedOps = [];

    for (const op of queue) {
        try {
            if (op.type === 'push') {
                const targetRef = ref(db, op.path);
                await push(targetRef, op.data);
            } else if (op.type === 'set') {
                const targetRef = ref(db, op.path);
                await set(targetRef, op.data);
            }
            console.log('[Firebase] Queued operation succeeded:', op.type, op.path);
        } catch (error) {
            console.error('[Firebase] Queued operation failed:', op.type, op.path, error);
            failedOps.push(op);
        }
    }

    saveOfflineQueue(failedOps);
    isProcessingQueue = false;

    if (failedOps.length > 0) {
        console.warn(`[Firebase] ${failedOps.length} operations still pending`);
    } else if (queue.length > 0) {
        showToast('Synced offline changes successfully!', 'success');
    }
}

// ============================================================
// RELIABLE FIREBASE OPERATIONS
// ============================================================

/**
 * Push data to Firebase with retry logic and offline fallback
 * @param {string} path - Firebase path (e.g., 'history')
 * @param {Object} data - Data to push
 * @param {Object} options - Options
 * @param {boolean} options.showSuccessToast - Show success toast (default false)
 * @param {boolean} options.showErrorToast - Show error toast (default true)
 * @param {number} options.maxRetries - Max retry attempts (default 3)
 * @returns {Promise<{success: boolean, key?: string, error?: Error, queued?: boolean}>}
 */
export async function reliablePush(path, data, options = {}) {
    const {
        showSuccessToast = false,
        showErrorToast = true,
        maxRetries = 3
    } = options;

    // If not connected, queue immediately
    if (!isConnected) {
        queueOfflineOperation('push', path, data);
        if (showErrorToast) {
            showToast('You\'re offline. Changes will sync when connected.', 'warning');
        }
        return { success: false, queued: true };
    }

    const result = await safeAsync(
        async () => {
            const targetRef = ref(db, path);
            const newRef = await push(targetRef, data);
            return newRef.key;
        },
        {
            maxRetries,
            errorMessage: 'Failed to save. Please try again.',
            showErrorToast
        }
    );

    if (result.success) {
        if (showSuccessToast) {
            showToast('Saved successfully!', 'success');
        }
        return { success: true, key: result.data };
    } else {
        // Queue for later if all retries failed
        queueOfflineOperation('push', path, data);
        return { success: false, error: result.error, queued: true };
    }
}

/**
 * Set data at a Firebase path with retry logic and offline fallback
 * @param {string} path - Firebase path (e.g., 'weeklyPlans/Moe')
 * @param {*} data - Data to set
 * @param {Object} options - Options
 * @returns {Promise<{success: boolean, error?: Error, queued?: boolean}>}
 */
export async function reliableSet(path, data, options = {}) {
    const {
        showSuccessToast = false,
        showErrorToast = true,
        maxRetries = 3
    } = options;

    // If not connected, queue immediately
    if (!isConnected) {
        queueOfflineOperation('set', path, data);
        if (showErrorToast) {
            showToast('You\'re offline. Changes will sync when connected.', 'warning');
        }
        return { success: false, queued: true };
    }

    const result = await safeAsync(
        async () => {
            const targetRef = ref(db, path);
            await set(targetRef, data);
        },
        {
            maxRetries,
            errorMessage: 'Failed to save. Please try again.',
            showErrorToast
        }
    );

    if (result.success) {
        if (showSuccessToast) {
            showToast('Saved successfully!', 'success');
        }
        return { success: true };
    } else {
        // Queue for later if all retries failed
        queueOfflineOperation('set', path, data);
        return { success: false, error: result.error, queued: true };
    }
}

/**
 * Wrapper for pushing drink log entries specifically
 * @param {Object} entry - Drink log entry
 * @param {string} entry.user - User name
 * @param {number} entry.timestamp - Timestamp
 * @param {number} entry.value - Delta value (+1 or -1)
 * @param {string} entry.drinkType - Drink type
 * @returns {Promise<{success: boolean, key?: string, queued?: boolean}>}
 */
export async function pushDrinkLog(entry) {
    // Validate entry
    if (!entry || !entry.user || !entry.timestamp || typeof entry.value !== 'number') {
        console.error('[Firebase] Invalid drink log entry:', entry);
        showToast('Invalid drink data. Please try again.', 'error');
        return { success: false };
    }

    return reliablePush('history', entry, {
        showSuccessToast: false,
        showErrorToast: true,
        maxRetries: 3
    });
}

/**
 * Wrapper for setting weekly plan specifically
 * @param {string} user - User name ('Moe' or 'Trish')
 * @param {number} plan - Weekly plan value
 * @returns {Promise<{success: boolean, queued?: boolean}>}
 */
export async function setWeeklyPlan(user, plan) {
    // Validate
    if (!['Moe', 'Trish'].includes(user)) {
        console.error('[Firebase] Invalid user for weekly plan:', user);
        return { success: false };
    }

    if (typeof plan !== 'number' || !Number.isFinite(plan) || plan < 0) {
        console.error('[Firebase] Invalid weekly plan value:', plan);
        return { success: false };
    }

    return reliableSet(`weeklyPlans/${user}`, plan, {
        showSuccessToast: true,
        showErrorToast: true,
        maxRetries: 3
    });
}

// ============================================================
// LOADING STATE HELPERS
// ============================================================

let pendingOperations = 0;
let operationListeners = [];

/**
 * Track the start of a Firebase operation
 */
export function startOperation() {
    pendingOperations++;
    notifyOperationListeners();
}

/**
 * Track the end of a Firebase operation
 */
export function endOperation() {
    pendingOperations = Math.max(0, pendingOperations - 1);
    notifyOperationListeners();
}

/**
 * Check if any Firebase operations are pending
 * @returns {boolean}
 */
export function hasOperationsPending() {
    return pendingOperations > 0;
}

/**
 * Add a listener for operation state changes
 * @param {Function} callback - Called with (hasPending: boolean)
 * @returns {Function} Unsubscribe function
 */
export function onOperationStateChange(callback) {
    operationListeners.push(callback);
    callback(hasOperationsPending());

    return () => {
        operationListeners = operationListeners.filter(cb => cb !== callback);
    };
}

function notifyOperationListeners() {
    const hasPending = hasOperationsPending();
    operationListeners.forEach(cb => {
        try {
            cb(hasPending);
        } catch (e) {
            console.error('[Firebase] Operation listener error:', e);
        }
    });
}

// ============================================================
// INITIALIZATION CHECK
// ============================================================

let firebaseReady = false;

/**
 * Check if Firebase is properly initialized
 * @returns {boolean}
 */
export function isFirebaseReady() {
    return firebaseReady;
}

/**
 * Mark Firebase as ready after successful initialization
 */
export function markFirebaseReady() {
    firebaseReady = true;
    console.log('[Firebase] Marked as ready');
}

/**
 * Wait for Firebase to be ready
 * @param {number} timeout - Timeout in ms (default 10000)
 * @returns {Promise<boolean>}
 */
export function waitForFirebase(timeout = 10000) {
    return new Promise((resolve) => {
        if (firebaseReady) {
            resolve(true);
            return;
        }

        const start = Date.now();
        const check = () => {
            if (firebaseReady) {
                resolve(true);
            } else if (Date.now() - start > timeout) {
                console.warn('[Firebase] Timeout waiting for Firebase');
                resolve(false);
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

/**
 * Wrapper for setting commitment specifically
 * @param {string} user - User name ('Moe' or 'Trish')
 * @param {Object} commitment - Commitment object { why: string, setDate: number }
 * @returns {Promise<{success: boolean, queued?: boolean}>}
 */
export async function setCommitment(user, commitment) {
    if (!['Moe', 'Trish'].includes(user)) {
        console.error('[Firebase] Invalid user for commitment:', user);
        return { success: false };
    }

    if (!commitment || typeof commitment.why !== 'string') {
        console.error('[Firebase] Invalid commitment data:', commitment);
        return { success: false };
    }

    return reliableSet(`commitments/${user}`, commitment, {
        showSuccessToast: true,
        showErrorToast: true,
        maxRetries: 3
    });
}
