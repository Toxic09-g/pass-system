import { Router } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from '../db.js';
import { saveDataUrlImage } from '../utils/saveDataUrlImage.js';
import { generateQrDataUrl } from '../utils/qrCode.js';
import { printReceipt } from '../printing/receiptPrinter.js';
import { generateQrCodeValue } from '../utils/receiptNumber.js';
import { VISITOR_TYPES, visitorIdLabel } from '../utils/visitorTypes.js';
import { getInstitutionName } from './settings.js';
import { institutionScope, requireAuth } from '../auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', '..', 'uploads');

const router = Router();

const IIN_PATTERN = /^\d{12}$/;

// Пропуск, по которому за 24 часа не отмечен выход, считается утерянным (забыли отсканировать
// на выходе или потеряли чек). Статус вычисляется на лету — фоновая задача не нужна;
// если человек всё же отсканирует чек позже, выход отметится как обычно
const PASS_LOST_AFTER = '-24 hours';
const VISIT_STATUS_SQL = `CASE
  WHEN visits.checked_out_at IS NOT NULL THEN 'left'
  WHEN visits.registered_at < datetime('now', 'localtime', '${PASS_LOST_AFTER}') THEN 'lost'
  ELSE 'inside'
END`;

const VISIT_SELECT = `
  SELECT
    visits.*,
    ${VISIT_STATUS_SQL} AS status,
    employees.full_name  AS employee_full_name,
    positions.name        AS employee_position,
    departments.name      AS employee_department
  FROM visits
  JOIN employees  ON employees.id = visits.employee_id
  JOIN positions  ON positions.id = employees.position_id
  JOIN departments ON departments.id = employees.department_id
`;

const sqlString = (value) => `'${value.replaceAll("'", "''")}'`;

// Всё, что видно в строке журнала, одной строкой — по ней идёт поиск.
// Дата и статус форматируются так же, как на странице журнала
const VISIT_SEARCH_TEXT_SQL = `lower_ru(
  printf('%06d', visits.id) || ' ' ||
  strftime('%d.%m.%Y, %H:%M:%S', visits.registered_at) || ' ' ||
  visits.visitor_full_name || ' ' ||
  visits.visitor_organization || ' ' ||
  CASE visits.visitor_type
    ${Object.entries(VISITOR_TYPES)
      .map(([type, { label, idLabel }]) => `WHEN ${sqlString(type)} THEN ${sqlString(`${label} ${idLabel}`)}`)
      .join(' ')}
    ELSE '' END || ' ' ||
  visits.visitor_iin || ' ' ||
  employees.full_name || ' ' ||
  positions.name || ' ' ||
  departments.name || ' ' ||
  visits.institution_name || ' ' ||
  CASE ${VISIT_STATUS_SQL}
    WHEN 'inside' THEN 'В здании'
    WHEN 'lost' THEN 'Утерян'
    ELSE 'Вышел ' || strftime('%H:%M:%S', visits.checked_out_at) END
)`;

// Период журнала и графа «за последние …» → модификатор datetime() SQLite (только из этого списка)
const PERIOD_MODIFIERS = {
  year: '-1 year',
  halfyear: '-6 months',
  month: '-1 month',
  week: '-7 days',
  '24h': '-24 hours',
  '12h': '-12 hours',
  '6h': '-6 hours',
  '3h': '-3 hours',
  '1h': '-1 hours',
};

