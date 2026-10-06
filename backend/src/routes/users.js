import crypto from 'node:crypto';
import { Router } from 'express';
import db from '../db.js';
import { endUserSessions, hashPassword } from '../auth.js';

// Учётные записи сотрудников. Создаёт и меняет только администратор (проверка — в server.js).
// Администратор здесь не показывается и не меняется: его вход задаётся в backend/.env,
// а права администратора через интерфейс выдать нельзя
const router = Router();

const USER_FIELDS = 'id, login, full_name, institution_name, can_register, can_view_journal, is_active, created_at';
const toFlag = (value) => (value ? 1 : 0);

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k',
  л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  ә: 'a', ғ: 'g', қ: 'k', ң: 'n', ө: 'o', ұ: 'u', ү: 'u', һ: 'h', і: 'i',
};

const transliterate = (text) =>
  [...text.toLowerCase()]
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]/g, '');

// «Иванов Иван Иванович» → ivanov.ii; при совпадении — ivanov.ii2, ivanov.ii3…
function generateLogin(fullName) {
  const [surname = '', ...rest] = fullName.trim().split(/\s+/);
  const initials = rest.map((part) => transliterate(part)[0] ?? '').join('');
  const base = [transliterate(surname) || 'user', initials].filter(Boolean).join('.');
  const taken = db.prepare('SELECT 1 FROM users WHERE login = ?');
  for (let n = 1; ; n++) {
    const login = n === 1 ? base : `${base}${n}`;
    if (!taken.get(login)) return login;
  }
}

// 8 символов без похожих (0/o, 1/l/i) — пароль легко продиктовать и переписать с бумаги
const PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
function generatePassword() {
  return Array.from({ length: 8 }, () => PASSWORD_ALPHABET[crypto.randomInt(PASSWORD_ALPHABET.length)]).join('');
}

const getEmployeeUser = db.prepare(`SELECT ${USER_FIELDS} FROM users WHERE id = ? AND is_admin = 0`);

router.get('/', (req, res) => {
  res.json(
    db
      .prepare(`SELECT ${USER_FIELDS} FROM users WHERE is_admin = 0 ORDER BY is_active DESC, institution_name, full_name`)
      .all()
  );
});

// GET /api/users/institutions — уже введённые учреждения (подсказки, чтобы одно учреждение не писали по-разному)
router.get('/institutions', (req, res) => {
  const rows = db
    .prepare(
      `SELECT institution_name AS name FROM users WHERE institution_name <> ''
       UNION SELECT institution_name FROM visits WHERE institution_name <> ''
       ORDER BY 1`
    )
    .all();
  res.json(rows.map((row) => row.name));
});

// POST /api/users — новый сотрудник; логин и пароль генерируются и возвращаются один раз
router.post('/', (req, res) => {
  const { full_name, institution_name, can_register, can_view_journal } = req.body;
  if (!full_name?.trim()) return res.status(400).json({ error: 'Укажите ФИО' });
  if (!institution_name?.trim()) return res.status(400).json({ error: 'Укажите учреждение сотрудника' });
  if (!can_register && !can_view_journal) {
    return res.status(400).json({ error: 'Отметьте хотя бы одно право: регистрация или журнал' });
  }

  const login = generateLogin(full_name);
  const password = generatePassword();
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO users (login, full_name, institution_name, password_hash, can_register, can_view_journal, is_admin)
       VALUES (?, ?, ?, ?, ?, ?, 0)`
    )
    .run(
      login,
      full_name.trim(),
      institution_name.trim(),
      hashPassword(password),
      toFlag(can_register),
      toFlag(can_view_journal)
    );

  res.status(201).json({ user: getEmployeeUser.get(lastInsertRowid), password });
});

// PUT /api/users/:id — ФИО, права, включён/отключён
router.put('/:id', (req, res) => {
  const existing = getEmployeeUser.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Пользователь не найден' });

  const next = {
    full_name: req.body.full_name?.trim() || existing.full_name,
    institution_name: req.body.institution_name?.trim() || existing.institution_name,
    can_register: req.body.can_register !== undefined ? toFlag(req.body.can_register) : existing.can_register,
    can_view_journal:
      req.body.can_view_journal !== undefined ? toFlag(req.body.can_view_journal) : existing.can_view_journal,
    is_active: req.body.is_active !== undefined ? toFlag(req.body.is_active) : existing.is_active,
  };
  if (next.is_active && !next.can_register && !next.can_view_journal) {
    return res.status(400).json({ error: 'Отметьте хотя бы одно право: регистрация или журнал' });
  }

  db.prepare(
    `UPDATE users SET full_name = @full_name, institution_name = @institution_name, can_register = @can_register,
       can_view_journal = @can_view_journal, is_active = @is_active WHERE id = @id`
  ).run({ ...next, id: existing.id });
  // Отключённый сотрудник сразу теряет доступ, даже если сейчас в системе
  if (!next.is_active) endUserSessions(existing.id);

  res.json(getEmployeeUser.get(existing.id));
});

// POST /api/users/:id/reset-password — новый пароль (показывается один раз), старые входы закрываются
router.post('/:id/reset-password', (req, res) => {
  const existing = getEmployeeUser.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Пользователь не найден' });

  const password = generatePassword();
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), existing.id);
  endUserSessions(existing.id);
  res.json({ user: existing, password });
});

export default router;
