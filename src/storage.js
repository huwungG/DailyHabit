/**
 * storage.js — Đọc/ghi localStorage & chuẩn hoá state shape
 * Owner: <Tên thành viên phụ trách>
 * Phụ thuộc: ./config.js, ./utils.js
 *
 * Quy tắc team: thêm field Habit mới → sửa storage.js trước, merge xong
 * mới sửa các file khác (algorithms.js, ui.js, v.v.).
 */

import {
  STORAGE_KEY,
  SYNC_CONFIG_KEY,
  SYNC_META_KEY,
  DEFAULT_STATE,
} from './config.js';
import { makeId, clampScore, dayKey } from './utils.js';

// ─── State chính ─────────────────────────────────────────────

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return normalizeState(parsed);
  } catch (e) {
    console.warn('loadState failed, falling back to DEFAULT_STATE', e);
    return structuredClone(DEFAULT_STATE);
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('saveState failed', e);
  }
}

function normalizeState(s) {
  const base = structuredClone(DEFAULT_STATE);
  if (!s || typeof s !== 'object') return base;
  base.habits = (Array.isArray(s.habits) ? s.habits : [])
    .map(normalizeHabit)
    .filter(Boolean);
  return base;
}

// ─── Habit ───────────────────────────────────────────────────

// Field mới cho Habit → sửa hàm này trước, merge xong mới đụng file khác.
export function normalizeHabit(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const id = typeof raw.id === 'string' && raw.id ? raw.id : makeId();
  const name = String(raw.name ?? '').trim() || 'Thói quen';
  const emoji = String(raw.emoji ?? '').slice(0, 4);
  const type = raw.type === 'bad' ? 'bad' : 'good';
  const score = clampScore(raw.score ?? 0);
  const streak = Math.max(0, Number(raw.streak) || 0);
  const lastCompleted = raw.lastCompleted || null;
  const lastDecayAppliedDate = raw.lastDecayAppliedDate || null;
  const history = Array.isArray(raw.history)
    ? raw.history
        .filter((e) => e && typeof e.timestamp === 'string')
        .map((e) => ({
          timestamp: e.timestamp,
          hourOfDay: Math.max(0, Math.min(23, Number(e.hourOfDay) || 0)),
          dateKey: typeof e.dateKey === 'string' ? e.dateKey : dayKey(new Date(e.timestamp)),
        }))
    : [];

  return {
    id,
    name,
    emoji,
    type,
    score,
    streak,
    lastCompleted,
    lastDecayAppliedDate,
    history,
    _deleted: Boolean(raw._deleted),
    _deletedAt: raw._deletedAt || null,
  };
}

// ─── Sync config & meta ──────────────────────────────────────

export function loadSyncConfig() {
  try {
    const raw = localStorage.getItem(SYNC_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSyncConfig(config) {
  localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(config));
}

export function loadSyncMeta() {
  try {
    const raw = localStorage.getItem(SYNC_META_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSyncMeta(meta) {
  localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
}
