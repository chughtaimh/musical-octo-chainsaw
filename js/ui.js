import { cssVar, normalizeDrinkType, drinkTypeEmoji, drinkTypeLabel, monthNameFromIndex, plural, startOfDayLocal, startOfWeekMonday, labelForDay, labelForWeek, labelForMonth, calcRangeSpanDays } from "./utils.js";
import { state } from "./state.js";
import { aggregate, buildTimeBucketsFromPerDay, getWeekProgress } from "./logic.js";
import { LS, NY_TZ, DOW_SHORT, DAY_MS } from "./constants.js";

// Better to move getWeeklyPlan to logic or state helper.
// Actually getWeeklyPlan reads from state.weeklyPlans. I can just export a helper from state or logic.

// Let's redefine getWeeklyPlan here or import it if I move it.
// I'll move getWeeklyPlan to logic.js or just inline it reading from state.
function getPlanFromState(user) {
    const n = state.weeklyPlans[user];
    if (!Number.isFinite(n) || isNaN(n) || n < 0) return 14;
    return Math.min(99, Math.trunc(n));
}

// Check standard imports
// We need chart.js. It is loaded via CDN in index.html. Assumed to be on window.Chart.

export const el = {};

export function initDOM() {
    const ids = [
        "app-header", "btn-settings", "view-login", "view-tracker", "view-analytics", "main-nav",
        "tab-tracker", "tab-analytics", "pass-input", "btn-login", "c-moe", "c-trish", "card-moe", "card-trish",
        "btn-moe-plus", "btn-moe-minus", "btn-trish-plus", "btn-trish-minus", "query-input", "query-submit",
        "query-results", "query-text", "query-chart-wrap", "query-chart", "history-chart-wrap", "history-chart",
        "profile-modal", "btn-profile-moe", "btn-profile-trish", "settings-modal", "btn-settings-close",
        "btn-settings-cancel", "btn-settings-save", "btn-switch-moe", "btn-switch-trish", "weekly-plan-input",
        "plan-hint", "drinktype-modal", "btn-drinktype-close", "drinktype-choices", "adjusttoday-modal",
        "btn-adjusttoday-close", "adjusttoday-title", "adjusttoday-rows"
    ];

    for (const id of ids) {
        const node = document.getElementById(id);
        if (node) {
            // Map camelCase keys
            const key = id.replace(/-([a-z])/g, (g) => g[1].toUpperCase()).replace(/^appHeader$/, "header").replace(/^passInput$/, "pass");
            // Special mappings from original code
            if (id === "query-chart") el.queryChartCanvas = node;
            else if (id === "history-chart") el.historyChartCanvas = node;
            else if (id === "pass-input") el.pass = node;
            else el[key] = node;
        }
    }
    // Manual fixups for keys that didn't match auto-conversion perfectly or were aliased
    el.header = document.getElementById("app-header");
    el.pass = document.getElementById("pass-input");
    el.queryChartCanvas = document.getElementById("query-chart");
    el.queryChartCanvas = document.getElementById("query-chart");
    el.historyChartCanvas = document.getElementById("history-chart");
    el.nav = el.mainNav; // Alias for app.js usage
}

export function updateText(id, val) {
    const node = document.getElementById(id);
    if (node) node.innerText = String(val);
}

export function switchTab(tab) {
    el.tabTracker.classList.toggle("active", tab === "tracker");
    el.tabAnalytics.classList.toggle("active", tab === "analytics");

    el.viewTracker.classList.toggle("hidden", tab !== "tracker");
    el.viewAnalytics.classList.toggle("hidden", tab !== "analytics");

    el.header.childNodes[0].textContent = tab === "tracker" ? "Check in" : "History";
}

export function getSelectedUser() {
    const u = localStorage.getItem(LS.selectedUser);
    return (u === "Moe" || u === "Trish") ? u : null;
}

export function applySelectedUserUI() {
    const u = getSelectedUser();
    if (!u) return;
    if (el.cardMoe) el.cardMoe.classList.toggle("selected", u === "Moe");
    if (el.cardTrish) el.cardTrish.classList.toggle("selected", u === "Trish");
}

export function showProfileModal() {
    if (!el.profileModal) return;
    el.profileModal.classList.remove("hidden");
    el.profileModal.setAttribute("aria-hidden", "false");

    if (el.btnSettings) el.btnSettings.classList.add("hidden");

    if (el.nav) el.nav.classList.add("hidden");
    if (el.viewTracker) el.viewTracker.classList.add("hidden");
    if (el.viewAnalytics) el.viewAnalytics.classList.add("hidden");
    if (el.header) el.header.childNodes[0].textContent = "Who are you?";
}

