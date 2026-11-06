const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { getConnection } = require('./connect');
const generatePromptPayPayload = require('promptpay-qr');
const QRCode = require('qrcode');

const ROOT_DIR = __dirname;
const SCHEMA_PATH = path.join(ROOT_DIR, 'house_sunset_schema.sql');
const INDEX_FILE = path.join(ROOT_DIR, 'baan-sangartit.html');
const PORT = Number(process.env.PORT || 5500);
const SLIPS_DIR = path.join(ROOT_DIR, 'uploads', 'slips');
fs.mkdirSync(SLIPS_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: '8mb' }));

// Block access to sensitive files before static middleware
const BLOCKED_EXTENSIONS = /\.(db|sql|log|json)$/i;
const BLOCKED_FILES = /^\/?(server\.js|connect\.js|package\.json|package-lock\.json|house_sunset_schema\.sql|server\.err\.log|server\.out\.log)$/i;
app.use((req, res, next) => {
  const urlPath = decodeURIComponent(req.path);
  if (BLOCKED_FILES.test(urlPath) || BLOCKED_EXTENSIONS.test(urlPath)) {
    return res.status(403).end();
  }
  next();
});

app.use(express.static(ROOT_DIR));

// ---- MySQL query helpers (แทนที่ sqlite3 run/get/all/exec เดิม) ----
// ใช้คอนเนกชันเดียวร่วมกันทั้งแอป (ดู connect.js) เพื่อให้ START TRANSACTION /
// COMMIT / ROLLBACK ทำงานต่อเนื่องกันภายใน request เดียว เหมือนพฤติกรรมเดิมของ sqlite3

async function run(sql, params = []) {
  const conn = await getConnection();
  const [result] = await conn.query(sql, params);
  // เลียนแบบ `this` ของ sqlite3 (lastID / changes) เผื่อโค้ดส่วนอื่นอ้างถึง
  return { lastID: result.insertId, changes: result.affectedRows };
}

async function get(sql, params = []) {
  const conn = await getConnection();
  const [rows] = await conn.query(sql, params);
  return rows[0];
}

async function all(sql, params = []) {
  const conn = await getConnection();
  const [rows] = await conn.query(sql, params);
  return rows;
}

