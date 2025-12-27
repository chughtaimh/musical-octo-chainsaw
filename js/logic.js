import { DAY_MS, DOW_FULL, DOW_SHORT, DOW_ALIASES, monthMap, numberWords } from "./constants.js";
import {
    safeInt, normalizeDrinkType, startOfDayLocal, startOfWeekMonday, nyDayKeyFromTs,
    addDaysToDayKey, labelForDay, labelForWeek, labelForMonth, normalizeQuery, currentWeekKey,
    monthNameFromIndex, plural, fmtDate
} from "./utils.js";

export function rebuildEventsCache(allHistory) {
    const out = [];
    for (const entry of Object.values(allHistory || {})) {
        if (!entry) continue;

        const u = entry.user;
        const ts = safeInt(entry.timestamp, NaN);
        if (typeof u !== "string" || !Number.isFinite(ts) || isNaN(ts)) continue;

        let v = 1;
        const rawV = entry.value;
        if (typeof rawV === "number" && Number.isFinite(rawV)) v = rawV;
        else if (typeof rawV === "string" && rawV.trim() !== "" && Number.isFinite(Number(rawV))) v = Number(rawV);
        else v = 1;

        v = Math.trunc(v);
        if (v === 0) continue;
        if (v !== 1 && v !== -1) v = v < 0 ? -1 : 1;

        const drinkType = normalizeDrinkType(entry.drinkType || "other");

        const dayStart = startOfDayLocal(ts);
        const dow = new Date(dayStart).getDay();
        out.push({ user: u, ts, v, dayStart, dow, drinkType });
    }
    out.sort((a, b) => a.ts - b.ts);
    return out;
}

export function buildNYUserDayNet(user, eventsCache) {
    const net = new Map();
    let minKey = null;

    for (const e of eventsCache) {
        if (!e) continue;
        if (e.user !== user) continue;

        const k = nyDayKeyFromTs(e.ts);
        if (!k) continue;

        const next = (net.get(k) || 0) + (safeInt(e.v, 0) || 0);
        net.set(k, next);

        if (!minKey || k < minKey) minKey = k;
    }

    for (const [k, v] of net.entries()) net.set(k, Math.max(0, v));
    return { net, minKey };
}

export function getZeroStreakDays(user, eventsCache) {
    const todayKey = nyDayKeyFromTs(Date.now());
    if (!todayKey) return 0;

    const { net, minKey } = buildNYUserDayNet(user, eventsCache);

    if (!minKey) return 1;

    let streak = 0;
    let k = todayKey;

    const MAX_LOOKBACK_DAYS = 3660;
    for (let i = 0; i < MAX_LOOKBACK_DAYS; i++) {
        const v = Math.max(0, net.get(k) || 0);
        if (v > 0) break;

        streak += 1;

        if (k === minKey) break;
        k = addDaysToDayKey(k, -1);
    }

    return streak;
}

export function getWeekProgress(user, weeklyPlan, eventsCache, which = "this") {
    const base = currentWeekKey(Date.now());
    if (!base) return null;

    const weekStartKey = (which === "last") ? addDaysToDayKey(base, -7) : base;
    const plan = weeklyPlan;

    const { net } = buildNYUserDayNet(user, eventsCache);

    const dailyKeys = [];
    const daily = [];
    let total = 0;

    let k = weekStartKey;
    for (let i = 0; i < 7; i++) {
        dailyKeys.push(k);
        const v = Math.max(0, net.get(k) || 0);
        daily.push(v);
        total += v;
        k = addDaysToDayKey(k, 1);
    }

    const over = Math.max(0, total - plan);
    const remaining = Math.max(0, plan - total);

    return {
        which,
        weekKey: weekStartKey,
        weekStartKey,
        weekEndKey: addDaysToDayKey(weekStartKey, 7),
        total,
        plan,
        over,
        remaining,
        dailyKeys,
        daily
    };
}

