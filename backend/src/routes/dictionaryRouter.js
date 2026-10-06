import { Router } from 'express';
import db from '../db.js';

// table — имя таблицы, задаётся только из кода (departments.js / positions.js), не из запроса
export function createDictionaryRouter(table, label) {
  const router = Router();

  router.get('/', (req, res) => {
    const { activeOnly } = req.query;
    let query = `SELECT * FROM ${table}`;
    if (activeOnly === '1') query += ' WHERE is_active = 1';
    query += ' ORDER BY name';
    res.json(db.prepare(query).all());
  });

  router.post('/', (req, res) => {
    const { name } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ error: `Укажите название (${label})` });
    }
    try {
      const result = db.prepare(`INSERT INTO ${table} (name) VALUES (?)`).run(name.trim());
      res.status(201).json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(result.lastInsertRowid));
    } catch (err) {
      res.status(400).json({ error: `Такое значение (${label}) уже существует` });
    }
  });

  router.put('/:id', (req, res) => {
    const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Запись не найдена' });

    const { name, is_active } = req.body;
    try {
      db.prepare(`UPDATE ${table} SET name = ?, is_active = ? WHERE id = ?`).run(
        name?.trim() || existing.name,
        is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
        req.params.id
      );
      res.json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id));
    } catch (err) {
      res.status(400).json({ error: `Такое значение (${label}) уже существует` });
    }
  });

  router.delete('/:id', (req, res) => {
    const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Запись не найдена' });
    db.prepare(`UPDATE ${table} SET is_active = 0 WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  return router;
}
