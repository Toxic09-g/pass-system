import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { PERIODS } from '../utils/periods.js';

// Окно «Связи»: к кому ходил посетитель или кто приходил к сотруднику.
// Два режима: «Орбита» (граф, по умолчанию) и «Досье» (сводка, тепловая карта визитов, список).
// Касание связи открывает уже её связи; путь переходов — в «хлебных крошках» наверху

const MODES = [
  { value: 'orbit', label: 'Орбита' },
  { value: 'dossier', label: 'Досье' },
];

const MAX_NODES = 24; // больше — подписи не помещаются; остальные связи есть в списке справа

// Орбита рисуется в координатах 800×680 и масштабируется под окно
const W = 800;
const H = 680;
const CX = W / 2;
const CY = 345;
const RINGS = { inner: 165, outer: 250, single: 225 };
const CENTER_R = 62;

// Сотрудник — морской цвет, посетитель — охра: различимы и по светлоте
const TONES = {
  employee: { fill: '#D6ECE8', text: '#0E6E62' },
  visitor: { fill: '#F3E3D6', text: '#9A5424' },
  muted: { fill: '#E8EEF1', text: '#5F6E77' },
};

function nodeId(node) {
  return node.type === 'employee' ? `e:${node.employee_id}` : `v:${node.visitor_key}`;
}

// Ключ связи в списке визитов (/api/visits/graph → visits[].link)
function linkKey(link) {
  return link.type === 'employee' ? String(link.employee_id) : link.visitor_key;
}