export function parseIntent(qLower) {
    const hasStreakWord = /\bstreak\b/.test(qLower);
    const hasZeroSignals =
        /\bzero\s*streak\b/.test(qLower) ||
        /\bdry\s*streak\b/.test(qLower) ||
        /\bsober\s*streak\b/.test(qLower) ||
        /\bno\s*(drink|drinks|drinking)\b.*\bstreak\b/.test(qLower) ||
        /\b(streak)\b.*\b(zero|dry|sober|no drinks?)\b/.test(qLower) ||
        /\bdays?\s+since\s+(i\s+)?(last\s+)?(drink|drank|drinking)\b/.test(qLower) ||
        /\bhow\s+long\s+since\s+(i|we|moe|trish)\b.*\b(drink|drank|drinking)\b/.test(qLower) ||
        /\bdays?\s+without\s+(a\s+)?(drink|drinks)\b/.test(qLower) ||
        /\bzero\s+days?\s+in\s+a\s+row\b/.test(qLower) ||
        /\bcurrent\s+streak\b/.test(qLower) ||
        /\bmy\s+streak\b/.test(qLower);

    const hasWeeklyStreakSignals = /\bweek(ly)?\b.*\bstreak\b/.test(qLower) || /\bstreak\b.*\bweek(ly)?\b/.test(qLower) || /\bplan\b.*\bstreak\b/.test(qLower);

    if ((hasZeroSignals || (hasStreakWord && !hasWeeklyStreakSignals)) && !/\b(longest|best|record)\b/.test(qLower)) {
        return { type: "zero_streak", breakdownMode: null, whoSignals: false };
    }

    const hasPlanSignals =
        /\b(game\s*plan)\b/.test(qLower) ||
        /\b(plan\s*progress)\b/.test(qLower) ||
        /\bweekly\s+(plan|target|limit|max|cap)\b/.test(qLower) ||
        /\b(this|current)\s+week\b.*\b(plan|target|limit|max|cap)\b/.test(qLower) ||
        /\b(plan|target|limit|max|cap)\b.*\b(this|current)\s+week\b/.test(qLower) ||
        /\b(on\s*track|within\s*plan|under\s*plan|over\s*plan)\b/.test(qLower) ||
        /\b(how\s+many|how\s+much)\b.*\b(left|remaining)\b.*\b(this|current)\s+week\b/.test(qLower) ||
        /\b(drinks?)\s+left\b.*\b(this|current)\s+week\b/.test(qLower) ||
        /\bremaining\b.*\b(plan|target|limit|max|cap)\b/.test(qLower);

    if (hasPlanSignals) {
        return { type: "plan_progress", breakdownMode: null, whoSignals: false };
    }

    const wantsCommonDrinkType =
        /\bmost common\b.*\b(drink type|type of drink|drink)\b/.test(qLower) ||
        /\bmost frequent\b.*\b(drink type|type of drink|drink)\b/.test(qLower) ||
        /\bfavorite\b.*\b(drink type|type of drink|drink)\b/.test(qLower) ||
        /\btop\b.*\b(drink type|type of drink|drink)\b/.test(qLower) ||
        /\bcommonest\b.*\b(drink type|type of drink|drink)\b/.test(qLower);

    const wantsDaysCount = /\bhow many days\b|\bnumber of days\b|\bdays did\b/.test(qLower);
    const wantsAvg = /\baverage\b|\bavg\b|\bper day\b|\bdaily average\b/.test(qLower);
    const wantsDiff = /\bdifference\b|\bdiff\b|\bdelta\b|\bby how many\b|\bmargin\b/.test(qLower);
    const wantsBreakdownByDow = /\bday of week\b|\bby day of week\b|\bweekday breakdown\b/.test(qLower);
    const wantsBreakdownByDate = /\bday by day\b|\beach day\b|\bdaily breakdown\b|\bper day\b(?!.*average)/.test(qLower);
    const wantsPeakDay = /\bpeak\b|\bhighest\b|\bmax\b|\bmost in a day\b|\bbiggest day\b|\bwhat day\b.*\bmost\b/.test(qLower);

    const compareSignals =
        /\bvs\b|\bversus\b|\bcompare\b|\bwho (won|wins|had more|drank more)\b|\bmore than\b|\bless than\b|\bbeat\b|\bwinner\b/.test(qLower) ||
        (/\bwho\b/.test(qLower) && /\bmore\b|\bmost\b/.test(qLower));

    const whoSignals = /^\s*who\b/.test(qLower) || /\bwho drank\b|\bwho had\b/.test(qLower);

    let type = "count";
    if (wantsCommonDrinkType) type = "common_type";
    else if (wantsPeakDay) type = "peak_day";
    else if (wantsDaysCount) type = "days_count";
    else if (wantsAvg) type = "average";
    else if (wantsDiff) type = "difference";
    else if (compareSignals) type = "comparison";
    else if (wantsBreakdownByDow || wantsBreakdownByDate) type = "breakdown";

    const breakdownMode = wantsBreakdownByDow ? "dow" : (wantsBreakdownByDate ? "date" : null);

    return { type, breakdownMode, whoSignals };
}