export function hideProfileModal() {
    if (!el.profileModal) return;
    el.profileModal.classList.add("hidden");
    el.profileModal.setAttribute("aria-hidden", "true");
}

export function showSettingsModal() {
    if (!el.settingsModal) return;
    el.settingsModal.classList.remove("hidden");
    el.settingsModal.setAttribute("aria-hidden", "false");
    syncSettingsUIFromState();
}

export function hideSettingsModal() {
    if (!el.settingsModal) return;
    el.settingsModal.classList.add("hidden");
    el.settingsModal.setAttribute("aria-hidden", "true");
}

export function syncSettingsUIFromState() {
    const u = getSelectedUser();
    if (!u) return;

    if (el.btnSwitchMoe) el.btnSwitchMoe.classList.toggle("active", u === "Moe");
    if (el.btnSwitchTrish) el.btnSwitchTrish.classList.toggle("active", u === "Trish");

    if (el.weeklyPlanInput) el.weeklyPlanInput.value = String(getPlanFromState(u));
    if (el.planHint) el.planHint.innerText = `Weekly target for: ${u}`;
}

export function setQueryResult(html, ok) {
    if (!el.queryResults || !el.queryText) return;
    el.queryResults.classList.remove("good", "bad");
    el.queryResults.classList.add(ok ? "good" : "bad");
    el.queryText.innerHTML = html;
}

let queryChart = null;

export function destroyQueryChart() {
    if (queryChart) {
        queryChart.destroy();
        queryChart = null;
    }
    if (el.queryChartWrap) el.queryChartWrap.classList.add("hidden");
}

export function renderMiniDailyBarChart({ labels, datasets }) {
    destroyQueryChart();

    if (!window.Chart || !el.queryChartCanvas || !el.queryChartWrap) return;

    const textColor = cssVar("--text", "#544a4a");
    const showLegend = (datasets || []).length > 1;

    const commonPlugins = {
        legend: {
            display: showLegend,
            position: "bottom",
            labels: {
                color: textColor,
                boxWidth: 14,
                boxHeight: 14,
                padding: 14,
                font: { weight: "800" }
            }
        },
        tooltip: {
            enabled: true,
            titleColor: "#fff",
            bodyColor: "#fff",
            footerColor: "#fff",
            callbacks: { labelTextColor: () => "#fff" }
        }
    };

    el.queryChartWrap.classList.remove("hidden");
    queryChart = new window.Chart(el.queryChartCanvas, {
        type: "bar",
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: commonPlugins,
            scales: {
                x: { grid: { display: false }, ticks: { color: textColor, font: { weight: "800" }, maxRotation: 0, autoSkip: true } },
                y: { beginAtZero: true, grid: { display: false }, ticks: { color: textColor, font: { weight: "800" }, precision: 0 } }
            },
            animation: { duration: 450 }
        }
    });
}

