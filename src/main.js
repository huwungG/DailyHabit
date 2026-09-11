/**
 * main.js — Entry point. Import & kết nối tất cả module.
 * Owner: <Tên thành viên phụ trách>
 * Phụ thuộc: ./ui.js, ./state.js, ./controls.js, ./sync.js, ./config.js
 *
 * Thay thế IIFE trong app.js cũ. Khi deploy, cập nhật index.html:
 *   <script type="module" src="./src/main.js"></script>
 *   (KHÔNG dùng defer — module đã defer mặc định.)
 */

import { render } from './ui.js';
import { onChange, runDailyDecay } from './state.js';
import { initControls } from './controls.js';
import { markDirty, maybeAutoSync } from './sync.js';
import {
  CLOCK_RENDER_INTERVAL_MS,
  AUTO_SYNC_INTERVAL_MS,
} from './config.js';

// Re-render mỗi khi state đổi (check-in, undo, sync, v.v.).
onChange(() => {
  render();
  markDirty();
});

function startClock() {
  setInterval(render, CLOCK_RENDER_INTERVAL_MS);
}

function startAutoSync() {
  setInterval(maybeAutoSync, AUTO_SYNC_INTERVAL_MS);
}

function bootstrap() {
  initControls();
  runDailyDecay();   // chạy 1 lần khi load, idempotent trong ngày
  render();
  startClock();
  startAutoSync();
}

bootstrap();