export function parseUsers(qLower, intent, selectedUser) {
    const explicitMoe = /\bmoe\b/.test(qLower);
    const explicitTrish = /\btrish\b/.test(qLower);

    const meSignals = /\b(me|my|mine|i|im|i'm|ive|i've)\b/.test(qLower);

    let hasMoe = explicitMoe;
    let hasTrish = explicitTrish;

    if (meSignals) {
        if (selectedUser === "Moe") hasMoe = true;
        else if (selectedUser === "Trish") hasTrish = true;
        else hasMoe = true;
    }

    const bothSignals = /\b(both|all|together|us|we|everyone)\b/.test(qLower) || (hasMoe && hasTrish);

    if ((intent?.type === "zero_streak" || intent?.type === "plan_progress") && !bothSignals && !explicitMoe && !explicitTrish) {
        if (selectedUser) return { users: [selectedUser], mode: "single" };
    }

    if (bothSignals) return { users: ["Moe", "Trish"], mode: "both" };
    if (hasMoe) return { users: ["Moe"], mode: "single" };
    if (hasTrish) return { users: ["Trish"], mode: "single" };

    if (intent?.type === "common_type" && selectedUser) return { users: [selectedUser], mode: "single" };

    if (intent?.whoSignals) return { users: ["Moe", "Trish"], mode: "who" };
    return { users: ["Moe", "Trish"], mode: "both" };
}

function expandDowRange(d1, d2) {
    const order = [1, 2, 3, 4, 5, 6, 0];
    const i1 = order.indexOf(d1);
    const i2 = order.indexOf(d2);
    if (i1 === -1 || i2 === -1) return null;

    const out = [];
    if (i2 >= i1) {
        for (let i = i1; i <= i2; i++) out.push(order[i]);
    } else {
        for (let i = i1; i < order.length; i++) out.push(order[i]);
        for (let i = 0; i <= i2; i++) out.push(order[i]);
    }
    return out;
}