function initials(fullName) {
  return fullName
    .replace(/[«»"]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

// «Сейткали Айгерим Нурлановна» → «Сейткали А. Н.»
function shortName(fullName) {
  const [last, ...rest] = fullName.split(/\s+/).filter(Boolean);
  if (!rest.length || rest.some((part) => !/^[А-ЯЁA-Z]/.test(part))) return fullName;
  return `${last} ${rest.map((part) => `${part[0]}.`).join(' ')}`;
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function formatDate(value, withYear = true) {
  return new Date(value).toLocaleDateString('ru-RU', withYear ? undefined : { day: '2-digit', month: '2-digit' });
}

function visitsWord(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'визит';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'визита';
  return 'визитов';
}

function formatMinutes(minutes) {
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours} ч ${minutes % 60} мин` : `${hours} ч`;
}

function minutesSince(value) {
  return Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
}

function photoUrl(path) {
  return path ? `/uploads/${path}` : null;
}

function Avatar({ name, photo, size, tone, className = '' }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.32) };
  if (photo) {
    return <img src={photo} alt="" style={style} className={`shrink-0 rounded-full bg-paper object-cover ${className}`} />;
  }
  return (
    <span style={{ ...style, background: tone.fill, color: tone.text }} className={`avatar ${className}`}>
      {initials(name)}
    </span>
  );
}

// ─── Орбита ───────────────────────────────────────────────────────────

function layoutNodes(links) {
  const shown = links.slice(0, MAX_NODES);
  // Много связей — узлы чередуются по двум орбитам, чтобы подписи не слипались
  const twoRings = shown.length > 8;
  return shown.map((link, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / shown.length;
    const radius = twoRings ? (i % 2 ? RINGS.inner : RINGS.outer) : RINGS.single;
    return { ...link, index: i, angle, x: CX + radius * Math.cos(angle), y: CY + radius * Math.sin(angle) };
  });
}

function OrbitNode({ node, r, tone, highlighted, onOpen, onHover }) {
  const photo = photoUrl(node.photo_path);
  const labelAbove = Math.sin(node.angle) < -0.35;
  const nameY = labelAbove ? node.y - r - 34 : node.y + r + 24;
  const clipId = `orbit-clip-${node.index}`;
  return (
    <g
      className="cursor-pointer"
      onClick={() => onOpen(node)}
      onPointerEnter={() => onHover(nodeId(node))}
      onPointerLeave={() => onHover(null)}
    >
      <circle cx={node.x} cy={node.y} r={r + 7} fill="#FFFFFF" />
      {photo ? (
        <>
          <clipPath id={clipId}>
            <circle cx={node.x} cy={node.y} r={r} />
          </clipPath>
          <image href={photo} x={node.x - r} y={node.y - r} width={r * 2} height={r * 2} clipPath={`url(#${clipId})`} preserveAspectRatio="xMidYMid slice" />
        </>
      ) : (
        <>
          <circle cx={node.x} cy={node.y} r={r} fill={tone.fill} />
          <text x={node.x} y={node.y} dy="0.35em" textAnchor="middle" fill={tone.text} fontSize={Math.round(r * 0.62)} fontWeight="600">
            {initials(node.name)}
          </text>
        </>
      )}
      {highlighted && <circle cx={node.x} cy={node.y} r={r + 7} fill="none" stroke="#0E6E62" strokeWidth="2" />}
      <text stroke="#FFFFFF" strokeWidth="5" paintOrder="stroke" strokeLinejoin="round" x={node.x} y={nameY} textAnchor="middle" className="fill-ink text-[15px] font-medium">
        {truncate(shortName(node.name), 24)}
      </text>
      <text stroke="#FFFFFF" strokeWidth="5" paintOrder="stroke" strokeLinejoin="round" x={node.x} y={nameY + 18} textAnchor="middle" className={`font-mono text-[12px] ${highlighted ? 'fill-accent' : 'fill-graphite'}`}>
        ×{node.visit_count} · {formatDate(node.last_visit, false)}
      </text>
    </g>
  );
}

function Orbit({ data, hoveredId, onHover, onOpen, emptyText }) {
  const nodes = layoutNodes(data.links);
  const maxCount = Math.max(1, ...nodes.map((n) => n.visit_count));
  const scale = (count) => (maxCount > 1 ? (count - 1) / (maxCount - 1) : 0.4);
  const centerPhoto = photoUrl(data.center.photo_path);
  const centerTone = TONES[data.center.type];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full select-none" role="img" aria-label={`Связи: ${data.center.name}`}>
      <circle cx={CX} cy={CY} r={RINGS.inner} fill="none" stroke="#E3E9EC" strokeDasharray="3 7" />
      <circle cx={CX} cy={CY} r={RINGS.outer} fill="none" stroke="#EDF1F3" strokeDasharray="3 7" />

      {nodes.map((node) => {
        const active = hoveredId === nodeId(node) || (!hoveredId && node.index === 0);
        return (
          <line
            key={`edge-${nodeId(node)}`}
            x1={CX}
            y1={CY}
            x2={node.x}
            y2={node.y}
            stroke={active ? '#0E6E62' : '#C9D3D8'}
            strokeOpacity={active ? 0.85 : 1}
            strokeWidth={2 + 7 * scale(node.visit_count)}
            strokeLinecap="round"
          />
        );
      })}

      {nodes.map((node) => {
        const highlighted = hoveredId ? hoveredId === nodeId(node) : node.index === 0;
        const tone = highlighted ? TONES[node.type] : TONES.muted;
        return (
          <OrbitNode
            key={nodeId(node)}
            node={node}
            r={22 + 16 * scale(node.visit_count)}
            tone={tone}
            highlighted={highlighted}
            onOpen={onOpen}
            onHover={onHover}
          />
        );
      })}

      <circle cx={CX} cy={CY} r={CENTER_R + 8} fill="#FFFFFF" stroke="#0E6E62" strokeWidth="2" />
      {centerPhoto ? (
        <>
          <clipPath id="orbit-clip-center">
            <circle cx={CX} cy={CY} r={CENTER_R} />
          </clipPath>
          <image href={centerPhoto} x={CX - CENTER_R} y={CY - CENTER_R} width={CENTER_R * 2} height={CENTER_R * 2} clipPath="url(#orbit-clip-center)" preserveAspectRatio="xMidYMid slice" />
        </>
      ) : (
        <>
          <circle cx={CX} cy={CY} r={CENTER_R} fill={centerTone.fill} />
          <text x={CX} y={CY} dy="0.35em" textAnchor="middle" fill={centerTone.text} fontSize="38" fontWeight="600">
            {initials(data.center.name)}
          </text>
        </>
      )}
      <text stroke="#FFFFFF" strokeWidth="5" paintOrder="stroke" strokeLinejoin="round" x={CX} y={CY + CENTER_R + 34} textAnchor="middle" className="fill-ink text-[18px] font-semibold">
        {truncate(shortName(data.center.name), 28)}
      </text>
      <text stroke="#FFFFFF" strokeWidth="5" paintOrder="stroke" strokeLinejoin="round" x={CX} y={CY + CENTER_R + 54} textAnchor="middle" className="fill-graphite font-mono text-[12px]">
        {data.center.visit_count} {visitsWord(data.center.visit_count)}
      </text>

      {nodes.length === 0 && (
        <text stroke="#FFFFFF" strokeWidth="5" paintOrder="stroke" strokeLinejoin="round" x={CX} y={CY - CENTER_R - 40} textAnchor="middle" className="fill-graphite text-[15px]">
          {emptyText}
        </text>
      )}
    </svg>
  );
}

