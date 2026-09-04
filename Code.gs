/**
 * Habit Snowball — Google Apps Script + Google Sheets backend
 * ----------------------------------------------------------
 * - Endpoint duy nhất (Web App URL) cho cả đọc và ghi.
 * - Google Sheets làm database: 1 sheet, 3 ô (key | state JSON | updatedAt).
 * - Bảo vệ bằng passcode chia sẻ (lưu trong Script Properties).
 *   Khi deploy, KHÔNG tick "Execute as: Me" để buộc người dùng truyền passcode.
 *   Nếu muốn public (không ai khác truy cập được passcode), đặt passcode trống.
 */

const SHEET_NAME    = 'habit_snowball';
const PROP_PASSC    = 'SYNC_PASSCODE';   // key trong Script Properties

/* =========================================================
 *  Web App entrypoints
 * ========================================================= */

function doGet(e) {
  return handle_(e, /* isWrite */ false);
}

function doPost(e) {
  return handle_(e, /* isWrite */ true);
}

function handle_(e, isWrite) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    const passcode = PropertiesService.getScriptProperties().getProperty(PROP_PASSC) || '';

    // --- Auth: client phải gửi kèm passcode đúng ---
    const clientPass = (e && e.parameter && e.parameter.p) ? String(e.parameter.p) : '';
    if (passcode && clientPass !== passcode) {
      return json_({ ok: false, error: 'Sai passcode.' });
    }

    if (!isWrite) {
      // ---------- READ ----------
      const sheet = ensureSheet_();
      const row   = sheet.getRange(1, 1, 1, 3).getValues()[0];
      const stateStr   = row[1];
      const updatedAt  = Number(row[2]) || 0;

      if (!stateStr) {
        return json_({ ok: true, state: null, updatedAt: 0 });
      }

      let state;
      try {
        state = JSON.parse(stateStr);
      } catch (err) {
        return json_({ ok: false, error: 'Dữ liệu trên Sheet bị hỏng: ' + err.message });
      }
      return json_({ ok: true, state: state, updatedAt: updatedAt });
    }

    // ---------- WRITE ----------
    let body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (err) {
      return json_({ ok: false, error: 'Body không phải JSON hợp lệ.' });
    }

    if (!body || typeof body !== 'object' || !body.state) {
      return json_({ ok: false, error: 'Thiếu trường "state".' });
    }

    const incomingUpdatedAt = Number(body.updatedAt) || Date.now();
    const sheet     = ensureSheet_();
    const row       = sheet.getRange(1, 1, 1, 3).getValues()[0];
    const serverTs  = Number(row[2]) || 0;

    // Nếu client gửi kèm baseUpdatedAt thì check "last-write-wins" an toàn:
    // server chỉ ghi đè khi incoming mới hơn (hoặc server rỗng).
    if (body.baseUpdatedAt && serverTs && Number(body.baseUpdatedAt) < serverTs) {
      // Trả về server state để client biết có xung đột
      return json_({
        ok: false,
        conflict: true,
        serverUpdatedAt: serverTs,
        serverState: safeParse_(row[1]),
        message: 'Phiên bản trên server mới hơn. Client sẽ hỏi người dùng.'
      });
    }

    sheet.getRange(1, 1).setValue('state');
    sheet.getRange(1, 2).setValue(JSON.stringify(body.state));
    sheet.getRange(1, 3).setValue(incomingUpdatedAt);

    return json_({ ok: true, updatedAt: incomingUpdatedAt });
  } catch (err) {
    return json_({ ok: false, error: err && err.message ? err.message : String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* =========================================================
 *  Helpers
 * ========================================================= */

function ensureSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('Chưa gắn Google Sheet vào Apps Script. Vào "Services" → bật Sheets và "Resources" → "Add a shortcut".');
  }
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, 3).setValues([['state', '', 0]]);
  }
  return sheet;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function safeParse_(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch (e) { return null; }
}

/* =========================================================
 *  Admin helpers — chạy thủ công trong editor nếu cần
 * ========================================================= */

/** Đặt passcode. Chạy 1 lần, sau đó KHÔNG cần chạy lại. */
function setPasscode(p) {
  if (!p || typeof p !== 'string') {
    throw new Error('Truyền passcode: setPasscode("mat-khau-cua-ban")');
  }
  PropertiesService.getScriptProperties().setProperty(PROP_PASSC, p);
  Logger.log('Đã lưu passcode.');
}

/** Xoá passcode (mở khoá public). */
function clearPasscode() {
  PropertiesService.getScriptProperties().deleteProperty(PROP_PASSC);
  Logger.log('Đã xoá passcode.');
}

/** Reset toàn bộ dữ liệu trên Sheet. */
function resetData() {
  const sheet = ensureSheet_();
  sheet.getRange(1, 1, 1, 3).setValues([['state', '', 0]]);
  Logger.log('Đã reset.');
}