// GET /api/visits?date=YYYY-MM-DD&period=&employee_id=&search= — журнал посещений
router.get('/', requireAuth('journal'), (req, res) => {
  const { date, period, employee_id, search } = req.query;
  // Сотрудник видит визиты только своего учреждения, администратор — все
  const conditions = ['(@institution IS NULL OR visits.institution_name = @institution)'];
  const params = { institution: institutionScope(req.user) };

  if (PERIOD_MODIFIERS[period]) {
    // registered_at хранится в местном времени — сравниваем с местным «сейчас»
    conditions.push("visits.registered_at >= datetime('now', 'localtime', @periodModifier)");
    params.periodModifier = PERIOD_MODIFIERS[period];
  }

  if (date) {
    conditions.push('date(visits.registered_at) = @date');
    params.date = date;
  }
  if (employee_id) {
    conditions.push('visits.employee_id = @employee_id');
    params.employee_id = employee_id;
  }
  // Поиск по всем столбцам: каждое слово запроса должно встретиться в строке
  const terms = search?.trim().toLowerCase().split(/\s+/).filter(Boolean) ?? [];
  terms.forEach((term, i) => {
    conditions.push(`${VISIT_SEARCH_TEXT_SQL} LIKE @term${i} ESCAPE '\\'`);
    params[`term${i}`] = `%${term.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
  });

  const query = `${VISIT_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY visits.registered_at DESC LIMIT 200`;

  res.json(db.prepare(query).all(params));
});

// Посетитель идентифицируется по ИИН. БИН — номер организации, от неё могут приходить
// разные люди, поэтому у юр. лиц ключ — БИН + ФИО. У старых записей без номера — ФИО
const VISITOR_KEY_SQL = `CASE
  WHEN visits.visitor_type = 'legal' THEN 'legal:' || visits.visitor_iin || ':' || visits.visitor_full_name
  WHEN visits.visitor_iin <> '' THEN visits.visitor_iin
  ELSE 'name:' || visits.visitor_full_name
END`;

// Сколько визитов за период граф отдаёт для режима «Досье» — хватает на год ежедневных визитов
const GRAPH_VISITS_LIMIT = 2000;

function visitorSubtitle(visitorType, number) {
  const typeLabel = VISITOR_TYPES[visitorType]?.label ?? '';
  const idLabel = visitorIdLabel(visitorType);
  return `${typeLabel} · ${number ? `${idLabel} ${number}` : `${idLabel} не указан`}`;
}

// GET /api/visits/graph?visitor_key=... | ?employee_id=...&period= — связи для графа-«паутины»:
// к кому ходил посетитель или кто приходил к сотруднику, с числом визитов за период
router.get('/graph', requireAuth('journal'), (req, res) => {
  const { visitor_key, employee_id, period } = req.query;
  const institution = institutionScope(req.user);
  const periodModifier = PERIOD_MODIFIERS[period] ?? null;
  const scopeSql = `(? IS NULL OR visits.institution_name = ?)
    AND (? IS NULL OR visits.registered_at >= datetime('now', 'localtime', ?))`;
  const scopeParams = [institution, institution, periodModifier, periodModifier];

  if (visitor_key) {
    // Посетитель ищется без учёта периода — центр графа показываем, даже если за период визитов нет
    const visits = db
      .prepare(
        `${VISIT_SELECT} WHERE ${VISITOR_KEY_SQL} = ? AND (? IS NULL OR visits.institution_name = ?)
         ORDER BY visits.registered_at DESC`
      )
      .all(visitor_key, institution, institution);
    if (!visits.length) return res.status(404).json({ error: 'Посещения не найдены' });

    const links = db
      .prepare(
        `SELECT employees.id AS employee_id, employees.full_name AS name,
                positions.name || ', ' || departments.name AS subtitle,
                COUNT(*) AS visit_count, MAX(visits.registered_at) AS last_visit
         FROM visits
         JOIN employees  ON employees.id = visits.employee_id
         JOIN positions  ON positions.id = employees.position_id
         JOIN departments ON departments.id = employees.department_id
         WHERE ${VISITOR_KEY_SQL} = ? AND ${scopeSql}
         GROUP BY employees.id
         ORDER BY visit_count DESC, last_visit DESC`
      )
      .all(visitor_key, ...scopeParams);

    // Все визиты за период — для режима «Досье»: тепловая карта, первый визит, средняя длительность
    const periodVisits = db
      .prepare(
        `SELECT visits.id, visits.registered_at, visits.checked_out_at, CAST(visits.employee_id AS TEXT) AS link
         FROM visits WHERE ${VISITOR_KEY_SQL} = ? AND ${scopeSql}
         ORDER BY visits.registered_at DESC LIMIT ${GRAPH_VISITS_LIMIT}`
      )
      .all(visitor_key, ...scopeParams);

    return res.json({
      center: {
        type: 'visitor',
        visitor_key,
        name: visits[0].visitor_full_name,
        subtitle: visitorSubtitle(visits[0].visitor_type, visits[0].visitor_iin),
        visit_count: links.reduce((sum, link) => sum + link.visit_count, 0),
        photo_path: visits.find((visit) => visit.photo_path)?.photo_path ?? null,
        // Посетитель сейчас в здании — время входа последнего незакрытого визита
        inside_since: visits[0].checked_out_at ? null : visits[0].registered_at,
      },
      links: links.map((link) => ({ type: 'employee', ...link })),
      visits: periodVisits,
    });
  }

  if (employee_id) {
    const employee = db
      .prepare(
        `SELECT employees.*, positions.name || ', ' || departments.name AS subtitle
         FROM employees
         JOIN positions  ON positions.id = employees.position_id
         JOIN departments ON departments.id = employees.department_id
         WHERE employees.id = ?`
      )
      .get(employee_id);
    if (!employee) return res.status(404).json({ error: 'Сотрудник не найден' });

    // ФИО берём из последнего визита — посетитель мог указать его по-разному
    const links = db
      .prepare(
        `SELECT ${VISITOR_KEY_SQL} AS visitor_key,
                (SELECT v2.visitor_full_name FROM visits v2
                 WHERE ${VISITOR_KEY_SQL.replaceAll('visits.', 'v2.')} = ${VISITOR_KEY_SQL}
                 ORDER BY v2.registered_at DESC LIMIT 1) AS name,
                (SELECT v3.photo_path FROM visits v3
                 WHERE ${VISITOR_KEY_SQL.replaceAll('visits.', 'v3.')} = ${VISITOR_KEY_SQL} AND v3.photo_path IS NOT NULL
                 ORDER BY v3.registered_at DESC LIMIT 1) AS photo_path,
                visits.visitor_type, visits.visitor_iin,
                COUNT(*) AS visit_count, MAX(visits.registered_at) AS last_visit
         FROM visits
         WHERE visits.employee_id = ? AND ${scopeSql}
         GROUP BY visitor_key
         ORDER BY visit_count DESC, last_visit DESC`
      )
      .all(employee_id, ...scopeParams);

    const periodVisits = db
      .prepare(
        `SELECT visits.id, visits.registered_at, visits.checked_out_at, ${VISITOR_KEY_SQL} AS link
         FROM visits WHERE visits.employee_id = ? AND ${scopeSql}
         ORDER BY visits.registered_at DESC LIMIT ${GRAPH_VISITS_LIMIT}`
      )
      .all(employee_id, ...scopeParams);

    return res.json({
      visits: periodVisits,
      center: {
        type: 'employee',
        employee_id: employee.id,
        name: employee.full_name,
        subtitle: employee.subtitle,
        visit_count: links.reduce((sum, link) => sum + link.visit_count, 0),
      },
      links: links.map(({ visitor_type, visitor_iin, ...link }) => ({
        type: 'visitor',
        ...link,
        subtitle: visitorSubtitle(visitor_type, visitor_iin),
      })),
    });
  }

  res.status(400).json({ error: 'Укажите посетителя или сотрудника' });
});

// GET /api/visits/organizations — подсказки для поля «Гос. орган»: справочник гос. органов,
// учреждения сотрудников системы и органы, уже указанные у посетителей
// (чтобы один орган не записывали по-разному).
// Объявлен до /:id — иначе «organizations» попадёт в /:id как номер визита
router.get('/organizations', requireAuth('register'), (req, res) => {
  const rows = db
    .prepare(
      `SELECT name FROM government_bodies WHERE is_active = 1
       UNION SELECT institution_name FROM users WHERE institution_name <> '' AND is_active = 1
       UNION SELECT institution_name FROM visits WHERE institution_name <> ''
       UNION SELECT visitor_organization FROM visits WHERE visitor_organization <> ''
       ORDER BY 1`
    )
    .all();
  res.json(rows.map((row) => row.name));
});

// GET /api/visits/recent — сводка для экрана регистрации: сколько посетителей сейчас в здании
// и последние выданные пропуска. Доступна дежурному (без права на журнал), поэтому отдаёт
// только ФИО и время — без ИИН, фото и сотрудника. Объявлен до /:id
router.get('/recent', requireAuth('register'), (req, res) => {
  const params = { institution: institutionScope(req.user) };
  const scope = '(@institution IS NULL OR institution_name = @institution)';
  const { in_building } = db
    // Утерянные пропуска (старше 24 часов без выхода) в «сейчас в здании» не считаем
    .prepare(`SELECT COUNT(*) AS in_building FROM visits WHERE ${VISIT_STATUS_SQL} = 'inside' AND ${scope}`)
    .get(params);
  const recent = db
    .prepare(
      `SELECT id, visitor_full_name, registered_at, checked_out_at FROM visits
       WHERE ${scope} ORDER BY registered_at DESC LIMIT 4`
    )
    .all(params);
  res.json({ in_building, recent });
});

router.get('/:id', requireAuth('journal'), (req, res) => {
  const visit = db.prepare(`${VISIT_SELECT} WHERE visits.id = ?`).get(req.params.id);
  const institution = institutionScope(req.user);
  if (!visit || (institution !== null && visit.institution_name !== institution)) {
    return res.status(404).json({ error: 'Запись не найдена' });
  }
  res.json(visit);
});

// POST /api/visits — регистрация посетителя: сохранение, генерация QR-кода и печать чека
router.post('/', requireAuth('register'), async (req, res) => {
  const { visitor_type, visitor_full_name, visitor_iin, visitor_organization, employee_id, photo_data_url } = req.body;

  if (!visitor_full_name?.trim()) {
    return res.status(400).json({ error: 'Укажите ФИО посетителя' });
  }
  if (!VISITOR_TYPES[visitor_type]) {
    return res.status(400).json({ error: 'Выберите тип посетителя: физ. лицо, юр. лицо или гос. орган' });
  }
  // Представителю гос. органа указывается, из какого он органа
  const organization = visitor_type === 'government' ? visitor_organization?.trim() ?? '' : '';
  if (visitor_type === 'government' && !organization) {
    return res.status(400).json({ error: 'Укажите гос. орган посетителя' });
  }
  if (!IIN_PATTERN.test(visitor_iin?.trim() || '')) {
    return res.status(400).json({ error: `Укажите корректный ${visitorIdLabel(visitor_type)} (12 цифр)` });
  }
  if (!employee_id) {
    return res.status(400).json({ error: 'Выберите сотрудника, к которому направляется посетитель' });
  }

  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(employee_id);
  if (!employee) {
    return res.status(400).json({ error: 'Выбранный сотрудник не найден' });
  }

  if (!photo_data_url) {
    return res.status(400).json({ error: 'Сделайте фото посетителя' });
  }

  let photoPath;
  try {
    photoPath = saveDataUrlImage(photo_data_url, 'photos', uploadsDir);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const insertResult = db
    .prepare(
      `INSERT INTO visits (visitor_type, visitor_full_name, visitor_iin, visitor_organization, employee_id, photo_path,
                           institution_name, registered_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      visitor_type,
      visitor_full_name.trim(),
      visitor_iin.trim(),
      organization,
      employee_id,
      photoPath,
      // Учреждение — дежурного, который оформляет; у администратора — учреждение по умолчанию
      req.user.institution_name || getInstitutionName(),
      req.user.id
    );

  const visitId = insertResult.lastInsertRowid;
  const qrCodeValue = generateQrCodeValue(visitId);
  db.prepare('UPDATE visits SET qr_code_value = ? WHERE id = ?').run(qrCodeValue, visitId);

  let visit = db.prepare(`${VISIT_SELECT} WHERE visits.id = ?`).get(visitId);
  const qrCodeDataUrl = await generateQrDataUrl(qrCodeValue);
  const printResult = await printReceipt(visit);

  if (printResult.printed) {
    db.prepare(`UPDATE visits SET printed_at = datetime('now', 'localtime') WHERE id = ?`).run(visitId);
    visit = db.prepare(`${VISIT_SELECT} WHERE visits.id = ?`).get(visitId);
  }

  res.status(201).json({
    ...visit,
    qr_code_data_url: qrCodeDataUrl,
    printed: printResult.printed,
    print_error: printResult.error ?? null,
  });
});

/**
 * Отмечает выход по коду из QR. Повторный скан идемпотентен — время выхода не меняется.
 * Возвращает визит с полем already_checked_out или null, если пропуск не найден.
 * Используется и HTTP-маршрутом, и сканером в режиме USB COM.
 */
export function checkoutByQrCode(qrCodeValue, institution = null) {
  const visit = db.prepare(`${VISIT_SELECT} WHERE visits.qr_code_value = ?`).get(qrCodeValue.trim());
  // Пропуск другого учреждения дежурный отметить не может — для него такого пропуска нет
  if (!visit || (institution !== null && visit.institution_name !== institution)) return null;

  const alreadyCheckedOut = Boolean(visit.checked_out_at);
  if (!alreadyCheckedOut) {
    db.prepare(`UPDATE visits SET checked_out_at = datetime('now', 'localtime') WHERE id = ?`).run(visit.id);
  }

  const updated = db.prepare(`${VISIT_SELECT} WHERE visits.id = ?`).get(visit.id);
  return { ...updated, already_checked_out: alreadyCheckedOut };
}

// POST /api/visits/checkout — отметка выхода посетителя по отсканированному QR-коду
router.post('/checkout', requireAuth('register'), (req, res) => {
  const { qr_code_value } = req.body;
  if (!qr_code_value?.trim()) {
    return res.status(400).json({ error: 'Отсканируйте QR-код пропуска' });
  }

  const visit = checkoutByQrCode(qr_code_value, institutionScope(req.user));
  if (!visit) {
    return res.status(404).json({ error: 'Пропуск с таким QR-кодом не найден' });
  }
  res.json(visit);
});

// POST /api/visits/:id/print — повторная печать чека (например, если принтер был недоступен)
router.post('/:id/print', requireAuth('register'), async (req, res) => {
  const visit = db.prepare(`${VISIT_SELECT} WHERE visits.id = ?`).get(req.params.id);
  if (!visit) return res.status(404).json({ error: 'Запись не найдена' });

  const printResult = await printReceipt(visit);
  if (printResult.printed) {
    db.prepare(`UPDATE visits SET printed_at = datetime('now', 'localtime') WHERE id = ?`).run(visit.id);
  }

  res.json({ printed: printResult.printed, error: printResult.error ?? null });
});

export default router;
