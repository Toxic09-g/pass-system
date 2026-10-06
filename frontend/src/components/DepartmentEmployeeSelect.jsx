import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';

// Выпадающий список под сенсорный экран: крупная кнопка-заголовок и
// раскрывающаяся панель с пунктами, закрывается касанием вне списка
const PANEL_MAX_HEIGHT = 384;
const PANEL_GAP = 12;

// Куда открыть список и какой высоты, чтобы он целиком влез в видимую область
// (страница регистрации не прокручивается — вылезший за край список обрезался бы)
function panelPlacement(rootEl) {
  const root = rootEl.getBoundingClientRect();
  const area = rootEl.closest('main')?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
  const below = area.bottom - root.bottom - PANEL_GAP;
  const above = root.top - area.top - PANEL_GAP;
  const up = below < 240 && above > below;
  return { up, maxHeight: Math.min(PANEL_MAX_HEIGHT, up ? above : below) };
}

function Dropdown({ caption, label, placeholder, disabled, open, onOpenChange, leading, children }) {
  const rootRef = useRef(null);
  const [placement, setPlacement] = useState({ up: false, maxHeight: PANEL_MAX_HEIGHT });

  useLayoutEffect(() => {
    if (open && rootRef.current) setPlacement(panelPlacement(rootRef.current));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e) {
      if (!rootRef.current?.contains(e.target)) onOpenChange(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open, onOpenChange]);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <span className="label">{caption}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onOpenChange(!open)}
        className={`field flex items-center gap-3 text-left ${leading ? 'pl-2.5' : ''} ${
          open ? 'border-accent ring-4 ring-accent/10' : ''
        }`}
      >
        {label && leading}
        <span className={`min-w-0 flex-1 truncate ${label ? 'text-ink' : 'text-mist'}`}>{label || placeholder}</span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={`shrink-0 text-mist transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          style={{ maxHeight: placement.maxHeight }}
          className={`absolute left-0 right-0 z-20 flex flex-col overflow-hidden rounded-[1.75rem] bg-surface p-2 shadow-float ${
            placement.up ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function Option({ selected, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full rounded-2xl px-4 py-3 text-left active:bg-paper ${
        selected ? 'bg-accent-soft text-accent' : ''
      }`}
    >
      {children}
    </button>
  );
}

function initials(fullName) {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

export default function DepartmentEmployeeSelect({ value, onChange }) {
  const [departments, setDepartments] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState(null);
  const [openList, setOpenList] = useState(null); // 'department' | 'employee' | null
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 250);

  useEffect(() => {
    api.departments.list({ activeOnly: '1' }).then(setDepartments);
  }, []);

  useEffect(() => {
    if (!selectedDepartment) return;
    let cancelled = false;
    setLoading(true);
    api.employees
      .search(debouncedQuery, selectedDepartment.id)
      .then((data) => {
        if (!cancelled) setResults(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, selectedDepartment]);

  function handleSelectDepartment(department) {
    setOpenList(null);
    if (department.id === selectedDepartment?.id) return;
    setSelectedDepartment(department);
    setQuery('');
    setResults([]);
    onChange(null);
  }

  function handleSelectEmployee(employee) {
    setOpenList(null);
    onChange(employee);
  }

  const setListOpen = (list) => (open) => setOpenList(open ? list : null);

  return (
    <div className="grid grid-cols-2 gap-4">
      <Dropdown
        caption="Управление"
        label={selectedDepartment?.name}
        placeholder="Выберите управление"
        open={openList === 'department'}
        onOpenChange={setListOpen('department')}
      >
        <div className="overflow-y-auto">
          {departments.map((department) => (
            <Option
              key={department.id}
              selected={department.id === selectedDepartment?.id}
              onClick={() => handleSelectDepartment(department)}
            >
              <span className="text-touch-base font-medium">{department.name}</span>
            </Option>
          ))}
          {departments.length === 0 && (
            <p className="px-4 py-3 text-graphite">
              Справочник управлений пуст. Добавьте управления в разделе «Справочники».
            </p>
          )}
        </div>
      </Dropdown>

      <Dropdown
        caption="Сотрудник"
        label={
          value && (
            <span className="flex flex-col leading-tight">
              <span className="truncate">{value.full_name}</span>
              <span className="truncate text-[13px] text-graphite">{value.position_name}</span>
            </span>
          )
        }
        leading={
          value && (
            <span className="avatar h-11 w-11 bg-accent-soft text-[15px] text-accent">{initials(value.full_name)}</span>
          )
        }
        placeholder={selectedDepartment ? 'Выберите сотрудника' : 'Сначала выберите управление'}
        disabled={!selectedDepartment}
        open={openList === 'employee'}
        onOpenChange={setListOpen('employee')}
      >
        <div className="pb-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по ФИО или должности"
            className="field field-sm"
          />
        </div>
        <div className="overflow-y-auto">
          {loading && <div className="px-4 py-3 text-graphite">Поиск…</div>}
          {!loading && results.length === 0 && (
            <div className="px-4 py-3 text-graphite">Сотрудники не найдены</div>
          )}
          {!loading &&
            results.map((employee) => (
              <Option
                key={employee.id}
                selected={employee.id === value?.id}
                onClick={() => handleSelectEmployee(employee)}
              >
                <p className="font-semibold">{employee.full_name}</p>
                <p className="text-graphite">{employee.position_name}</p>
              </Option>
            ))}
        </div>
      </Dropdown>
    </div>
  );
}
