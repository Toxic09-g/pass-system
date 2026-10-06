import { Router } from 'express';
import db from '../db.js';
import { endSession, getSessionUser, isAdminConfigured, publicUser, startSession, verifyPassword } from '../auth.js';
import { getInstitutionName } from './settings.js';

const router = Router();

// GET /api/auth/me — кто вошёл; admin_configured = false — на посту ещё не задан вход администратора.
// institution_name — учреждение вошедшего сотрудника (до входа и у администратора — по умолчанию)
router.get('/me', (req, res) => {
  const user = getSessionUser(req);
  res.json({
    admin_configured: isAdminConfigured(),
    institution_name: user?.institution_name || getInstitutionName(),
    user: user ? publicUser(user) : null,
  });
});

router.post('/login', async (req, res) => {
  const { login, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE login = ? AND is_active = 1').get(login?.trim() ?? '');
  if (!user || !verifyPassword(password ?? '', user.password_hash)) {
    // Небольшая задержка замедляет перебор паролей
    await new Promise((resolve) => setTimeout(resolve, 700));
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }
  startSession(res, user.id);
  res.json({ user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  endSession(req, res);
  res.json({ ok: true });
});

export default router;
