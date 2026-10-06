import { spawn } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const READER_SCRIPT = path.join(__dirname, 'readSerialScanner.ps1');
const RESTART_DELAY_MS = 5000;

/**
 * Приём кодов со сканера в режиме USB COM. Сканер в этом режиме не притворяется
 * клавиатурой и не вводит символы в поля, где работает дежурный.
 * Чтение порта — в PowerShell-скрипте (System.IO.Ports), без нативных npm-пакетов.
 */
export function startSerialScanner({ portName = 'auto', baudRate = 9600, onScan }) {
  if (process.platform !== 'win32') {
    console.warn('Сканер USB COM: чтение порта поддерживается только на Windows');
    return;
  }

  let lastStatus = null;
  const logStatus = (message) => {
    // WAIT приходит каждые несколько секунд — в лог пишем только смену состояния
    if (message !== lastStatus) console.log(`Сканер USB COM: ${message}`);
    lastStatus = message;
  };

  function run() {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        READER_SCRIPT,
        '-PortName',
        portName,
        '-BaudRate',
        String(baudRate),
        '-ParentPid',
        String(process.pid),
      ],
      { windowsHide: true }
    );

    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      const [kind, ...rest] = line.split(' ');
      const payload = rest.join(' ');
      if (kind === 'SCAN') onScan(payload);
      else if (kind === 'PORT') logStatus(`подключён к ${payload}`);
      else if (kind === 'WAIT') logStatus(payload);
    });
    child.stderr.on('data', (data) => logStatus(`ошибка: ${data.toString().trim()}`));
    child.on('exit', () => setTimeout(run, RESTART_DELAY_MS));
  }

  run();
}
