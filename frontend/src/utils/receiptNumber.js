// Номер чека — id записи в журнале, дополненный нулями до 6 цифр (как на печатном чеке)
export function formatReceiptNumber(visitId) {
  return String(visitId).padStart(6, '0');
}
