// Вход администратора (один на все посты) — задаётся в backend/.env.
//
//   npm run admin                       — вывести строки ADMIN_LOGIN / ADMIN_PASSWORD_HASH
//                                         из базы этого поста, чтобы вставить их в .env других постов
//   npm run admin -- set-password       — задать новый пароль (спросит его), записать в .env и в базу
//   npm run admin -- set-password логин — то же, заодно сменить логин
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import db from '../src/db.js';
import { endUserSessions, hashPassword } from '../src/auth.js';

const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
const MIN_PASSWORD_LENGTH = 8;

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (text) => {
      // Вводимые символы не показываем — только сам вопрос и перевод строки
      if (text.includes(question) || text.includes('\n')) process.stdout.write(text);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

function setEnvValue(content, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(content)) return content.replace(pattern, line);
  return `${content.replace(/\s*$/, '')}\n\n${line}\n`;
}

const [command, loginArg] = process.argv.slice(2);

if (!command || command === 'export') {
  const admin = db.prepare('SELECT login, password_hash FROM users WHERE is_admin = 1 ORDER BY id LIMIT 1').get();
  if (!admin) {
    console.log('На этом посту администратор ещё не задан. Задайте пароль: npm run admin -- set-password');
    process.exit(1);
  }
  console.log('Вставьте эти строки в backend/.env на каждом посту:\n');
  console.log(`ADMIN_LOGIN=${admin.login}`);
  console.log(`ADMIN_PASSWORD_HASH=${admin.password_hash}`);
} else if (command === 'set-password') {
  const login = loginArg?.trim() || process.env.ADMIN_LOGIN?.trim() || 'admin';
  const password = await askHidden(`Новый пароль администратора (${login}): `);
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.log(`Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов`);
    process.exit(1);
  }
  if ((await askHidden('Повторите пароль: ')) !== password) {
    console.log('Пароли не совпадают');
    process.exit(1);
  }

  const passwordHash = hashPassword(password);
  let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
  env = setEnvValue(env, 'ADMIN_LOGIN', login);
  env = setEnvValue(env, 'ADMIN_PASSWORD_HASH', passwordHash);
  fs.writeFileSync(envPath, env);

  // Сразу применяем и в базе — перезапуск backend не нужен
  const admin = db.prepare('SELECT id FROM users WHERE is_admin = 1 ORDER BY id LIMIT 1').get();
  if (admin) {
    db.prepare('UPDATE users SET login = ?, password_hash = ?, is_active = 1 WHERE id = ?').run(
      login,
      passwordHash,
      admin.id
    );
    endUserSessions(admin.id);
  } else {
    db.prepare(
      `INSERT INTO users (login, full_name, password_hash, can_register, can_view_journal, is_admin)
       VALUES (?, 'Администратор', ?, 1, 1, 1)`
    ).run(login, passwordHash);
  }

  console.log(`Готово: пароль администратора «${login}» записан в backend/.env и применён.`);
  console.log('Для других постов: npm run admin — выведет строки для их .env.');
} else {
  console.log('Команды: npm run admin | npm run admin -- set-password [логин]');
  process.exit(1);
}
