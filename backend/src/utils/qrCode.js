import QRCode from 'qrcode';

export function generateQrDataUrl(value) {
  return QRCode.toDataURL(value, { margin: 1, width: 240 });
}
