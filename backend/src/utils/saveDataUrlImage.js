import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_URL_PATTERN = /^data:image\/(png|jpe?g);base64,(.+)$/;

/**
 * Декодирует dataURL изображения (из canvas / webcam) и сохраняет его на диск.
 * Возвращает относительный путь (от uploadsDir) для хранения в БД, либо null.
 */
export function saveDataUrlImage(dataUrl, subdir, uploadsDir) {
  if (!dataUrl) return null;

  const match = DATA_URL_PATTERN.exec(dataUrl);
  if (!match) {
    throw new Error('Некорректный формат изображения');
  }

  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const buffer = Buffer.from(match[2], 'base64');

  const dir = path.join(uploadsDir, subdir);
  fs.mkdirSync(dir, { recursive: true });

  const filename = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(dir, filename), buffer);

  return path.join(subdir, filename).replace(/\\/g, '/');
}
