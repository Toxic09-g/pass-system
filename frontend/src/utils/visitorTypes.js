// Тип посетителя определяет, какой номер он предъявляет: юр. лицо — БИН, остальные — ИИН
// (те же значения, что в backend/src/utils/visitorTypes.js)
export const VISITOR_TYPES = {
  individual: { label: 'Физ. лицо', idLabel: 'ИИН' },
  legal: { label: 'Юр. лицо', idLabel: 'БИН' },
  government: { label: 'Гос. орган', idLabel: 'ИИН' },
};

export function visitorIdLabel(visitorType) {
  return VISITOR_TYPES[visitorType]?.idLabel ?? 'ИИН';
}

// Ключ посетителя для графа связей (как VISITOR_KEY_SQL на backend): по ИИН; БИН — номер
// организации, поэтому у юр. лиц к нему добавляется ФИО; у старых записей без номера — ФИО
export function visitorKey(visit) {
  if (visit.visitor_type === 'legal') return `legal:${visit.visitor_iin}:${visit.visitor_full_name}`;
  return visit.visitor_iin || `name:${visit.visitor_full_name}`;
}