async function exec(sql) {
  const conn = await getConnection();
  await conn.query(sql);
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function apiError(status, code) {
  const err = new Error(code);
  err.status = status;
  err.code = code;
  return err;
}

// ---- Session-based authentication ----
const sessions = new Map(); // token -> { userId, role, room, expiresAt }
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, {
    userId: user.id,
    role: user.role,
    room: user.room_id || user.room || null,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

function getSession(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function destroySession(token) {
  sessions.delete(token);
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const session = getSession(token);
  if (!session) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  req.session = session;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || req.session.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}

function nowIso() {
  return new Date().toISOString();
}

function splitNameParts(fullName) {
  const value = (fullName || '').toString().trim();
  if (!value) return { firstName: '', lastName: '' };
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: value, lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function joinName(firstName, lastName, fallbackName = '') {
  const f = (firstName || '').toString().trim();
  const l = (lastName || '').toString().trim();
  const combined = `${f} ${l}`.trim();
  if (combined) return combined;
  return (fallbackName || '').toString().trim();
}

async function refreshRoomOccupancy(roomId, preferredTenantId = null) {
  if (!roomId) return;
  const tenants = await all(
    "SELECT id FROM users WHERE role='tenant' AND room_id=? AND is_active=1 ORDER BY id",
    [roomId]
  );
  if (!tenants.length) {
    await run("UPDATE rooms SET status='vacant', tenant_id=NULL WHERE id=?", [roomId]);
    return;
  }
  const hasPreferred =
    preferredTenantId && tenants.some((t) => t.id === preferredTenantId);
  const tenantId = hasPreferred ? preferredTenantId : tenants[0].id;
  await run("UPDATE rooms SET status='occupied', tenant_id=? WHERE id=?", [tenantId, roomId]);
}

async function getCurrentRoomPeopleCount(roomId) {
  const occRow = await get('SELECT COUNT(*) AS c FROM room_occupants WHERE room_id=?', [roomId]);
  const occCount = toNumber(occRow && occRow.c, 0);
  if (occCount > 0) return occCount;
  const tenantRow = await get(
    "SELECT COUNT(*) AS c FROM users WHERE role='tenant' AND room_id=? AND is_active=1",
    [roomId]
  );
  return toNumber(tenantRow && tenantRow.c, 0);
}

function createId(prefix) {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}${Date.now().toString(36).toUpperCase()}${rand}`;
}

function cleanPromptPay(value) {
  return (value || '').toString().replace(/[^\d]/g, '');
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (_err) {
    return fallback;
  }
}

function roundMoney(value) {
  return Math.round(toNumber(value, 0) * 100) / 100;
}

function mapPaymentIntentRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    room: row.room_id,
    bill_ids: safeJsonParse(row.bill_ids, []),
    amount: toNumber(row.amount, 0),
    status: row.status,
    provider: row.provider,
    promptpay: row.promptpay_id,
    qr_payload: row.qr_payload,
    qr_image_data_url: row.qr_image_data_url,
    provider_ref: row.provider_ref || null,
    expires_at: row.expires_at || null,
    paid_at: row.paid_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

async function ensureSchema() {
  const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  await exec(schemaSql);
  const alterStatements = [
    'ALTER TABLE users ADD COLUMN first_name VARCHAR(191)',
    'ALTER TABLE users ADD COLUMN last_name VARCHAR(191)',
    'ALTER TABLE users ADD COLUMN relation_note VARCHAR(255)',
    'ALTER TABLE users ADD COLUMN created_at VARCHAR(64)',
    // หมายเหตุ: MySQL ไม่รองรับ DEFAULT บนคอลัมน์ TEXT/BLOB จึงใช้ VARCHAR แทน
    "ALTER TABLE bills ADD COLUMN slip_status VARCHAR(32) NOT NULL DEFAULT 'none'",
    'ALTER TABLE rates ADD COLUMN deposit DOUBLE NOT NULL DEFAULT 3000',
    'ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1',
    'ALTER TABLE users ADD COLUMN archived_at VARCHAR(64)',
    'ALTER TABLE bills ADD COLUMN tenant_user_id VARCHAR(64) DEFAULT NULL',
    'ALTER TABLE reports ADD COLUMN tenant_user_id VARCHAR(64) DEFAULT NULL',
    'ALTER TABLE checkouts ADD COLUMN urgent TINYINT(1) NOT NULL DEFAULT 0',
    'ALTER TABLE checkouts ADD COLUMN urgent_reason TEXT',
    'ALTER TABLE checkouts ADD COLUMN tenant_user_id VARCHAR(64) DEFAULT NULL',
    'ALTER TABLE room_readings ADD COLUMN tenant_user_id VARCHAR(64) DEFAULT NULL',
    'ALTER TABLE checkouts ADD COLUMN inspect_date VARCHAR(32) DEFAULT NULL',
    // เลิกใช้ระบบตรวจสลิปอัตโนมัติ/อ้างอิงเลขธุรกรรมแล้ว (เหลือแค่อัปโหลดสลิปให้แอดมินตรวจเอง)
    // ลบ index และคอลัมน์ slip_txn_ref ที่เหลือค้างในฐานข้อมูลเดิมออก (ถ้าเพิ่งสร้างใหม่จะไม่มีอะไรให้ลบ จึง error เฉยๆ)
    'ALTER TABLE bills DROP INDEX idx_bills_slip_txn_ref',
    'ALTER TABLE bills DROP COLUMN slip_txn_ref',
    // ลบตาราง yearly_finance_monthly ที่เหลือค้างจากของเก่า — ไม่มีจุดไหนในระบบเขียนข้อมูลจริงใส่เลย
    // (รายรับ-รายจ่ายคำนวณสดจาก bills/expenses แทนแล้ว) เก็บไว้ก็เปลืองเปล่าๆ
    'DROP TABLE IF EXISTS yearly_finance_monthly',
    // วันที่ลงบิล ใช้นับถอยหลัง 15 วันก่อนย้ายไปหน้าติดตามหนี้ค้างชำระ
    'ALTER TABLE bills ADD COLUMN bill_date VARCHAR(32) DEFAULT NULL',
    // TEXT เก็บได้สูงสุดแค่ ~64KB ซึ่งไม่พอสำหรับรูปสลิป/รูปแนบแจ้งเหตุแบบ base64 (มักเกิน 100KB)
    // อัปเกรดเป็น MEDIUMTEXT (สูงสุด ~16MB) กันรูปที่ใหญ่หน่อยถูกตัดทอน/insert ไม่ผ่าน
    'ALTER TABLE bills MODIFY COLUMN slip MEDIUMTEXT',
    'ALTER TABLE reports MODIFY COLUMN media MEDIUMTEXT',
  ];
  for (const sql of alterStatements) {
    try {
      // keep compatibility with existing databases
      // eslint-disable-next-line no-await-in-loop
      await run(sql);
    } catch (_err) {
      // คอลัมน์มีอยู่แล้ว (ER_DUP_FIELDNAME) หรือความผิดพลาดอื่นที่ไม่ต้องหยุดการทำงาน
    }
  }
  // MySQL (< 8.0.29) ไม่รองรับ CREATE INDEX IF NOT EXISTS จึงสร้างทีละอันแล้วเมิน
  // error กรณี index มีอยู่แล้ว (ER_DUP_KEYNAME)
  const indexStatements = [
    'CREATE INDEX idx_bills_room_year_month ON bills(room_id, year, month)',
    'CREATE INDEX idx_reports_room_status ON reports(room_id, status)',
    'CREATE INDEX idx_chat_messages_report_id ON chat_messages(report_id)',
    'CREATE INDEX idx_payment_intents_room_status ON payment_intents(room_id, status)',
  ];
  for (const sql of indexStatements) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await run(sql);
    } catch (_err) {
      // index มีอยู่แล้ว หรือ error อื่นที่ไม่ critical
    }
  }
  try {
    await run("UPDATE users SET created_at = ? WHERE created_at IS NULL OR created_at = ''", [
      nowIso(),
    ]);
  } catch (_err) {}
  try {
    await run(
      "UPDATE bills SET slip_status = 'pending' WHERE status = 'paid' AND (slip_status IS NULL OR slip_status = 'none')"
    );
  } catch (_err) {}
  try {
    // บิลเก่าที่ยังไม่มีวันที่ลงบิล (สร้างก่อนฟีเจอร์นี้) ให้ใช้วันที่ 1 ของเดือน/ปีที่เรียกเก็บแทน
    // (year ในตารางเป็น พ.ศ. จึงต้อง -543 ให้เป็นปี ค.ศ. ก่อนเก็บเป็น ISO date)
    await run(
      "UPDATE bills SET bill_date = CONCAT(year - 543, '-', LPAD(month,2,'0'), '-01') WHERE bill_date IS NULL OR bill_date = ''"
    );
  } catch (_err) {}
}

// จำกัดข้อมูลที่ GET /api/data ส่งกลับให้ผู้เช่าเห็น — ของเดิมส่งข้อมูลทั้งฐานข้อมูลกลับไปหมด
// (รวมรหัสผ่านของทุกคนและบิล/ข้อมูลส่วนตัวของผู้เช่าคนอื่น) ให้ใครก็ได้ที่ล็อกอินอยู่เห็น
// ฟังก์ชันนี้ตัดเหลือเฉพาะสิ่งที่หน้าจอฝั่งผู้เช่าใช้จริง และเฉพาะของห้อง/ตัวเองเท่านั้น
function scopeDataForSession(payload, session) {
  if (!session || session.role === 'admin') return payload;
  const room = session.room;
  const userId = session.userId;

  const ownUser = (payload.users || []).find((u) => u.id === userId);
  const scopedUsers = ownUser ? [{ ...ownUser, password: '' }] : [];

  const myReports = (payload.reports || []).filter((r) => r.room === room);
  const myReportIds = new Set(myReports.map((r) => r.id));
  const scopedChatMessages = {};
  for (const reportId of Object.keys(payload.chatMessages || {})) {
    if (myReportIds.has(reportId)) {
      scopedChatMessages[reportId] = payload.chatMessages[reportId];
    }
  }

  return {
    rooms: [],
    users: scopedUsers,
    rates: payload.rates,
    bankAccount: payload.bankAccount,
    chatMessages: scopedChatMessages,
    bills: (payload.bills || []).filter((b) => b.room === room),
    deposits: (payload.deposits || []).filter((d) => d.room === room),
    reports: myReports,
    checkouts: (payload.checkouts || []).filter((c) => c.room === room),
    expenses: [],
    roomReadings: (payload.roomReadings || []).filter((rr) => rr.room === room),
    roomOccupants: (payload.roomOccupants || []).filter((o) => o.room === room),
  };
}

async function readData() {
  const rooms = (await all('SELECT id, status, tenant_id FROM rooms ORDER BY id')).map((r) => ({
    id: r.id,
    status: r.status,
    tenant: r.tenant_id,
  }));

  const users = (
    await all(
      'SELECT id, username, password, room_id, name, first_name, last_name, relation_note, role, created_at, is_active, archived_at FROM users ORDER BY id'
    )
  ).map((u) => {
    const parts = splitNameParts(u.name);
    const firstName = (u.first_name || parts.firstName || '').toString();
    const lastName = (u.last_name || parts.lastName || '').toString();
    return {
      id: u.id,
      username: u.username,
      password: u.password,
      room: u.room_id,
      first_name: firstName,
      last_name: lastName,
      relation_note: (u.relation_note || '').toString(),
      name: joinName(firstName, lastName, u.name),
      role: u.role,
      created_at: u.created_at || null,
      is_active: u.is_active === undefined || u.is_active === null ? true : !!u.is_active,
      archived_at: u.archived_at || null,
    };
  });

  const ratesRow =
    (await get('SELECT rent, water_unit, electric_unit, deposit FROM rates WHERE id=1')) || {};
  const rates = {
    rent: toNumber(ratesRow.rent, 0),
    water_unit: toNumber(ratesRow.water_unit, 0),
    electric_unit: toNumber(ratesRow.electric_unit, 0),
    deposit: toNumber(ratesRow.deposit, 3000),
  };

  const bankRow =
    (await get(
      'SELECT account_name, bank_name, account_number, promptpay FROM bank_accounts WHERE id=1'
    )) || {};
  const bankAccount = {
    name: bankRow.account_name || '',
    bank: bankRow.bank_name || '',
    number: bankRow.account_number || '',
    promptpay: bankRow.promptpay || '',
  };

  const chatRows = await all(
    'SELECT report_id, sender, message_text, sent_at FROM chat_messages ORDER BY id'
  );
  const chatMessages = {};
  for (const row of chatRows) {
    if (!chatMessages[row.report_id]) chatMessages[row.report_id] = [];
    chatMessages[row.report_id].push({
      from: row.sender,
      text: row.message_text,
      time: row.sent_at,
    });
  }

  const bills = (
    await all(
      'SELECT id, room_id, month, year, rent, water_unit, water_cost, elec_unit, elec_cost, total, status, slip, slip_status, tenant_user_id, bill_date FROM bills ORDER BY id'
    )
  ).map((b) => ({
    id: b.id,
    room: b.room_id,
    month: b.month,
    year: b.year,
    rent: toNumber(b.rent),
    water_unit: toNumber(b.water_unit),
    water_cost: toNumber(b.water_cost),
    elec_unit: toNumber(b.elec_unit),
    elec_cost: toNumber(b.elec_cost),
    total: toNumber(b.total),
    status: b.status,
    slip: b.slip,
    slip_status: b.slip_status || 'none',
    tenantUserId: b.tenant_user_id || null,
    billDate: b.bill_date || null,
  }));

  const deposits = (
    await all('SELECT room_id, amount, status FROM deposits ORDER BY room_id')
  ).map((d) => ({
    room: d.room_id,
    amount: toNumber(d.amount),
    status: d.status,
  }));

  const reports = (
    await all(
      'SELECT id, room_id, type, detail, media, status, response, report_date, tenant_user_id FROM reports ORDER BY id'
    )
  ).map((r) => ({
    id: r.id,
    room: r.room_id,
    type: r.type,
    detail: r.detail,
    media: r.media,
    status: r.status,
    response: r.response,
    date: r.report_date,
    tenantUserId: r.tenant_user_id || null,
  }));

  const checkouts = (
    await all(
      'SELECT id, room_id, checkout_date, refund_type, bank_name, account_no, status, urgent, urgent_reason, tenant_user_id, inspect_date FROM checkouts ORDER BY id'
    )
  ).map((c) => ({
    id: c.id,
    room: c.room_id,
    date: c.checkout_date,
    refundType: c.refund_type,
    bank: c.bank_name,
    accountNo: c.account_no,
    status: c.status,
    urgent: !!c.urgent,
    urgentReason: c.urgent_reason || '',
    tenantUserId: c.tenant_user_id || null,
    inspectDate: c.inspect_date || null,
  }));

  const expenses = (
    await all('SELECT id, month, year, type, detail, amount FROM expenses ORDER BY id')
  ).map((e) => ({
    id: e.id,
    month: e.month,
    year: e.year,
    type: e.type,
    detail: e.detail,
    amount: toNumber(e.amount),
  }));

  const roomReadings = (
    await all(
      'SELECT room_id, month, year, prev_water, cur_water, prev_elec, cur_elec FROM room_readings ORDER BY room_id, year, month'
    )
  ).map((rr) => ({
    room: rr.room_id,
    month: rr.month,
    year: rr.year,
    prevWater: toNumber(rr.prev_water),
    curWater: toNumber(rr.cur_water),
    prevElec: toNumber(rr.prev_elec),
    curElec: toNumber(rr.cur_elec),
  }));

  const roomOccupants = (
    await all(
      'SELECT id, room_id, first_name, last_name, relation_note, tenant_user_id FROM room_occupants ORDER BY room_id, id'
    )
  ).map((o) => ({
    id: o.id,
    room: o.room_id,
    first_name: o.first_name || '',
    last_name: o.last_name || '',
    relation_note: o.relation_note || '',
    tenant_user_id: o.tenant_user_id || null,
  }));

  const payload = {
    rooms,
    users,
    rates,
    bankAccount,
    chatMessages,
    bills,
    deposits,
    reports,
    checkouts,
    expenses,
    roomReadings,
    roomOccupants,
  };

  return payload;
}

// ตารางที่ผู้เช่า (role !== 'admin') ได้รับอนุญาตให้ sync ผ่าน /api/data
// ส่วนตารางอื่นทั้งหมด (ห้อง/ผู้ใช้/รหัสผ่าน/อัตราค่าบริการ/เลขบัญชี/บิล/เงินมัดจำ/
// รายจ่าย/มิเตอร์น้ำไฟ/ผู้พักร่วม) ผู้เช่าต้องไม่มีสิทธิ์เขียนทับได้เลย
// ไม่งั้นผู้เช่าคนหนึ่งจะแก้ไฟล์ใน DevTools แล้วส่งข้อมูลทับทั้งระบบได้
async function writeTenantScopedData(payload, session) {
  const data = payload || {};
  const room = session.room;
  await run('START TRANSACTION');
  try {
    // รายงาน/แจ้งซ่อม: อนุญาตให้เพิ่มรายการใหม่ของห้องตัวเองเท่านั้น ห้ามแก้/ลบของเดิม
    const existingReports = await all('SELECT id FROM reports');
    const existingReportIds = new Set(existingReports.map((r) => r.id));
    for (const r of data.reports || []) {
      if (existingReportIds.has(r.id)) continue; // ห้ามแก้ของเดิม (ของตัวเองหรือคนอื่น)
      if (r.room !== room) continue; // ห้ามสร้างแจ้งซ่อมแทนห้องอื่น
      await run(
        'INSERT INTO reports (id, room_id, type, detail, media, status, response, report_date, tenant_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [r.id, r.room, r.type || '', r.detail || '', r.media ?? '', 'pending', '', r.date ?? '', session.userId]
      );
    }

    // คำขอย้ายออก: เช่นเดียวกัน อนุญาตเฉพาะรายการใหม่ของห้องตัวเอง
    const existingCheckouts = await all('SELECT id FROM checkouts');
    const existingCheckoutIds = new Set(existingCheckouts.map((c) => c.id));
    for (const c of data.checkouts || []) {
      if (existingCheckoutIds.has(c.id)) continue;
      if (c.room !== room) continue;
      await run(
        'INSERT INTO checkouts (id, room_id, checkout_date, refund_type, bank_name, account_no, status, urgent, urgent_reason, tenant_user_id, inspect_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          c.id,
          c.room,
          c.date ?? '',
          c.refundType ?? '',
          c.bank ?? '',
          c.accountNo ?? '',
          'pending',
          c.urgent ? 1 : 0,
          c.urgentReason ?? '',
          session.userId,
          null,
        ]
      );
    }

    // ข้อความแชท: อนุญาตเฉพาะข้อความใหม่ที่ส่งเป็น "tenant" และอยู่ในแจ้งซ่อมของห้องตัวเองเท่านั้น
    const ownReportRows = await all('SELECT id FROM reports WHERE room_id=?', [room]);
    const ownReportIds = new Set(ownReportRows.map((r) => r.id));
    for (const reportId of Object.keys(data.chatMessages || {})) {
      if (!ownReportIds.has(reportId)) continue;
      const messages = data.chatMessages[reportId];
      if (!Array.isArray(messages)) continue;
      const countRow = await get(
        'SELECT COUNT(*) AS c FROM chat_messages WHERE report_id=?',
        [reportId]
      );
      const existingCount = toNumber(countRow && countRow.c, 0);
      const newMessages = messages.slice(existingCount);
      for (const m of newMessages) {
        if (m.from !== 'tenant') continue; // ห้ามปลอมเป็นข้อความของแอดมิน
        await run(
          'INSERT INTO chat_messages (report_id, sender, message_text, sent_at) VALUES (?, ?, ?, ?)',
          [reportId, 'tenant', m.text || '', m.time || '']
        );
      }
    }

    await run('COMMIT');
  } catch (err) {
    await run('ROLLBACK');
    throw err;
  }
}

async function writeData(payload, session) {
  if (!session || session.role !== 'admin') {
    return writeTenantScopedData(payload, session || {});
  }
  const data = payload || {};
  await run('START TRANSACTION');
  try {
    // หมายเหตุสำคัญ: ตาราง users และ room_occupants "ไม่" ถูกล้าง+เขียนทับที่นี่แล้ว (ตัดออกตั้งแต่
    // รอบแก้บั๊ก "ย้ายห้องแล้วคนที่อยู่ด้วยไม่ย้ายตาม") เพราะสองตารางนี้มีช่องทางเขียนข้อมูลเฉพาะของ
    // ตัวเองอยู่แล้วครบ (POST/PUT/DELETE /api/users, /api/room-occupants) ถ้ายังปล่อยให้ระบบบันทึก
    // อัตโนมัติ (sync ทั้งก้อนทุก 450ms จากข้อมูลที่ค้างอยู่ในเบราว์เซอร์) เขียนทับสองตารางนี้ด้วย จะมี
    // โอกาสที่ sync รอบเก่า (ข้อมูลก่อนย้ายห้อง) ยิงมาถึงเซิร์ฟเวอร์ "หลัง" คำสั่งย้ายห้องที่เพิ่งกดไป
    // แล้วเขียนทับค่าที่เพิ่งย้ายให้กลับไปเป็นค่าเก่า ทำให้ดูเหมือนย้ายห้องไม่สำเร็จ (ทั้งที่ย้ายสำเร็จ
    // แล้วแต่โดนทับ) ฟีเจอร์เดียวที่เคยอาศัยให้ sync ก้อนนี้ช่วยพาค่า room ของ users/room_occupants
    // ไปด้วยคือ "แก้ไขหมายเลขห้อง" ซึ่งตอนนี้ย้ายไปทำที่ POST /api/rooms/:id/rename แทนแล้ว
    await run('DELETE FROM rooms');
    await run('DELETE FROM rates');
    await run('DELETE FROM bank_accounts');
    await run('DELETE FROM chat_messages');
    await run('DELETE FROM bills');
    await run('DELETE FROM deposits');
    await run('DELETE FROM reports');
    await run('DELETE FROM checkouts');
    await run('DELETE FROM expenses');
    await run('DELETE FROM room_readings');

    for (const r of data.rooms || []) {
      await run('INSERT INTO rooms (id, status, tenant_id) VALUES (?, ?, ?)', [
        r.id,
        r.status,
        r.tenant ?? null,
      ]);
    }

    const rates = data.rates || {};
    await run('INSERT INTO rates (id, rent, water_unit, electric_unit, deposit) VALUES (1, ?, ?, ?, ?)', [
      toNumber(rates.rent),
      toNumber(rates.water_unit),
      toNumber(rates.electric_unit),
      toNumber(rates.deposit, 3000),
    ]);

    const bank = data.bankAccount || {};
    await run(
      'INSERT INTO bank_accounts (id, account_name, bank_name, account_number, promptpay) VALUES (1, ?, ?, ?, ?)',
      [bank.name || '', bank.bank || '', bank.number || '', bank.promptpay || '']
    );

    for (const reportId of Object.keys(data.chatMessages || {})) {
      const messages = data.chatMessages[reportId];
      if (!Array.isArray(messages)) continue;
      for (const m of messages) {
        await run(
          'INSERT INTO chat_messages (report_id, sender, message_text, sent_at) VALUES (?, ?, ?, ?)',
          [reportId, m.from || '', m.text || '', m.time || '']
        );
      }
    }

    for (const b of data.bills || []) {
      await run(
        'INSERT INTO bills (id, room_id, month, year, rent, water_unit, water_cost, elec_unit, elec_cost, total, status, slip, slip_status, tenant_user_id, bill_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          b.id,
          b.room,
          toNumber(b.month),
          toNumber(b.year),
          toNumber(b.rent),
          toNumber(b.water_unit),
          toNumber(b.water_cost),
          toNumber(b.elec_unit),
          toNumber(b.elec_cost),
          toNumber(b.total),
          b.status || '',
          b.slip ?? null,
          b.slip_status || 'none',
          b.tenantUserId ?? null,
          b.billDate || nowIso().slice(0, 10),
        ]
      );
    }

    for (const d of data.deposits || []) {
      await run('INSERT INTO deposits (room_id, amount, status) VALUES (?, ?, ?)', [
        d.room,
        toNumber(d.amount),
        d.status || '',
      ]);
    }

    for (const r of data.reports || []) {
      await run(
        'INSERT INTO reports (id, room_id, type, detail, media, status, response, report_date, tenant_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          r.id,
          r.room,
          r.type || '',
          r.detail || '',
          r.media ?? '',
          r.status || '',
          r.response ?? '',
          r.date ?? '',
          r.tenantUserId ?? null,
        ]
      );
    }

    for (const c of data.checkouts || []) {
      await run(
        'INSERT INTO checkouts (id, room_id, checkout_date, refund_type, bank_name, account_no, status, urgent, urgent_reason, tenant_user_id, inspect_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          c.id,
          c.room,
          c.date ?? '',
          c.refundType ?? '',
          c.bank ?? '',
          c.accountNo ?? '',
          c.status || '',
          c.urgent ? 1 : 0,
          c.urgentReason ?? '',
          c.tenantUserId ?? null,
          c.inspectDate ?? null,
        ]
      );
    }

    for (const e of data.expenses || []) {
      await run(
        'INSERT INTO expenses (id, month, year, type, detail, amount) VALUES (?, ?, ?, ?, ?, ?)',
        [e.id, toNumber(e.month), toNumber(e.year), e.type || '', e.detail || '', toNumber(e.amount)]
      );
    }

    for (const rr of data.roomReadings || []) {
      await run(
        'INSERT INTO room_readings (room_id, month, year, prev_water, cur_water, prev_elec, cur_elec) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          rr.room,
          toNumber(rr.month),
          toNumber(rr.year),
          toNumber(rr.prevWater),
          toNumber(rr.curWater),
          toNumber(rr.prevElec),
          toNumber(rr.curElec),
        ]
      );
    }

    await run('COMMIT');
  } catch (err) {
    await run('ROLLBACK');
    throw err;
  }
}

async function expireIntentIfNeeded(intentRow) {
  if (!intentRow || intentRow.status !== 'pending' || !intentRow.expires_at) return intentRow;
  const expMs = Date.parse(intentRow.expires_at);
  if (!Number.isFinite(expMs) || expMs > Date.now()) return intentRow;
  await run(
    "UPDATE payment_intents SET status='expired', updated_at=? WHERE id=? AND status='pending'",
    [nowIso(), intentRow.id]
  );
  return {
    ...intentRow,
    status: 'expired',
  };
}

async function markIntentPaid(intentId, providerRef, paidAmount, slipMeta) {
  slipMeta = slipMeta || {};
  await run('START TRANSACTION');
  try {
    const intent = await get(
      'SELECT id, bill_ids, amount, status FROM payment_intents WHERE id = ?',
      [intentId]
    );
    if (!intent) throw apiError(404, 'intent_not_found');
    if (intent.status === 'paid') {
      await run('COMMIT');
      return;
    }
    if (intent.status !== 'pending') throw apiError(409, 'intent_not_pending');

    const expectedAmount = toNumber(intent.amount, 0);
    if (paidAmount !== null && Number.isFinite(paidAmount)) {
      if (Math.abs(expectedAmount - paidAmount) > 0.01) {
        throw apiError(409, 'amount_mismatch');
      }
    }

    const billIds = safeJsonParse(intent.bill_ids, []);
    if (!Array.isArray(billIds) || billIds.length === 0) {
      throw apiError(500, 'invalid_intent_bills');
    }

    const slipValue = slipMeta.slip || `auto_qr:${providerRef || intentId}`;
    const slipStatus = slipMeta.slipStatus || 'pending';

    const placeholders = billIds.map(() => '?').join(',');
    await run(
      `UPDATE bills SET status='paid', slip=?, slip_status=? WHERE id IN (${placeholders})`,
      [slipValue, slipStatus, ...billIds]
    );

    const paidAt = nowIso();
    await run(
      "UPDATE payment_intents SET status='paid', provider_ref=?, paid_at=?, updated_at=? WHERE id=?",
      [providerRef || null, paidAt, paidAt, intentId]
    );
    await run('COMMIT');
  } catch (err) {
    try {
      await run('ROLLBACK');
    } catch (_rollbackErr) {}
    throw err;
  }
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// ---- Auth endpoints (public) ----
app.post('/api/login', async (req, res) => {
  const body = req.body || {};
  const username = (body.username || '').toString().trim();
  const password = (body.password || '').toString();

  if (!username || !password) {
    return res.status(400).json({ error: 'invalid_payload' });
  }

  try {
    const user = await get(
      'SELECT id, username, password, room_id, name, first_name, last_name, relation_note, role, is_active FROM users WHERE username = ?',
      [username]
    );
    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }
    if (user.is_active === 0) {
      return res.status(403).json({ error: 'account_archived' });
    }

    const token = createSession(user);
    const parts = splitNameParts(user.name);
    const firstName = (user.first_name || parts.firstName || '').toString();
    const lastName = (user.last_name || parts.lastName || '').toString();

    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        room: user.room_id,
        first_name: firstName,
        last_name: lastName,
        name: joinName(firstName, lastName, user.name),
        role: user.role,
      },
    });
  } catch (err) {
    console.error('POST /api/login failed', err);
    return res.status(500).json({ error: 'login_failed' });
  }
});

app.post('/api/logout', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (token) destroySession(token);
  res.json({ ok: true });
});

// ---- Protected routes: require authentication ----
app.use('/api', (req, res, next) => {
  // Skip auth for public endpoints already handled above
  if (req.path === '/health' || req.path === '/login' || req.path === '/logout') {
    return next();
  }
  requireAuth(req, res, next);
});

app.get('/api/dashboard', async (req, res) => {
  try {
    const vacantRow = await get("SELECT COUNT(*) AS c FROM rooms WHERE status='vacant'");
    const occupiedRow = await get("SELECT COUNT(*) AS c FROM rooms WHERE status='occupied'");
    // นับเฉพาะผู้เช่าที่ยังพักอยู่จริง (is_active=1) ไม่นับรวมผู้เช่าเก่าที่ย้ายออก/archived แล้ว
    const tenantRow = await get("SELECT COUNT(*) AS c FROM users WHERE role='tenant' AND is_active=1");
    const unpaidBillRow = await get("SELECT COUNT(*) AS c FROM bills WHERE status='unpaid'");

    // คำนวณรายรับ-รายจ่ายสดจากข้อมูลจริง (bills ที่จ่ายแล้วและสลิปอนุมัติแล้วเท่านั้น + expenses)
    // แทนที่จะอ่านจากตาราง yearly_finance_monthly ซึ่งไม่มีจุดไหนในระบบเขียนค่าจริงใส่เลย
    // (ค้างเป็น 0 ตลอดไม่ว่าจะมีคนจ่ายบิลมาเท่าไหร่ก็ตาม)
    const incomeRows = await all(
      "SELECT year, month, SUM(total) AS income FROM bills WHERE status='paid' AND slip_status='approved' GROUP BY year, month"
    );
    const expenseRows = await all(
      'SELECT year, month, SUM(amount) AS expense FROM expenses GROUP BY year, month'
    );

    const yearMap = new Map();
    function ensureYear(y) {
      if (!yearMap.has(y)) {
        yearMap.set(y, { income: new Array(12).fill(0), expense: new Array(12).fill(0) });
      }
      return yearMap.get(y);
    }
    for (const row of incomeRows) {
      const idx = Math.max(0, Math.min(11, Number(row.month) - 1));
      ensureYear(Number(row.year)).income[idx] = toNumber(row.income);
    }
    for (const row of expenseRows) {
      const idx = Math.max(0, Math.min(11, Number(row.month) - 1));
      ensureYear(Number(row.year)).expense[idx] = toNumber(row.expense);
    }

    const currentYear = yearMap.size ? Math.max(...Array.from(yearMap.keys())) : null;
    const currentYearData = currentYear ? yearMap.get(currentYear) : { income: new Array(12).fill(0), expense: new Array(12).fill(0) };

    let currentMonth = 1;
    if (currentYear) {
      const data = currentYearData;
      for (let m = 11; m >= 0; m -= 1) {
        if (data.income[m] || data.expense[m]) {
          currentMonth = m + 1;
          break;
        }
      }
    }

    const currentIncome = currentYearData.income[currentMonth - 1] || 0;
    const currentExpense = currentYearData.expense[currentMonth - 1] || 0;

    // จำกัดกราฟ "เปรียบเทียบรายปี" ไว้แค่ 5 ปีล่าสุด กันไม่ให้แท่งกราฟแน่นเกินไปเมื่อใช้งานไปหลายปี
    // (ข้อมูลปีเก่ากว่านั้นยังอยู่ในฐานข้อมูลครบ แค่ไม่เอามาวาดกราฟนี้เท่านั้น)
    const YEARLY_CHART_MAX_YEARS = 5;
    const yearlyTotals = Array.from(yearMap.entries())
      .map(([year, v]) => ({
        year,
        income_total: v.income.reduce((a, b) => a + b, 0),
        expense_total: v.expense.reduce((a, b) => a + b, 0),
      }))
      .sort((a, b) => a.year - b.year)
      .slice(-YEARLY_CHART_MAX_YEARS);

    res.json({
      summary: {
        vacant_rooms: toNumber(vacantRow && vacantRow.c),
        occupied_rooms: toNumber(occupiedRow && occupiedRow.c),
        tenant_count: toNumber(tenantRow && tenantRow.c),
        unpaid_bill_count: toNumber(unpaidBillRow && unpaidBillRow.c),
      },
      current_month: {
        year: currentYear,
        month: currentMonth,
        income: currentIncome,
        expense: currentExpense,
        profit: currentIncome - currentExpense,
      },
      monthly_current_year: {
        year: currentYear,
        income: currentYearData.income,
        expense: currentYearData.expense,
      },
      yearly: yearlyTotals.map((y) => ({
        year: y.year,
        income_total: toNumber(y.income_total),
        expense_total: toNumber(y.expense_total),
        profit_total: toNumber(y.income_total) - toNumber(y.expense_total),
      })),
    });
  } catch (err) {
    console.error('GET /api/dashboard failed', err);
    res.status(500).json({ error: 'failed_to_read_dashboard' });
  }
});

app.post('/api/payments/intents', async (req, res) => {
  const body = req.body || {};
  const room = (body.room || '').toString().trim();
  const billIds = Array.isArray(body.billIds)
    ? Array.from(
        new Set(
          body.billIds
            .map((x) => (x == null ? '' : x.toString().trim()))
            .filter((x) => x.length > 0)
        )
      )
    : [];

  if (!room || billIds.length === 0) {
    return res.status(400).json({ error: 'invalid_payload' });
  }

  // ผู้เช่าสร้างรายการจ่ายเงินได้เฉพาะห้องตัวเอง ห้ามระบุห้องอื่น (แอดมินทำแทนห้องไหนก็ได้)
  if (req.session.role !== 'admin' && req.session.room !== room) {
    return res.status(403).json({ error: 'forbidden' });
  }

  try {
    const bankRow = await get('SELECT promptpay FROM bank_accounts WHERE id=1');
    const promptpay = cleanPromptPay(bankRow && bankRow.promptpay);
    if (!promptpay) {
      return res.status(409).json({ error: 'promptpay_not_configured' });
    }

    const placeholders = billIds.map(() => '?').join(',');
    const bills = await all(
      `SELECT id, room_id, total, status FROM bills WHERE id IN (${placeholders})`,
      billIds
    );
    if (bills.length !== billIds.length) {
      return res.status(404).json({ error: 'bill_not_found' });
    }

    const invalidBill = bills.find((b) => b.room_id !== room || b.status !== 'unpaid');
    if (invalidBill) {
      return res.status(409).json({ error: 'bill_not_payable' });
    }

    const zeroAmountBill = bills.find((b) => !(toNumber(b.total, 0) > 0));
    if (zeroAmountBill) {
      return res.status(409).json({ error: 'bill_zero_amount' });
    }

    const pendingRows = await all(
      "SELECT id, bill_ids, status, expires_at FROM payment_intents WHERE room_id=? AND status='pending' ORDER BY created_at DESC",
      [room]
    );
    const requestedSet = new Set(billIds);
    for (const row of pendingRows) {
      const updatedRow = await expireIntentIfNeeded(row);
      if (updatedRow.status !== 'pending') continue;
      const existingIds = safeJsonParse(updatedRow.bill_ids, []);
      if (existingIds.some((id) => requestedSet.has(id))) {
        return res.status(409).json({ error: 'bill_has_active_payment' });
      }
    }

    const amount = roundMoney(bills.reduce((sum, b) => sum + toNumber(b.total, 0), 0));
    if (!(amount > 0)) {
      return res.status(400).json({ error: 'invalid_amount' });
    }

    const qrPayload = generatePromptPayPayload(promptpay, { amount });
    const qrImageDataUrl = await QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 320,
    });

    const intentId = createId('PAY');
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await run(
      'INSERT INTO payment_intents (id, room_id, bill_ids, amount, status, provider, promptpay_id, qr_payload, qr_image_data_url, provider_ref, expires_at, paid_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        intentId,
        room,
        JSON.stringify(billIds),
        amount,
        'pending',
        'promptpay',
        promptpay,
        qrPayload,
        qrImageDataUrl,
        null,
        expiresAt,
        null,
        createdAt,
        createdAt,
      ]
    );

    const intent = await get('SELECT * FROM payment_intents WHERE id=?', [intentId]);
    return res.status(201).json({ intent: mapPaymentIntentRow(intent) });
  } catch (err) {
    console.error('POST /api/payments/intents failed', err);
    return res.status(err.status || 500).json({ error: err.code || 'create_payment_intent_failed' });
  }
});

app.get('/api/payments/intents/active', async (req, res) => {
  const room = (req.query.room || '').toString().trim();
  if (!room) {
    return res.status(400).json({ error: 'invalid_payload' });
  }
  // ผู้เช่าดูรายการจ่ายเงินที่กำลังทำอยู่ได้เฉพาะห้องตัวเอง
  if (req.session.role !== 'admin' && req.session.room !== room) {
    return res.status(403).json({ error: 'forbidden' });
  }

  try {
    let intent = await get(
      "SELECT * FROM payment_intents WHERE room_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1",
      [room]
    );
    if (!intent) {
      return res.json({ intent: null });
    }
    intent = await expireIntentIfNeeded(intent);
    return res.json({ intent: mapPaymentIntentRow(intent) });
  } catch (err) {
    console.error('GET /api/payments/intents/active failed', err);
    return res.status(500).json({ error: 'failed_to_get_active_intent' });
  }
});

app.get('/api/payments/intents/:id', async (req, res) => {
  const intentId = (req.params.id || '').toString().trim();
  if (!intentId) {
    return res.status(400).json({ error: 'invalid_payload' });
  }

  try {
    let intent = await get('SELECT * FROM payment_intents WHERE id=?', [intentId]);
    if (!intent) {
      return res.status(404).json({ error: 'intent_not_found' });
    }
    // ผู้เช่าดูรายการจ่ายเงินได้เฉพาะของห้องตัวเอง (แอดมินดูได้ทุกห้อง)
    if (req.session.role !== 'admin' && req.session.room !== intent.room_id) {
      return res.status(403).json({ error: 'forbidden' });
    }
    intent = await expireIntentIfNeeded(intent);
    return res.json({ intent: mapPaymentIntentRow(intent) });
  } catch (err) {
    console.error('GET /api/payments/intents/:id failed', err);
    return res.status(500).json({ error: 'failed_to_get_intent' });
  }
});

// ============================================================
// อัปโหลดสลิปการโอนเงิน (Slip Upload)
//
// ผู้เช่าอัปโหลดรูปสลิปการโอนเงินหลังจ่าย -> ระบบบันทึกไฟล์ไว้
// แล้วเข้าคิว "ตรวจสอบสลิป" ให้แอดมินตรวจสอบและยืนยัน/ปฏิเสธเองเสมอ
// (ไม่มีการเรียกตรวจสอบกับผู้ให้บริการภายนอกหรือปิดบิลอัตโนมัติ)
// ============================================================

app.post('/api/payments/intents/:id/verify-slip', async (req, res) => {
  const intentId = (req.params.id || '').toString();
  const imageDataUrl = ((req.body || {}).imageBase64 || '').toString();

  const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/.exec(imageDataUrl);
  if (!match) {
    return res.status(400).json({ error: 'invalid_image' });
  }
  const mimeType = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 6 * 1024 * 1024) {
    return res.status(400).json({ error: 'image_too_large' });
  }

  try {
    const intent = await get('SELECT * FROM payment_intents WHERE id=?', [intentId]);
    if (!intent) return res.status(404).json({ error: 'intent_not_found' });

    // ผู้เช่าแนบสลิปได้เฉพาะห้องตัวเอง แอดมินแนบแทนได้ทุกห้อง
    if (req.session.role !== 'admin' && req.session.room !== intent.room_id) {
      return res.status(403).json({ error: 'forbidden' });
    }
    if (intent.status === 'paid') {
      return res.json({ ok: true, already_paid: true });
    }
    if (intent.status !== 'pending') {
      return res.status(409).json({ error: 'intent_not_pending' });
    }

    const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
    const filename = `${intentId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(SLIPS_DIR, filename), buffer);
    const slipValue = `upload:${filename}`;

    // อัปโหลดแล้วเข้าคิวให้แอดมินตรวจสอบเองเสมอ
    await markIntentPaid(intentId, null, null, { slip: slipValue, slipStatus: 'pending' });
    return res.json({ ok: true, auto_verified: false, reason: 'awaiting_admin_review' });
  } catch (err) {
    console.error('POST /api/payments/intents/:id/verify-slip failed', err);
    return res.status(err.status || 500).json({ error: err.code || 'verify_slip_failed' });
  }
});

// สร้าง QR PromptPay แบบทั่วไป (ระบุยอดเงินหรือไม่ก็ได้) ไม่ผูกกับบิล/ห้อง
app.post('/api/qr/promptpay', requireAdmin, async (req, res) => {
  const body = req.body || {};
  const rawTarget = (body.promptpay || body.target || '').toString().trim();
  const target = cleanPromptPay(rawTarget);

  // พร้อมเพย์ต้องเป็นเบอร์โทร 10 หลัก, เลขบัตร ปชช./เลขทะเบียนนิติบุคคล 13 หลัก
  // หรือเลข e-Wallet ID 15 หลัก เท่านั้น (เลขบัญชีธนาคารทั่วไปใช้สร้าง QR โอนเงินแบบสแกนจ่ายไม่ได้
  // เพราะไม่ใช่มาตรฐาน EMV QR ของพร้อมเพย์)
  if (![10, 13, 15].includes(target.length)) {
    return res.status(400).json({
      error: 'invalid_promptpay',
      message: 'พร้อมเพย์ต้องเป็นเบอร์โทร 10 หลัก หรือเลขบัตรประชาชน/นิติบุคคล 13 หลัก',
    });
  }

  let amount;
  const amountRaw = body.amount;
  if (amountRaw !== undefined && amountRaw !== null && amountRaw !== '') {
    amount = roundMoney(toNumber(amountRaw, NaN));
    if (!(amount > 0)) {
      return res.status(400).json({ error: 'invalid_amount' });
    }
  }

  try {
    const qrPayload = generatePromptPayPayload(target, amount ? { amount } : {});
    const qrImageDataUrl = await QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 320,
    });
    return res.json({
      promptpay: target,
      amount: amount || null,
      qr_payload: qrPayload,
      qr_image_data_url: qrImageDataUrl,
    });
  } catch (err) {
    console.error('POST /api/qr/promptpay failed', err);
    return res.status(500).json({ error: 'generate_qr_failed' });
  }
});