export function renderChart(intent, userInfo, agg, range) {
    destroyQueryChart();

    if (intent?.type === "common_type") return;
    if (!window.Chart || !el.queryChartCanvas || !el.queryChartWrap) return;

    const moeTotal = agg?.sums?.Moe || 0;
    const trishTotal = agg?.sums?.Trish || 0;
    const hasAny = (moeTotal + trishTotal) > 0;
    if (!hasAny) return;

    const moeColor = cssVar("--moe", "#6ab7ff");
    const trishColor = cssVar("--trish", "#ff8da1");
    const textColor = cssVar("--text", "#544a4a");

    const spanDays = calcRangeSpanDays(range);
    const isSingleDay = spanDays === 1;

    const wantsPie = intent?.type === "comparison" || (intent?.whoSignals && isSingleDay);

    const commonPlugins = {
        legend: {
            display: true,
            position: "bottom",
            labels: {
                color: textColor,
                boxWidth: 14,
                boxHeight: 14,
                padding: 14,
                font: { weight: "800" }
            }
        },
        tooltip: {
            enabled: true,
            titleColor: "#fff",
            bodyColor: "#fff",
            footerColor: "#fff",
            callbacks: {
                labelTextColor: () => "#fff"
            }
        }
    };

    if (wantsPie) {
        el.queryChartWrap.classList.remove("hidden");

        queryChart = new window.Chart(el.queryChartCanvas, {
            type: "pie",
            data: {
                labels: ["Moe", "Trish"],
                datasets: [{
                    data: [moeTotal, trishTotal],
                    backgroundColor: [moeColor, trishColor],
                    borderColor: ["#ffffff", "#ffffff"],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: commonPlugins,
                animation: { duration: 450 }
            }
        });
        return;
    }

    if (intent?.type === "breakdown" && intent?.breakdownMode === "dow") {
        const order = [1, 2, 3, 4, 5, 6, 0];
        const labels = order.map(d => DOW_SHORT[d]);

        const moeData = order.map(d => (agg.perDow.get(d)?.Moe || 0));
        const trishData = order.map(d => (agg.perDow.get(d)?.Trish || 0));

        const datasets = (userInfo.users.length === 1)
            ? [{
                label: userInfo.users[0],
                data: (userInfo.users[0] === "Moe" ? moeData : trishData),
                backgroundColor: (userInfo.users[0] === "Moe" ? moeColor : trishColor),
                borderRadius: 12,
                borderSkipped: false
            }]
            : [
                { label: "Moe", data: moeData, backgroundColor: moeColor, borderRadius: 12, borderSkipped: false },
                { label: "Trish", data: trishData, backgroundColor: trishColor, borderRadius: 12, borderSkipped: false }
            ];

        el.queryChartWrap.classList.remove("hidden");
        queryChart = new window.Chart(el.queryChartCanvas, {
            type: "bar",
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: commonPlugins,
                scales: {
                    x: { grid: { display: false }, ticks: { color: textColor, font: { weight: "800" } } },
                    y: { beginAtZero: true, grid: { display: false }, ticks: { color: textColor, font: { weight: "800" }, precision: 0 } }
                },
                animation: { duration: 450 }
            }
        });
        return;
    }

    const bucketed = buildTimeBucketsFromPerDay(agg.perDay, range);
    if (!bucketed.labels.length) return;

    const datasets = (userInfo.users.length === 1)
        ? [{
            label: userInfo.users[0],
            data: bucketed.series.map(s => s[userInfo.users[0]] || 0),
            backgroundColor: (userInfo.users[0] === "Moe") ? moeColor : trishColor,
            borderRadius: 12,
            borderSkipped: false
        }]
        : [
            { label: "Moe", data: bucketed.series.map(s => s.Moe || 0), backgroundColor: moeColor, borderRadius: 12, borderSkipped: false },
            { label: "Trish", data: bucketed.series.map(s => s.Trish || 0), backgroundColor: trishColor, borderRadius: 12, borderSkipped: false }
        ];

    el.queryChartWrap.classList.remove("hidden");
    queryChart = new window.Chart(el.queryChartCanvas, {
        type: "bar",
        data: { labels: bucketed.labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: commonPlugins,
            scales: {
                x: { grid: { display: false }, ticks: { color: textColor, font: { weight: "800" }, maxRotation: 0, autoSkip: true } },
                y: { beginAtZero: true, grid: { display: false }, ticks: { color: textColor, font: { weight: "800" }, precision: 0 } }
            },
            animation: { duration: 450 }
        }
    });
}

let historyChart = null;

export function destroyHistoryChart() {
    if (historyChart) {
        historyChart.destroy();
        historyChart = null;
    }
    if (el.historyChartWrap) el.historyChartWrap.classList.add("hidden");
}

export function renderHistoryChart() {
    destroyHistoryChart();

    if (!window.Chart || !el.historyChartCanvas || !el.historyChartWrap) return;

    const u = getSelectedUser();
    if (!u) {
        if (el.historyChartWrap) el.historyChartWrap.classList.add("hidden");
        return;
    }

    const textColor = cssVar("--text", "#544a4a");

    const now = new Date();
    const endMs = now.getTime();
    const startMs = startOfDayLocal(endMs) - (21 - 1) * DAY_MS;
    const range = { startMs, endMs, label: "last 21 days" };

    const agg = aggregate([u], range, {}, state.eventsCache);
    const bucketed = buildTimeBucketsFromPerDay(agg.perDay, range);

    const total = agg?.sums?.[u] || 0;
    if (total === 0 || !bucketed.labels.length) {
        if (el.historyChartWrap) el.historyChartWrap.classList.add("hidden");
        return;
    }

    const color = (u === "Moe") ? cssVar("--moe", "#6ab7ff") : cssVar("--trish", "#ff8da1");

    const datasets = [
        {
            label: u,
            data: bucketed.series.map(s => s[u] || 0),
            backgroundColor: color,
            borderRadius: 12,
            borderSkipped: false
        }
    ];

    el.historyChartWrap.classList.remove("hidden");
    historyChart = new window.Chart(el.historyChartCanvas, {
        type: "bar",
        data: { labels: bucketed.labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    enabled: true,
                    titleColor: "#fff",
                    bodyColor: "#fff",
                    callbacks: { labelTextColor: () => "#fff" }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: textColor, font: { weight: "800" }, maxRotation: 0, autoSkip: true } },
                y: { beginAtZero: true, grid: { display: false }, ticks: { color: textColor, font: { weight: "800" }, precision: 0 } }
            },
            animation: { duration: 450 }
        }
    });
}