export function parseDayFilter(qLower) {
    if (/\bweekends?\b/.test(qLower) || /\bweek end(s)?\b/.test(qLower)) {
        return { days: [6, 0], label: "weekends" };
    }
    if (/\bweekdays?\b/.test(qLower)) {
        return { days: [1, 2, 3, 4, 5], label: "weekdays" };
    }

    const rangeMatch = qLower.match(/\b(mon(?:day)?|tue(?:s|sday|sday)?|tues(?:day)?|wed(?:s|nesday)?|thu(?:r|rs|rsday|rsday)?|thurs(?:day)?|thur(?:sday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b\s*(?:-|to|thru|through)\s*\b(mon(?:day)?|tue(?:s|sday|sday)?|tues(?:day)?|wed(?:s|nesday)?|thu(?:r|rs|rsday|rsday)?|thurs(?:day)?|thur(?:sday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/);
    if (rangeMatch) {
        const a = rangeMatch[1].replace(/sday|nesday|rsday|urday/g, "");
        const b = rangeMatch[2].replace(/sday|nesday|rsday|urday/g, "");
        const d1 = DOW_ALIASES[a] ?? null;
        const d2 = DOW_ALIASES[b] ?? null;
        const days = (d1 !== null && d2 !== null) ? expandDowRange(d1, d2) : null;
        if (days && days.length) return { days, label: `${DOW_SHORT[d1]}-${DOW_SHORT[d2]}` };
    }

    const pluralMatch = qLower.match(/\b(sundays|mondays|tuesdays|wednesdays|thursdays|fridays|saturdays)\b/);
    if (pluralMatch) {
        const token = pluralMatch[1].slice(0, -1);
        const dow = DOW_ALIASES[token] ?? null;
        if (dow !== null) return { days: [dow], label: pluralMatch[1] };
    }

    return null;
}

function inferYearForMonthDay(monthIdx, day, now, opts = {}) {
    const nowY = now.getFullYear();
    const todayStart = startOfDayLocal(now);

    const hasNext = !!opts.hasNext;
    const hasThis = !!opts.hasThis;

    let y = nowY;
    let candidate = new Date(y, monthIdx, day, 0, 0, 0, 0).getTime();

    if (hasNext) {
        if (candidate <= todayStart) y = nowY + 1;
        return y;
    }

    if (hasThis) return nowY;

    if (candidate > todayStart) y = nowY - 1;
    return y;
}

function parseDateStringToDayStart(dateStr, now, qLower) {
    const s = String(dateStr || "").trim().toLowerCase();
    const hasNext = /\bnext\b/.test(qLower);
    const hasThis = /\bthis\b/.test(qLower) || /\bcurrent\b/.test(qLower);

    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) {
        const y = parseInt(m[1], 10);
        const mo = parseInt(m[2], 10) - 1;
        const d = parseInt(m[3], 10);
        const dt = new Date(y, mo, d, 0, 0, 0, 0);
        return isNaN(dt.getTime()) ? null : dt.getTime();
    }

    m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
    if (m) {
        const mo = parseInt(m[1], 10) - 1;
        const d = parseInt(m[2], 10);
        let y;
        if (m[3]) {
            y = parseInt(m[3], 10);
            if (y < 100) y = 2000 + y;
        } else {
            y = inferYearForMonthDay(mo, d, now, { hasNext, hasThis });
        }
        const dt = new Date(y, mo, d, 0, 0, 0, 0);
        return isNaN(dt.getTime()) ? null : dt.getTime();
    }

    m = s.match(/^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?$/);
    if (m) {
        const monthToken = m[1];
        const mo = monthMap[monthToken] ?? null;
        if (mo === null) return null;
        const d = parseInt(m[2], 10);
        const y = m[3] ? parseInt(m[3], 10) : inferYearForMonthDay(mo, d, now, { hasNext, hasThis });
        const dt = new Date(y, mo, d, 0, 0, 0, 0);
        return isNaN(dt.getTime()) ? null : dt.getTime();
    }

    m = s.match(/^(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s*,?\s*(\d{4}))?$/);
    if (m) {
        const d = parseInt(m[1], 10);
        const monthToken = m[2];
        const mo = monthMap[monthToken] ?? null;
        if (mo === null) return null;
        const y = m[3] ? parseInt(m[3], 10) : inferYearForMonthDay(mo, d, now, { hasNext, hasThis });
        const dt = new Date(y, mo, d, 0, 0, 0, 0);
        return isNaN(dt.getTime()) ? null : dt.getTime();
    }

    return null;
}

function extractDateTokens(qLower, now) {
    const tokens = [];

    function addToken(text, idx) {
        const dayStart = parseDateStringToDayStart(text, now, qLower);
        if (dayStart === null) return;
        tokens.push({ text, idx, len: text.length, dayStart });
    }

    for (const match of qLower.matchAll(/\b(19\d{2}|20\d{2})-(\d{1,2})-(\d{1,2})\b/g)) addToken(match[0], match.index ?? 0);
    for (const match of qLower.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g)) addToken(match[0], match.index ?? 0);
    for (const match of qLower.matchAll(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?\b/g)) addToken(match[0], match.index ?? 0);
    for (const match of qLower.matchAll(/\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s*,?\s*(\d{4}))?\b/g)) addToken(match[0], match.index ?? 0);

    const seen = new Set();
    const deduped = [];
    for (const t of tokens.sort((a, b) => a.idx - b.idx)) {
        const k = `${t.idx}:${t.len}:${t.dayStart}`;
        if (seen.has(k)) continue;
        seen.add(k);
        deduped.push(t);
    }
    return deduped;
}

function parseMonthRange(qLower, now) {
    let monthIdx = null;

    for (const [token, idx] of Object.entries(monthMap)) {
        const re = new RegExp("\\b" + token + "\\b", "i");

        if (token === "may") {
            const ok = /\bin may\b/.test(qLower) || /\bmay\s+\d{4}\b/.test(qLower) || /\bmay\s+\d{1,2}\b/.test(qLower);
            if (!ok) continue;
        }

        if (re.test(qLower)) { monthIdx = idx; break; }
    }

    if (monthIdx === null) return null;

    const yearMatch = qLower.match(/\b(19\d{2}|20\d{2})\b/);
    const nowY = now.getFullYear();
    const nowM = now.getMonth();
    const hasNext = /\bnext\b/.test(qLower);
    const hasLast = /\blast\b|\bprevious\b/.test(qLower);
    const hasThis = /\bthis\b|\bcurrent\b/.test(qLower);

    let year;
    if (yearMatch) {
        year = parseInt(yearMatch[1], 10);
    } else if (hasNext) {
        year = (monthIdx <= nowM) ? nowY + 1 : nowY;
    } else if (hasLast) {
        year = (monthIdx >= nowM) ? nowY - 1 : nowY;
    } else if (hasThis) {
        year = nowY;
    } else {
        year = (monthIdx > nowM) ? nowY - 1 : nowY;
    }

    const start = new Date(year, monthIdx, 1, 0, 0, 0, 0).getTime();
    const end = new Date(year, monthIdx + 1, 1, 0, 0, 0, 0).getTime();
    return { startMs: start, endMs: end, label: `${monthNameFromIndex(monthIdx)} ${year}` };
}

function parseNamedRange(qLower, now, ctx) {
    const nowMs = now.getTime();
    const todayStart = startOfDayLocal(now);

    if (/\btoday\b/.test(qLower)) return { startMs: todayStart, endMs: nowMs, label: "today" };
    if (/\byesterday\b/.test(qLower)) return { startMs: todayStart - DAY_MS, endMs: todayStart, label: "yesterday" };

    if (/\bthis week\b/.test(qLower)) return { startMs: startOfWeekMonday(now), endMs: nowMs, label: "this week" };

    if (/\b(calendar last week|previous week|last calendar week)\b/.test(qLower)) {
        const startThis = startOfWeekMonday(now);
        return { startMs: startThis - 7 * DAY_MS, endMs: startThis, label: "last week (Mon-Sun)" };
    }

    if (/\blast week\b/.test(qLower)) {
        if (ctx?.preferCalendarLastWeek) {
            const startThis = startOfWeekMonday(now);
            return { startMs: startThis - 7 * DAY_MS, endMs: startThis, label: "last week (Mon-Sun)" };
        }
        return { startMs: todayStart - 6 * DAY_MS, endMs: nowMs, label: "last week (past 7 days)" };
    }

    if (/\bthis month\b/.test(qLower)) {
        const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();
        return { startMs: start, endMs: nowMs, label: "this month" };
    }
    if (/\blast month\b/.test(qLower)) {
        const startThis = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();
        const startPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0).getTime();
        return { startMs: startPrev, endMs: startThis, label: "last month" };
    }

    if (/\bthis year\b/.test(qLower) || /\bcurrent year\b/.test(qLower) || /\bytd\b/.test(qLower)) {
        const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0).getTime();
        return { startMs: start, endMs: nowMs, label: "this year" };
    }
    if (/\blast year\b|\bprevious year\b/.test(qLower)) {
        const startThis = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0).getTime();
        const startPrev = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0).getTime();
        return { startMs: startPrev, endMs: startThis, label: "last year" };
    }

    if (/\blast weekend\b/.test(qLower)) {
        const weekStart = startOfWeekMonday(now);
        const satThisWeek = weekStart + 5 * DAY_MS;
        const satLastWeek = satThisWeek - 7 * DAY_MS;
        const end = satLastWeek + 2 * DAY_MS;
        return { startMs: satLastWeek, endMs: end, label: "last weekend" };
    }
    if (/\bthis weekend\b/.test(qLower)) {
        const weekStart = startOfWeekMonday(now);
        const satThisWeek = weekStart + 5 * DAY_MS;
        const end = satThisWeek + 2 * DAY_MS;
        return { startMs: satThisWeek, endMs: Math.min(end, nowMs), label: "this weekend" };
    }

    const wd = qLower.match(/\b(last|this|next)\s+(sun(?:day)?|mon(?:day)?|tue(?:s|sday|sday)?|tues(?:day)?|wed(?:s|nesday)?|thu(?:r|rs|rsday|rsday)?|thurs(?:day)?|thur(?:sday)?|fri(?:day)?|sat(?:urday)?)\b/);
    if (wd) {
        const mod = wd[1];
        const raw = wd[2].replace(/sday|nesday|rsday|urday/g, "");
        const target = DOW_ALIASES[raw];
        if (target === undefined || target === null) return null;

        const todayDow = new Date(todayStart).getDay();

        if (mod === "last") {
            let diff = (todayDow - target + 7) % 7;
            if (diff === 0) diff = 7;
            const dayStart = todayStart - diff * DAY_MS;
            return { startMs: dayStart, endMs: dayStart + DAY_MS, label: `last ${DOW_FULL[target]}` };
        }

        const weekStart = startOfWeekMonday(now);
        const offset = (target + 6) % 7;
        const dayStart = weekStart + offset * DAY_MS;

        if (mod === "this") return { startMs: dayStart, endMs: dayStart + DAY_MS, label: `this ${DOW_FULL[target]}` };
        return { startMs: dayStart + 7 * DAY_MS, endMs: dayStart + 8 * DAY_MS, label: `next ${DOW_FULL[target]}` };
    }

    const onWd = qLower.match(/\bon\s+(sun(?:day)?|mon(?:day)?|tue(?:s|sday|sday)?|tues(?:day)?|wed(?:s|nesday)?|thu(?:r|rs|rsday|rsday)?|thurs(?:day)?|thur(?:sday)?|fri(?:day)?|sat(?:urday)?)\b/);
    if (onWd) {
        const raw = onWd[1].replace(/sday|nesday|rsday|urday/g, "");
        const target = DOW_ALIASES[raw];
        const todayDow = new Date(todayStart).getDay();
        const diff = (todayDow - target + 7) % 7;
        const dayStart = todayStart - diff * DAY_MS;
        return { startMs: dayStart, endMs: dayStart + DAY_MS, label: `on ${DOW_FULL[target]}` };
    }

    return null;
}

