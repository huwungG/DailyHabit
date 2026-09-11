/**
 * controls.js — DOM event wiring + modal/toast.
 * Owner: <Tên thành viên phụ trách>
 * Phụ thuộc: ./state.js, ./ui.js, ./utils.js
 *
 * Quy ước: modal markup đã có sẵn trong index.html (form #habit-form, .modal,
 * #toast). File này chỉ show/hide + đọc giá trị form, KHÔNG tự tạo modal markup.
 */

import { addOrUpdateHabit, deleteHabit } from './state.js';
import { render } from './ui.js';
import { escapeHTML } from './utils.js';

// ─── Toast ──────────────────────────────────────────────────

// TODO: showToast(message, isError) — hiển thị #toast 2-3s rồi tự ẩn.
// Phân biệt variant 'error' vs 'success' qua class.
export function showToast(message, isError = false) {
  // const el = document.getElementById('toast');
  // if (!el) return;
  // el.textContent = message;
  // el.classList.toggle('error', !!isError);
  // el.hidden = false;
  // clearTimeout(showToast._t);
  // showToast._t = setTimeout(() => { el.hidden = true; }, 2500);
}

// ─── Modal open/close ───────────────────────────────────────

let editingId = null;

// TODO: reset form, set editingId = null, show modal.
export function openAddModal() {
  editingId = null;
  // resetForm(); showModal();
}

// TODO: prefill form từ habit hiện tại (tìm theo id trong state), show modal.
export function openEditModal(habitId) {
  editingId = habitId;
  // const h = getState().habits.find(x => x.id === habitId);
  // if (!h) return;
  // prefillForm(h); showModal();
}

// TODO: hide modal, giữ editingId cho lần mở sau.
export function closeModal() {
  // const m = document.querySelector('.modal'); if (m) m.hidden = true;
}

// ─── Form handlers ──────────────────────────────────────────

// TODO: đọc #habit-form → build payload → addOrUpdateHabit → close + toast + render.
function handleFormSubmit(e) {
  // e.preventDefault();
  // const fd = new FormData(e.target);
  // const payload = {
  //   id: editingId,
  //   name: fd.get('name')?.toString().trim(),
  //   emoji: fd.get('emoji')?.toString().slice(0, 4),
  //   type: fd.get('type') === 'bad' ? 'bad' : 'good',
  //   score: Number(fd.get('score')) || 0,
  // };
  // if (!payload.name) { showToast('Tên thói quen không được trống', true); return; }
  // addOrUpdateHabit(payload);
  // closeModal();
  // showToast(editingId ? 'Đã cập nhật' : 'Đã thêm');
  // render();
}

// TODO: đổi radio good/bad → đảo dấu score mặc định, đổi hint emoji.
function handleTypeRadioChange() {
  // const checked = document.querySelector('input[name="type"]:checked')?.value;
  // const scoreInput = document.querySelector('input[name="score"]');
  // if (checked === 'bad' && scoreInput) scoreInput.placeholder = 'Điểm bắt đầu (thấp = tốt)';
}

// ─── Init ───────────────────────────────────────────────────

// TODO: gắn listener một lần khi app khởi động. Gọi từ main.js.
export function initControls() {
  // const form = document.getElementById('habit-form');
  // if (form) form.addEventListener('submit', handleFormSubmit);
  // document.querySelectorAll('input[name="type"]').forEach(r =>
  //   r.addEventListener('change', handleTypeRadioChange)
  // );
}

// ─── Xoá (gọi từ nút X trên card) ───────────────────────────

// TODO: confirm() → deleteHabit(id) → showToast + render.
export function confirmDelete(habitId) {
  // if (!confirm('Xoá thói quen này?')) return;
  // deleteHabit(habitId);
  // showToast('Đã xoá');
  // render();
}
