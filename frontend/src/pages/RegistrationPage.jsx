import { useCallback, useEffect, useRef, useState } from 'react';
import DepartmentEmployeeSelect from '../components/DepartmentEmployeeSelect.jsx';
import WebcamCapture from '../components/WebcamCapture.jsx';
import { api, VISITS_CHANGED_EVENT } from '../api/client.js';
import { formatReceiptNumber } from '../utils/receiptNumber.js';
import { VISITOR_TYPES, visitorIdLabel } from '../utils/visitorTypes.js';

const IIN_PATTERN = /^\d{12}$/;

const initialFormState = {
  visitorType: null, // выбирается первым: от него зависит ИИН или БИН
  visitorFullName: '',
  visitorIin: '',
  visitorOrganization: '', // только для гос. органа — из какого он органа
  employee: null,
};

function formatTime(value) {
  return new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function CheckIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

// Правая колонка: сколько людей в здании и последние выданные пропуска
function RecentPanel({ summary }) {
  if (!summary) return null;
  return (
    <aside className="flex w-[300px] shrink-0 flex-col gap-4">
      <div className="panel px-7 py-6">
        <p className="eyebrow">Сейчас в здании</p>
        <p className="mt-1 text-[64px] font-light leading-none tracking-tight tabular-nums">{summary.in_building}</p>
      </div>
      {summary.recent.length > 0 && (
        <div className="panel flex flex-col gap-4 px-7 py-6">
          <p className="eyebrow">Последние</p>
          {summary.recent.map((visit) => (
            <div key={visit.id} className="flex items-center gap-3">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${visit.checked_out_at ? 'bg-hair' : 'bg-accent'}`} />
              <span className="min-w-0 flex-1 truncate text-[15px]">{visit.visitor_full_name}</span>
              <span className="font-mono text-[13px] text-mist">{formatTime(visit.registered_at)}</span>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

export default function RegistrationPage() {
  const [form, setForm] = useState(initialFormState);
  const [now, setNow] = useState(new Date());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successVisit, setSuccessVisit] = useState(null);
  const [printState, setPrintState] = useState({ printed: false, error: null });
  const [organizations, setOrganizations] = useState([]);
  const [summary, setSummary] = useState(null);

  const webcamRef = useRef(null);

  const loadSummary = useCallback(() => {
    api.visits.recent().then(setSummary).catch(() => {});
  }, []);

  useEffect(() => {
    api.visits.organizations().then(setOrganizations).catch(() => {});
    loadSummary();
    // Выход отмечен сканом — счётчик «в здании» меняется
    window.addEventListener(VISITS_CHANGED_EVENT, loadSummary);
    return () => window.removeEventListener(VISITS_CHANGED_EVENT, loadSummary);
  }, [loadSummary]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  function resetForm() {
    setForm(initialFormState);
    webcamRef.current?.reset();
    setError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!form.visitorType) {
      setError('Выберите, кто посетитель: физ. лицо, юр. лицо или гос. орган');
      return;
    }
    if (form.visitorType === 'government' && !form.visitorOrganization.trim()) {
      setError('Укажите, из какого гос. органа посетитель');
      return;
    }
    if (!form.visitorFullName.trim()) {
      setError('Укажите ФИО посетителя');
      return;
    }
    if (!IIN_PATTERN.test(form.visitorIin.trim())) {
      setError(`Укажите корректный ${visitorIdLabel(form.visitorType)} (12 цифр)`);
      return;
    }
    if (!form.employee) {
      setError('Выберите сотрудника, к которому направляется посетитель');
      return;
    }
    const photo = webcamRef.current?.getImage();
    if (!photo) {
      setError('Сделайте фото посетителя — коснитесь круга с камерой');
      return;
    }

    setSubmitting(true);
    try {
      const visit = await api.visits.create({
        visitor_type: form.visitorType,
        visitor_full_name: form.visitorFullName,
        visitor_iin: form.visitorIin,
        visitor_organization: form.visitorType === 'government' ? form.visitorOrganization : '',
        employee_id: form.employee.id,
        photo_data_url: photo,
      });
      setSuccessVisit({ ...visit, photo });
      setPrintState({ printed: visit.printed, error: visit.print_error });
      loadSummary();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRetryPrint() {
    if (!successVisit) return;
    const result = await api.visits.print(successVisit.id);
    setPrintState({ printed: result.printed, error: result.error });
  }

  const idComplete = form.visitorIin.length === 12;

  return (
    // Экран дежурного — без прокрутки при любой высоте экрана от 720 px
    <div className="flex min-h-0 flex-1 justify-center gap-6 px-8 pb-6 pt-1">
      {successVisit ? (
        <div className="card flex w-[640px] flex-col items-center gap-4 self-start px-10 py-7 text-center">
          <div className="relative">
            <img
              src={successVisit.photo}
              alt=""
              className="h-28 w-28 rounded-full border-[6px] border-surface object-cover shadow-[0_0_0_2px_theme(colors.accent.DEFAULT)]"
            />
            <span className="absolute -bottom-1 -right-1 flex h-12 w-12 items-center justify-center rounded-full border-4 border-surface bg-accent text-surface">
              <CheckIcon size={22} />
            </span>
          </div>
          <div className="space-y-1">
            <p className="eyebrow">Пропуск оформлен</p>
            <h1 className="text-[32px] font-semibold leading-tight tracking-tight">{successVisit.visitor_full_name}</h1>
            <p className="font-mono text-sm text-graphite">№ {formatReceiptNumber(successVisit.id)}</p>
          </div>

          <div className="flex w-full items-center gap-6 rounded-[1.75rem] bg-paper/70 p-4 text-left">
            {successVisit.qr_code_data_url && (
              <img
                src={successVisit.qr_code_data_url}
                alt="QR-код пропуска"
                className="h-32 w-32 shrink-0 rounded-2xl bg-surface p-2"
              />
            )}
            <dl className="flex-1 space-y-3 text-[15px]">
              <div>
                <dt className="text-graphite">К сотруднику</dt>
                <dd className="font-medium">{successVisit.employee_full_name}</dd>
              </div>
              <div>
                <dt className="text-graphite">Должность</dt>
                <dd>
                  {successVisit.employee_position}, {successVisit.employee_department}
                </dd>
              </div>
              <div>
                <dt className="text-graphite">Вход</dt>
                <dd className="font-mono">{new Date(successVisit.registered_at).toLocaleString('ru-RU')}</dd>
              </div>
            </dl>
          </div>

          {printState.printed ? (
            <span className="pill-live text-sm">Чек распечатан</span>
          ) : (
            <div className="flex w-full items-center gap-3">
              <p className="alert-error min-w-0 flex-1 text-left">
                Чек не распечатан — покажите QR-код на экране.
              </p>
              <button type="button" onClick={handleRetryPrint} className="btn-ghost h-14 shrink-0">
                Повторить печать
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setSuccessVisit(null);
              resetForm();
            }}
            className="btn-primary h-16 w-full text-touch-lg"
          >
            Новая регистрация
          </button>
        </div>
      ) : (
        // Размеры плавно зависят от высоты экрана (clamp + vh): на 1920×1080 крупно,
        // на 1366×768 компактнее — прокрутки нет ни там, ни там.
        // Сверху — камера и справа от неё тип, ФИО и ИИН; ниже на всю ширину — кого посещает и кнопки
        <form
          onSubmit={handleSubmit}
          className="card flex w-full max-w-[1180px] flex-col gap-[clamp(10px,2.4vh,26px)] self-start p-[clamp(20px,3vh,36px)] [&_.field]:h-[clamp(48px,7vh,72px)]"
        >
          <div className="flex gap-[clamp(20px,3vh,40px)]">
            <WebcamCapture ref={webcamRef} className="h-[clamp(200px,40vh,380px)]" />

            <div className="flex min-w-0 flex-1 flex-col gap-[clamp(10px,2.4vh,26px)]">
              <div className="flex items-center justify-between gap-4">
                <h1 className="text-[clamp(24px,3.2vh,32px)] font-semibold leading-tight">Новый посетитель</h1>
                <div className="flex shrink-0 items-center gap-3">
                  {/* Когда боковой панели нет (узкий экран), счётчик «в здании» — здесь */}
                  {summary && (
                    <span className="rounded-full bg-paper px-3 py-1 text-sm text-graphite min-[1600px]:hidden">
                      В здании: <span className="font-semibold tabular-nums text-ink">{summary.in_building}</span>
                    </span>
                  )}
                  <p className="font-mono text-sm text-mist">
                    {now.toLocaleDateString('ru-RU')} · {now.toLocaleTimeString('ru-RU')}
                  </p>
                </div>
              </div>

              <div className="segmented">
                {Object.entries(VISITOR_TYPES).map(([type, { label }]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, visitorType: type }))}
                    className={`segment py-[clamp(8px,1.6vh,16px)] ${form.visitorType === type ? 'segment-active' : ''}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {form.visitorType === 'government' && (
                <div>
                  <label className="label" htmlFor="visitor-organization">
                    Какой гос. орган
                  </label>
                  {/* Подсказки — известные учреждения и органы из прошлых визитов; можно вписать новый */}
                  <input
                    id="visitor-organization"
                    type="text"
                    list="known-organizations"
                    value={form.visitorOrganization}
                    onChange={(e) => setForm((f) => ({ ...f, visitorOrganization: e.target.value }))}
                    placeholder="Например, ДП города Астаны"
                    className="field"
                  />
                  <datalist id="known-organizations">
                    {organizations.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label" htmlFor="visitor-name">
                    ФИО
                  </label>
                  <input
                    id="visitor-name"
                    type="text"
                    value={form.visitorFullName}
                    onChange={(e) => setForm((f) => ({ ...f, visitorFullName: e.target.value }))}
                    placeholder="Иванов Иван Иванович"
                    className="field"
                  />
                </div>

                <div>
                  <label className="label" htmlFor="visitor-iin">
                    {form.visitorType ? visitorIdLabel(form.visitorType) : 'ИИН / БИН'}
                  </label>
                  <div className="relative">
                    <input
                      id="visitor-iin"
                      type="text"
                      inputMode="numeric"
                      maxLength={12}
                      disabled={!form.visitorType}
                      value={form.visitorIin}
                      onChange={(e) => setForm((f) => ({ ...f, visitorIin: e.target.value.replace(/\D/g, '') }))}
                      placeholder={form.visitorType ? '12 цифр' : 'Выберите тип посетителя'}
                      className={`field pr-16 font-mono tracking-[0.1em] ${idComplete ? 'border-accent ring-4 ring-accent/10' : ''}`}
                    />
                    {form.visitorType && (
                      <span
                        className={`pointer-events-none absolute right-4 top-1/2 flex -translate-y-1/2 items-center justify-center ${
                          idComplete ? 'h-8 w-8 rounded-full bg-accent text-surface' : 'font-mono text-sm text-mist'
                        }`}
                      >
                        {idComplete ? <CheckIcon /> : `${form.visitorIin.length}/12`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DepartmentEmployeeSelect value={form.employee} onChange={(employee) => setForm((f) => ({ ...f, employee }))} />

          {error && <div className="alert-error">{error}</div>}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={resetForm}
              className="btn-ghost h-[clamp(52px,7.5vh,80px)] px-7 text-base font-medium"
            >
              Очистить
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary h-[clamp(52px,7.5vh,80px)] flex-1 text-touch-lg"
            >
              {submitting ? 'Оформление…' : 'Выдать пропуск'}
            </button>
          </div>
        </form>
      )}

      {/* Боковая панель — только на широких экранах; на узких счётчик в шапке формы */}
      <div className="hidden min-[1600px]:flex">
        <RecentPanel summary={summary} />
      </div>
    </div>
  );
}
