import { useEffect, useRef } from 'react';

// Сканер эмулирует физические клавиши. Если в Windows активна не английская
// раскладка (например, русская), event.key придёт уже «переведённым» в
// кириллицу — поэтому символ определяем по event.code (физическое
// положение клавиши), которое от раскладки не зависит.
const CODE_TO_CHAR = {
  Digit0: '0', Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4',
  Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9',
  Numpad0: '0', Numpad1: '1', Numpad2: '2', Numpad3: '3', Numpad4: '4',
  Numpad5: '5', Numpad6: '6', Numpad7: '7', Numpad8: '8', Numpad9: '9',
  Minus: '-', NumpadSubtract: '-',
  KeyA: 'A', KeyB: 'B', KeyC: 'C', KeyD: 'D', KeyE: 'E', KeyF: 'F', KeyG: 'G',
  KeyH: 'H', KeyI: 'I', KeyJ: 'J', KeyK: 'K', KeyL: 'L', KeyM: 'M', KeyN: 'N',
  KeyO: 'O', KeyP: 'P', KeyQ: 'Q', KeyR: 'R', KeyS: 'S', KeyT: 'T', KeyU: 'U',
  KeyV: 'V', KeyW: 'W', KeyX: 'X', KeyY: 'Y', KeyZ: 'Z',
};

// Сканер «печатает» код за миллисекунды, человек — не быстрее ~80–150 мс на клавишу.
// Очередь нажатий с паузами меньше этого порога, закончившаяся Enter, считается сканом
const SCAN_GAP_MS = 50;

// Код пропуска: 12 цифр; у старых пропусков — вида V12-3CDB5876
const QR_CODE_PATTERN = /^(\d{12}|V\d+-[0-9A-F]{8})$/;

function isTextField(el) {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}

// Возвращает полю значение, которое было до скана, так, чтобы React это заметил
function restoreFieldValue(el, value) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Слушает сканер QR на любом экране, без отдельной страницы «Выход».
 * Если в момент скана фокус был в поле ввода, символы кода из него убираются,
 * а Enter сканера не отправляет форму.
 */
export function useGlobalQrScanner(onScan, enabled = true) {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return undefined;
    let buffer = '';
    let lastKeyTime = 0;
    let field = null;
    let fieldValueBefore = '';

    function handleKeyDown(e) {
      // Shift сканер нажимает для заглавных букв старых кодов — он не прерывает очередь
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') return;

      const now = performance.now();
      const isFast = now - lastKeyTime <= SCAN_GAP_MS;
      lastKeyTime = now;

      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        const code = buffer;
        buffer = '';
        if (isFast && QR_CODE_PATTERN.test(code)) {
          e.preventDefault();
          e.stopPropagation();
          if (field && field.isConnected && field.value !== fieldValueBefore) {
            restoreFieldValue(field, fieldValueBefore);
          }
          onScanRef.current(code);
        }
        return;
      }

      const char = CODE_TO_CHAR[e.code];
      if (!char || e.ctrlKey || e.altKey || e.metaKey) {
        buffer = '';
        return;
      }
      if (!isFast) {
        // Начало новой очереди нажатий — запоминаем поле и его значение до неё
        buffer = '';
        field = isTextField(document.activeElement) ? document.activeElement : null;
        fieldValueBefore = field?.value ?? '';
      }
      buffer += char;
    }

    // capture: перехватываем Enter раньше, чем его увидит форма
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [enabled]);
}
