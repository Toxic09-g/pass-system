import { Router } from 'express';
import db from '../db.js';

// Настройки, которые разрешено менять через интерфейс
const EDITABLE_KEYS = ['institution_name'];

export function getSetting(key) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value;
}

// Название из базы приоритетнее INSTITUTION_NAME из .env — .env остаётся
// значением по умолчанию для установок, где название ещё не задано в интерфейсе
export function getInstitutionName() {
  return getSetting('institution_name') ?? process.env.INSTITUTION_NAME ?? '';
}

const router = Router();

router.get('/', (req, res) => {
  res.json({ institution_name: getInstitutionName() });
});

router.put('/', (req, res) => {
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  db.transaction(() => {
    for (const key of EDITABLE_KEYS) {
      if (typeof req.body[key] === 'string') upsert.run(key, req.body[key].trim());
    }
  })();
  res.json({ institution_name: getInstitutionName() });
});

export default router;