app.post('/api/users', requireAdmin, async (req, res) => {
  const body = req.body || {};
  const room = (body.room || '').toString().trim();
  const firstName = (body.firstName || body.first_name || '').toString().trim();
  const lastName = (body.lastName || body.last_name || '').toString().trim();
  const relationNote = (body.relation || body.relation_note || '').toString().trim();
  const extraOccupants = Array.isArray(body.occupants)
    ? body.occupants
        .map((x) => ({
          firstName: (x && (x.firstName || x.first_name) ? x.firstName || x.first_name : '')
            .toString()
            .trim(),
          lastName: (x && (x.lastName || x.last_name) ? x.lastName || x.last_name : '')
            .toString()
            .trim(),
          relation: (x && (x.relation || x.relation_note) ? x.relation || x.relation_note : '')
            .toString()
            .trim(),
        }))
        .filter((x) => x.firstName && x.lastName)
    : [];
  const name = joinName(firstName, lastName, body.name || '');
  const username = (body.username || '').toString().trim();
  const password = (body.password || '').toString();

  if (!room || !name || !username || !password) {
    return res.status(400).json({ error: 'invalid_payload' });
  }

  try {
    await run('START TRANSACTION');

    const roomRow = await get('SELECT id, status FROM rooms WHERE id = ?', [room]);
    if (!roomRow) throw apiError(404, 'room_not_found');
    const currentPeople = await getCurrentRoomPeopleCount(room);
    const incomingPeople = 1 + extraOccupants.length;
    if (currentPeople + incomingPeople > 5) {
      throw apiError(409, 'room_capacity_reached');
    }

    const existingUsername = await get('SELECT id FROM users WHERE username = ?', [username]);
    if (existingUsername) throw apiError(409, 'username_exists');

    const userId = createId('TN');

    await run(
      'INSERT INTO users (id, username, password, room_id, name, first_name, last_name, relation_note, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, username, password, room, name, firstName, lastName, relationNote, 'tenant', nowIso()]
    );
    await run(
      'INSERT INTO room_occupants (room_id, first_name, last_name, relation_note, tenant_user_id) VALUES (?, ?, ?, ?, ?)',
      [room, firstName, lastName, relationNote || '', userId]
    );
    for (const occ of extraOccupants) {
      // eslint-disable-next-line no-await-in-loop
      await run(
        'INSERT INTO room_occupants (room_id, first_name, last_name, relation_note, tenant_user_id) VALUES (?, ?, ?, ?, NULL)',
        [room, occ.firstName, occ.lastName, occ.relation || '']
      );
    }
    await refreshRoomOccupancy(room, userId);

    // บันทึกค่ามัดจำตามยอดที่แอดมินกรอกเอง (ถ้ากรอกมา > 0)
    const depositAmount = toNumber(body.depositAmount, 0);
    if (depositAmount > 0) {
      await run(
        'INSERT INTO deposits (room_id, amount, status) VALUES (?, ?, ?) ' +
          'ON DUPLICATE KEY UPDATE amount = VALUES(amount), status = VALUES(status)',
        [room, depositAmount, 'paid']
      );
    }

    await run('COMMIT');
    return res.status(201).json({ ok: true, id: userId });
  } catch (err) {
    try {
      await run('ROLLBACK');
    } catch (_rollbackErr) {}
    const status = err.status || 500;
    return res.status(status).json({ error: err.code || 'create_user_failed' });
  }
});

