import {
    cssVar,
    normalizeDrinkType,
    drinkTypeEmoji,
    drinkTypeLabel,
    monthNameFromIndex,
    plural,
    startOfDayLocal,
    startOfWeekMonday,
    labelForDay,
    labelForWeek,
    labelForMonth,
    calcRangeSpanDays
} from "./utils.js";
import { state } from "./state.js";
import { aggregate, buildTimeBucketsFromPerDay, getWeekProgress, getTodayCountsByType } from "./logic.js";
import { LS, NY_TZ, DOW_SHORT, DAY_MS } from "./constants.js";
import { safeGetItem } from "./error-handler.js";
import { sanitizeHtml } from "./validation.js";

function getPlanFromState(user) {
    const n = state.weeklyPlans[user];
    if (!Number.isFinite(n) || isNaN(n) || n < 0) return 14;
    return Math.min(99, Math.trunc(n));
}

// Chart.js is loaded via CDN in index.html, available at window.Chart.
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
        if (!node) continue;

        const key = id
            .replace(/-([a-z])/g, (g) => g[1].toUpperCase())
            .replace(/^appHeader$/, "header")
            .replace(/^passInput$/, "pass");

        if (id === "query-chart") el.queryChartCanvas = node;
        else if (id === "history-chart") el.historyChartCanvas = node;
        else if (id === "pass-input") el.pass = node;
        else el[key] = node;
    }

    // Manual fixups / aliases
    el.header = document.getElementById("app-header");
    el.pass = document.getElementById("pass-input");
    el.queryChartCanvas = document.getElementById("query-chart");
    el.historyChartCanvas = document.getElementById("history-chart");
    el.nav = el.mainNav;
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

    if (el.header && el.header.childNodes?.[0]) {
        el.header.childNodes[0].textContent = tab === "tracker" ? "Check in" : "History";
    }
}

export function getSelectedUser() {
    const u = safeGetItem(LS.selectedUser);
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
    if (el.header && el.header.childNodes?.[0]) el.header.childNodes[0].textContent = "Who are you?";
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
                x: {
                    grid: { display: false },
                    ticks: { color: textColor, font: { weight: "800" }, maxRotation: 0, autoSkip: true }
                },
                y: {
                    beginAtZero: true,
                    grid: { display: false },
                    ticks: { color: textColor, font: { weight: "800" }, precision: 0 }
                }
            },
            animation: {
                duration: 500,
                delay: (context) => (context.type === "data" && context.mode === "default") ? context.dataIndex * 30 : 0
            }
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
            callbacks: { labelTextColor: () => "#fff" }
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
                animation: { duration: 500, animateRotate: true, animateScale: true }
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
                animation: {
                    duration: 500,
                    delay: (context) => (context.type === "data" && context.mode === "default") ? context.dataIndex * 30 : 0
                }
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
                x: {
                    grid: { display: false },
                    ticks: { color: textColor, font: { weight: "800" }, maxRotation: 0, autoSkip: true }
                },
                y: {
                    beginAtZero: true,
                    grid: { display: false },
                    ticks: { color: textColor, font: { weight: "800" }, precision: 0 }
                }
            },
            animation: {
                duration: 500,
                delay: (context) => (context.type === "data" && context.mode === "default") ? context.dataIndex * 30 : 0
            }
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
        el.historyChartWrap.classList.add("hidden");
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
        el.historyChartWrap.classList.add("hidden");
        return;
    }

    const color = (u === "Moe") ? cssVar("--moe", "#6ab7ff") : cssVar("--trish", "#ff8da1");

    const datasets = [{
        label: u,
        data: bucketed.series.map(s => s[u] || 0),
        backgroundColor: color,
        borderRadius: 12,
        borderSkipped: false
    }];

    el.historyChartWrap.classList.remove("hidden");
    historyChart = new window.Chart(el.historyChartCanvas, {
        type: "bar",
        data: { labels: bucketed.labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: true,
                    titleColor: "#fff",
                    bodyColor: "#fff",
                    callbacks: { labelTextColor: () => "#fff" }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: textColor, font: { weight: "800" }, maxRotation: 0, autoSkip: true }
                },
                y: {
                    beginAtZero: true,
                    grid: { display: false },
                    ticks: { color: textColor, font: { weight: "800" }, precision: 0 }
                }
            },
            animation: {
                duration: 500,
                delay: (context) => (context.type === "data" && context.mode === "default") ? context.dataIndex * 40 : 0
            }
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

