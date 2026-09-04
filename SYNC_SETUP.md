# Đồng bộ Habit Snowball với Google Sheets (miễn phí)

Tài liệu này hướng dẫn bạn dùng **Google Apps Script** làm backend và **Google Sheets** làm database để dữ liệu thói quen đồng bộ giữa máy tính và điện thoại. Hoàn toàn **miễn phí** trong hạn mức của Google.

## Tổng quan luồng

```
Máy tính / Điện thoại                Google Apps Script            Google Sheets
       │                                     │                          │
       │  POST /exec {state, passcode}       │                          │
       ├────────────────────────────────────►│  setValues([stateJSON])  │
       │                                     ├─────────────────────────►│
       │                                     │                          │
       │   GET  /exec?p=passcode             │                          │
       ├────────────────────────────────────►│  getRange(...).getValues │
       │◄────────────────────────────────────┤◄─────────────────────────┤
```

- Mỗi lần bạn thêm thói quen, check-in, undo… app sẽ **tự động đồng bộ** (sau ~5 giây) lên Google Sheets.
- Khi mở app trên thiết bị khác, app **tự tải về** và **gộp (merge)** với dữ liệu local — không mất lịch sử check-in.
- Có 3 nút thủ công trong popup **Đồng bộ**:
  - **Lưu cấu hình** — lưu URL + passcode và kích hoạt auto-sync.
  - **⬆ Đẩy lên cloud** — đẩy dữ liệu local lên Sheets (sẽ hỏi nếu server mới hơn).
  - **⬇ Tải về từ cloud** — ghi đè local bằng dữ liệu trên Sheets (có xác nhận).

---

## Bước 1 — Tạo Google Sheet

1. Vào https://sheets.google.com → **Blank spreadsheet**.
2. Đặt tên tuỳ ý, ví dụ `Habit Snowball DB`.
3. Ghi nhớ URL của Sheet, ví dụ:
   `https://docs.google.com/spreadsheets/d/1AbCdEf.../edit`

---

## Bước 2 — Tạo Google Apps Script

1. Vào https://script.google.com → **New project**.
2. Đặt tên project, ví dụ `Habit Snowball Sync`.
3. Trong editor, **xoá hết code mặc định** rồi **dán toàn bộ nội dung file `Code.gs`** (đã có sẵn trong thư mục dự án này).
4. Lưu (Ctrl/Cmd + S).

### Gắn Google Sheet vào project

1. Trong Apps Script, menu bên trái chọn **Services** (hoặc **Libraries + Services** tuỳ phiên bản).
2. Bật **Google Sheets API** (chọn identifier là *Google Sheets API* v4).
3. Quay lại `Code.gs`, sửa dòng `SHEET_NAME` nếu bạn muốn đặt tên sheet khác.

   > Khi chạy lần đầu, hàm `ensureSheet_()` sẽ **tự tạo sheet tên `habit_snowball`** nếu chưa có — bạn không cần tạo tay.

### Đặt passcode (khuyến nghị)

1. Trong Apps Script, mở file `Code.gs`.
2. Chọn function `setPasscode` ở dropdown toolbar, nhập `'mat-khau-cua-ban'`, bấm **Run**.
3. Lần đầu chạy sẽ hỏi cấp quyền — chấp nhận hết.
4. Sau khi chạy thành công, **passcode đã lưu** trong Script Properties (không ai xem được trừ bạn).

> Nếu muốn public (không cần passcode), chạy `clearPasscode` thay thế.

---

## Bước 3 — Deploy thành Web App

1. Trong Apps Script, bấm **Deploy** → **New deployment**.
2. Chọn type **Web app**.
3. Cấu hình:
   - **Description**: `Habit Snowball sync v1`
   - **Execute as**: **Me** (tài khoản Google của bạn)
   - **Who has access**: **Anyone** (vì passcode đã bảo vệ).
     - Nếu bạn *không* đặt passcode thì chọn **Only myself** và dùng account-bound — nhưng mọi thiết bị đều phải đăng nhập cùng tài khoản Google đó.
4. Bấm **Deploy** → copy **Web app URL** (dạng `https://script.google.com/macros/s/AKfycbz.../exec`).

---

## Bước 4 — Cấu hình trong app

### Trên máy tính

1. Mở `index.html` (bằng trình duyệt, hoặc serve qua `npx serve` / `python -m http.server`).
2. Bấm nút **Đồng bộ** trên header.
3. Dán **Web App URL** vào ô đầu tiên.
4. Nhập **passcode** (giống passcode đã đặt ở Bước 2).
5. Bấm **💾 Lưu cấu hình** — app sẽ tự test bằng cách đồng bộ ngay.