app.put('/api/users/:id', requireAdmin, async (req, res) => {
  const userId = (req.params.id || '').toString();
  const body = req.body || {};
  const room = (body.room || '').toString().trim();
  const firstName = (body.firstName || body.first_name || '').toString().trim();
  const lastName = (body.lastName || body.last_name || '').toString().trim();
  const relationNote = (body.relation || body.relation_note || '').toString().trim();
  const name = joinName(firstName, lastName, body.name || '');
  const username = (body.username || '').toString().trim();
  const password = (body.password || '').toString();

  if (!userId || !room || !name || !username || !password) {
    return res.status(400).json({ error: 'invalid_payload' });
  }

  try {
    await run('START TRANSACTION');

    const current = await get('SELECT id, room_id, role FROM users WHERE id = ?', [userId]);
    if (!current || current.role !== 'tenant') throw apiError(404, 'user_not_found');

    const roomRow = await get('SELECT id, status FROM rooms WHERE id = ?', [room]);
    if (!roomRow) throw apiError(404, 'room_not_found');

    const isMovingRoom = current.room_id !== room;

    // ย้ายห้อง: ถ้าผู้เช่าคนนี้เป็นเจ้าของบัญชีคนเดียวที่เหลืออยู่ในห้องเดิม (ไม่มีผู้เช่าที่มีบัญชี
    // คนอื่นค้างอยู่) ให้ย้ายผู้เข้าพักที่ "ไม่มีบัญชีผู้ใช้" (เช่นสมาชิกครอบครัว) ในห้องเดิมตามไปด้วย
    // เพราะเดิมย้ายแค่แถว room_occupants ของตัวเองแถวเดียว (WHERE tenant_user_id=?) คนอื่นเลยค้างอยู่
    // ห้องเก่า ถ้ายังมีผู้เช่าบัญชีอื่นเหลืออยู่ในห้องเดิม ให้ถือว่าผู้เข้าพักไร้บัญชีเหล่านั้นยังอยู่กับ
    // ผู้เช่าที่เหลือ ไม่ย้ายตาม
    let occupantsFollowing = [];
    if (isMovingRoom) {
      const otherTenantRow = await get(
        "SELECT COUNT(*) AS c FROM users WHERE role='tenant' AND room_id=? AND id<>? AND is_active=1",
        [current.room_id, userId]
      );
      const hasOtherTenant = toNumber(otherTenantRow && otherTenantRow.c, 0) > 0;
      if (!hasOtherTenant) {
        occupantsFollowing = await all(
          'SELECT id FROM room_occupants WHERE room_id=? AND tenant_user_id IS NULL',
          [current.room_id]
        );
      }
    }

    const roomTenantCountRow = await get(
      "SELECT COUNT(*) AS c FROM users WHERE role='tenant' AND room_id=? AND id<>?",
      [room, userId]
    );
    const destTenantCount = toNumber(roomTenantCountRow && roomTenantCountRow.c, 0);
    if (destTenantCount >= 5) {
      throw apiError(409, 'room_capacity_reached');
    }
    const destOccupantRow = await get(
      'SELECT COUNT(*) AS c FROM room_occupants WHERE room_id=? AND tenant_user_id IS NULL',
      [room]
    );
    const destOccupantCount = toNumber(destOccupantRow && destOccupantRow.c, 0);
    if (1 + destTenantCount + destOccupantCount + occupantsFollowing.length > 5) {
      throw apiError(409, 'room_capacity_reached');
    }

    const duplicate = await get('SELECT id FROM users WHERE username = ? AND id <> ?', [
      username,
      userId,
    ]);
    if (duplicate) throw apiError(409, 'username_exists');

    await run(
      'UPDATE users SET room_id=?, name=?, first_name=?, last_name=?, relation_note=?, username=?, password=? WHERE id=?',
      [
      room,
      name,
      firstName,
      lastName,
      relationNote,
      username,
      password,
      userId,
    ]);
    await run(
      'UPDATE room_occupants SET room_id=?, first_name=?, last_name=?, relation_note=? WHERE tenant_user_id=?',
      [room, firstName, lastName, relationNote, userId]
    );
    if (occupantsFollowing.length) {
      await run(
        'UPDATE room_occupants SET room_id=? WHERE id IN (' +
          occupantsFollowing.map(() => '?').join(',') +
          ')',
        [room, ...occupantsFollowing.map((o) => o.id)]
      );
    }

    if (isMovingRoom) {
      await refreshRoomOccupancy(current.room_id, null);
    }
    await refreshRoomOccupancy(room, userId);

    await run('COMMIT');
    return res.json({ ok: true });
  } catch (err) {
    try {
      await run('ROLLBACK');
    } catch (_rollbackErr) {}
    const status = err.status || 500;
    return res.status(status).json({ error: err.code || 'update_user_failed' });
  }
});

