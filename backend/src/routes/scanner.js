import { Router } from 'express';

// Открытые страницы подписываются на результаты сканов (Server-Sent Events):
// скан со сканера в режиме USB COM обрабатывает backend, а страница только показывает итог
const clients = new Set();
const HEARTBEAT_MS = 25000;

export function broadcastScanResult(result) {
  const message = `data: ${JSON.stringify(result)}\n\n`;
  for (const res of clients) res.write(message);
}

const router = Router();

// GET /api/scanner/events — поток результатов сканов
router.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(': connected\n\n');
  clients.add(res);

  // Комментарий-пинг, чтобы соединение не закрыли по простою
  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
});

export default router;
