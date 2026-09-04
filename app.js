/* =========================================================
   Habit Snowball — Core logic + UI
   ========================================================= */

(() => {
  'use strict';

  /* ---------------- STORAGE ---------------- */
  const STORAGE_KEY = 'habit_snowball_v1';

  const DEFAULT_STATE = {
    habits: [],
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.habits)) {
        return structuredClone(DEFAULT_STATE);
      }
      // Ensure all habits have required fields
      parsed.habits = parsed.habits.map(normalizeHabit);
      return parsed;
    } catch (err) {
      console.warn('Failed to load state, using default', err);
      return structuredClone(DEFAULT_STATE);
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.error('Failed to save state', err);
      showToast('Không thể lưu dữ liệu (LocalStorage đầy?)', true);
    }
  }

  function normalizeHabit(h) {
    return {
      id: h.id || makeId(),
      name: h.name || 'Thói quen không tên',
      emoji: h.emoji || '',
      score: clampScore(Number(h.score) || 0),
      streak: Math.max(0, Math.floor(Number(h.streak) || 0)),
      lastCompleted: h.lastCompleted || null,
      lastDecayAppliedDate: h.lastDecayAppliedDate || null,
      history: Array.isArray(h.history)
        ? h.history
            .map((entry) => ({
              timestamp: Number(entry.timestamp) || Date.now(),
              hourOfDay:
                typeof entry.hourOfDay === 'number'
                  ? entry.hourOfDay
                  : new Date(Number(entry.timestamp) || Date.now()).getHours(),
            }))
            .filter((entry) => entry.hourOfDay >= 0 && entry.hourOfDay <= 23)
        : [],
    };
  }

  /* ---------------- UTILS ---------------- */
  function makeId() {
    return 'h_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function clampScore(v) {
    if (Number.isNaN(v)) return 0;
    return Math.max(0, Math.min(100, v));
  }

  function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function dayKey(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  function sameDay(a, b) {
    if (!a || !b) return false;
    return dayKey(a) === dayKey(b);
  }

  function diffDays(from, to) {
    const a = startOfDay(from).getTime();
    const b = startOfDay(to).getTime();
    return Math.round((b - a) / 86400000);
  }

  function slotOfHour(hour) {
    if (hour >= 5 && hour < 11) return 'Sáng';
    if (hour >= 11 && hour < 14) return 'Trưa';
    if (hour >= 14 && hour < 18) return 'Chiều';
    if (hour >= 18 && hour < 23) return 'Tối';
    return 'Đêm';
  }

  function getStage(score) {
    if (score <= 30) return 1;
    if (score <= 70) return 2;
    return 3;
  }

  function getStageName(stage) {
    if (stage === 1) return 'Khởi động';
    if (stage === 2) return 'Tích tụ';
    return 'Vô thức';
  }

  /* ---------------- CORE ALGORITHMS ---------------- */

  /**
   * Snowball: gain for one completion
   *   gain = base_gain × (1 + streak × 0.1)
   * Streak also bumps by +1 on a successful check-in.
   * Capped at 100.
   */
  const BASE_GAIN = 6;

  function computeCheckInGain(streak) {
    return BASE_GAIN * (1 + streak * 0.1);
  }

  function applyCheckIn(habit, now = new Date()) {
    const previousStreak = habit.streak || 0;

    // If already checked in today, ignore.
    if (sameDay(habit.lastCompleted, now)) {
      return { changed: false, reason: 'Bạn đã check-in thói quen này hôm nay rồi.' };
    }

    // If gap > 1 day from last completion, streak resets to 1.
    let nextStreak;
    if (!habit.lastCompleted) {
      nextStreak = 1;
    } else {
      const gap = diffDays(new Date(habit.lastCompleted), now);
      if (gap <= 1) {
        nextStreak = previousStreak + 1;
      } else {
        // Missed one or more days -> reset streak to 1.
        nextStreak = 1;
      }
    }

    const gain = computeCheckInGain(previousStreak);
    habit.streak = nextStreak;
    habit.score = clampScore(habit.score + gain);
    habit.lastCompleted = now.toISOString();
    habit.history.push({
      timestamp: now.getTime(),
      hourOfDay: now.getHours(),
    });

    return {
      changed: true,
      streak: nextStreak,
      gain,
      score: habit.score,
    };
  }

  /**
   * Degradation: decay per missed day.
   *   - Higher scores decay less (a "shield" for established habits).
   *   - Lower scores decay more aggressively.
   *
   *   decay_per_day = clamp(2.5 × (1 - score/140), 0.3, 2.5)
   *
   *   At score = 0  → ~2.5/day (fast rã đông)
   *   At score = 50 → ~1.6/day
   *   At score = 100 → ~0.7/day (vững chắc)
   */
  function decayPerDay(score) {
    const base = 2.5 * (1 - score / 140);
    return Math.max(0.3, Math.min(2.5, base));
  }

  /**
   * Apply daily decay for missed days. Run on every render and on app start.
   * Compares today with lastDecayAppliedDate to know how many missed days to apply.
   * Note: we apply decay ONLY if the habit was NOT completed today.
   */
  function applyDailyDecay(habit, now = new Date()) {
    const today = startOfDay(now);
    const todayKey = dayKey(today);

    if (habit.lastDecayAppliedDate === todayKey) return;

    // Find reference: the most recent "reference date" — either last completion
    // (if today completed, decay paused) or last decay applied date.
    const referenceISO = habit.lastDecayAppliedDate || habit.lastCompleted;
    if (!referenceISO) {
      // No history at all: just remember we checked today.
      habit.lastDecayAppliedDate = todayKey;
      return;
    }

    const referenceDate = new Date(referenceISO);
    // Number of full missed days between reference and today.
    // If today was completed, do nothing (snowball already adds, and decay should pause).
    if (sameDay(habit.lastCompleted, now)) {
      habit.lastDecayAppliedDate = todayKey;
      return;
    }

    const missed = diffDays(referenceDate, today);
    if (missed <= 0) {
      habit.lastDecayAppliedDate = todayKey;
      return;
    }

    const perDay = decayPerDay(habit.score);
    const totalDecay = perDay * missed;
    habit.score = clampScore(habit.score - totalDecay);

    // Streak resets if missed >= 1 day
    if (habit.streak > 0 && missed >= 1) {
      habit.streak = 0;
    }

    habit.lastDecayAppliedDate = todayKey;
  }

  /**
   * Time-based probability: given a habit's history, compute the probability
   * the user will complete the habit during the *current hour-of-day bucket*.
   *
   *   bucket(hour) = one of 24 slots (we use the current hour ±1 weighted)
   *   p = count_in_recent_window / total_in_recent_window
   *
   * We weight recent entries (last 30 days) more than old ones, and use a
   * Gaussian-like window around the current hour (±2 hours).
   */
  function computeHourProbabilities(habit, now = new Date()) {
    const counts = new Array(24).fill(0);
    const totalWeight = { value: 0 };

    const RECENT_MS = 30 * 86400000; // last 30 days
    const cutoff = now.getTime() - RECENT_MS;

    habit.history.forEach((entry) => {
      if (entry.timestamp < cutoff) return;
      counts[entry.hourOfDay] += 1;
      totalWeight.value += 1;
    });

    // If user hasn't done it in the last 30 days, fall back to all history
    if (totalWeight.value === 0 && habit.history.length > 0) {
      habit.history.forEach((entry) => {
        counts[entry.hourOfDay] += 1;
        totalWeight.value += 1;
      });
    }

    const total = totalWeight.value || 0;
    return counts.map((c) => (total === 0 ? 0 : (c / total) * 100));
  }

  /**
   * Probability the user will do this habit *now*, considering a
   * weighted window around the current hour.
   */
  function probabilityForCurrentHour(habit, now = new Date()) {
    const probs = computeHourProbabilities(habit, now);
    if (probs.every((p) => p === 0)) return 0;

    const hour = now.getHours();
    let weighted = 0;
    let weightSum = 0;
    for (let offset = -2; offset <= 2; offset += 1) {
      const h = (hour + offset + 24) % 24;
      // Gaussian-ish weights: 0, 1, 2, 3, 2, 1, 0 across ±3
      const w = Math.max(0, 3 - Math.abs(offset));
      weighted += probs[h] * w;
      weightSum += w;
    }
    if (weightSum === 0) return 0;
    return Math.round(weighted / weightSum);
  }

  /* ---------------- STATE MUTATIONS ---------------- */
  let state = loadState();

  // On first ever load, seed with a couple of demo habits (only if empty)
  function seedIfEmpty() {
    if (state.habits.length > 0) return;
    const now = new Date();
    const mk = (name, emoji, score, streak, history) => ({
      id: makeId(),
      name,
      emoji,
      score,
      streak,
      lastCompleted: null,
      lastDecayAppliedDate: null,
      history,
    });

    // Build a small synthetic history for demo (last 14 days, scattered hours)
    const synthHistory = (hours) => {
      const out = [];
      const today = startOfDay(now).getTime();
      for (let d = 0; d < 14; d += 1) {
        if (Math.random() < 0.55) {
          // pick 1-2 random hours from the provided distribution
          const dayBase = today - d * 86400000;
          const count = Math.random() < 0.3 ? 2 : 1;
          for (let i = 0; i < count; i += 1) {
            const h = hours[Math.floor(Math.random() * hours.length)];
            const ts = dayBase + h * 3600000 + Math.floor(Math.random() * 1800000);
            out.push({ timestamp: ts, hourOfDay: h });
          }
        }
      }
      return out;
    };

    state.habits = [
      mk('Tập Gym', '🏋️', 42, 5, synthHistory([6, 7, 8, 17, 18, 19])),
      mk('Đọc sách 20 phút', '📚', 68, 12, synthHistory([21, 22, 23])),
      mk('Thiền 10 phút', '🧘', 18, 2, synthHistory([6, 7, 22])),
      mk('Uống đủ 2L nước', '💧', 80, 22, synthHistory([8, 9, 13, 15, 17, 20])),
    ];
    saveState();
  }
  seedIfEmpty();

  function addOrUpdateHabit({ id, name, emoji, score }) {
    if (id) {
      const h = state.habits.find((x) => x.id === id);
      if (h) {
        h.name = name.trim() || 'Thói quen không tên';
        h.emoji = (emoji || '').trim().slice(0, 4);
        h.score = clampScore(Number(score) || 0);
        saveState();
        return h;
      }
    }
    const fresh = normalizeHabit({
      id: makeId(),
      name: (name || '').trim() || 'Thói quen mới',
      emoji: (emoji || '').trim().slice(0, 4),
      score: clampScore(Number(score) || 0),
      streak: 0,
      lastCompleted: null,
      lastDecayAppliedDate: null,
      history: [],
    });
    state.habits.unshift(fresh);
    saveState();
    return fresh;
  }

  function deleteHabit(id) {
    state.habits = state.habits.filter((h) => h.id !== id);
    saveState();
  }

  function checkInHabit(id) {
    const habit = state.habits.find((h) => h.id === id);
    if (!habit) return;
    const result = applyCheckIn(habit, new Date());
    saveState();
    if (!result.changed) {
      showToast(result.reason);
      return;
    }
    showToast(
      `+${result.gain.toFixed(1)} điểm • Streak: ${result.streak} ngày • Tổng: ${result.score.toFixed(1)}%`
    );
  }

  /* ---------------- UI ---------------- */
  const elGrid = document.getElementById('habitsGrid');
  const elEmpty = document.getElementById('emptyState');
  const elPredictiveMsg = document.getElementById('predictiveMsg');
  const elPredictiveTimeText = document.getElementById('predictiveTimeText');
  const elPredictiveSlot = document.getElementById('predictiveSlot');
  const elLiveClock = document.getElementById('liveClock');
  const elStatTotal = document.getElementById('statTotal');
  const elStatAutopilot = document.getElementById('statAutopilot');
  const elStatBestStreak = document.getElementById('statBestStreak');
  const elStatAvgScore = document.getElementById('statAvgScore');
  const elToast = document.getElementById('toast');

  /* Modal elements */
  const modalBackdrop = document.getElementById('modalBackdrop');
  const modalTitle = document.getElementById('modalTitle');
  const habitForm = document.getElementById('habitForm');
  const habitIdInput = document.getElementById('habitId');
  const habitNameInput = document.getElementById('habitName');
  const habitEmojiInput = document.getElementById('habitEmoji');
  const habitScoreInput = document.getElementById('habitScore');

  function render() {
    // Apply daily decay to all habits first
    state.habits.forEach((h) => applyDailyDecay(h, new Date()));

    renderPredictiveBar();
    renderStats();
    renderGrid();
  }

  function renderPredictiveBar() {
    const now = new Date();
    elLiveClock.textContent = formatTime(now);
    elPredictiveTimeText.textContent = formatTime(now);
    elPredictiveSlot.textContent = slotOfHour(now.getHours());

    if (state.habits.length === 0) {
      elPredictiveMsg.innerHTML =
        'Thêm vài thói quen và bắt đầu check-in để nhận gợi ý thông minh.';
      return;
    }

    // Score each habit by current-hour probability
    const scored = state.habits
      .map((h) => ({
        habit: h,
        prob: probabilityForCurrentHour(h, now),
      }))
      .sort((a, b) => b.prob - a.prob);

    const top = scored[0];

    if (!top || top.prob === 0) {
      elPredictiveMsg.innerHTML =
        'Chưa đủ dữ liệu để dự đoán. Hãy check-in thói quen vài lần để app học khung giờ của bạn.';
      return;
    }

    const name = top.habit.name;
    elPredictiveMsg.innerHTML = `
      <span class="suggested-name">${escapeHTML(name)}</span> là thói quen bạn thường làm nhất lúc này.
      Xác suất bạn sẽ làm nó bây giờ là
      <span class="suggested-pct">${top.prob}%</span>.
      <button class="btn btn-primary" data-suggested="${top.habit.id}" style="margin-left:8px;padding:6px 10px;font-size:12px;">
        Check-in ngay
      </button>
    `;

    const btn = elPredictiveMsg.querySelector('[data-suggested]');
    if (btn) {
      btn.addEventListener('click', () => {
        checkInHabit(btn.dataset.suggested);
        render();
      });
    }
  }

  function renderStats() {
    const habits = state.habits;
    elStatTotal.textContent = habits.length;

    const autopilot = habits.filter((h) => getStage(h.score) === 3).length;
    elStatAutopilot.textContent = autopilot;

    const best = habits.reduce((acc, h) => Math.max(acc, h.streak || 0), 0);
    elStatBestStreak.textContent = best;

    const avg = habits.length === 0
      ? 0
      : habits.reduce((acc, h) => acc + h.score, 0) / habits.length;
    elStatAvgScore.textContent = `${avg.toFixed(0)}%`;
  }

  function renderGrid() {
    const now = new Date();

    if (state.habits.length === 0) {
      elGrid.innerHTML = '';
      elEmpty.hidden = false;
      return;
    }
    elEmpty.hidden = true;

    // Sort habits: highest current-hour probability first (smart suggestion),
    // then by score, then by streak.
    const sorted = state.habits
      .map((h) => ({
        habit: h,
        prob: probabilityForCurrentHour(h, now),
      }))
      .sort((a, b) => {
        if (b.prob !== a.prob) return b.prob - a.prob;
        if (b.habit.score !== a.habit.score) return b.habit.score - a.habit.score;
        return (b.habit.streak || 0) - (a.habit.streak || 0);
      });

    elGrid.innerHTML = sorted
      .map(({ habit, prob }) => renderHabitCard(habit, prob, now))
      .join('');

    // Attach events
    elGrid.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', onCardAction);
    });
  }

  function onCardAction(ev) {
    const btn = ev.currentTarget;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (!action || !id) return;

    if (action === 'checkin') {
      checkInHabit(id);
      render();
    } else if (action === 'edit') {
      openEditModal(id);
    } else if (action === 'delete') {
      const h = state.habits.find((x) => x.id === id);
      if (!h) return;
      const ok = confirm(`Xoá thói quen "${h.name}"? Dữ liệu lịch sử sẽ mất.`);
      if (!ok) return;
      deleteHabit(id);
      render();
      showToast('Đã xoá thói quen.');
    }
  }

  function renderHabitCard(habit, prob, now) {
    const score = habit.score;
    const stage = getStage(score);
    const stageName = getStageName(stage);
    const stageClass = `badge-stage-${stage}`;
    const doneToday = sameDay(habit.lastCompleted, now);
    const lastText = habit.lastCompleted
      ? `Lần cuối: ${formatDateTime(new Date(habit.lastCompleted))}`
      : 'Chưa từng hoàn thành';

    const emoji = (habit.emoji || '').trim() || '❄️';

    const probs = computeHourProbabilities(habit, now);
    const max = Math.max(...probs, 1);
    const currentHour = now.getHours();

    const hourBars = probs
      .map((p, h) => {
        const heightPct = max === 0 ? 4 : Math.max(4, Math.round((p / max) * 100));
        const isEmpty = p === 0;
        const isCurrent = h === currentHour;
        return `<div class="hour-bar ${isEmpty ? 'is-empty' : ''} ${isCurrent ? 'is-current' : ''}" style="height:${heightPct}%" title="${h}h — ${p.toFixed(0)}%"></div>`;
      })
      .join('');

    return `
      <article class="habit-card" data-id="${habit.id}">
        <div class="habit-card-head">
          <div class="habit-emoji">${escapeHTML(emoji)}</div>
          <div class="habit-title-wrap">
            <div class="habit-name">${escapeHTML(habit.name)}</div>
            <div class="habit-meta">${lastText}</div>
          </div>
          <div class="habit-actions">
            <button class="icon-btn" data-action="edit" data-id="${habit.id}" title="Chỉnh sửa" aria-label="Chỉnh sửa">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
            </button>
            <button class="icon-btn" data-action="delete" data-id="${habit.id}" title="Xoá" aria-label="Xoá">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
            </button>
          </div>
        </div>

        <div class="badges">
          <span class="badge ${stageClass}">● ${stageName}</span>
          <span class="badge badge-streak">🔥 Streak: ${habit.streak || 0} ngày</span>
          <span class="badge badge-prob">⏱ Xác suất: ${prob}%</span>
        </div>

        <div class="progress-block">
          <div class="progress-head">
            <span>Điểm tự động hoá (Automaticity)</span>
            <span class="progress-pct">${score.toFixed(1)}%</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width: ${score}%"></div>
          </div>
        </div>

        <div class="chart-block">
          <div class="chart-head">
            <span>Tần suất theo khung giờ</span>
            <span>0h — 23h</span>
          </div>
          <div class="hour-chart">${hourBars}</div>
        </div>

        <div class="checkin-row">
          <button
            class="checkin-btn ${doneToday ? 'done-today' : ''}"
            data-action="checkin"
            data-id="${habit.id}"
            ${doneToday ? 'disabled' : ''}
          >
            ${doneToday
              ? '✓ Đã check-in hôm nay'
              : '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Hoàn thành hôm nay'}
          </button>
        </div>
      </article>
    `;
  }

  /* ---------------- HELPERS ---------------- */
  function formatTime(date) {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }

  function formatDateTime(date) {
    const d = date;
    const day = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
    return `${day} ${formatTime(d)}`;
  }

  function escapeHTML(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ---------------- TOAST ---------------- */
  let toastTimer = null;
  function showToast(message, isError = false) {
    elToast.textContent = message;
    elToast.classList.toggle('is-error', isError);
    elToast.classList.add('is-visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      elToast.classList.remove('is-visible');
    }, 2600);
  }

  /* ---------------- MODAL ---------------- */
  function openAddModal() {
    modalTitle.textContent = 'Thêm thói quen mới';
    habitIdInput.value = '';
    habitNameInput.value = '';
    habitEmojiInput.value = '';
    habitScoreInput.value = '0';
    modalBackdrop.hidden = false;
    modalBackdrop.style.display = '';
    setTimeout(() => habitNameInput.focus(), 50);
  }

  function openEditModal(id) {
    const h = state.habits.find((x) => x.id === id);
    if (!h) return;
    modalTitle.textContent = 'Chỉnh sửa thói quen';
    habitIdInput.value = h.id;
    habitNameInput.value = h.name;
    habitEmojiInput.value = h.emoji || '';
    habitScoreInput.value = String(Math.round(h.score));
    modalBackdrop.hidden = false;
    modalBackdrop.style.display = '';
    setTimeout(() => habitNameInput.focus(), 50);
  }

  function closeModal() {
    modalBackdrop.hidden = true;
    modalBackdrop.style.display = '';
  }

  habitForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const name = habitNameInput.value.trim();
    if (!name) {
      showToast('Vui lòng nhập tên thói quen.', true);
      return;
    }
    addOrUpdateHabit({
      id: habitIdInput.value || null,
      name,
      emoji: habitEmojiInput.value,
      score: habitScoreInput.value,
    });
    closeModal();
    render();
    showToast(habitIdInput.value ? 'Đã cập nhật.' : 'Đã thêm thói quen mới.');
  });

  document.getElementById('openAddBtn').addEventListener('click', openAddModal);
  document.getElementById('emptyAddBtn').addEventListener('click', openAddModal);
  /* Robust: close the modal on ANY click on a button with [data-close] OR
     the legacy icon/X, and stop the click from triggering the form submit. */
  modalBackdrop.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button');
    if (btn) {
      const isClose =
        btn.id === 'closeModalBtn' ||
        btn.id === 'cancelModalBtn' ||
        btn.id === 'modalBigCloseBtn' ||
        btn.dataset.close === '1';
      if (isClose) {
        ev.preventDefault();
        ev.stopPropagation();
        closeModal();
        return;
      }
    }
    if (ev.target === modalBackdrop) closeModal();
  });

  /* ESC closes whichever modal is open */
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (!modalBackdrop.hidden) { closeModal(); return; }
  });

  /* ---------------- CLOCK LOOP ---------------- */
  function tick() {
    const now = new Date();
    elLiveClock.textContent = formatTime(now);
    // Re-render predictive bar every minute, and stats/grid hourly.
    renderPredictiveBar();
  }

  /* ---------------- BOOT ---------------- */
  render();
  tick();
  setInterval(tick, 30000); // update predictive bar every 30s
})();