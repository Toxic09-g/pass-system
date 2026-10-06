import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import employeesRouter from './routes/employees.js';
import visitsRouter, { checkoutByQrCode } from './routes/visits.js';
import departmentsRouter from './routes/departments.js';
import positionsRouter from './routes/positions.js';
import governmentBodiesRouter from './routes/governmentBodies.js';
import settingsRouter from './routes/settings.js';
import scannerRouter, { broadcastScanResult } from './routes/scanner.js';
import { startSerialScanner } from './scanner/serialScanner.js';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import { requireAuth, requireByMethod, syncAdminFromEnv } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', 'uploads');

syncAdminFromEnv();

const app = express();

app.use(cors());
app.use(express.json({ limit: '15mb' })); // фото и подпись передаются как base64

// Права: регистрация — дежурный; журнал и фото посетителей — кому выдан доступ к журналу;
// справочники, учреждение и пользователи — администратор (ему доступно всё).
// Права на отдельные маршруты визитов — в routes/visits.js
app.use('/api/auth', authRouter);
app.use('/uploads', requireAuth('journal'), express.static(uploadsDir));
app.use('/api/visits', visitsRouter);
// Справочники читают форма регистрации (каскадный выбор сотрудника) и журнал (фильтр по сотруднику)
const dictionaryGuard = requireByMethod({ read: ['register', 'journal'], write: ['admin'] });
app.use('/api/employees', dictionaryGuard, employeesRouter);
app.use('/api/departments', dictionaryGuard, departmentsRouter);
app.use('/api/positions', dictionaryGuard, positionsRouter);
app.use('/api/government-bodies', dictionaryGuard, governmentBodiesRouter);
app.use('/api/settings', requireAuth('admin'), settingsRouter);
app.use('/api/users', requireAuth('admin'), usersRouter);
app.use('/api/scanner', requireAuth(), scannerRouter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend запущен: http://localhost:${PORT}`);
});

// Сканер в режиме USB COM: backend сам отмечает выход и рассылает результат открытым страницам.
// SCANNER_PORT=off — не читать порт (например, если сканер работает в режиме клавиатуры)
const scannerPort = process.env.SCANNER_PORT || 'auto';
if (scannerPort !== 'off') {
  startSerialScanner({
    portName: scannerPort,
    baudRate: Number(process.env.SCANNER_BAUD_RATE) || 9600,
    onScan: (code) => {
      try {
        const visit = checkoutByQrCode(code);
        broadcastScanResult(visit ? { status: 'ok', visit } : { status: 'not_found', code });
      } catch (err) {
        console.error(err);
        broadcastScanResult({ status: 'error', code });
      }
    },
  });
}
