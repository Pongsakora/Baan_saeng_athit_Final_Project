-- house_sunset_schema.sql (MySQL version)
-- หมายเหตุ: การสร้าง INDEX แยกไปทำใน server.js (ensureSchema)
-- เพราะ MySQL รุ่นเก่ากว่า 8.0.29 ไม่รองรับ CREATE INDEX IF NOT EXISTS

CREATE DATABASE IF NOT EXISTS `house_sunset` CHARACTER SET utf8mb4;
USE `house_sunset`;

CREATE TABLE IF NOT EXISTS rooms (
  id VARCHAR(64) PRIMARY KEY,
  status VARCHAR(32) NOT NULL,
  tenant_id VARCHAR(64)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  username VARCHAR(191) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  room_id VARCHAR(64),
  name VARCHAR(255) NOT NULL,
  first_name VARCHAR(191),
  last_name VARCHAR(191),
  relation_note VARCHAR(255),
  role VARCHAR(32) NOT NULL,
  created_at VARCHAR(64),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  archived_at VARCHAR(64)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rates (
  id INT PRIMARY KEY,
  rent DOUBLE NOT NULL,
  water_unit DOUBLE NOT NULL,
  electric_unit DOUBLE NOT NULL,
  deposit DOUBLE NOT NULL DEFAULT 3000
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bank_accounts (
  id INT PRIMARY KEY,
  account_name VARCHAR(255) NOT NULL,
  bank_name VARCHAR(255) NOT NULL,
  account_number VARCHAR(64) NOT NULL,
  promptpay VARCHAR(32)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS chat_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  report_id VARCHAR(64) NOT NULL,
  sender VARCHAR(32) NOT NULL,
  message_text TEXT NOT NULL,
  sent_at VARCHAR(64),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bills (
  id VARCHAR(64) PRIMARY KEY,
  room_id VARCHAR(64) NOT NULL,
  month INT NOT NULL,
  year INT NOT NULL,
  rent DOUBLE NOT NULL,
  water_unit DOUBLE NOT NULL,
  water_cost DOUBLE NOT NULL,
  elec_unit DOUBLE NOT NULL,
  elec_cost DOUBLE NOT NULL,
  total DOUBLE NOT NULL,
  status VARCHAR(32) NOT NULL,
  slip MEDIUMTEXT,
  slip_status VARCHAR(32) NOT NULL DEFAULT 'none',
  tenant_user_id VARCHAR(64) DEFAULT NULL,
  bill_date VARCHAR(32) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS deposits (
  room_id VARCHAR(64) PRIMARY KEY,
  amount DOUBLE NOT NULL,
  status VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reports (
  id VARCHAR(64) PRIMARY KEY,
  room_id VARCHAR(64) NOT NULL,
  type VARCHAR(32) NOT NULL,
  detail TEXT NOT NULL,
  media MEDIUMTEXT,
  status VARCHAR(32) NOT NULL,
  response TEXT,
  report_date VARCHAR(64),
  tenant_user_id VARCHAR(64) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS checkouts (
  id VARCHAR(64) PRIMARY KEY,
  room_id VARCHAR(64) NOT NULL,
  checkout_date VARCHAR(64),
  refund_type VARCHAR(32),
  bank_name VARCHAR(255),
  account_no VARCHAR(64),
  status VARCHAR(32) NOT NULL,
  urgent TINYINT(1) NOT NULL DEFAULT 0,
  urgent_reason TEXT,
  tenant_user_id VARCHAR(64) DEFAULT NULL,
  inspect_date VARCHAR(32) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS expenses (
  id VARCHAR(64) PRIMARY KEY,
  month INT NOT NULL,
  year INT NOT NULL,
  type VARCHAR(64) NOT NULL,
  detail TEXT NOT NULL,
  amount DOUBLE NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS room_readings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  room_id VARCHAR(64) NOT NULL,
  month INT NOT NULL,
  year INT NOT NULL,
  prev_water DOUBLE NOT NULL,
  cur_water DOUBLE NOT NULL,
  prev_elec DOUBLE NOT NULL,
  cur_elec DOUBLE NOT NULL,
  tenant_user_id VARCHAR(64) DEFAULT NULL,
  UNIQUE KEY uniq_room_month_year (room_id, month, year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS room_occupants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  room_id VARCHAR(64) NOT NULL,
  first_name VARCHAR(191) NOT NULL,
  last_name VARCHAR(191) NOT NULL,
  relation_note VARCHAR(255),
  tenant_user_id VARCHAR(64),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payment_intents (
  id VARCHAR(64) PRIMARY KEY,
  room_id VARCHAR(64) NOT NULL,
  bill_ids TEXT NOT NULL,
  amount DOUBLE NOT NULL,
  status VARCHAR(32) NOT NULL,
  provider VARCHAR(32) NOT NULL DEFAULT 'promptpay',
  promptpay_id VARCHAR(32) NOT NULL,
  qr_payload TEXT NOT NULL,
  qr_image_data_url LONGTEXT NOT NULL,
  provider_ref VARCHAR(191),
  expires_at VARCHAR(64),
  paid_at VARCHAR(64),
  created_at VARCHAR(64) NOT NULL,
  updated_at VARCHAR(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