app.delete('/api/users/:id', requireAdmin, async (req, res) => {
  const userId = (req.params.id || '').toString();
  if (!userId) {
    return res.status(400).json({ error: 'invalid_payload' });
  }

  try {
    await run('START TRANSACTION');

    const current = await get('SELECT id, room_id, role FROM users WHERE id = ?', [userId]);
    if (!current || current.role !== 'tenant') throw apiError(404, 'user_not_found');

    // เก็บประวัติผู้เช่าไว้: ปิดใช้งานบัญชี (ล็อกอินไม่ได้อีก) แทนการลบทิ้งถาวร
    // ยังคงเก็บ room_id ไว้บนบัญชีเพื่อให้หน้า "ประวัติผู้เช่า" ยังอ้างอิงห้องเดิมได้
    await run("UPDATE users SET is_active=0, archived_at=? WHERE id = ?", [nowIso(), userId]);
    await run('DELETE FROM room_occupants WHERE tenant_user_id = ?', [userId]);
    const remainTenantRow = await get(
      "SELECT COUNT(*) AS c FROM users WHERE role='tenant' AND room_id=? AND is_active=1",
      [current.room_id]
    );
    if (toNumber(remainTenantRow && remainTenantRow.c, 0) === 0) {
      await run('DELETE FROM room_occupants WHERE room_id = ?', [current.room_id]);
    }
    await refreshRoomOccupancy(current.room_id, null);

    await run('COMMIT');
    return res.json({ ok: true });
  } catch (err) {
    try {
      await run('ROLLBACK');
    } catch (_rollbackErr) {}
    const status = err.status || 500;
    return res.status(status).json({ error: err.code || 'delete_user_failed' });
  }
});

