import crypto from 'node:crypto';

// Номер чека — id записи в журнале, дополненный нулями до 6 цифр
export function formatReceiptNumber(visitId) {
  return String(visitId).padStart(6, '0');
}

// Значение QR-кода — только цифры: номер чека + 6 случайных цифр.
// Случайная часть не даёт отметить чужой выход, напечатав QR с угаданным номером
export function generateQrCodeValue(visitId) {
  const randomPart = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  return `${formatReceiptNumber(visitId)}${randomPart}`;
}