### Trên điện thoại

1. Upload `index.html`, `app.js`, `styles.css` lên **cùng một hosting tĩnh** (GitHub Pages, Netlify, Vercel, Cloudflare Pages — đều có gói miễn phí). Ví dụ nhanh nhất:
   - **GitHub Pages**: tạo repo, push code, bật Pages trong Settings → Pages → branch `main`.
   - Mở URL GitHub Pages trên điện thoại.
2. Bấm **Đồng bộ** → nhập **cùng URL Web App** và **cùng passcode** → **Lưu cấu hình**.
3. Xong. Mọi thay đổi trên điện thoại sẽ đẩy lên Sheets, và máy tính sẽ tự tải về khi mở app.

> **Mẹo**: Bạn có thể thêm URL Web App + passcode vào URL dạng `?sync_url=...&sync_pass=...` để auto-fill, hoặc đơn giản là dán nhanh vào popup Đồng bộ.

---

## Cách merge hoạt động (an toàn khi sửa 2 thiết bị cùng lúc)

Khi bạn bấm check-in trên máy tính, sau 5 giây app sẽ:

1. **Tải** state hiện tại từ Sheets.
2. **Gộp** với state local bằng quy tắc:
   - Mỗi thói quen có một `id` cố định (sinh một lần lúc tạo).
   - Với cùng `id`, bên nào có **lần check-in gần nhất mới hơn** → thắng.
   - Thói quen chỉ có ở một bên → giữ lại.
3. **Đẩy** state đã gộp lên Sheets.

Khi mở app trên điện thoại, app cũng tự **tải → gộp → đẩy**, nên cả hai thiết bị luôn đồng bộ về cùng một phiên bản.

Nếu bạn lo mất dữ liệu, app luôn giữ nguyên bản local trong `localStorage` — Sheets chỉ là bản sao cloud.

---

## Hạn mức miễn phí của Google Apps Script

- **URL Fetch / POST**: 20,000 lần/ngày (chung cho cả Gmail, Calendar, Sheets…).
- **Script runtime**: 6 phút/lần thực thi.
- **Triggers**: 90 phút runtime/ngày.

Một thao tác đồng bộ (check-in 1 thói quen) tốn **2 lần** (1 pull + 1 push). Bạn check-in 50 lần/ngày cũng chỉ dùng ~100 requests — thoải mái trong hạn mức miễn phí.

---

## Khắc phục sự cố

| Triệu chứng | Nguyên nhân / Cách xử lý |
|---|---|
| `Sai passcode.` | Passcode trong app khác với `setPasscode` đã lưu. Chạy lại `setPasscode("...")` trong Apps Script. |
| `Failed to fetch` / `NetworkError` | App không truy cập được Google. Kiểm tra mạng. |
| HTTP 403 / 404 | URL Web App sai hoặc chưa Deploy lại sau khi sửa `Code.gs`. Vào Deploy → Manage deployments → tạo version mới. |
| Sheet trống dù app đã sync | App tạo sheet tên `habit_snowball` tự động. Mở Sheet kiểm tra. |
| Hai thiết bị "đánh nhau" | Luôn dùng nút **Lưu cấu hình** (không phải Pull/Push) để app tự merge. Thao tác Pull chỉ dùng khi bạn tin bản trên cloud mới hơn và muốn ghi đè hoàn toàn. |
| Muốn xoá hết dữ liệu | Chạy `resetData()` trong Apps Script editor. |

---

## Cấu trúc file đã thêm

```
d:\Sec\
├── app.js          (đã cập nhật — module sync ở cuối file)
├── index.html      (đã thêm modal sync + nút Đồng bộ)
├── styles.css      (đã thêm style cho nút sync & modal)
├── Code.gs         (Google Apps Script backend — dán vào script.google.com)
└── SYNC_SETUP.md   (file này)
```

---

## Nâng cấp tuỳ chọn

- **Mã hoá end-to-end**: thêm `p` làm khoá mã hoá AES-GCM cho `state` trước khi gửi. Khi đó passcode trở thành khoá bí mật chỉ bạn biết — Google chỉ thấy blob mã hoá.
- **Sync theo thiết bị**: lưu `deviceId` để biết thay đổi đến từ đâu (đã có sẵn trong code, chỉ cần thêm cột trong Sheet).
- **Cron-style backup**: Apps Script có Trigger theo giờ/ngày, có thể tự snapshot Sheet ra một Sheet khác hàng tuần.

Nếu cần mình cài luôn phần mã hoá end-to-end hoặc tự động deploy GitHub Pages, báo mình nhé.
