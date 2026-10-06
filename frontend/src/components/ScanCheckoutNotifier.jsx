import { useCallback, useEffect, useRef, useState } from 'react';
import { api, VISITS_CHANGED_EVENT } from '../api/client.js';
import { useGlobalQrScanner } from '../hooks/useGlobalQrScanner.js';
import { formatReceiptNumber } from '../utils/receiptNumber.js';

const RESULT_TIMEOUT_MS = 6000;

function formatTime(value) {
  return new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

// Отметка выхода по скану QR на любом экране: результат всплывает поверх
// текущей страницы и сам исчезает, дежурному ничего не нужно открывать.
// Два источника сканов:
//  - сканер в режиме USB COM — код читает backend и присылает итог через /api/scanner/events;
//  - сканер в режиме клавиатуры — код ловит useGlobalQrScanner (запасной вариант).
// showPopups — только у дежурного (право регистрации); у остальных скан лишь обновляет журнал
export default function ScanCheckoutNotifier({ showPopups }) {
  const [notice, setNotice] = useState(null); // { status: 'loading' | 'ok' | 'repeat' | 'error', ... }
  const hideTimerRef = useRef(null);

  const showNotice = useCallback(
    (next, autoHide = true) => {
      if (!showPopups) return;
      clearTimeout(hideTimerRef.current);
      setNotice(next);
      if (autoHide) hideTimerRef.current = setTimeout(() => setNotice(null), RESULT_TIMEOUT_MS);
    },
    [showPopups]
  );

  const showVisit = useCallback(
    (visit) => {
      showNotice({ status: visit.already_checked_out ? 'repeat' : 'ok', visit });
      if (!visit.already_checked_out) window.dispatchEvent(new Event(VISITS_CHANGED_EVENT));
    },
    [showNotice]
  );

  const handleKeyboardScan = useCallback(
    async (code) => {
      showNotice({ status: 'loading' }, false);
      try {
        showVisit(await api.visits.checkout(code));
      } catch (err) {
        showNotice({ status: 'error', message: err.message, code });
      }
    },
    [showNotice, showVisit]
  );

  useGlobalQrScanner(handleKeyboardScan, showPopups);

  // EventSource сам переподключается, если backend перезапустился
  useEffect(() => {
    const events = new EventSource('/api/scanner/events');
    events.onmessage = (e) => {
      const result = JSON.parse(e.data);
      if (result.status === 'ok') showVisit(result.visit);
      else if (result.status === 'not_found')
        showNotice({ status: 'error', message: 'Пропуск с таким QR-кодом не найден', code: result.code });
      else showNotice({ status: 'error', message: 'Не удалось обработать скан', code: result.code });
    };
    return () => events.close();
  }, [showNotice, showVisit]);

  useEffect(() => () => clearTimeout(hideTimerRef.current), []);

  if (!notice) return null;

  // Цвет — только значок: морской — выход отмечен, графит — повтор, красный — ошибка
  const accents = {
    loading: { badge: 'bg-paper text-graphite', icon: '…' },
    ok: { badge: 'bg-accent text-surface', icon: '✓' },
    repeat: { badge: 'bg-ink text-surface', icon: '!' },
    error: { badge: 'bg-danger text-surface', icon: '✕' },
  };
  const accent = accents[notice.status];

  return (
    <div className="pointer-events-none fixed bottom-8 right-8 z-[60] w-[calc(100%-4rem)] max-w-md">
      <div
        role="status"
        onClick={() => setNotice(null)}
        className="pointer-events-auto relative flex w-full gap-5 overflow-hidden rounded-card bg-surface p-6 shadow-float"
      >
        
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl font-semibold ${accent.badge}`}
        >
          {accent.icon}
        </span>

        <div className="min-w-0">
          {notice.status === 'loading' && <p className="pt-2 text-touch-lg text-graphite">Проверка пропуска…</p>}

          {(notice.status === 'ok' || notice.status === 'repeat') && (
            <>
              <p className="eyebrow">{notice.status === 'ok' ? 'Выход отмечен' : 'Выход уже был отмечен'}</p>
              <p className="mt-1 text-touch-lg font-semibold">{notice.visit.visitor_full_name}</p>
              <p className="mt-1 font-mono text-sm text-graphite">
                № {formatReceiptNumber(notice.visit.id)} · вход {formatTime(notice.visit.registered_at)} · выход{' '}
                {formatTime(notice.visit.checked_out_at)}
              </p>
            </>
          )}

          {notice.status === 'error' && (
            <>
              <p className="text-touch-lg font-semibold text-danger-deep">{notice.message}</p>
              <p className="mt-1 break-all font-mono text-sm text-graphite">Считанный код: {notice.code}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
