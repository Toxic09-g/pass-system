// Знак бюро: круг с «окном» — порог, через который проходят
export default function BrandMark({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className="shrink-0">
      <circle cx="20" cy="20" r="20" className="fill-accent" />
      <circle cx="20" cy="20" r="7" fill="none" stroke="#FFFFFF" strokeWidth="2.6" />
    </svg>
  );
}