function parseNumericRelative(qLower, now) {
    const nowMs = now.getTime();
    const todayStart = startOfDayLocal(now);

    const days = qLower.match(/\b(past|last)\s+(\d{1,3}|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+days?\b/);
    if (days) {
        const n = /^\d+$/.test(days[2]) ? parseInt(days[2], 10) : (numberWords[days[2]] ?? 1);
        const nn = Math.max(1, n);
        return { startMs: todayStart - (nn - 1) * DAY_MS, endMs: nowMs, label: `past ${nn} ${plural(nn, "day")}` };
    }

    const weeks = qLower.match(/\b(past|last)\s+(\d{1,2}|a|an|one|two|three|four|five|six|seven|eight)\s+weeks?\b/);
    if (weeks) {
        const n = /^\d+$/.test(weeks[2]) ? parseInt(weeks[2], 10) : (numberWords[weeks[2]] ?? 1);
        const nn = Math.max(1, n);
        const daysCount = nn * 7;
        return { startMs: todayStart - (daysCount - 1) * DAY_MS, endMs: nowMs, label: `past ${nn} ${plural(nn, "week")}` };
    }

    const months = qLower.match(/\b(past|last)\s+(\d{1,2}|a|an|one|two|three|four|five|six)\s+months?\b/);
    if (months) {
        const n = /^\d+$/.test(months[2]) ? parseInt(months[2], 10) : (numberWords[months[2]] ?? 1);
        const nn = Math.max(1, n);
        const daysCount = nn * 30;
        return { startMs: todayStart - (daysCount - 1) * DAY_MS, endMs: nowMs, label: `past ${nn} ${plural(nn, "month")}` };
    }

    const nDays = qLower.match(/\blast\s+(7|30)\s+days?\b/);
    if (nDays) {
        const nn = parseInt(nDays[1], 10);
        return { startMs: todayStart - (nn - 1) * DAY_MS, endMs: nowMs, label: `past ${nn} days` };
    }

    return null;
}

export function resolveTimeRange(rawQ, now, ctx) {
    const qLower = normalizeQuery(rawQ);
    const nowMs = now.getTime();
    const todayStart = startOfDayLocal(now);

    const dayFilter = parseDayFilter(qLower);
    const dateTokens = extractDateTokens(qLower, now);

    if (/\bsince\b/.test(qLower) && dateTokens.length >= 1) {
        const sinceIdx = qLower.indexOf("since");
        const t = dateTokens.find(x => x.idx >= sinceIdx) || dateTokens[0];
        return { startMs: t.dayStart, endMs: nowMs, label: `since ${fmtDate(t.dayStart)}` };
    }

    if (/\bon\b/.test(qLower) && dateTokens.length >= 1) {
        const onIdx = qLower.indexOf("on");
        const t = dateTokens.find(x => x.idx >= onIdx) || dateTokens[0];
        return { startMs: t.dayStart, endMs: t.dayStart + DAY_MS, label: `on ${fmtDate(t.dayStart)}` };
    }

    if (/\bbetween\b/.test(qLower) && dateTokens.length >= 2) {
        const betweenIdx = qLower.indexOf("between");
        const andIdx = qLower.indexOf(" and ", betweenIdx);
        const t1 = dateTokens.find(x => x.idx >= betweenIdx) || dateTokens[0];
        const t2 = (andIdx >= 0 ? dateTokens.find(x => x.idx >= andIdx) : null) || dateTokens[1];
        const start = Math.min(t1.dayStart, t2.dayStart);
        const end = Math.max(t1.dayStart, t2.dayStart) + DAY_MS;
        return { startMs: start, endMs: end, label: `between ${fmtDate(start)} and ${fmtDate(end - DAY_MS)}` };
    }

    if (/\bfrom\b/.test(qLower) && dateTokens.length >= 2) {
        const fromIdx = qLower.indexOf("from");
        const toIdx = qLower.indexOf(" to ", fromIdx);
        const t1 = dateTokens.find(x => x.idx >= fromIdx) || dateTokens[0];
        const t2 = (toIdx >= 0 ? dateTokens.find(x => x.idx >= toIdx) : null) || dateTokens[1];
        const start = Math.min(t1.dayStart, t2.dayStart);
        const end = Math.max(t1.dayStart, t2.dayStart) + DAY_MS;
        return { startMs: start, endMs: end, label: `${fmtDate(start)} to ${fmtDate(end - DAY_MS)}` };
    }

    if (dateTokens.length >= 2) {
        for (let i = 0; i < dateTokens.length - 1; i++) {
            const a = dateTokens[i];
            const b = dateTokens[i + 1];
            const mid = qLower.slice(a.idx + a.len, b.idx).trim();

            const isDashRange = mid === "-" || mid === "\u2013" || mid === "\u2014";
            const isToRange = mid === "to" || mid === "thru" || mid === "through" || mid === "until";

            if (isDashRange || isToRange) {
                const start = Math.min(a.dayStart, b.dayStart);
                const end = Math.max(a.dayStart, b.dayStart) + DAY_MS;
                return { startMs: start, endMs: end, label: `${fmtDate(start)} to ${fmtDate(end - DAY_MS)}` };
            }

            if (/^-$/.test(mid)) {
                const start = Math.min(a.dayStart, b.dayStart);
                const end = Math.max(a.dayStart, b.dayStart) + DAY_MS;
                return { startMs: start, endMs: end, label: `${fmtDate(start)} to ${fmtDate(end - DAY_MS)}` };
            }
        }
    }

    const monthRange = parseMonthRange(qLower, now);
    if (monthRange) return monthRange;

    const named = parseNamedRange(qLower, now, ctx);
    if (named) return named;

    const rel = parseNumericRelative(qLower, now);
    if (rel) return rel;

    if (/\bweek\b/.test(qLower)) return { startMs: todayStart - 6 * DAY_MS, endMs: nowMs, label: "past 7 days" };
    if (/\bmonth\b/.test(qLower)) return { startMs: todayStart - 29 * DAY_MS, endMs: nowMs, label: "past 30 days" };

    if (dayFilter && /\b(this year|last year|this month|last month|this week|last week|past|last|since|between|from|\d{1,2}\/\d{1,2}|20\d{2}-\d{1,2}-\d{1,2})\b/.test(qLower) === false) {
        const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0).getTime();
        return { startMs: start, endMs: nowMs, label: "this year" };
    }

    return null;
}

