/** @type {import('tailwindcss').Config} */
// Визуальная система «Тишина» (design/concepts-2, вариант E): жемчужный фон, белые
// полупрозрачные поверхности, крупные скругления, один морской акцент — только для
// главного действия, фокуса и статуса «в здании»; красный — только для ошибок
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: '#E8EEF1', deep: '#DCE3E7' },
        surface: '#FFFFFF',
        ink: '#15232B',
        graphite: '#5F6E77',
        mist: '#8FA0A9',
        hair: '#DCE3E7',
        accent: { DEFAULT: '#0E6E62', deep: '#0A574D', soft: '#D6ECE8' },
        danger: { DEFAULT: '#C2453A', deep: '#9A3027', soft: '#F7E3E0' },
      },
      fontFamily: {
        sans: ['Commissioner', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        'touch-base': ['1.125rem', { lineHeight: '1.5rem' }],
        'touch-lg': ['1.375rem', { lineHeight: '1.875rem' }],
        'touch-xl': ['2.25rem', { lineHeight: '2.625rem', letterSpacing: '-0.02em' }],
      },
      borderRadius: {
        field: '1.25rem',
        card: '2.5rem',
      },
      boxShadow: {
        float: '0 1px 0 rgba(255,255,255,0.9) inset, 0 30px 60px -30px rgba(21,35,43,0.28)',
        lift: '0 10px 30px -18px rgba(21,35,43,0.35)',
      },
    },
  },
  plugins: [],
};
