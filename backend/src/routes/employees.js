import { Router } from 'express';
import db from '../db.js';

const router = Router();

const EMPLOYEE_SELECT = `
  SELECT
    employees.*,
    departments.name AS department_name,
    positions.name AS position_name
  FROM employees
  JOIN departments ON departments.id = employees.department_id
  JOIN positions ON positions.id = employees.position_id
`;

// GET /api/employees?search=&department_id=&activeOnly=1 — список / поиск для формы регистрации
router.get('/', (req, res) => {
  const { search = '', department_id, activeOnly } = req.query;
  const conditions = [];
  const params = {};

  if (activeOnly === '1') {
    conditions.push('employees.is_active = 1');
  }
  if (department_id) {
    conditions.push('employees.department_id = @department_id');
    params.department_id = department_id;
  }
  if (search.trim()) {
    conditions.push('(employees.full_name LIKE @search OR departments.name LIKE @search OR positions.name LIKE @search)');
    params.search = `%${search.trim()}%`;
  }

  let query = EMPLOYEE_SELECT;
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY employees.full_name LIMIT 50';

  res.json(db.prepare(query).all(params));
});

router.get('/:id', (req, res) => {
  const employee = db.prepare(`${EMPLOYEE_SELECT} WHERE employees.id = ?`).get(req.params.id);
  if (!employee) return res.status(404).json({ error: 'Сотрудник не найден' });
  res.json(employee);
});

router.post('/', (req, res) => {
  const { full_name, department_id, position_id } = req.body;
  if (!full_name?.trim() || !department_id || !position_id) {
    return res.status(400).json({ error: 'Заполните ФИО, управление и должность' });
  }

  const department = db.prepare('SELECT id FROM departments WHERE id = ?').get(department_id);
  const position = db.prepare('SELECT id FROM positions WHERE id = ?').get(position_id);
  if (!department || !position) {
    return res.status(400).json({ error: 'Указано несуществующее управление или должность' });
  }

  const result = db
    .prepare('INSERT INTO employees (full_name, department_id, position_id) VALUES (?, ?, ?)')
    .run(full_name.trim(), department_id, position_id);

  res.status(201).json(db.prepare(`${EMPLOYEE_SELECT} WHERE employees.id = ?`).get(result.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Сотрудник не найден' });

  const { full_name, department_id, position_id, is_active } = req.body;

  db.prepare(
    `UPDATE employees
     SET full_name = ?, department_id = ?, position_id = ?, is_active = ?, updated_at = datetime('now', 'localtime')
     WHERE id = ?`
  ).run(
    full_name?.trim() || existing.full_name,
    department_id || existing.department_id,
    position_id || existing.position_id,
    is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
    req.params.id
  );

  res.json(db.prepare(`${EMPLOYEE_SELECT} WHERE employees.id = ?`).get(req.params.id));
});

// Мягкое удаление — сотрудник помечается неактивным, но остаётся в истории посещений
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Сотрудник не найден' });

  db.prepare(
    `UPDATE employees SET is_active = 0, updated_at = datetime('now', 'localtime') WHERE id = ?`
  ).run(req.params.id);

  res.json({ ok: true });
});

export default router;
