/**
 * algorithms.js — Logic tính điểm, decay, dự đoán giờ check-in
 * Owner: <Tên thành viên phụ trách>
 * Phụ thuộc: ./config.js, ./utils.js
 *
 * Lưu ý: hàm ở đây MUTATE trực tiếp đối tượng habit được truyền vào
 * để state.js không phải tự re-assign. Nếu thay đổi hành vi mutate →
 * sang pure, phải cập nhật state.js cho khớp.
 */

import { BASE_GAIN, STREAK_BONUS_CAP } from './config.js';
import { dayKey, clampScore } from './utils.js';

// Cộng điểm khi user check-in. Tự sinh history entry và cập nhật streak.
// TODO: hiệu chỉnh công thức snowball (đang dùng bonus tuyến tính theo streak).
// TODO: xác nhận hành vi khi habit.type === 'bad' (đang trừ điểm).
export function applyCheckIn(habit, now = new Date()) {
  const ts = now.toISOString();
  const entry = {
    timestamp: ts,
    hourOfDay: now.getHours(),
    dateKey: dayKey(now),
  };

  const history = Array.isArray(habit.history) ? habit.history : [];
  const alreadyToday = history.some((h) => h.dateKey === entry.dateKey);

  // Lần đầu trong ngày: BASE_GAIN + bonus theo streak. Trùng ngày: chỉ +1.
  const streak = Number(habit.streak) || 0;
  const bonus = Math.min(streak, STREAK_BONUS_CAP);
  const gain = alreadyToday ? 1 : BASE_GAIN + bonus;
  const delta = habit.type === 'bad' ? -gain : gain;

  habit.score = clampScore((Number(habit.score) || 0) + delta);
  habit.streak = streak + 1;
  habit.lastCompleted = ts;
  habit.history = [...history, entry];
  return habit;
}

// Hoàn tác lần check-in gần nhất: bỏ entry cuối, revert score & streak.
// TODO: cần quyết định công thức revert (delta bao nhiêu? có trừ bonus không?).
export function undoLastCheckIn(habit) {
  const history = Array.isArray(habit.history) ? habit.history : [];
  if (history.length === 0) return habit;

  const last = history[history.length - 1];
  const remaining = history.slice(0, -1);

  // TODO: lưu delta gốc vào entry lúc check-in để revert chính xác.
  // Hiện tại đoán ngược: nếu type === 'bad' thì revert là cộng, ngược lại trừ.
  const isBad = habit.type === 'bad';
  const delta = isBad ? BASE_GAIN : -BASE_GAIN;
  habit.score = clampScore((Number(habit.score) || 0) + delta);

  habit.streak = Math.max(0, (Number(habit.streak) || 1) - 1);
  habit.history = remaining;
  habit.lastCompleted = remaining.length
    ? remaining[remaining.length - 1].timestamp
    : null;
  return habit;
}

// Áp dụng giảm điểm khi trôi qua ngày mà không check-in.
// Idempotent trong cùng 1 ngày nhờ lastDecayAppliedDate.
// TODO: công thức decay (ví dụ -5 cho good habit, +5 cho bad habit khi bỏ).
export function applyDailyDecay(habit, now = new Date()) {
  const today = dayKey(now);
  if (habit.lastDecayAppliedDate === today) return habit;

  const isBad = habit.type === 'bad';
  const delta = isBad ? -BASE_GAIN : -BASE_GAIN; // TODO: điều chỉnh
  habit.score = clampScore((Number(habit.score) || 0) + delta);
  habit.lastDecayAppliedDate = today;
  return habit;
}

// Đếm check-in theo từng giờ trong ngày, trả về mảng 24 phần tử đã normalize [0..1].
// TODO: cân nhắc smoothing (Laplace) để giờ ít data không ra 0.
export function computeHourProbabilities(history = []) {
  const counts = new Array(24).fill(0);
  for (const h of history) {
    const hour = Number(h?.hourOfDay);
    if (Number.isInteger(hour) && hour >= 0 && hour < 24) {
      counts[hour] += 1;
    }
  }
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return counts; // toàn 0 → caller tự xử lý
  return counts.map((c) => c / total);
}

// Xác suất check-in tại giờ hiện tại (mặc định giờ local bây giờ).
// Trả về 0 nếu history rỗng.
export function probabilityForCurrentHour(history = [], hour = new Date().getHours()) {
  const probs = computeHourProbabilities(history);
  return probs[hour] || 0;
}
