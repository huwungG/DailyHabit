/**
 * state.js — Sole owner của biến `state`. Mọi mutation phải đi qua đây.
 * Owner: <Tên thành viên phụ trách>
 * Phụ thuộc: ./storage.js, ./algorithms.js
 *
 * Quy tắc team:
 *   - KHÔNG được sửa state.habits từ file khác (sync.js dùng applyRemoteState).
 *   - Thêm field Habit mới → đã được normalizeHabit lo; state.js chỉ truyền qua.
 */

import {
  loadState,
  saveState,
  normalizeHabit,
} from './storage.js';
import {
  applyCheckIn,
  undoLastCheckIn,
  applyDailyDecay,
} from './algorithms.js';

// Biến module-private. Export qua getState() — không export trực tiếp.
let state = loadState();

// Listener cho UI re-render + sync debounce.
const listeners = new Set();

function emit() {
  saveState(state);
  for (const cb of listeners) {
    try {
      cb(state);
    } catch (e) {
      console.error('state listener threw', e);
    }
  }
}

// ─── Public API ─────────────────────────────────────────────

export function getState() {
  return state;
}

export function onChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// Thêm mới hoặc cập nhật habit. Input có thể chứa `id` (update) hoặc không (create).
export function addOrUpdateHabit(input) {
  const id = typeof input?.id === 'string' ? input.id : null;
  const existing = id ? state.habits.find((h) => h.id === id) : null;

  if (existing) {
    // Preserve các field mà form không sửa (history, streak, score...).
    const merged = normalizeHabit({ ...existing, ...input, id });
    Object.assign(existing, merged);
  } else {
    const created = normalizeHabit({ ...input });
    if (created) state.habits.push(created);
  }
  emit();
}

export function checkInHabit(id) {
  const h = state.habits.find((x) => x.id === id);
  if (!h || h._deleted) return;
  applyCheckIn(h);
  emit();
}

export function undoHabit(id) {
  const h = state.habits.find((x) => x.id === id);
  if (!h || h._deleted) return;
  undoLastCheckIn(h);
  emit();
}

// Soft delete: giữ record + _deletedAt để sync biết phải xoá ở cloud.
export function deleteHabit(id) {
  const h = state.habits.find((x) => x.id === id);
  if (!h) return;
  h._deleted = true;
  h._deletedAt = Date.now();
  emit();
}

// Chỉ sync.js được gọi. Thay thế toàn bộ state bằng state đã merge từ cloud.
export function applyRemoteState(next) {
  const normalized = (next && typeof next === 'object')
    ? { habits: (Array.isArray(next.habits) ? next.habits : [])
        .map(normalizeHabit)
        .filter(Boolean) }
    : { habits: [] };
  state = normalized;
  emit();
}

// Chạy decay cho tất cả habit (gọi từ main.js khi khởi động + mỗi ngày).
export function runDailyDecay() {
  for (const h of state.habits) {
    if (!h._deleted) applyDailyDecay(h);
  }
  emit();
}
