-- Справочник управлений/департаментов
CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Справочник должностей
CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Справочник гос. органов, из которых приходят посетители (подсказки в форме регистрации)
CREATE TABLE IF NOT EXISTS government_bodies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Справочник сотрудников
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  department_id INTEGER NOT NULL REFERENCES departments(id),
  position_id INTEGER NOT NULL REFERENCES positions(id),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_employees_full_name ON employees(full_name);
CREATE INDEX IF NOT EXISTS idx_employees_department_id ON employees(department_id);

-- Журнал регистраций посетителей (пропуска)
CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_full_name TEXT NOT NULL,
  visitor_type TEXT NOT NULL DEFAULT 'individual', -- individual | legal | government
  visitor_iin TEXT NOT NULL DEFAULT '',           -- ИИН, у юр. лица — БИН
  visitor_organization TEXT NOT NULL DEFAULT '',  -- гос. орган посетителя (для типа government)
  institution_name TEXT NOT NULL DEFAULT '',      -- место: учреждение, где оформлен пропуск
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  registered_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  photo_path TEXT,
  qr_code_value TEXT UNIQUE,
  printed_at TEXT,
  checked_out_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_visits_registered_at ON visits(registered_at);
CREATE INDEX IF NOT EXISTS idx_visits_employee_id ON visits(employee_id);

-- Настройки конкретной установки (ключ-значение), например название учреждения
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Пользователи системы. Права выдаются флагами: регистрация (дежурный),
-- журнал (кому разрешили), администратор (всё, включая справочники и пользователей)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login TEXT NOT NULL UNIQUE COLLATE NOCASE,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  can_register INTEGER NOT NULL DEFAULT 0,
  can_view_journal INTEGER NOT NULL DEFAULT 0,
  is_admin INTEGER NOT NULL DEFAULT 0,
  institution_name TEXT NOT NULL DEFAULT '', -- учреждение сотрудника: печатается на чеке, ограничивает журнал
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Сессии входа: в cookie лежит случайный токен, в базе — только его SHA-256
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL -- unix-время, мс
);
