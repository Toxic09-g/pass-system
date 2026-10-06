import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
// Не используется напрямую: импорт делает tailwind.config.js зависимостью этого файла,
// и Vite сам перезапускается при его изменении. Иначе запущенный frontend не видит
// новые цвета/скругления и падает с «The `…` class does not exist»
import './tailwind.config.js';

export default defineConfig(({ mode }) => {
  // Адрес backend можно переопределить в frontend/.env.local (BACKEND_URL=...),
  // например если порт 3001 на этой машине занят другим приложением
  const backendUrl = loadEnv(mode, process.cwd(), '').BACKEND_URL || 'http://localhost:3001';

  return {
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      // Порт занят — ошибка, а не тихий переезд на 5174: адрес знают другие компьютеры сети
      strictPort: true,
      proxy: {
        '/api': backendUrl,
        '/uploads': backendUrl,
      },
    },
  };
});