export function aggregate(users, range, filters, eventsCache) {
    const startMs = range.startMs;
    const endMs = range.endMs;
    const dayFilter = filters?.dayFilter;
    const includePerType = !!filters?.includePerType;

    const sums = {};
    const daySets = {};
    for (const u of users) {
        sums[u] = 0;
        daySets[u] = new Set();
    }

    let total = 0;
    const perDay = new Map();
    const perDow = new Map();

    const perType = includePerType ? new Map() : null;

    const allowedDays = dayFilter?.days ? new Set(dayFilter.days) : null;

    for (const e of eventsCache) {
        if (!e) continue;
        if (e.ts < startMs || e.ts >= endMs) continue;
        if (!sums.hasOwnProperty(e.user)) continue;

        if (allowedDays && !allowedDays.has(e.dow)) continue;

        sums[e.user] += e.v;
        total += e.v;

        daySets[e.user].add(e.dayStart);

        if (!perDay.has(e.dayStart)) perDay.set(e.dayStart, { Moe: 0, Trish: 0, total: 0 });
        const pd = perDay.get(e.dayStart);
        pd[e.user] = (pd[e.user] || 0) + e.v;
        pd.total += e.v;

        if (!perDow.has(e.dow)) perDow.set(e.dow, { Moe: 0, Trish: 0, total: 0 });
        const pw = perDow.get(e.dow);
        pw[e.user] = (pw[e.user] || 0) + e.v;
        pw.total += e.v;

        if (perType) {
            const dt = normalizeDrinkType(e.drinkType || "other");
            if (!perType.has(dt)) perType.set(dt, { Moe: 0, Trish: 0, total: 0 });
            const pt = perType.get(dt);
            pt[e.user] = (pt[e.user] || 0) + e.v;
            pt.total += e.v;
        }
    }

    return { sums, total, perDay, perDow, daySets, perType };
}