function LinkList({ data, hoveredId, onHover, onOpen }) {
  return (
    <div className="flex flex-col gap-1">
      {data.links.map((link, i) => {
        const highlighted = hoveredId ? hoveredId === nodeId(link) : i === 0;
        return (
          <button
            key={nodeId(link)}
            type="button"
            onClick={() => onOpen(link)}
            onPointerEnter={() => onHover(nodeId(link))}
            onPointerLeave={() => onHover(null)}
            className={`flex items-center gap-3.5 rounded-[1.375rem] px-4 py-3 text-left transition ${
              highlighted ? 'bg-surface shadow-lift ring-[1.5px] ring-accent-soft' : 'active:bg-paper'
            }`}
          >
            <Avatar name={link.name} photo={photoUrl(link.photo_path)} size={44} tone={highlighted ? TONES[link.type] : TONES.muted} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-medium">{shortName(link.name)}</span>
              <span className="block truncate text-[13px] text-graphite">{link.subtitle}</span>
            </span>
            <span className="text-right">
              <span className={`block text-lg font-semibold ${highlighted ? 'text-accent' : ''}`}>{link.visit_count}</span>
              <span className="block font-mono text-[11px] text-mist">{formatDate(link.last_visit, false)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Досье ────────────────────────────────────────────────────────────

const PERIOD_DAYS = { week: 7, month: 31, halfyear: 183, year: 366 };
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function dayKey(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Тепловая карта: столбец — неделя (пн…вс), клетка — день. Диапазон — выбранный период;
// для «всего времени» — с первого визита, но не больше года; для часовых периодов — неделя
function buildHeatmap(visits, period) {
  const counts = new Map();
  for (const visit of visits) {
    const key = visit.registered_at.slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let days = PERIOD_DAYS[period];
  if (!period) {
    const first = visits.reduce((min, v) => (v.registered_at < min ? v.registered_at : min), dayKey(new Date()));
    days = Math.min(371, Math.max(28, Math.ceil((Date.now() - new Date(first.slice(0, 10)).getTime()) / 86400000) + 1));
  }
  days ??= 7;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(end.getDate() + ((7 - end.getDay()) % 7)); // воскресенье текущей недели
  const weeks = Math.ceil(days / 7);
  const start = new Date(end);
  start.setDate(start.getDate() - weeks * 7 + 1); // понедельник первой недели

  const columns = [];
  for (let w = 0; w < weeks; w++) {
    const cells = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + d);
      const key = dayKey(date);
      cells.push({ key, date, count: counts.get(key) ?? 0, future: date > today });
    }
    const monthStart = cells.find((cell) => cell.date.getDate() === 1);
    columns.push({ cells, month: w === 0 ? MONTHS[cells[0].date.getMonth()] : monthStart && MONTHS[monthStart.date.getMonth()] });
  }
  return columns;
}

function Heatmap({ visits, period }) {
  const columns = buildHeatmap(visits, period);
  const cellColor = (cell) =>
    cell.future ? 'bg-transparent' : cell.count >= 2 ? 'bg-accent' : cell.count === 1 ? 'bg-[#7DB5AC]' : 'bg-[#EEF2F4]';
  const grid = { gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` };

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between text-sm text-graphite">
        <span>Визиты по дням</span>
        <span className="flex items-center gap-2">
          меньше
          <span className="h-3.5 w-3.5 rounded bg-[#EEF2F4]" />
          <span className="h-3.5 w-3.5 rounded bg-[#7DB5AC]" />
          <span className="h-3.5 w-3.5 rounded bg-accent" />
          больше
        </span>
      </div>
      <div className="grid gap-1" style={grid}>
        {columns.map((column, w) => (
          <div key={w} className="grid grid-rows-7 gap-1">
            {column.cells.map((cell) => (
              <span
                key={cell.key}
                title={cell.future ? undefined : `${cell.date.toLocaleDateString('ru-RU')} — ${cell.count} ${visitsWord(cell.count)}`}
                className={`h-4 rounded-[4px] ${cellColor(cell)}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="grid gap-1 font-mono text-[11px] text-mist" style={grid}>
        {columns.map((column, w) => (
          <span key={w} className="overflow-visible whitespace-nowrap">
            {column.month ?? ''}
          </span>
        ))}
      </div>
    </section>
  );
}

function Dossier({ data, period, onOpen }) {
  const { center, links, visits } = data;
  const firstVisit = visits.reduce((min, v) => (!min || v.registered_at < min ? v.registered_at : min), null);
  const durations = visits
    .filter((v) => v.checked_out_at)
    .map((v) => (new Date(v.checked_out_at) - new Date(v.registered_at)) / 60000);
  const avgDuration = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;
  const maxCount = Math.max(1, ...links.map((l) => l.visit_count));
  const linksLabel = center.type === 'visitor' ? 'Сотрудников' : 'Посетителей';

  const stats = [
    ['Визитов', center.visit_count],
    [linksLabel, links.length],
    ['Первый визит', firstVisit ? formatDate(firstVisit) : '—', true],
    ['Средняя длительность', avgDuration != null ? formatMinutes(avgDuration) : '—', true],
  ];

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[380px_minmax(0,1fr)]">
      <aside className="flex flex-col items-center gap-4 overflow-y-auto bg-paper/50 px-8 py-8">
        <div className="rounded-full bg-surface p-1.5 shadow-[0_0_0_2px_theme(colors.accent.DEFAULT)]">
          <Avatar name={center.name} photo={photoUrl(center.photo_path)} size={172} tone={TONES[center.type]} />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-semibold leading-tight tracking-tight">{center.name}</h2>
          <p className={`mt-1.5 text-[13px] text-graphite ${center.type === 'visitor' ? 'font-mono' : ''}`}>{center.subtitle}</p>
        </div>
        {center.inside_since && (
          <span className="pill-live text-sm">В здании · {formatMinutes(minutesSince(center.inside_since))}</span>
        )}
        <div className="mt-1 grid w-full grid-cols-2 gap-2.5">
          {stats.map(([label, value, small]) => (
            <div key={label} className="rounded-[1.375rem] bg-surface px-4 py-3.5">
              <p className="text-[13px] leading-tight text-graphite">{label}</p>
              <p className={small ? 'mt-1.5 font-mono text-[15px]' : 'mt-0.5 text-[28px] font-light leading-tight'}>{value}</p>
            </div>
          ))}
        </div>
      </aside>

      <main className="flex min-h-0 flex-col gap-6 overflow-y-auto px-9 py-7">
        {visits.length > 0 && <Heatmap visits={visits} period={period} />}

        <section className="flex flex-col gap-1">
          <p className="px-4 pb-1.5 text-sm text-graphite">
            {center.type === 'visitor' ? 'К кому ходил' : 'Кто приходил'} · {links.length}
          </p>
          {links.map((link, i) => (
            <button
              key={nodeId(link)}
              type="button"
              onClick={() => onOpen(link)}
              className={`grid grid-cols-[48px_minmax(0,1.3fr)_minmax(0,1fr)_48px_96px_20px] items-center gap-4 rounded-[1.375rem] px-4 py-3.5 text-left transition active:bg-paper ${
                i === 0 ? 'bg-surface shadow-lift ring-[1.5px] ring-accent-soft' : ''
              }`}
            >
              <Avatar name={link.name} photo={photoUrl(link.photo_path)} size={48} tone={i === 0 ? TONES[link.type] : TONES.muted} />
              <span className="min-w-0">
                <span className="block truncate text-[17px] font-medium">{shortName(link.name)}</span>
                <span className="block truncate text-[13px] text-graphite">{link.subtitle}</span>
              </span>
              <span className="h-3 overflow-hidden rounded-full bg-paper">
                <span
                  className={`block h-full rounded-full ${i === 0 ? 'bg-accent' : 'bg-[#7DB5AC]'}`}
                  style={{ width: `${Math.max(6, (link.visit_count / maxCount) * 100)}%` }}
                />
              </span>
              <span className={`text-right text-xl font-semibold ${i === 0 ? 'text-accent' : ''}`}>{link.visit_count}</span>
              <span className="text-right font-mono text-[13px] text-mist">{formatDate(link.last_visit)}</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8FA0A9" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          ))}
        </section>

        {visits.length === 0 && links.length === 0 && (
          <p className="py-16 text-center text-graphite">{period ? 'За выбранный период визитов нет' : 'Визитов пока нет'}</p>
        )}
      </main>
    </div>
  );
}

// ─── Окно ─────────────────────────────────────────────────────────────

export default function ConnectionsGraph({ initialNode, initialPeriod = '', onClose }) {
  const [history, setHistory] = useState([initialNode]);
  // Период и режим сохраняются при переходе по связям
  const [period, setPeriod] = useState(initialPeriod);
  const [mode, setMode] = useState('orbit');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);

  const current = history[history.length - 1];

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    setHoveredId(null);
    const params =
      current.type === 'employee' ? { employee_id: current.employee_id } : { visitor_key: current.visitor_key };
    if (period) params.period = period;
    api.visits
      .graph(params)
      .then((result) => !cancelled && setData(result))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [current, period]);

  useEffect(() => {
    const handleKeyDown = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  function openNode(node) {
    if (nodeId(node) === nodeId(current)) return;
    setHistory((h) => [...h, node]);
  }

  const emptyText = period ? 'За выбранный период связей нет' : 'Связей пока нет';
  const hiddenCount = data ? data.links.length - Math.min(data.links.length, MAX_NODES) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6" onClick={onClose}>
      <div
        className="flex h-[min(828px,100%)] w-full max-w-[1312px] flex-col overflow-hidden rounded-card bg-surface shadow-float"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Связи"
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-hair px-8 py-5">
          <nav aria-label="Путь по связям" className="flex min-w-0 flex-1 items-center gap-2 text-[15px]">
            <span className="shrink-0 text-mist">Связи</span>
            {history.map((node, i) => (
              <span key={`${nodeId(node)}-${i}`} className="flex min-w-0 items-center gap-2">
                <span className="text-hair">/</span>
                {i === history.length - 1 ? (
                  <span className="truncate font-semibold">{shortName(data?.center.name ?? node.name)}</span>
                ) : (
                  <button type="button" onClick={() => setHistory((h) => h.slice(0, i + 1))} className="truncate text-graphite active:text-ink">
                    {shortName(node.name)}
                  </button>
                )}
              </span>
            ))}
          </nav>

          <div className="segmented shrink-0 p-1">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMode(m.value)}
                className={`segment px-5 py-2 text-[15px] ${mode === m.value ? 'segment-active' : ''}`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            aria-label="Период"
            className="field field-sm h-11 w-auto shrink-0 border-transparent bg-paper text-[15px]"
          >
            {PERIODS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-paper active:bg-paper-deep"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {error && <div className="alert-error m-8">{error}</div>}
        {!data && !error && <p className="py-24 text-center text-graphite">Загрузка…</p>}

        {data && mode === 'orbit' && (
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_400px]">
            <div className="relative min-h-0 bg-[radial-gradient(circle_at_50%_48%,#F4F7F8_0,#FFFFFF_70%)] p-4">
              <Orbit data={data} hoveredId={hoveredId} onHover={setHoveredId} onOpen={openNode} emptyText={emptyText} />
              <p className="absolute bottom-5 left-8 text-[13px] text-mist">
                Размер узла и толщина линии — число визитов · коснитесь связи, чтобы открыть её связи
                {hiddenCount > 0 && ` · ещё ${hiddenCount} — в списке`}
              </p>
            </div>
            <aside className="flex min-h-0 flex-col gap-5 border-l border-hair px-7 py-6">
              <div>
                <h2 className="text-2xl font-semibold leading-tight tracking-tight">{data.center.name}</h2>
                <p className={`mt-1.5 text-[13px] text-graphite ${data.center.type === 'visitor' ? 'font-mono' : ''}`}>{data.center.subtitle}</p>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-[1.375rem] bg-paper/60 px-4 py-3">
                  <p className="text-[13px] text-graphite">Визитов</p>
                  <p className="text-[28px] font-light leading-tight">{data.center.visit_count}</p>
                </div>
                <div className="rounded-[1.375rem] bg-paper/60 px-4 py-3">
                  <p className="text-[13px] text-graphite">{data.center.type === 'visitor' ? 'Сотрудников' : 'Посетителей'}</p>
                  <p className="text-[28px] font-light leading-tight">{data.links.length}</p>
                </div>
              </div>
              <div className="-mx-2 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                {data.links.length > 0 ? (
                  <LinkList data={data} hoveredId={hoveredId} onHover={setHoveredId} onOpen={openNode} />
                ) : (
                  <p className="py-10 text-center text-graphite">{emptyText}</p>
                )}
              </div>
            </aside>
          </div>
        )}

        {data && mode === 'dossier' && <Dossier data={data} period={period} onOpen={openNode} />}
      </div>
    </div>
  );
}
