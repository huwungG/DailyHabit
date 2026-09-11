/**
 * utils.js — Hàm pure (không phụ thuộc DOM, không phụ thuộc storage)
 * Owner: <Tên thành viên phụ trách>
 * Phụ thuộc: (không — pure)
 */

// Trả về "YYYY-M-D" KHÔNG zero-pad, đúng định dạng app.js cũ đang dùng.
// Ví dụ: 2026-9-9 (không phải 2026-09-09).
export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// Sinh id có tiền tố 'h_' + base36 random + base36 timestamp.
// TODO: kiểm tra va chạm khi tạo nhanh nhiều habit trong cùng ms.
export function makeId() {
  return 'h_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// Kẹp score về [0, 100], làm tròn, fallback 0 nếu NaN/không phải số.
export function clampScore(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

// Format ISO timestamp → "HH:MM" theo giờ local. Trả về '' nếu falsy.
export function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// Escape chuỗi trước khi nhúng vào innerHTML.
// TODO: nếu sau này chuyển sang textContent thì hàm này không còn cần thiết.
export function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}