// แก้ไขข้อมูลผู้เข้าพักที่ "ไม่มีบัญชีผู้ใช้" (tenant_user_id เป็น NULL) เท่านั้น
// ผู้เข้าพักที่มีบัญชีผู้ใช้แล้วต้องแก้ผ่าน PUT /api/users/:id เพื่อให้ชื่อตรงกับบัญชีล็อกอินเสมอ
app.put('/api/room-occupants/:id', requireAdmin, async (req, res) => {
  const occupantId = (req.params.id || '').toString();
  const body = req.body || {};
  const firstName = (body.firstName || body.first_name || '').toString().trim();
  const lastName = (body.lastName || body.last_name || '').toString().trim();
  const relationNote = (body.relation || body.relation_note || '').toString().trim();

  if (!occupantId || !firstName || !lastName) {
    return res.status(400).json({ error: 'invalid_payload' });
  }

  try {
    const current = await get(
      'SELECT id, tenant_user_id FROM room_occupants WHERE id = ?',
      [occupantId]
    );
    if (!current) return res.status(404).json({ error: 'occupant_not_found' });
    if (current.tenant_user_id) {
      return res.status(409).json({ error: 'occupant_has_account' });
    }

    await run(
      'UPDATE room_occupants SET first_name=?, last_name=?, relation_note=? WHERE id=?',
      [firstName, lastName, relationNote, occupantId]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/room-occupants/:id failed', err);
    return res.status(500).json({ error: 'update_occupant_failed' });
  }
});

// เพิ่มผู้เข้าพัก "ที่ไม่มีบัญชีผู้ใช้" เข้าห้องที่มีผู้เช่าหลัก (ที่มีบัญชี) อยู่แล้ว
// เช่น เพิ่มสมาชิกครอบครัว/เพื่อนร่วมห้องที่ไม่ต้องล็อกอินเข้าระบบ
app.post('/api/room-occupants', requireAdmin, async (req, res) => {
  const body = req.body || {};
  const room = (body.room || body.room_id || '').toString().trim();
  const firstName = (body.firstName || body.first_name || '').toString().trim();
  const lastName = (body.lastName || body.last_name || '').toString().trim();
  const relationNote = (body.relation || body.relation_note || '').toString().trim();

  if (!room || !firstName || !lastName) {
    return res.status(400).json({ error: 'invalid_payload' });
  }

  try {
    const roomRow = await get('SELECT id FROM rooms WHERE id = ?', [room]);
    if (!roomRow) return res.status(404).json({ error: 'room_not_found' });

    const currentPeople = await getCurrentRoomPeopleCount(room);
    if (currentPeople + 1 > 5) {
      return res.status(409).json({ error: 'room_capacity_reached' });
    }

    const result = await run(
      'INSERT INTO room_occupants (room_id, first_name, last_name, relation_note, tenant_user_id) VALUES (?, ?, ?, ?, NULL)',
      [room, firstName, lastName, relationNote]
    );
    return res.status(201).json({ ok: true, id: result.lastID });
  } catch (err) {
    console.error('POST /api/room-occupants failed', err);
    return res.status(500).json({ error: 'add_occupant_failed' });
  }
});

// ลบผู้เข้าพัก "ที่ไม่มีบัญชีผู้ใช้" ออกจากห้อง (ลบถาวรจริงๆ ไม่ใช่แค่ย้ายออก เพราะคนกลุ่มนี้ไม่มี
// บัญชีให้ล็อกอิน ไม่มีประวัติการใช้งานอะไรให้ต้องเก็บไว้แบบผู้เช่าที่มีบัญชี)
// ผู้เข้าพักที่มีบัญชีผู้ใช้แล้วต้องลบผ่าน DELETE /api/users/:id (ย้ายออก) แทน เพื่อเก็บประวัติไว้
app.delete('/api/room-occupants/:id', requireAdmin, async (req, res) => {
  const occupantId = (req.params.id || '').toString();
  if (!occupantId) {
    return res.status(400).json({ error: 'invalid_payload' });
  }

  try {
    const current = await get(
      'SELECT id, room_id, tenant_user_id FROM room_occupants WHERE id = ?',
      [occupantId]
    );
    if (!current) return res.status(404).json({ error: 'occupant_not_found' });
    if (current.tenant_user_id) {
      return res.status(409).json({ error: 'occupant_has_account' });
    }

    await run('DELETE FROM room_occupants WHERE id = ?', [occupantId]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/room-occupants/:id failed', err);
    return res.status(500).json({ error: 'delete_occupant_failed' });
  }
});

// เปลี่ยนหมายเลขห้อง (เฉพาะห้องว่าง) — ต้องไล่อัปเดต room_id ทุกตารางที่อ้างอิงหมายเลขห้องเดิม
// ทำฝั่งเซิร์ฟเวอร์ทั้งหมดในธุรกรรมเดียว (ไม่ใช่ให้ฝั่งเว็บไล่แก้ค่าในหน่วยความจำแล้วหวังว่า
// ระบบบันทึกอัตโนมัติจะ sync ตามทัน) เพราะ users/room_occupants ถูกตัดออกจากระบบบันทึก
// อัตโนมัติแบบรวมแล้ว (ดูคอมเมนต์ที่ writeData) ต้องมี endpoint เฉพาะมาจัดการแทน
app.post('/api/rooms/:id/rename', requireAdmin, async (req, res) => {
  const oldId = (req.params.id || '').toString();
  const newId = ((req.body && req.body.newId) || '').toString().trim();
  if (!oldId || !newId) return res.status(400).json({ error: 'invalid_payload' });
  if (oldId === newId) return res.json({ ok: true });

  try {
    await run('START TRANSACTION');
    const room = await get('SELECT id, status FROM rooms WHERE id=?', [oldId]);
    if (!room) throw apiError(404, 'room_not_found');
    if (room.status === 'occupied') throw apiError(409, 'room_occupied');
    const dup = await get('SELECT id FROM rooms WHERE id=?', [newId]);
    if (dup) throw apiError(409, 'room_exists');

    await run('UPDATE rooms SET id=? WHERE id=?', [newId, oldId]);
    await run('UPDATE users SET room_id=? WHERE room_id=?', [newId, oldId]);
    await run('UPDATE room_occupants SET room_id=? WHERE room_id=?', [newId, oldId]);
    await run('UPDATE bills SET room_id=? WHERE room_id=?', [newId, oldId]);
    await run('UPDATE deposits SET room_id=? WHERE room_id=?', [newId, oldId]);
    await run('UPDATE reports SET room_id=? WHERE room_id=?', [newId, oldId]);
    await run('UPDATE checkouts SET room_id=? WHERE room_id=?', [newId, oldId]);
    await run('UPDATE room_readings SET room_id=? WHERE room_id=?', [newId, oldId]);
    await run('UPDATE payment_intents SET room_id=? WHERE room_id=?', [newId, oldId]);

    await run('COMMIT');
    return res.json({ ok: true });
  } catch (err) {
    try {
      await run('ROLLBACK');
    } catch (_rollbackErr) {}
    const status = err.status || 500;
    return res.status(status).json({ error: err.code || 'rename_room_failed' });
  }
});

app.get('/api/data', async (req, res) => {
  try {
    const payload = await readData();
    res.json(scopeDataForSession(payload, req.session));
  } catch (err) {
    console.error('GET /api/data failed', err);
    res.status(500).json({ error: 'failed_to_read_data' });
  }
});

app.post('/api/data', requireAuth, async (req, res) => {
  try {
    await writeData(req.body || {}, req.session);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/data failed', err);
    res.status(500).json({ error: 'failed_to_write_data' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(INDEX_FILE);
});

ensureSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`House Sunset server running on http://127.0.0.1:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database schema', err);
    process.exit(1);
  });
