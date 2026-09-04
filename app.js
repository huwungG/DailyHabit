/* =========================================================
   Habit Snowball — Core logic + UI
   ========================================================= */

(() => {
  'use strict';

  /* ---------------- STORAGE ---------------- */
  const STORAGE_KEY = 'habit_snowball_v1';
  const SYNC_CONFIG_KEY = 'habit_snowball_sync_v1';
  const SYNC_META_KEY = 'habit_snowball_sync_meta_v1';

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
      // 'good' = check-ins raise the automaticity score.
      // 'bad'  = check-ins lower it (the user wants to track / avoid them).
      type: h.type === 'bad' ? 'bad' : 'good',
      score: clampScore(Number(h.score) || 0),
      streak: Math.max(0, Math.floor(Number(h.streak) || 0)),
      lastCompleted: h.lastCompleted || null,
      lastDecayAppliedDate: h.lastDecayAppliedDate || null,
      // history entries: each check-in is a { timestamp, hourOfDay, dateKey } record.
      // Multi-check-ins per day are now allowed.
      history: Array.isArray(h.history)
        ? h.history
            .map((entry) => {
              const ts = Number(entry.timestamp) || Date.now();
              const d = new Date(ts);
              return {
                timestamp: ts,
                hourOfDay:
                  typeof entry.hourOfDay === 'number'
                    ? entry.hourOfDay
                    : d.getHours(),
                dateKey:
                  typeof entry.dateKey === 'string'
                    ? entry.dateKey
                    : dayKey(d),
              };
            })
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
   *
   * Multi check-ins per day are now allowed:
   *   - The first check-in of the day contributes full BASE_GAIN.
   *   - Each subsequent check-in on the same day adds a *diminishing*
   *     extra bonus:  base_gain * 0.5^(extra_count - 1), capped at 2.
   *   - Streak still bumps only once per calendar day (first check-in).
   *   - score is capped at 100.
   */
  const BASE_GAIN = 6;

  function computeCheckInGain(streak) {
    return BASE_GAIN * (1 + streak * 0.1);
  }

  function computeSameDayExtraGain(extraCount) {
    // extraCount starts at 1 for the 2nd check-in of the day.
    const factor = Math.pow(0.5, extraCount - 1);
    return Math.max(0.5, Math.min(2, BASE_GAIN * 0.5 * factor));
  }

  function applyCheckIn(habit, now = new Date()) {
    const previousStreak = habit.streak || 0;
    const todayKey = dayKey(now);

    // Count how many check-ins the user already logged today.
    const todaysCount = habit.history.filter(
      (entry) => entry.dateKey === todayKey
    ).length;

    let nextStreak = previousStreak;
    let isFirstOfDay = false;

    if (todaysCount === 0) {
      // First check-in of the day.
      isFirstOfDay = true;
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
    }

    let gain;
    if (isFirstOfDay) {
      gain = computeCheckInGain(previousStreak);
    } else {
      gain = computeSameDayExtraGain(todaysCount); // 2nd, 3rd, ...
    }

    // Bad habits: each check-in *reduces* the automaticity score.
    if (habit.type === 'bad') {
      gain = -Math.abs(gain);
    }

    habit.streak = nextStreak;
    habit.score = clampScore(habit.score + gain);
    habit.lastCompleted = now.toISOString();
    habit.history.push({
      timestamp: now.getTime(),
      hourOfDay: now.getHours(),
      dateKey: todayKey,
    });

    return {
      changed: true,
      streak: nextStreak,
      gain,
      score: habit.score,
      isFirstOfDay,
      todaysCount: todaysCount + 1,
    };
  }

  /**
   * Undo the most recent check-in. Removes the last history entry,
   * reverses the gain, and reverts streak/lastCompleted if needed.
   */
  function undoLastCheckIn(habit) {
    if (!habit.history || habit.history.length === 0) {
      return { changed: false, reason: 'Chưa có lượt check-in nào để hoàn tác.' };
    }

    const lastEntry = habit.history[habit.history.length - 1];
    const entryDateKey = lastEntry.dateKey;
    const isLastOfDay = habit.history.filter((e) => e.dateKey === entryDateKey)
      .length === 1;

    // Reverse gain
    if (isLastOfDay) {
      // We need to undo the day's gain: if it was the first-of-day, full gain;
      // otherwise, the diminishing extra gain for that index.
      const sameDayEntries = habit.history.filter(
        (e) => e.dateKey === entryDateKey
      );
      // After removal, the previous "first-of-day" is the highest remaining one.
      const prevFirstIndex = habit.history.length - 2;
      let streakBeforeThisDay = habit.streak;
      // Recompute what the streak was right before this day.
      if (prevFirstIndex >= 0) {
        // Walk back through entries to find the previous day's last timestamp.
        let i = prevFirstIndex;
        while (i >= 0 && habit.history[i].dateKey === entryDateKey) i -= 1;
        if (i >= 0) {
          // We need the streak value at the time the previous day was completed.
          // For simplicity, recompute from scratch by simulating the day-order.
          streakBeforeThisDay = computeStreakFromHistory(habit.history, i);
        } else {
          streakBeforeThisDay = 0;
        }
      } else {
        streakBeforeThisDay = 0;
      }

      const gain =
        sameDayEntries.length === 1
          ? computeCheckInGain(streakBeforeThisDay)
          : computeSameDayExtraGain(sameDayEntries.length - 1);

      const signed = habit.type === 'bad' ? -Math.abs(gain) : gain;
      habit.score = clampScore(habit.score - signed);
      habit.streak = streakBeforeThisDay;
    } else {
      // There are still other entries today. Use diminishing series.
      const remainingSameDay = habit.history.filter(
        (e) => e.dateKey === entryDateKey
      ).length;
      const extraIndex = remainingSameDay; // 1st, 2nd, ... of remaining today
      const gain = computeSameDayExtraGain(extraIndex);
      const signed = habit.type === 'bad' ? -Math.abs(gain) : gain;
      habit.score = clampScore(habit.score - signed);
    }

    habit.history.pop();

    // Update lastCompleted to most recent remaining entry
    if (habit.history.length > 0) {
      const last = habit.history[habit.history.length - 1];
      habit.lastCompleted = new Date(last.timestamp).toISOString();
    } else {
      habit.lastCompleted = null;
      habit.streak = 0;
    }

    return {
      changed: true,
      removed: lastEntry,
    };
  }

  /**
   * Recompute streak by walking backwards from index `endIdx` (inclusive)
   * through habit.history, counting consecutive days back to today.
   */
  function computeStreakFromHistory(historyArr, endIdx) {
    if (endIdx < 0 || endIdx >= historyArr.length) return 0;
    // Collect unique dateKeys in [0..endIdx], most recent first.
    const seen = new Set();
    const uniqueDays = [];
    for (let i = endIdx; i >= 0; i -= 1) {
      const k = historyArr[i].dateKey;
      if (!seen.has(k)) {
        seen.add(k);
        uniqueDays.push(k);
      }
    }
    // Count consecutive days ending at uniqueDays[0].
    if (uniqueDays.length === 0) return 0;
    let streak = 1;
    for (let i = 1; i < uniqueDays.length; i += 1) {
      const prev = new Date(uniqueDays[i - 1]);
      const cur = new Date(uniqueDays[i]);
      if (diffDays(cur, prev) === 1) {
        streak += 1;
      } else {
        break;
      }
    }
    return streak;
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
            out.push({ timestamp: ts, hourOfDay: h, dateKey: dayKey(new Date(ts)) });
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
      { ...mk('Hút thuốc', '🚬', 30, 0, synthHistory([10, 15, 20])), type: 'bad' },
      { ...mk('Lướt điện thoại trước khi ngủ', '📱', 55, 0, synthHistory([22, 23, 0])), type: 'bad' },
    ];
    saveState();
  }
  seedIfEmpty();

  function addOrUpdateHabit({ id, name, emoji, score, type }) {
    if (id) {
      const h = state.habits.find((x) => x.id === id);
      if (h) {
        h.name = name.trim() || 'Thói quen không tên';
        h.emoji = (emoji || '').trim().slice(0, 4);
        h.score = clampScore(Number(score) || 0);
        h.type = type === 'bad' ? 'bad' : 'good';
        saveState();
        return h;
      }
    }
    const fresh = normalizeHabit({
      id: makeId(),
      name: (name || '').trim() || 'Thói quen mới',
      emoji: (emoji || '').trim().slice(0, 4),
      type: type === 'bad' ? 'bad' : 'good',
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
    const suffix = result.isFirstOfDay
      ? ''
      : ` • lần ${result.todaysCount} trong ngày`;
    const sign = result.gain >= 0 ? '+' : '';
    showToast(
      `${sign}${result.gain.toFixed(1)} điểm • Streak: ${result.streak} ngày • Tổng: ${result.score.toFixed(1)}%${suffix}`
    );
  }

  function undoHabit(id) {
    const habit = state.habits.find((h) => h.id === id);
    if (!habit) return;
    const result = undoLastCheckIn(habit);
    saveState();
    if (!result.changed) {
      showToast(result.reason, true);
      return;
    }
    showToast('Đã hoàn tác lượt check-in gần nhất.');
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
  const elStatTodayCount = document.getElementById('statTodayCount');
  const elStatTotalChecks = document.getElementById('statTotalChecks');
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

    // New: today's check-ins + total check-ins across all habits.
    const todayKey = dayKey(new Date());
    let todayCount = 0;
    let totalChecks = 0;
    habits.forEach((h) => {
      h.history.forEach((entry) => {
        totalChecks += 1;
        if (entry.dateKey === todayKey) todayCount += 1;
      });
    });
    elStatTodayCount.textContent = todayCount;
    elStatTotalChecks.textContent = totalChecks;
  }

  /* ---------------- FREQUENCY STATS & ACTIVITY GRAPH ---------------- */

  function frequencyStatsForHabit(habit, now = new Date()) {
    const todayKey = dayKey(now);
    const nowMs = now.getTime();
    const day = 86400000;
    const count = { today: 0, last7: 0, last30: 0, total: 0, bestDay: 0 };

    const perDay = new Map();
    habit.history.forEach((entry) => {
      count.total += 1;
      if (entry.dateKey === todayKey) count.today += 1;
      if (nowMs - entry.timestamp <= 7 * day) count.last7 += 1;
      if (nowMs - entry.timestamp <= 30 * day) count.last30 += 1;
      perDay.set(entry.dateKey, (perDay.get(entry.dateKey) || 0) + 1);
    });
    perDay.forEach((v) => {
      if (v > count.bestDay) count.bestDay = v;
    });
    return count;
  }

  /**
   * Build a 26-week (≈182 days) activity grid: rows = day-of-week (Sun..Sat),
   * columns = weeks (oldest left, newest right). Returns:
   *   { weeks: [[ {dateKey, count, date} ], ...], monthLabels: [{weekIdx, label}] }
   */
  function buildActivityGrid(habit, now = new Date()) {
    const totalDays = 26 * 7; // ~6 months
    const start = startOfDay(now);
    start.setDate(start.getDate() - (totalDays - 1));

    // Align grid so each column is a week starting on Sunday.
    // Compute the Sunday on/before `start`.
    const firstSunday = new Date(start);
    firstSunday.setDate(firstSunday.getDate() - firstSunday.getDay());

    // Build day-count map.
    const perDay = new Map();
    habit.history.forEach((entry) => {
      if (entry.dateKey) perDay.set(entry.dateKey, (perDay.get(entry.dateKey) || 0) + 1);
    });

    // Determine level thresholds based on max count.
    let maxCount = 0;
    perDay.forEach((v) => {
      if (v > maxCount) maxCount = v;
    });

    const weeks = [];
    let cursor = new Date(firstSunday);
    const todayKey = dayKey(now);
    const lastDate = startOfDay(now);

    let safety = 0;
    while (cursor <= lastDate && safety < 60) {
      const week = [];
      for (let d = 0; d < 7; d += 1) {
        const cellDate = new Date(cursor);
        const k = dayKey(cellDate);
        const count = perDay.get(k) || 0;
        const isFuture = cellDate > lastDate;
        const isToday = k === todayKey;
        let level = 0;
        if (!isFuture && count > 0 && maxCount > 0) {
          const ratio = count / maxCount;
          if (ratio <= 0.25) level = 1;
          else if (ratio <= 0.5) level = 2;
          else if (ratio <= 0.75) level = 3;
          else level = 4;
        }
        week.push({
          dateKey: k,
          count,
          date: cellDate,
          isFuture,
          isToday,
          level,
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(week);
      safety += 1;
    }

    // Month labels: put label on the first week whose day1's month differs from previous week.
    const monthLabels = [];
    let prevMonth = -1;
    weeks.forEach((week, idx) => {
      const first = week[0];
      if (!first || first.isFuture) {
        monthLabels.push({ idx, label: '' });
        return;
      }
      const m = first.date.getMonth();
      if (m !== prevMonth) {
        monthLabels.push({ idx, label: `T${first.date.getMonth() + 1}` });
        prevMonth = m;
      } else {
        monthLabels.push({ idx, label: '' });
      }
    });

    return { weeks, monthLabels, maxCount };
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
    } else if (action === 'undo') {
      undoHabit(id);
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
    const todayKey = dayKey(now);
    const todaysCount = habit.history.filter((e) => e.dateKey === todayKey).length;
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

    const freq = frequencyStatsForHabit(habit, now);
    const grid = buildActivityGrid(habit, now);

    const cells = grid.weeks
      .map((week) =>
        week
          .map(
            (cell) => {
              const lvl = cell.isFuture ? 0 : cell.level;
              const lvlAttr = cell.isToday ? 'today' : String(lvl);
              const title = cell.isFuture
                ? ''
                : `${formatDateShort(cell.date)} — ${cell.count} lượt`;
              return `<div class="activity-cell" data-level="${lvlAttr}" title="${title}"></div>`;
            }
          )
          .join('')
      )
      .join('');

    const monthRow = grid.monthLabels
      .map((m) => `<span>${escapeHTML(m.label)}</span>`)
      .join('');

    const historyItems = habit.history
      .slice(-30)
      .reverse()
      .map((entry) => {
        const d = new Date(entry.timestamp);
        const dateLabel = `${d.getDate()}/${d.getMonth() + 1}`;
        const timeLabel = `${String(d.getHours()).padStart(2, '0')}:${String(
          d.getMinutes()
        ).padStart(2, '0')}`;
        return `
          <div class="history-item">
            <span><span class="ts">${timeLabel}</span> <span class="meta">${dateLabel}</span></span>
            <span class="meta">${entry.dateKey === todayKey ? 'hôm nay' : ''}</span>
          </div>
        `;
      })
      .join('');

    const historyBlock = habit.history.length
      ? `<div class="history-list">${historyItems}</div>`
      : `<div class="history-list"><div class="history-empty">Chưa có lượt check-in nào.</div></div>`;

    const isBad = habit.type === 'bad';
    const cardClass = `habit-card${isBad ? ' is-bad' : ''}`;
    const typeBadge = isBad
      ? `<span class="badge badge-type-bad">🚫 Thói quen xấu</span>`
      : `<span class="badge badge-type-good">✨ Thói quen tốt</span>`;
    const checkinLabel =
      todaysCount === 0
        ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> ${isBad ? 'Đã mắc hôm nay' : 'Hoàn thành hôm nay'}`
        : `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> ${isBad ? `Ghi nhận thêm (${todaysCount} hôm nay)` : `Check-in thêm (${todaysCount} hôm nay)`}`;

    return `
      <article class="${cardClass}" data-id="${habit.id}">
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
          ${typeBadge}
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

        <div class="history-block">
          <div class="history-head">
            <span>Tần suất hoạt động</span>
            <span class="history-stats">
              <span><strong>${freq.today}</strong>hôm nay</span>
              <span><strong>${freq.last7}</strong>/7n</span>
              <span><strong>${freq.last30}</strong>/30n</span>
              <span><strong>${freq.total}</strong>tổng</span>
            </span>
          </div>
          <div class="activity-months">${monthRow}</div>
          <div class="activity-graph">${cells}</div>
          <div class="activity-legend">
            <span>Ít</span>
            <div class="activity-cell" data-level="0"></div>
            <div class="activity-cell" data-level="1"></div>
            <div class="activity-cell" data-level="2"></div>
            <div class="activity-cell" data-level="3"></div>
            <div class="activity-cell" data-level="4"></div>
            <span>Nhiều</span>
          </div>
        </div>

        ${historyBlock}

        <div class="checkin-row">
          <button
            class="checkin-btn ${todaysCount > 0 ? 'done-today' : ''}"
            data-action="checkin"
            data-id="${habit.id}"
          >
            ${checkinLabel}
          </button>
          <button
            class="mini-btn"
            data-action="undo"
            data-id="${habit.id}"
            title="Hoàn tác lượt gần nhất"
            aria-label="Hoàn tác"
            ${habit.history.length === 0 ? 'disabled' : ''}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/></svg>
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

  function formatDateShort(date) {
    return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
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
  function getSelectedHabitType() {
    const r = document.querySelector('input[name="habitType"]:checked');
    return r && r.value === 'bad' ? 'bad' : 'good';
  }

  function setSelectedHabitType(type) {
    const target = type === 'bad' ? 'bad' : 'good';
    document.querySelectorAll('input[name="habitType"]').forEach((r) => {
      r.checked = r.value === target;
    });
    document.querySelectorAll('.type-option').forEach((el) => {
      el.classList.toggle(
        'is-selected',
        el.querySelector('input[name="habitType"]').value === target
      );
    });
  }

  function openAddModal() {
    modalTitle.textContent = 'Thêm thói quen mới';
    habitIdInput.value = '';
    habitNameInput.value = '';
    habitEmojiInput.value = '';
    habitScoreInput.value = '0';
    setSelectedHabitType('good');
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
    setSelectedHabitType(h.type || 'good');
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
      type: getSelectedHabitType(),
    });
    closeModal();
    render();
    showToast(habitIdInput.value ? 'Đã cập nhật.' : 'Đã thêm thói quen mới.');
  });

  // Toggle visual selection on the type picker
  document.querySelectorAll('input[name="habitType"]').forEach((radio) => {
    radio.addEventListener('change', () => setSelectedHabitType(radio.value));
  });
  document.querySelectorAll('.type-option').forEach((opt) => {
    opt.addEventListener('click', () => {
      const v = opt.querySelector('input[name="habitType"]').value;
      setSelectedHabitType(v);
    });
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
  // Auto-sync in background every 60s (best-effort, only when configured + online).
  setInterval(() => { maybeAutoSync(); }, 60000);
  window.addEventListener('online', () => { maybeAutoSync(true); });

  /* =========================================================
   *  SYNC MODULE — Google Apps Script + Google Sheets backend
   * ========================================================= */
  //
  // State stored in localStorage (per-device):
  //   SYNC_CONFIG_KEY: { url, passcode, deviceId, deviceName }
  //   SYNC_META_KEY  : { lastSyncedAt, lastPushAt, lastPullAt, lastError }
  //
  // Server-side single source of truth lives in Google Sheets
  // (managed by Code.gs). We always keep a full local snapshot of
  // `state` and merge it with the server snapshot using a
  // "most-recent history per habit wins" rule, so simultaneous edits
  // on two devices won't silently drop data.

  function loadSyncConfig() {
    try {
      const raw = localStorage.getItem(SYNC_CONFIG_KEY);
      if (!raw) return null;
      const cfg = JSON.parse(raw);
      if (cfg && typeof cfg === 'object') return cfg;
    } catch (err) { /* ignore */ }
    return null;
  }

  function saveSyncConfig(cfg) {
    localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(cfg));
  }

  function loadSyncMeta() {
    try {
      const raw = localStorage.getItem(SYNC_META_KEY);
      if (!raw) return { lastSyncedAt: 0, lastPushAt: 0, lastPullAt: 0, lastError: '' };
      return Object.assign({ lastSyncedAt: 0, lastPushAt: 0, lastPullAt: 0, lastError: '' }, JSON.parse(raw));
    } catch (err) {
      return { lastSyncedAt: 0, lastPushAt: 0, lastPullAt: 0, lastError: '' };
    }
  }

  function saveSyncMeta(meta) {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
  }

  function ensureDeviceId(cfg) {
    let id = cfg.deviceId;
    if (!id || typeof id !== 'string') {
      id = 'dev_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      cfg.deviceId = id;
    }
    if (!cfg.deviceName) {
      try {
        const ua = navigator.userAgent || '';
        let name = 'Thiết bị';
        if (/iPhone/i.test(ua)) name = 'iPhone';
        else if (/iPad/i.test(ua)) name = 'iPad';
        else if (/Android/i.test(ua)) name = 'Android';
        else if (/Windows/i.test(ua)) name = 'Windows';
        else if (/Mac/i.test(ua)) name = 'Mac';
        else if (/Linux/i.test(ua)) name = 'Linux';
        cfg.deviceName = name;
      } catch (err) {
        cfg.deviceName = 'Thiết bị';
      }
    }
    return cfg;
  }

  /**
   * Merge two habit lists (local + remote) so that:
   *  - New habits on either side are kept.
   *  - If the same habit ID exists on both, we keep the side whose
   *    last history entry is more recent. If both have empty history
   *    (e.g. newly created), we prefer the higher score; if equal,
   *    we keep the local copy.
   *
   * Returns: merged { habits } state.
   */
  function mergeStates(local, remote) {
    const localHabits  = Array.isArray(local  && local.habits)  ? local.habits  : [];
    const remoteHabits = Array.isArray(remote && remote.habits) ? remote.habits : [];

    const byId = new Map();
    // Index local first.
    localHabits.forEach((h) => byId.set(h.id, { local: h, remote: null }));
    // Merge remote in.
    remoteHabits.forEach((h) => {
      const entry = byId.get(h.id);
      if (!entry) {
        byId.set(h.id, { local: null, remote: h });
      } else {
        entry.remote = h;
      }
    });

    const merged = [];
    byId.forEach(({ local: lh, remote: rh }) => {
      const winner = pickWinner_(lh, rh);
      merged.push(winner);
    });

    // Sort newest-first like the rest of the app expects.
    merged.sort((a, b) => {
      const ta = a.lastCompleted ? new Date(a.lastCompleted).getTime() : 0;
      const tb = b.lastCompleted ? new Date(b.lastCompleted).getTime() : 0;
      return tb - ta;
    });

    return { habits: merged };
  }

  function pickWinner_(local, remote) {
    if (local && !remote) return local;
    if (remote && !local) return remote;

    const lHist = Array.isArray(local.history)  ? local.history  : [];
    const rHist = Array.isArray(remote.history) ? remote.history : [];

    const lLatest = lHist.length ? lHist[lHist.length - 1].timestamp : 0;
    const rLatest = rHist.length ? rHist[rHist.length - 1].timestamp : 0;

    if (lLatest !== rLatest) {
      return lLatest > rLatest ? local : remote;
    }

    // Tiebreaker: prefer higher score, then local.
    if ((local.score || 0) !== (remote.score || 0)) {
      return (local.score || 0) > (remote.score || 0) ? local : remote;
    }
    return local;
  }

  /** Read from cloud. Returns { ok, state, updatedAt } or { ok:false, error }. */
  async function fetchFromCloud(cfg) {
    const url = cfg.url + (cfg.url.includes('?') ? '&' : '?') + 'p=' + encodeURIComponent(cfg.passcode || '');
    const res = await fetch(url, { method: 'GET', redirect: 'follow' });
    if (!res.ok) {
      return { ok: false, error: 'HTTP ' + res.status };
    }
    const data = await res.json();
    return data;
  }

  /** Write to cloud. Returns { ok, updatedAt } or { ok:false, error, conflict, serverState }. */
  async function pushToCloud(cfg, stateObj, baseUpdatedAt) {
    const url = cfg.url + (cfg.url.includes('?') ? '&' : '?') + 'p=' + encodeURIComponent(cfg.passcode || '');
    const body = JSON.stringify({
      state: stateObj,
      updatedAt: Date.now(),
      baseUpdatedAt: baseUpdatedAt || 0,
    });
    const res = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
    });
    if (!res.ok) {
      return { ok: false, error: 'HTTP ' + res.status };
    }
    const data = await res.json();
    return data;
  }

  /** Pull → merge → push back. Safe default for the user. */
  async function performPullMergePush(cfg) {
    const meta = loadSyncMeta();
    const localSnapshot = JSON.parse(JSON.stringify(state));
    let serverUpdatedAt = 0;

    const fetch = await fetchFromCloud(cfg);
    if (!fetch.ok) {
      meta.lastError = fetch.error || 'Tải về thất bại';
      saveSyncMeta(meta);
      return { ok: false, error: meta.lastError };
    }

    const serverState = fetch.state || { habits: [] };
    serverUpdatedAt   = Number(fetch.updatedAt) || 0;

    const merged = mergeStates(localSnapshot, serverState);

    // Push merged result back so both sides converge.
    const push = await pushToCloud(cfg, merged, serverUpdatedAt);
    if (!push.ok) {
      meta.lastError = push.error || 'Đẩy lên thất bại';
      saveSyncMeta(meta);
      return { ok: false, error: meta.lastError, conflict: !!push.conflict };
    }

    // Apply merge locally.
    state = merged;
    saveState();
    saveSyncMeta({
      lastSyncedAt: Date.now(),
      lastPushAt: Date.now(),
      lastPullAt: Date.now(),
      lastError: '',
    });
    render();
    return { ok: true, merged: true };
  }

  /** Just push local state up (overwrites cloud). */
  async function performPushOnly(cfg) {
    const meta = loadSyncMeta();
    const localSnapshot = JSON.parse(JSON.stringify(state));
    const fetch = await fetchFromCloud(cfg);
    const serverUpdatedAt = fetch.ok ? (Number(fetch.updatedAt) || 0) : 0;

    const push = await pushToCloud(cfg, localSnapshot, serverUpdatedAt);
    if (!push.ok) {
      meta.lastError = push.error || 'Đẩy lên thất bại';
      saveSyncMeta(meta);
      return { ok: false, error: meta.lastError, conflict: !!push.conflict, serverState: push.serverState };
    }
    saveSyncMeta({
      lastSyncedAt: Date.now(),
      lastPushAt: Date.now(),
      lastPullAt: meta.lastPullAt,
      lastError: '',
    });
    showToast('Đã đẩy lên cloud.');
    return { ok: true };
  }

  /** Just pull from cloud and overwrite local. */
  async function performPullOnly(cfg) {
    const meta = loadSyncMeta();
    const fetch = await fetchFromCloud(cfg);
    if (!fetch.ok) {
      meta.lastError = fetch.error || 'Tải về thất bại';
      saveSyncMeta(meta);
      return { ok: false, error: meta.lastError };
    }
    const serverState = fetch.state || { habits: [] };
    state = serverState;
    state.habits = (state.habits || []).map(normalizeHabit);
    saveState();
    saveSyncMeta({
      lastSyncedAt: Date.now(),
      lastPushAt: meta.lastPushAt,
      lastPullAt: Date.now(),
      lastError: '',
    });
    render();
    showToast('Đã tải về từ cloud.');
    return { ok: true };
  }

  function maybeAutoSync(force) {
    const cfg = loadSyncConfig();
    if (!cfg || !cfg.url) return;
    if (!navigator.onLine) return;
    // Don't auto-sync right after a user edit (avoid stomping); instead,
    // debounce: any state-mutating call schedules a sync in 4s.
    if (syncScheduled_) return;
    syncScheduled_ = true;
    setTimeout(async () => {
      syncScheduled_ = false;
      try {
        await performPullMergePush(cfg);
      } catch (err) {
        // swallow auto-sync errors quietly
        const meta = loadSyncMeta();
        meta.lastError = (err && err.message) ? err.message : String(err);
        saveSyncMeta(meta);
      }
    }, force ? 0 : 4000);
  }
  let syncScheduled_ = false;

  /* ---------------- SYNC UI WIRING ---------------- */
  const syncBackdrop     = document.getElementById('syncBackdrop');
  const syncUrlInput     = document.getElementById('syncUrl');
  const syncPassInput    = document.getElementById('syncPass');
  const syncStatusEl     = document.getElementById('syncStatus');
  const syncLastInfoEl   = document.getElementById('syncLastInfo');
  const syncBtn          = document.getElementById('openSyncBtn');

  function openSyncModal() {
    const cfg = ensureDeviceId(loadSyncConfig() || {});
    syncUrlInput.value  = cfg.url || '';
    syncPassInput.value = cfg.passcode || '';
    updateSyncLastInfo();
    syncBackdrop.hidden = false;
    syncBackdrop.style.display = '';
    setTimeout(() => syncUrlInput.focus(), 50);
  }
  function closeSyncModal() {
    syncBackdrop.hidden = true;
    syncBackdrop.style.display = '';
  }
  function updateSyncLastInfo() {
    const meta = loadSyncMeta();
    if (!meta.lastSyncedAt) {
      syncLastInfoEl.textContent = 'Chưa từng đồng bộ.';
      return;
    }
    const fmt = (ts) => {
      if (!ts) return '—';
      const d = new Date(ts);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')}`;
    };
    syncLastInfoEl.textContent =
      `Lần cuối: ${fmt(meta.lastSyncedAt)} • Push: ${fmt(meta.lastPushAt)} • Pull: ${fmt(meta.lastPullAt)}` +
      (meta.lastError ? ` • Lỗi gần nhất: ${meta.lastError}` : '');
  }
  function setSyncBusy(busy) {
    if (!syncBtn) return;
    syncBtn.classList.toggle('is-syncing', !!busy);
    syncBtn.disabled = !!busy;
  }

  function handleSyncError(prefix, err) {
    const msg = (err && err.error) ? err.error : (err && err.message) ? err.message : String(err || 'Lỗi không xác định');
    showToast(prefix + ': ' + msg, true);
    const meta = loadSyncMeta();
    meta.lastError = msg;
    saveSyncMeta(meta);
    updateSyncLastInfo();
  }

  if (syncBtn) {
    syncBtn.addEventListener('click', openSyncModal);
  }

  document.getElementById('closeSyncBtn').addEventListener('click', closeSyncModal);
  document.getElementById('syncBigCloseBtn').addEventListener('click', closeSyncModal);
  syncBackdrop.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button');
    if (btn && (btn.id === 'closeSyncBtn' || btn.id === 'syncBigCloseBtn' || btn.dataset.closeSync === '1')) {
      closeSyncModal();
      return;
    }
    if (ev.target === syncBackdrop) closeSyncModal();
  });

  document.getElementById('syncSaveBtn').addEventListener('click', () => {
    const url = (syncUrlInput.value || '').trim();
    const passcode = (syncPassInput.value || '').trim();
    if (!url || !/^https:\/\/script\.google\.com\//.test(url)) {
      showToast('URL không hợp lệ. Cần bắt đầu bằng https://script.google.com/', true);
      return;
    }
    let cfg = ensureDeviceId(loadSyncConfig() || {});
    cfg.url = url;
    cfg.passcode = passcode;
    saveSyncConfig(cfg);
    showToast('Đã lưu cấu hình đồng bộ.');
    updateSyncLastInfo();
    maybeAutoSync(true);
  });

  document.getElementById('syncPushBtn').addEventListener('click', async () => {
    const cfg = ensureDeviceId(loadSyncConfig() || {});
    if (!cfg.url) {
      showToast('Vui lòng nhập URL và bấm Lưu cấu hình trước.', true);
      return;
    }
    saveSyncConfig({ ...cfg, url: syncUrlInput.value.trim(), passcode: syncPassInput.value.trim() });
    setSyncBusy(true);
    try {
      const cfg2 = loadSyncConfig();
      const res = await performPushOnly(cfg2);
      if (!res.ok) {
        handleSyncError('Đẩy lên thất bại', res);
        if (res.conflict && res.serverState) {
          const ok = confirm('Server có phiên bản mới hơn. Bạn có muốn gộp (merge) với server không? Bấm Cancel để giữ nguyên bản local và không ghi đè.');
          if (ok) {
            const m = await performPullMergePush(cfg2);
            if (!m.ok) handleSyncError('Merge thất bại', m);
          }
        }
      }
    } finally {
      setSyncBusy(false);
      updateSyncLastInfo();
    }
  });

  document.getElementById('syncPullBtn').addEventListener('click', async () => {
    const cfg = ensureDeviceId(loadSyncConfig() || {});
    if (!cfg.url) {
      showToast('Vui lòng nhập URL và bấm Lưu cấu hình trước.', true);
      return;
    }
    saveSyncConfig({ ...cfg, url: syncUrlInput.value.trim(), passcode: syncPassInput.value.trim() });
    const ok = confirm('Tải về từ cloud sẽ THAY THẾ toàn bộ dữ liệu trên thiết bị này. Nếu muốn an toàn, hãy dùng nút "Lưu cấu hình" rồi đợi app tự đồng bộ. Tiếp tục?');
    if (!ok) return;
    setSyncBusy(true);
    try {
      const cfg2 = loadSyncConfig();
      const res = await performPullOnly(cfg2);
      if (!res.ok) handleSyncError('Tải về thất bại', res);
    } finally {
      setSyncBusy(false);
      updateSyncLastInfo();
    }
  });

  // ESC closes sync modal too
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !syncBackdrop.hidden) closeSyncModal();
  });

  /* ---------------- HOOK SYNC INTO STATE MUTATIONS ---------------- */
  // Wrap saveState to schedule a background sync after each change.
  // (We mutate the inner variable instead of redefining saveState
  // to keep all existing call sites working.)
  const _origSaveState = saveState;
  saveState = function patchedSaveState() {
    _origSaveState();
    scheduleBackgroundSync_();
  };
  function scheduleBackgroundSync_() {
    const cfg = loadSyncConfig();
    if (!cfg || !cfg.url) return;
    if (syncScheduled_) return;
    syncScheduled_ = true;
    setTimeout(async () => {
      syncScheduled_ = false;
      if (!navigator.onLine) return;
      try {
        await performPullMergePush(cfg);
      } catch (err) {
        const meta = loadSyncMeta();
        meta.lastError = (err && err.message) ? err.message : String(err);
        saveSyncMeta(meta);
      }
    }, 5000);
  }
})();