export function daysTouchedByRange(range, nowMs) {
    const start = startOfDayLocal(range.startMs);
    const end = startOfDayLocal(Math.max(range.startMs, Math.min(range.endMs, nowMs) - 1)) + DAY_MS;
    return Math.max(1, Math.round((end - start) / DAY_MS));
}

export function calcRangeSpanDays(range) {
    const startDay = startOfDayLocal(range.startMs);
    const endDay = startOfDayLocal(Math.max(range.startMs, range.endMs - 1));
    return Math.max(1, Math.round((endDay - startDay) / DAY_MS) + 1);
}

export function buildTimeBucketsFromPerDay(perDayMap, range) {
    const startDay = startOfDayLocal(range.startMs);
    const endDay = startOfDayLocal(Math.max(range.startMs, range.endMs - 1));
    const spanDays = Math.max(1, Math.round((endDay - startDay) / DAY_MS) + 1);

    let mode = "day";
    if (spanDays > 90) mode = "month";
    else if (spanDays > 30) mode = "week";

    const bucketKeys = [];
    const labels = [];
    const bucketMap = new Map();

    function ensureBucket(key, label) {
        if (!bucketMap.has(key)) bucketMap.set(key, { Moe: 0, Trish: 0, total: 0 });
        bucketKeys.push(key);
        labels.push(label);
    }

    if (mode === "day") {
        for (let t = startDay; t <= endDay; t += DAY_MS) ensureBucket(t, labelForDay(t));
    } else if (mode === "week") {
        let t = startOfWeekMonday(startDay);
        const endW = startOfWeekMonday(endDay);
        for (; t <= endW; t += 7 * DAY_MS) ensureBucket(t, labelForWeek(t));
    } else {
        const s = new Date(startDay);
        s.setDate(1); s.setHours(0, 0, 0, 0);
        const e = new Date(endDay);
        e.setDate(1); e.setHours(0, 0, 0, 0);

        let y = s.getFullYear();
        let m = s.getMonth();
        const endY = e.getFullYear();
        const endM = e.getMonth();

        while (y < endY || (y === endY && m <= endM)) {
            const t = new Date(y, m, 1, 0, 0, 0, 0).getTime();
            ensureBucket(t, labelForMonth(t));
            m += 1;
            if (m > 11) { m = 0; y += 1; }
        }
    }

    for (const [dayStart, rec] of perDayMap.entries()) {
        if (dayStart < startDay || dayStart > endDay) continue;

        let key;
        if (mode === "day") key = dayStart;
        else if (mode === "week") key = startOfWeekMonday(dayStart);
        else {
            const d = new Date(dayStart);
            key = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0).getTime();
        }

        if (!bucketMap.has(key)) continue;
        const b = bucketMap.get(key);
        b.Moe += rec.Moe || 0;
        b.Trish += rec.Trish || 0;
        b.total += rec.total || 0;
    }

    const series = bucketKeys.map(k => bucketMap.get(k) || { Moe: 0, Trish: 0, total: 0 });
    return { mode, labels, series, spanDays };
}

export function getTodayCountsByType(user, eventsCache) {
  // Helpers assumed imported or we re-import if needed...
  // But this is appending to file. Imports are at top.
  // We need startOfDayLocal which is imported at top.
  
  // Implementation
  const todayStart = startOfDayLocal(Date.now());
  const out = { beer: 0, wine: 0, cocktail: 0, other: 0, total: 0 };

  for (const e of eventsCache) {
    if (!e) continue;
    if (e.user !== user) continue;
    if (e.dayStart !== todayStart) continue;

    const dt = normalizeDrinkType(e.drinkType || "other");
    out[dt] += e.v;
    out.total += e.v;
  }

  // Clamp display safety
  out.beer = Math.max(0, out.beer);
  out.wine = Math.max(0, out.wine);
  out.cocktail = Math.max(0, out.cocktail);
  out.other = Math.max(0, out.other);
  out.total = Math.max(0, out.total);

  return out;
}
