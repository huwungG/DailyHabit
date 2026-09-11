/**
 * config.js — Hằng số & cấu hình tập trung
 * Owner: <Tên thành viên phụ trách>
 * Phụ thuộc: (không)
 */

// TODO: xác nhận key này đang dùng trong app.js cũ trước khi migrate.
export const STORAGE_KEY = 'habit_snowball_v1';

// TODO: xác nhận key này đang dùng trong app.js cũ trước khi migrate.
export const SYNC_CONFIG_KEY = 'habit_snowball_sync_v1';

// TODO: key này CHƯA tồn tại trong app.js cũ — sync meta cần được tách riêng
// (Code.gs cũng chưa thấy trường này). Cân nhắc thêm hoặc dùng SYNC_CONFIG_KEY.
export const SYNC_META_KEY = 'habit_snowball_sync_meta_v1';

// Đóng băng để đảm bảo mọi nơi dùng DEFAULT_STATE không vô tình mutate.
export const DEFAULT_STATE = Object.freeze({
  habits: [],
});

// Điểm tăng/giảm cơ sở cho mỗi lần check-in. Snowball bonus sẽ cộng thêm theo streak.
// TODO: hiệu chỉnh công thức snowball cho cân bằng giữa good/bad habit.
export const BASE_GAIN = 5;

// Ngưỡng tối đa cộng thêm từ streak để tránh tăng quá nhanh.
// TODO: xác nhận có cần cap này không (hiện đang hard-code trong algorithms.js).
export const STREAK_BONUS_CAP = 10;

// Chu kỳ auto-sync (ms). 60s cho vòng lặp ngoài, 5s cho debounce bên trong sync.js.
// TODO: tách 2 hằng số này nếu muốn tinh chỉnh độc lập.
export const AUTO_SYNC_INTERVAL_MS = 60_000;
export const AUTO_SYNC_DEBOUNCE_MS = 5_000;

// Chu kỳ render lại đồng hồ / thanh dự đoán.
export const CLOCK_RENDER_INTERVAL_MS = 30_000;
