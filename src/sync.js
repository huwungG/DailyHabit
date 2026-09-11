/**
 * sync.js — Đồng bộ Google Sheets qua Apps Script Web App.
 * Owner: <Tên thành viên phụ trách>
 * Phụ thuộc: ./state.js, ./storage.js, ./config.js
 *
 * Quy ước:
 *   - KHÔNG mutate state.habits trực tiếp; dùng applyRemoteState() từ state.js.
 *   - URL + passcode lấy từ loadSyncConfig(); KHÔNG hard-code.
 *   - Conflict: server trả { ok:false, conflict:true, serverUpdatedAt, serverState }.
 */

import { getState, applyRemoteState } from './state.js';
import {
  loadSyncConfig,
  loadSyncMeta,
  saveSyncMeta,
  normalizeHabit,
} from './storage.js';
import { AUTO_SYNC_DEBOUNCE_MS } from './config.js';

// ─── Merge logic ────────────────────────────────────────────

// Theo rule trong project: cùng id → entry có history[].timestamp mới nhất thắng;
// id chỉ có ở 1 phía → union.
export function mergeStates(local, remote) {
  const byId = new Map();

  for (const h of local?.habits || []) {
    byId.set(h.id, h);
  }

  for (const r of remote?.habits || []) {
    const cur = byId.get(r.id);
    if (!cur) {
      byId.set(r.id, r);
      continue;
    }
    const curLast = newestTs(cur);
    const remLast = newestTs(r);
    if (remLast > curLast) byId.set(r.id, r);
    // else: giữ cur
  }

  return {
    habits: [...byId.values()].map(normalizeHabit).filter(Boolean),
  };
}

function newestTs(habit) {
  const hist = Array.isArray(habit?.history) ? habit.history : [];
  let max = 0;
  for (const e of hist) {
    const t = Date.parse(e?.timestamp);
    if (Number.isFinite(t) && t > max) max = t;
  }
  // soft-delete cũng tính là "mới" → _deletedAt so với history timestamp
  if (habit?._deletedAt && habit._deletedAt > max) max = habit._deletedAt;
  return max;
}

// ─── Network primitives ─────────────────────────────────────

// TODO: GET ?p=<passcode> → trả { ok, state, updatedAt } | { ok:false, error }
export async function fetchFromCloud() {
  // const cfg = loadSyncConfig();
  // if (!cfg?.url || !cfg?.passcode) return { ok:false, error:'Chưa cấu hình' };
  // const res = await fetch(`${cfg.url}?p=${encodeURIComponent(cfg.passcode)}`);
  // if (!res.ok) return { ok:false, error:`HTTP ${res.status}` };
  // return await res.json();
}

// TODO: POST { p, state, baseUpdatedAt } → trả { ok, updatedAt } | { ok:false, conflict, serverUpdatedAt, serverState }
export async function pushToCloud(state, baseUpdatedAt) {
  // const cfg = loadSyncConfig();
  // if (!cfg?.url || !cfg?.passcode) return { ok:false, error:'Chưa cấu hình' };
  // const res = await fetch(cfg.url, {
  //   method: 'POST',
  //   body: JSON.stringify({ p: cfg.passcode, state, baseUpdatedAt }),
  // });
  // return await res.json();
}

// ─── Composite ops (gọi từ nút trong sync modal) ────────────

// Pull → merge local với remote → push kết quả.
export async function performPullMergePush() {
  // const cfg = loadSyncConfig();
  // if (!cfg?.url || !cfg?.passcode) return;
  // const remote = await fetchFromCloud();
  // if (!remote.ok) return;
  // const merged = mergeStates(getState(), remote.state);
  // applyRemoteState(merged); // render sẽ tự chạy qua onChange
  // const meta = loadSyncMeta();
  // await pushToCloud(merged, meta?.updatedAt || null);
}

// Force push — ghi đè, không cần baseUpdatedAt check.
export async function performPushOnly() {
  // const state = getState();
  // const result = await pushToCloud(state, null);
  // if (result.ok) saveSyncMeta({ ...loadSyncMeta(), updatedAt: result.updatedAt });
}

// Force pull — ghi đè local, có confirm trước khi gọi hàm này.
export async function performPullOnly() {
  // const remote = await fetchFromCloud();
  // if (!remote.ok) return;
  // applyRemoteState(remote.state);
  // saveSyncMeta({ ...loadSyncMeta(), updatedAt: remote.updatedAt });
}

// ─── Auto-sync (debounce) ───────────────────────────────────

let debounceHandle = null;
let lastChangeAt = 0;

export function markDirty() {
  // state.js có thể gọi hàm này (qua onChange) để báo "có thay đổi".
  lastChangeAt = Date.now();
  if (debounceHandle) clearTimeout(debounceHandle);
  debounceHandle = setTimeout(() => {
    debounceHandle = null;
    // Chỉ sync nếu đã đủ im lặng AUTO_SYNC_DEBOUNCE_MS.
    if (Date.now() - lastChangeAt >= AUTO_SYNC_DEBOUNCE_MS) {
      performPullMergePush().catch((e) => console.error('auto-sync failed', e));
    }
  }, AUTO_SYNC_DEBOUNCE_MS);
}

// Stub cho main.js setInterval — nếu không có dirty thì có thể chủ động poll.
export function maybeAutoSync() {
  // TODO: nếu chưa có config thì skip; nếu đang offline thì skip;
  // nếu đủ im lặng thì gọi performPullMergePush.
}
