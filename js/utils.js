import { monthMap, DAY_MS, VALID_DRINK_TYPES, NY_TZ, NY_DOW_MAP } from "./constants.js";

export const nyYMDFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
});

export const nyWeekdayFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TZ,
    weekday: "short"
});

export function safeInt(n, fallback) {
    const x = (typeof n === "number") ? n : parseInt(String(n ?? ""), 10);
    if (!Number.isFinite(x) || isNaN(x)) return fallback;
    return x;
}

export function normalizeDrinkType(t) {
    const s = String(t || "").trim().toLowerCase();
    return VALID_DRINK_TYPES.has(s) ? s : "other";
}

export function drinkTypeLabel(dt) {
    const t = normalizeDrinkType(dt);
    if (t === "wine") return "🍷 Wine";
    if (t === "beer") return "🍺 Beer";
    if (t === "cocktail") return "🍹 Cocktail";
    return "✨ Other";
}

export function drinkTypeEmoji(dt) {
    const t = normalizeDrinkType(dt);
    if (t === "wine") return "🍷";
    if (t === "beer") return "🍺";
    if (t === "cocktail") return "🍹";
    return "✨";
}

export function cssVar(name, fallback = "") {
    try {
        const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return v || fallback;
    } catch {
        return fallback;
    }
}

export function monthNameFromIndex(idx) {
    const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return names[idx] || "";
}

export function plural(n, word) {
    return Math.abs(n) === 1 ? word : word + "s";
}

export function startOfDayLocal(dOrMs) {
    const x = new Date(dOrMs);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
}

export function startOfWeekMonday(dOrMs) {
    const dayStart = startOfDayLocal(dOrMs);
    const day = new Date(dayStart).getDay();
    const diff = (day + 6) % 7;
    return dayStart - diff * DAY_MS;
}

export function nyDayKeyFromTs(ts) {
    try {
        const parts = nyYMDFormatter.formatToParts(new Date(ts));
        const y = parts.find(p => p.type === "year")?.value;
        const m = parts.find(p => p.type === "month")?.value;
        const d = parts.find(p => p.type === "day")?.value;
        if (!y || !m || !d) return null;
        return `${y}-${m}-${d}`; // YYYY-MM-DD
    } catch {
        return null;
    }
}

export function nyDowFromTs(ts) {
    try {
        const w = nyWeekdayFormatter.format(new Date(ts)); // "Mon"
        return (w && NY_DOW_MAP[w] !== undefined) ? NY_DOW_MAP[w] : null;
    } catch {
        return null;
    }
}

export function dayKeyToUtcNoonMs(dayKey) {
    const m = String(dayKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return NaN;
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    const d = parseInt(m[3], 10);
    return Date.UTC(y, mo, d, 12, 0, 0, 0);
}

export function addDaysToDayKey(dayKey, deltaDays) {
    const noon = dayKeyToUtcNoonMs(dayKey);
    if (!Number.isFinite(noon) || isNaN(noon)) return dayKey;
    const dt = new Date(noon);
    dt.setUTCDate(dt.getUTCDate() + deltaDays);
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const d = String(dt.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

export function fmtDate(ms) {
    try {
        const d = new Date(ms);
        const y = d.getFullYear();
        const m = monthNameFromIndex(d.getMonth()).slice(0, 3);
        const day = d.getDate();
        return `${m} ${day}, ${y}`;
    } catch {
        return "";
    }
}

export function fmtDayKey(dayKey) {
    const ms = dayKeyToUtcNoonMs(dayKey);
    if (!Number.isFinite(ms) || isNaN(ms)) return String(dayKey || "");
    const d = new Date(ms);
    const y = d.getUTCFullYear();
    const m = monthNameFromIndex(d.getUTCMonth()).slice(0, 3);
    const day = d.getUTCDate();
    return `${m} ${day}, ${y}`;
}

export function fmtRange(startMs, endMs, nowMs) {
    const safeEnd = Math.max(startMs, endMs);
    const endForDisplay = (safeEnd === nowMs) ? nowMs : (safeEnd - 1);
    const a = fmtDate(startMs);
    const b = fmtDate(endForDisplay);
    return a === b ? a : `${a} - ${b}`;
}

export function currentWeekKey(nowTs = Date.now()) {
    const todayKey = nyDayKeyFromTs(nowTs);
    const dow = nyDowFromTs(nowTs);
    if (!todayKey || dow === null) return null;
    const diff = (dow + 6) % 7;
    return addDaysToDayKey(todayKey, -diff);
}

export function normalizeQuery(q) {
    return String(q || "")
        .toLowerCase()
        .replace(/[’]/g, "'")
        .replace(/\s+/g, " ")
        .trim();
}

export function labelForDay(dayStartMs) {
    const d = new Date(dayStartMs);
    return `${monthNameFromIndex(d.getMonth()).slice(0, 3)} ${d.getDate()}`;
}

export function labelForWeek(weekStartMs) {
    const d = new Date(weekStartMs);
    return `Week of ${monthNameFromIndex(d.getMonth()).slice(0, 3)} ${d.getDate()}`;
}

export function labelForMonth(monthStartMs) {
    const d = new Date(monthStartMs);
    return `${monthNameFromIndex(d.getMonth()).slice(0, 3)} ${d.getFullYear()}`;
}