export function shakeCard(user) {
    const card = user === "Moe" ? el.cardMoe : el.cardTrish;
    if (!card) return;
    card.style.transform = "translateX(5px)";
    setTimeout(() => (card.style.transform = "translateX(-5px)"), 50);
    setTimeout(() => (card.style.transform = "none"), 100);
}

export function showKanpaiPop(user) {
    const card = user === "Moe" ? el.cardMoe : el.cardTrish;
    if (!card) return;
    const pop = document.createElement("div");
    pop.className = "kanpai-pop";
    pop.innerText = "🍻 Kanpai!";
    card.appendChild(pop);
    setTimeout(() => pop.remove(), 800);
}

export function openDrinkTypeModal(user) {
    state.activeModalUser = user;
    if (!el.drinkTypeModal) return;
    el.drinkTypeModal.classList.remove("hidden");
    el.drinkTypeModal.setAttribute("aria-hidden", "false");
}

export function closeDrinkTypeModal() {
    if (!el.drinkTypeModal) return;
    el.drinkTypeModal.classList.add("hidden");
    el.drinkTypeModal.setAttribute("aria-hidden", "true");
    state.activeModalUser = null;
}

export function openAdjustTodayModal(user) {
    state.activeModalUser = user;
    if (!el.adjustTodayModal) return;
    el.adjustTodayModal.classList.remove("hidden");
    el.adjustTodayModal.setAttribute("aria-hidden", "false");
    renderAdjustTodayUI();
}

export function closeAdjustTodayModal() {
    if (!el.adjustTodayModal) return;
    el.adjustTodayModal.classList.add("hidden");
    el.adjustTodayModal.setAttribute("aria-hidden", "true");
    state.activeModalUser = null;
}

// Need logic for getTodayCountsByType to render UI...
// I'll import it from app.js or logic.js if moved. 
// getTodayCountsByType should be in Logic.
// Let's assume I export it from logic.js. I'll need to add it there.

// IMPORTANT: Missing function getTodayCountsByType in Logic.js!
// I will just implement it here for now or add it to logic.js later.
// Actually, it's better to keep logic in logic.js. I'll patch logic.js in a moment.
// For now I'll stub it or assume it's imported.
import { getTodayCountsByType } from "./logic.js";

export function renderAdjustTodayUI() {
    if (!el.adjustTodayRows || !state.activeModalUser) return;

    const user = state.activeModalUser;
    if (el.adjustTodayTitle) el.adjustTodayTitle.textContent = `Adjust today (${user})`;

    const counts = getTodayCountsByType(user, state.eventsCache);

    const rows = [
        { type: "beer", label: "🍺 Beer" },
        { type: "wine", label: "🍷 Wine" },
        { type: "cocktail", label: "🍹 Cocktail" },
        { type: "other", label: "✨ Other" }
    ];

    el.adjustTodayRows.innerHTML = rows.map(r => {
        const c = Math.max(0, counts[r.type] || 0);
        const disabled = c <= 0 ? "disabled" : "";
        return `
      <div class="adjust-row" data-type="${r.type}">
        <div class="adjust-label">${r.label}</div>
        <div class="adjust-count" data-count="${r.type}">${c}</div>
        <button class="mini-btn" type="button" data-action="minus" ${disabled} aria-label="${r.type} minus">−</button>
        <button class="mini-btn" type="button" data-action="plus" aria-label="${r.type} plus">+</button>
      </div>
    `;
    }).join("");
}

export function attachLongPress({ element, onTap, onLongPress, ms = 450 }) {
    if (!element) return;

    let timer = null;
    let fired = false;
    let pointerDown = false;
    let suppressClick = false;

    const clear = () => {
        if (timer) clearTimeout(timer);
        timer = null;
    };

    element.addEventListener("pointerdown", (e) => {
        pointerDown = true;
        fired = false;
        suppressClick = false;
        clear();

        timer = setTimeout(() => {
            if (!pointerDown) return;
            fired = true;
            suppressClick = true;
            try { onLongPress && onLongPress(e); } catch { }
        }, ms);
    });

    element.addEventListener("pointerup", (e) => {
        pointerDown = false;
        clear();
        if (!fired) {
            try { onTap && onTap(e); } catch { }
        } else {
            setTimeout(() => { suppressClick = false; }, 0);
        }
    });

    element.addEventListener("pointercancel", () => {
        pointerDown = false;
        clear();
    });

    element.addEventListener("pointerleave", () => {
        pointerDown = false;
        clear();
    });

    element.addEventListener("contextmenu", (e) => {
        e.preventDefault();
    });

    element.addEventListener("click", (e) => {
        if (suppressClick) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);
}