// Confetti celebration effect
export function triggerConfetti() {
    const colors = ["#6ab7ff", "#ff8da1", "#ffd700", "#00ff88", "#ff6b6b"];
    const particleCount = 40;

    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement("div");
        particle.className = "confetti-particle";
        particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];

        const startX = window.innerWidth / 2 + (Math.random() - 0.5) * 100;
        const startY = window.innerHeight / 2;
        particle.style.left = startX + "px";
        particle.style.top = startY + "px";

        particle.style.animationDelay = (Math.random() * 0.3) + "s";

        const spread = (Math.random() - 0.5) * window.innerWidth * 0.8;
        particle.style.setProperty("--spread-x", spread + "px");

        document.body.appendChild(particle);
        setTimeout(() => particle.remove(), 1800);
    }
}

export function animateCountLoad(element, targetValue) {
    if (!element) return;

    element.classList.add("loading");

    const startValue = parseInt(element.textContent) || 0;
    const duration = 300;
    const startTime = performance.now();

    const animate = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const currentValue = Math.round(startValue + (targetValue - startValue) * easeOut);

        element.textContent = currentValue;

        if (progress < 1) requestAnimationFrame(animate);
        else element.classList.remove("loading");
    };

    requestAnimationFrame(animate);
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
    if (!el.drinktypeModal) return;
    el.drinktypeModal.classList.remove("hidden");
    el.drinktypeModal.setAttribute("aria-hidden", "false");
}

export function closeDrinkTypeModal() {
    if (!el.drinktypeModal) return;
    el.drinktypeModal.classList.add("hidden");
    el.drinktypeModal.setAttribute("aria-hidden", "true");
    state.activeModalUser = null;
}

export function openAdjustTodayModal(user) {
    state.activeModalUser = user;
    if (!el.adjusttodayModal) return;
    el.adjusttodayModal.classList.remove("hidden");
    el.adjusttodayModal.setAttribute("aria-hidden", "false");
    renderAdjustTodayUI();
}

export function closeAdjustTodayModal() {
    if (!el.adjusttodayModal) return;
    el.adjusttodayModal.classList.add("hidden");
    el.adjusttodayModal.setAttribute("aria-hidden", "true");
    state.activeModalUser = null;
}

