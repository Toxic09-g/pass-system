// Тип посетителя определяет, какой номер он предъявляет: юр. лицо — БИН, остальные — ИИН.
// Номер хранится в visits.visitor_iin независимо от типа (ИИН и БИН — оба по 12 цифр)
export const VISITOR_TYPES = {
  individual: { label: 'Физ. лицо', idLabel: 'ИИН' },
  legal: { label: 'Юр. лицо', idLabel: 'БИН' },
  government: { label: 'Гос. орган', idLabel: 'ИИН' },
};

export function visitorIdLabel(visitorType) {
  return VISITOR_TYPES[visitorType]?.idLabel ?? 'ИИН';
}
