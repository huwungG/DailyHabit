/**
 * ui.js — Render DOM. Subscribe vào state qua getState() (không mutate state).
 * Owner: <Tên thành viên phụ trách>
 * Phụ thuộc: ./state.js (chỉ đọc)
 *
 * Quy ước: mọi hàm render ở đây đều thuần idempotent — gọi lại nhiều lần
 * với cùng state phải ra cùng DOM. Không lưu reference ngoài closure.
 */

import { getState } from './state.js';

// ─── Entry point ────────────────────────────────────────────

export function render() {
  renderPredictiveBar();
  renderStats();
  renderGrid();
}

// ─── Thanh dự đoán (top) ────────────────────────────────────

// TODO: lấy giờ hiện tại, gọi probabilityForCurrentHour cho từng habit,
// render top-N habit được dự đoán sẽ check-in lúc này.
export function renderPredictiveBar() {
  // const state = getState();
  // const now = new Date().getHours();
  // const ranked = state.habits
  //   .filter(h => !h._deleted)
  //   .map(h => ({ h, p: probabilityForCurrentHour(h.history, now) }))
  //   .sort((a, b) => b.p - a.p)
  //   .slice(0, 3);
  // ... đổ vào #predictive-bar
}

// ─── Stats header ───────────────────────────────────────────

// TODO: tổng habit, tổng check-in hôm nay, score trung bình, ...
export function renderStats() {
  // const state = getState();
  // ... đổ vào .stat-grid
}

// ─── Grid chính ─────────────────────────────────────────────

// TODO: xoá grid cũ, build lại từ renderHabitCard.
export function renderGrid() {
  // const state = getState();
  // const visible = state.habits.filter(h => !h._deleted);
  // ... append vào #habit-grid
}

// ─── 1 card ─────────────────────────────────────────────────

// TODO: trả về HTMLElement cho 1 habit, gắn data-id để controls.js
// delegate event (check-in / undo / edit / delete).
export function renderHabitCard(habit) {
  // const el = document.createElement('article');
  // el.className = 'habit-card';
  // el.dataset.id = habit.id;
  // ... innerHTML an toàn (dùng escapeHTML từ utils.js nếu nhúng text)
  // return el;
}

// ─── Helper cho card ────────────────────────────────────────

// TODO: tổng check-in, current streak, giờ hay check-in nhất.
export function frequencyStatsForHabit(habit) {
  return {
    total: habit.history?.length ?? 0,
    streak: habit.streak ?? 0,
    bestHour: null, // TODO
  };
}

// TODO: grid 7 cột × N hàng hiển thị cường độ check-in theo ngày (giống GitHub).
export function buildActivityGrid(habit) {
  // return []; // mảng các ô { date, count, intensity 0..4 }
}