export function renderAdjustTodayUI() {
    if (!el.adjusttodayRows || !state.activeModalUser) return;

    const user = state.activeModalUser;
    if (el.adjusttodayTitle) el.adjusttodayTitle.textContent = `Adjust today (${user})`;

    const counts = getTodayCountsByType(user, state.eventsCache);

    const rows = [
        { type: "beer", label: "🍺 Beer" },
        { type: "wine", label: "🍷 Wine" },
        { type: "cocktail", label: "🍹 Cocktail" },
        { type: "other", label: "✨ Other" }
    ];

    el.adjusttodayRows.innerHTML = rows.map(r => {
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

// ===== PLAN ADHERENCE UI =====

// DELETED: renderProgressBar used to be here

export function renderStreakBadge(user, zeroStreak, startDay) {
    const badgeId = user === "Moe" ? "streak-moe" : "streak-trish";
    const badge = document.getElementById(badgeId);
    if (!badge) return;

    if (zeroStreak > 0) {
        if (zeroStreak === 1 && startDay) badge.textContent = `Zero 🍺 since ${startDay}`;
        else badge.textContent = `${zeroStreak} zero days 🍺`;
        badge.classList.add("active");
    } else {
        badge.textContent = "";
        badge.classList.remove("active");
    }
}

export function renderTrendArrow(user, percentChange) {
    const arrowId = user === "Moe" ? "trend-moe" : "trend-trish";
    const arrow = document.getElementById(arrowId);
    if (!arrow) return;

    arrow.classList.remove("up", "down", "neutral");

    if (percentChange === null || percentChange === 0) {
        arrow.textContent = "";
        return;
    }

    if (percentChange > 0) {
        arrow.textContent = `↑${Math.abs(percentChange)}%`;
        arrow.classList.add("up");
    } else {
        arrow.textContent = `↓${Math.abs(percentChange)}%`;
        arrow.classList.add("down");
    }
}

// Keep both: status (persistent) + toast (milestone)
// DELETED: renderBuddyStatus used to be here

export function showBuddyMilestoneToast(partner, zeroStreak) {
    if (zeroStreak < 3) return;

    const toast = document.createElement("div");
    toast.className = "toast buddy-milestone-toast";

    const emoji = partner === "Moe" ? "🐻" : "🐱";
    // Made interactive as requested
    toast.innerHTML = `${emoji} ${partner} is on a ${zeroStreak} day zero streak! 💪<br><small>Tap to cheer!</small>`;

    // Interactive cheer
    toast.addEventListener("click", () => {
        showKanpaiPop(partner);
        triggerConfetti();
        toast.classList.remove("show"); // Dismiss on click
    });

    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add("show"), 10);

    setTimeout(() => {
        if (toast.parentElement) {
            toast.classList.remove("show");
            toast.classList.add("hide");
            toast.addEventListener("transitionend", () => toast.remove(), { once: true });
        }
    }, 6000); // Slightly longer for reading
}

export function showWeeklyCheckInModal(stats, partnerInfo, user) {
    const modal = document.getElementById("weekly-checkin-modal");
    const statsEl = document.getElementById("checkin-stats");
    const buddyEl = document.getElementById("checkin-buddy");
    if (!modal || !statsEl) return;

    const statusEmoji = stats.onTrack ? "🎉" : "📈";
    const statusText = stats.onTrack
        ? `On track! ${stats.total}/${stats.plan}`
        : `Over by ${stats.total - stats.plan}`;

    let changeText = "";
    if (stats.change > 0) {
        changeText = `<span class="checkin-stat-value good">↓${stats.change} less than this week</span>`;
    } else if (stats.change < 0) {
        changeText = `<span class="checkin-stat-value bad">↑${Math.abs(stats.change)} more than this week</span>`;
    }

    statsEl.innerHTML = `
        <div class="checkin-stat-row">
            <span class="checkin-stat-label">Last week total</span>
            <span class="checkin-stat-value ${stats.onTrack ? "good" : "bad"}">${stats.total}</span>
        </div>
        <div class="checkin-stat-row">
            <span class="checkin-stat-label">Weekly target</span>
            <span class="checkin-stat-value">${stats.plan}</span>
        </div>
        <div class="checkin-stat-row">
            <span class="checkin-stat-label">Status</span>
            <span class="checkin-stat-value ${stats.onTrack ? "good" : "bad"}">${statusEmoji} ${statusText}</span>
        </div>
        ${changeText ? `<div class="checkin-stat-row"><span class="checkin-stat-label">Trend</span>${changeText}</div>` : ""}
    `;

    if (partnerInfo && partnerInfo.zeroStreak >= 1 && buddyEl) {
        const emoji = partnerInfo.partner === "Moe" ? "🐻" : "🐱";
        buddyEl.innerHTML = `${emoji} ${partnerInfo.partner} has a ${partnerInfo.zeroStreak} day streak!`;
        buddyEl.classList.remove("hidden");
    } else if (buddyEl) {
        buddyEl.classList.add("hidden");
    }

    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
}

export function hideWeeklyCheckInModal() {
    const modal = document.getElementById("weekly-checkin-modal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
}

export function showCelebration(type, message) {
    triggerConfetti();

    const badge = document.createElement("div");
    badge.className = "celebration-badge";
    badge.textContent = message;
    document.body.appendChild(badge);

    setTimeout(() => badge.remove(), 2500);
}

export function syncCommitmentUI(user, commitment) {
    const whyInput = document.getElementById("commitment-why");
    const dateEl = document.getElementById("commitment-date");

    if (whyInput) whyInput.value = commitment?.why || "";

    if (dateEl) {
        if (commitment?.setDate) {
            const date = new Date(commitment.setDate);
            const formatted = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
            dateEl.textContent = `Committed on: ${formatted}`;
        } else {
            dateEl.textContent = "Commitment not set yet";
        }
    }
}
