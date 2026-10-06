import { useEffect, useState } from 'react';
import { api, VISITS_CHANGED_EVENT } from '../api/client.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { formatReceiptNumber } from '../utils/receiptNumber.js';
import ConnectionsGraph from '../components/ConnectionsGraph.jsx';
import { PERIODS } from '../utils/periods.js';
import { VISITOR_TYPES, visitorIdLabel, visitorKey } from '../utils/visitorTypes.js';

// Фильтр по статусу — на клиенте, по уже загруженным записям.
// status считает backend: inside — в здании, left — вышел,
// lost — больше 24 часов без отметки выхода (пропуск утерян)
const STATUS_FILTERS = [
  { value: 'all', label: 'Все' },
  { value: 'inside', label: 'В здании' },
  { value: 'left', label: 'Вышли' },
  { value: 'lost', label: 'Утеряны' },
];

function visitorNode(visit) {
  return {
    type: 'visitor',
    visitor_key: visitorKey(visit),
    name: visit.visitor_full_name,
  };
}

function employeeNode(visit) {
  return { type: 'employee', employee_id: visit.employee_id, name: visit.employee_full_name };
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function initials(fullName) {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

// «Сегодня», «Вчера» или «28 сентября» — заголовок группы в ленте
function dayLabel(value) {
  const day = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (day.toDateString() === today.toDateString()) return 'Сегодня';
  if (day.toDateString() === yesterday.toDateString()) return 'Вчера';
  return day.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function durationSince(value) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours} ч ${minutes % 60} мин` : `${hours} ч`;
}

function Avatar({ visit, size }) {
  const style = { width: size, height: size };
  return visit.photo_path ? (
    <img src={`/uploads/${visit.photo_path}`} alt="" style={style} className="shrink-0 rounded-full bg-paper object-cover" />
  ) : (
    <span style={style} className="avatar text-sm">
      {initials(visit.visitor_full_name)}
    </span>
  );
}

function StatusPill({ visit }) {
  if (visit.status === 'lost') return <span className="pill-danger">Утерян</span>;
  return visit.checked_out_at ? (
    <span className="pill-muted">
      Выход {formatTime(visit.checked_out_at)}
    </span>
  ) : (
    <span className="pill-live">В здании</span>
  );
}

function VisitDetails({ visit, onShowGraph }) {
  const rows = [
    ['К сотруднику', visit.employee_full_name],
    ['Должность', visit.employee_position],
    ['Управление', visit.employee_department],
    ['Место', visit.institution_name || '—'],
    ['Вход', new Date(visit.registered_at).toLocaleString('ru-RU'), true],
    ['Выход', visit.checked_out_at ? new Date(visit.checked_out_at).toLocaleString('ru-RU') : '—', true],
  ];

  return (
    <aside className="card flex flex-col items-center gap-5 overflow-y-auto p-8">
      <div className="rounded-full p-1.5 shadow-[0_0_0_2px_theme(colors.accent.DEFAULT)]">
        <Avatar visit={visit} size={148} />
      </div>
      <div className="space-y-1 text-center">
        <h2 className="text-2xl font-semibold leading-tight tracking-tight">{visit.visitor_full_name}</h2>
        <p className="font-mono text-sm text-graphite">
          {visit.visitor_iin ? `${visitorIdLabel(visit.visitor_type)} ${visit.visitor_iin} · ` : ''}№{' '}
          {formatReceiptNumber(visit.id)}
        </p>
        <p className="text-sm text-graphite">
          {VISITOR_TYPES[visit.visitor_type]?.label}
          {visit.visitor_organization && ` · ${visit.visitor_organization}`}
        </p>
      </div>
      {visit.status === 'lost' ? (
        <span className="pill-danger text-sm">
          Утерян · выход не отмечен {durationSince(visit.registered_at)}
        </span>
      ) : visit.checked_out_at ? (
        <span className="pill-muted text-sm">
          Выход в {formatTime(visit.checked_out_at)}
        </span>
      ) : (
        <span className="pill-live text-sm">В здании · {durationSince(visit.registered_at)}</span>
      )}

      <dl className="w-full">
        {rows.map(([label, value, mono]) => (
          <div key={label} className="flex justify-between gap-6 border-b border-hair py-3.5 text-[15px] last:border-b-0">
            <dt className="shrink-0 text-graphite">{label}</dt>
            <dd className={`text-right ${mono ? 'font-mono text-sm' : ''}`}>{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-auto grid w-full grid-cols-2 gap-3">
        <button type="button" onClick={() => onShowGraph(visitorNode(visit))} className="btn-ghost h-14 text-[15px]">
          Связи посетителя
        </button>
        <button type="button" onClick={() => onShowGraph(employeeNode(visit))} className="btn-ghost h-14 text-[15px]">
          Связи сотрудника
        </button>
      </div>
    </aside>
  );
}

export default function JournalPage() {
  const [visits, setVisits] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [date, setDate] = useState('');
  const [period, setPeriod] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [graphNode, setGraphNode] = useState(null);
  const debouncedSearch = useDebouncedValue(search, 250);
  const [reloadKey, setReloadKey] = useState(0);

  // Выход отмечен сканом на этом же экране — обновляем статусы в ленте
  useEffect(() => {
    const reload = () => setReloadKey((key) => key + 1);
    window.addEventListener(VISITS_CHANGED_EVENT, reload);
    return () => window.removeEventListener(VISITS_CHANGED_EVENT, reload);
  }, []);

  useEffect(() => {
    api.employees.list().then(setEmployees).catch(() => {});
  }, []);

  // Поиск по мере набора: ответы на устаревшие запросы отбрасываются
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = {};
    if (date) params.date = date;
    if (period) params.period = period;
    if (employeeId) params.employee_id = employeeId;
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
    api.visits
      .list(params)
      .then((data) => !cancelled && setVisits(data))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [date, period, employeeId, debouncedSearch, reloadKey]);

  const insideCount = visits.filter((visit) => visit.status === 'inside').length;
  const lostCount = visits.filter((visit) => visit.status === 'lost').length;
  const shown = visits.filter((visit) => status === 'all' || visit.status === status);
  const selected = shown.find((visit) => visit.id === selectedId) ?? shown[0] ?? null;

  const groups = [];
  for (const visit of shown) {
    const label = dayLabel(visit.registered_at);
    if (groups.at(-1)?.label !== label) groups.push({ label, visits: [] });
    groups.at(-1).visits.push(visit);
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_440px] grid-rows-[minmax(0,1fr)] gap-6 px-10 pb-8 pt-1">
      <section className="flex min-h-0 flex-col gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-touch-xl font-semibold">Журнал</h1>
          <p className="text-[17px] text-graphite">
            {loading
              ? 'Загрузка…'
              : `Записей: ${visits.length} · в здании ${insideCount}${lostCount ? ` · утеряно ${lostCount}` : ''}`}
          </p>
          <label className="relative ml-auto w-[400px]">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
              className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-mist"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4-4" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ФИО, ИИН/БИН, сотрудник, «утерян»…"
              aria-label="Поиск"
              className="field field-sm h-[52px] border-transparent bg-surface/75 pl-12"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setStatus(filter.value)}
              className={`chip ${status === filter.value ? 'chip-active' : ''}`}
            >
              {filter.label}
            </button>
          ))}
          <span className="mx-1 h-6 w-px bg-hair" />
          <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Период" className="field field-sm h-10 w-auto border-transparent bg-surface/70 text-sm">
            {PERIODS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Дата"
            className="field field-sm h-10 w-auto border-transparent bg-surface/70 font-mono text-sm"
          />
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            aria-label="Сотрудник"
            className="field field-sm h-10 w-auto max-w-xs border-transparent bg-surface/70 text-sm"
          >
            <option value="">Все сотрудники</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.full_name}
              </option>
            ))}
          </select>
          {(search || date || period || employeeId || status !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setDate('');
                setPeriod('');
                setEmployeeId('');
                setStatus('all');
              }}
              className="link ml-1 text-sm"
            >
              Сбросить
            </button>
          )}
        </div>

        <div className="panel min-h-0 flex-1 overflow-y-auto p-2.5">
          {!loading && shown.length === 0 && <p className="py-20 text-center text-graphite">Записи не найдены</p>}
          {groups.map((group) => (
            <div key={group.label} className="mb-2">
              <p className="px-5 pb-1 pt-3 text-[13px] text-mist">{group.label}</p>
              {group.visits.map((visit) => {
                const isSelected = visit.id === selected?.id;
                return (
                  <button
                    key={visit.id}
                    type="button"
                    onClick={() => setSelectedId(visit.id)}
                    className={`flex w-full items-center gap-4 rounded-3xl px-5 py-3.5 text-left transition ${
                      isSelected ? 'bg-surface shadow-lift' : 'active:bg-surface/60'
                    }`}
                  >
                    <Avatar visit={visit} size={52} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className={`truncate text-[17px] font-medium ${visit.checked_out_at && !isSelected ? 'text-graphite' : ''}`}>
                        {visit.visitor_full_name}
                      </span>
                      <span className="truncate text-sm text-graphite">
                        → {visit.employee_full_name} · {visit.employee_department}
                      </span>
                    </span>
                    <span className="font-mono text-sm text-mist">{formatTime(visit.registered_at)}</span>
                    <span className="w-[7.5rem] text-right">
                      <StatusPill visit={visit} />
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      {selected ? (
        <VisitDetails visit={selected} onShowGraph={setGraphNode} />
      ) : (
        <aside className="card flex items-center justify-center p-8 text-center text-graphite">
          Выберите запись, чтобы увидеть подробности
        </aside>
      )}

      {/* Граф открывается с тем же периодом, что выбран в журнале, — дальше его можно сменить */}
      {graphNode && (
        <ConnectionsGraph initialNode={graphNode} initialPeriod={period} onClose={() => setGraphNode(null)} />
      )}
    </div>
  );
}
