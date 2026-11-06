// connect.js
// โมดูลเชื่อมต่อฐานข้อมูล MySQL (แทนที่ sqlite3 เดิม)
//
// ตั้งค่าการเชื่อมต่อผ่าน environment variables ได้ (แนะนำสำหรับ production):
//   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
// ถ้าไม่ตั้งค่า จะใช้ค่า default ด้านล่าง (เหมาะสำหรับ dev บนเครื่องตัวเอง)

const mysql = require('mysql2/promise');

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'house_sunset',
  // อนุญาตให้รันหลาย statement ในคำสั่งเดียว (ใช้ตอนโหลด schema.sql)
  multipleStatements: true,
  // คืนค่า DATE/DATETIME เป็น string ตรง ๆ แทนการแปลงเป็น JS Date object
  dateStrings: true,
};

let connectionPromise = null;

/**
 * สร้าง (หรือคืนค่า) การเชื่อมต่อ MySQL แบบ single connection
 * ที่ใช้ร่วมกันทั้งแอป — เลียนแบบพฤติกรรมเดิมของ sqlite3.Database
 * เพื่อให้ transaction (START TRANSACTION / COMMIT / ROLLBACK) ทำงาน
 * บนคอนเนกชันเดียวกันตลอด request
 */
async function getConnection() {
  if (connectionPromise) return connectionPromise;

  connectionPromise = mysql
    .createConnection(DB_CONFIG)
    .then(async (conn) => {
      // ตัว schema (house_sunset_schema.sql) สั่ง USE house_sunset ไว้ตอนเริ่มเซิร์ฟเวอร์ ทำให้คอนเนกชันแรกใช้ฐานข้อมูลนั้น
      // แต่ถ้าคอนเนกชันหลุดแล้วต่อใหม่ (เช่น Railway ตัดคอนเนกชันที่ว่างนาน) คอนเนกชันใหม่จะเข้าฐานข้อมูลตาม DB_NAME
      // (เช่น 'railway') ซึ่งไม่มีตารางเลย ทำให้ทุก API ตอบ 500 (ล็อกอินไม่ได้) จึงต้องสั่ง USE ซ้ำทุกครั้งที่ต่อใหม่
      // ถ้ายังไม่มีฐานข้อมูลนี้ (รันครั้งแรกสุด) ให้ข้ามไป เดี๋ยว ensureSchema จะสร้างและ USE ให้เอง
      try { await conn.query('USE `house_sunset`'); } catch (_e) { /* ยังไม่มีฐานข้อมูล */ }
      conn.on('error', (err) => {
        console.error('MySQL connection error:', err.message);
        // ถ้าคอนเนกชันหลุด ให้ล้าง cache เพื่อสร้างใหม่ในการเรียกครั้งถัดไป
        if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.fatal) {
          connectionPromise = null;
        }
      });
      return conn;
    })
    .catch((err) => {
      connectionPromise = null;
      throw err;
    });

  return connectionPromise;
}

async function closeConnection() {
  if (!connectionPromise) return;
  try {
    const conn = await connectionPromise;
    await conn.end();
  } catch (_err) {
    // ignore
  } finally {
    connectionPromise = null;
  }
}

module.exports = { getConnection, closeConnection, DB_CONFIG };
