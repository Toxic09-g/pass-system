import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { printer as ThermalPrinter, types as PrinterTypes, CharacterSet } from 'node-thermal-printer';
import { getInstitutionName } from '../routes/settings.js';
import { formatReceiptNumber } from '../utils/receiptNumber.js';
import { VISITOR_TYPES, visitorIdLabel } from '../utils/visitorTypes.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_PRINT_SCRIPT = path.join(__dirname, 'rawPrintWindows.ps1');

function formatDateTime(sqliteDateTime) {
  const [datePart, timePart] = sqliteDateTime.split(' ');
  const [year, month, day] = datePart.split('-');
  return `${day}.${month}.${year} ${timePart?.slice(0, 5) ?? ''}`;
}

function buildReceiptPrinter(interfaceValue) {
  return new ThermalPrinter({
    type: PrinterTypes[process.env.PRINTER_TYPE] || PrinterTypes.EPSON,
    ...(interfaceValue ? { interface: interfaceValue } : {}),
    width: Number(process.env.PRINTER_WIDTH) || 42,
    characterSet: CharacterSet[process.env.PRINTER_CHARACTER_SET] || CharacterSet.PC866_CYRILLIC2,
    removeSpecialCharacters: false,
    options: { timeout: 5000 },
  });
}

function writeReceiptContent(printer, visit) {
  // Учреждение, где оформлен пропуск (от дежурного); у старых записей — учреждение по умолчанию
  const institutionName = visit.institution_name || getInstitutionName();
  if (institutionName) {
    printer.alignCenter();
    printer.bold(true);
    printer.println(institutionName);
    printer.bold(false);
    printer.drawLine();
  }

  printer.alignCenter();
  printer.bold(true);
  printer.println(`ПРОПУСК ПОСЕТИТЕЛЯ № ${formatReceiptNumber(visit.id)}`);
  printer.bold(false);
  printer.drawLine();

  printer.alignLeft();
  printer.println(`Посетитель: ${visit.visitor_full_name}`);
  printer.println(`Тип:        ${VISITOR_TYPES[visit.visitor_type]?.label ?? ''}`);
  if (visit.visitor_organization) printer.println(`Орган:      ${visit.visitor_organization}`);
  printer.println(`${visitorIdLabel(visit.visitor_type)}:        ${visit.visitor_iin}`);
  printer.println(`Дата:       ${formatDateTime(visit.registered_at)}`);
  printer.newLine();
  printer.println(`К кому:     ${visit.employee_full_name}`);
  printer.println(`Должность:  ${visit.employee_position}`);
  printer.println(`Управление: ${visit.employee_department}`);
  printer.drawLine();

  printer.println('Подпись сопровождающего:');
  printer.newLine();
  printer.println('_______________________________');
  printer.newLine();

  printer.alignCenter();
  printer.printQR(visit.qr_code_value, { cellSize: 6, correction: 'M', model: 2 });
  printer.newLine();
  printer.println('Предъявите QR-код при выходе');
  printer.cut();
}

// Печать на принтер, установленный в Windows по имени (включая USB-принтеры)
// — отправляем «сырые» ESC/POS-байты напрямую в спулер печати через
// winspool.drv (P/Invoke из PowerShell), без нативных npm-зависимостей.
// Буфер собирается через getBuffer() и записывается напрямую (не через
// встроенный File-интерфейс node-thermal-printer — он рассчитан на
// посимвольную запись в устройство и не подходит для обычного файла).
async function printViaWindowsSpooler(printerName, visit) {
  const printer = buildReceiptPrinter(null);
  writeReceiptContent(printer, visit);
  const buffer = printer.getBuffer();

  const tempFile = path.join(os.tmpdir(), `pass-system-receipt-${crypto.randomUUID()}.bin`);
  await fs.writeFile(tempFile, buffer);

  try {
    await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      RAW_PRINT_SCRIPT,
      '-PrinterName',
      printerName,
      '-FilePath',
      tempFile,
    ]);
  } finally {
    await fs.unlink(tempFile).catch(() => {});
  }
}

async function printViaNetwork(interfaceValue, visit) {
  const printer = buildReceiptPrinter(interfaceValue);
  const isConnected = await printer.isPrinterConnected();
  if (!isConnected) {
    throw new Error('Принтер не найден или не подключен');
  }
  writeReceiptContent(printer, visit);
  await printer.execute();
}

/**
 * Печатает чек посетителя на ESC/POS термопринтере.
 * Возвращает { printed, error } и никогда не бросает исключение —
 * отсутствие/сбой принтера не должен ломать регистрацию посетителя.
 */
export async function printReceipt(visit) {
  const interfaceValue = process.env.PRINTER_INTERFACE || 'tcp://192.168.0.100:9100';
  const printerNameMatch = /^printer:(.+)$/i.exec(interfaceValue);

  try {
    if (printerNameMatch) {
      if (process.platform !== 'win32') {
        throw new Error('Печать по имени принтера (printer:...) поддерживается только на Windows');
      }
      await printViaWindowsSpooler(printerNameMatch[1], visit);
    } else {
      await printViaNetwork(interfaceValue, visit);
    }
    return { printed: true };
  } catch (err) {
    // В лог — чтобы после жалобы «чек не вышел» было видно причину
    // stderr PowerShell-скрипта печати — там настоящая причина (message содержит только команду)
    const details = err?.stderr?.toString().trim();
    console.error(`Печать чека № ${visit.id} не удалась:`, details || err?.message || err);
    return { printed: false, error: details || err?.message || String(err) };
  }
}
