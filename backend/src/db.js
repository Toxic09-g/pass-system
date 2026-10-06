import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'pass-system.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Встроенные LOWER/LIKE в SQLite не меняют регистр кириллицы — для поиска без учёта
// регистра по русскому тексту используем lower_ru из JavaScript
db.function('lower_ru', { deterministic: true }, (value) => (value == null ? null : String(value).toLowerCase()));

const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf-8');
db.exec(schema);

migrate();
seedDictionariesIfEmpty();

// Лёгкие миграции для баз, созданных до появления нового столбца —
// CREATE TABLE IF NOT EXISTS не добавляет столбцы в уже существующую таблицу
function migrate() {
  const columns = db.prepare('PRAGMA table_info(visits)').all().map((c) => c.name);
  if (!columns.includes('checked_out_at')) {
    db.exec('ALTER TABLE visits ADD COLUMN checked_out_at TEXT');
  }
  // Цифровая подпись посетителя отменена — на чеке теперь подпись
  // сопровождающего сотрудника, ставится ручкой на бумаге, в базе не хранится
  if (columns.includes('signature_path')) {
    db.exec('ALTER TABLE visits DROP COLUMN signature_path');
  }
  if (!columns.includes('visitor_iin')) {
    db.exec("ALTER TABLE visits ADD COLUMN visitor_iin TEXT NOT NULL DEFAULT ''");
  }
  // Тип посетителя появился позже — все прежние записи были физ. лицами с ИИН
  if (!columns.includes('visitor_type')) {
    db.exec("ALTER TABLE visits ADD COLUMN visitor_type TEXT NOT NULL DEFAULT 'individual'");
  }
  // Место посещения сохраняется в каждом визите, чтобы смена названия учреждения
  // не переписывала историю. Прежним записям ставим текущее название
  if (!columns.includes('institution_name')) {
    db.exec("ALTER TABLE visits ADD COLUMN institution_name TEXT NOT NULL DEFAULT ''");
    const currentName =
      db.prepare("SELECT value FROM settings WHERE key = 'institution_name'").get()?.value ??
      process.env.INSTITUTION_NAME ??
      '';
    db.prepare('UPDATE visits SET institution_name = ?').run(currentName);
  }
  // Кто из пользователей оформил пропуск (появилось вместе с логинами)
  if (!columns.includes('registered_by_user_id')) {
    db.exec('ALTER TABLE visits ADD COLUMN registered_by_user_id INTEGER REFERENCES users(id)');
  }
  if (!columns.includes('visitor_organization')) {
    db.exec("ALTER TABLE visits ADD COLUMN visitor_organization TEXT NOT NULL DEFAULT ''");
  }
  const userColumns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!userColumns.includes('institution_name')) {
    db.exec("ALTER TABLE users ADD COLUMN institution_name TEXT NOT NULL DEFAULT ''");
  }
  if (columns.includes('visit_purpose')) {
    db.exec('ALTER TABLE visits DROP COLUMN visit_purpose');
  }
}

// Пример структуры (на основе МВД) — стартовые значения для демонстрации,
// редактируются в разделе «Справочники»
function seedDictionariesIfEmpty() {
  const departmentCount = db.prepare('SELECT COUNT(*) AS count FROM departments').get().count;
  if (departmentCount === 0) {
    const insert = db.prepare('INSERT INTO departments (name) VALUES (?)');
    db.transaction((names) => names.forEach((name) => insert.run(name)))([
      'Следственный департамент',
      'Департамент экономической безопасности и противодействия коррупции',
      'Департамент уголовного розыска',
      'Главное управление собственной безопасности',
      'Административно-хозяйственный департамент',
    ]);
  }

  const positionCount = db.prepare('SELECT COUNT(*) AS count FROM positions').get().count;
  if (positionCount === 0) {
    const insert = db.prepare('INSERT INTO positions (name) VALUES (?)');
    db.transaction((names) => names.forEach((name) => insert.run(name)))([
      'Начальник департамента',
      'Заместитель начальника департамента',
      'Начальник отдела',
      'Заместитель начальника отдела',
      'Старший следователь',
      'Следователь',
      'Оперуполномоченный',
      'Специалист',
    ]);
  }
}

export default db;
