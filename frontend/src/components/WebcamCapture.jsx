import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

// Пропорции окна камеры и сохраняемого снимка — портрет 3:4
const ASPECT = 3 / 4;

// Крупное окно камеры: живое видео, касание — снимок, повторное касание — переснять.
// Размер задаёт родитель (className): окно заполняет отведённое ему место.
// <video> не размонтируется, пока показан снимок: иначе при «переснять» новый элемент
// остался бы без потока камеры
const WebcamCapture = forwardRef(function WebcamCapture({ className = '' }, ref) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCamera() {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 960 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      setError('Камера недоступна');
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }

  // Сохраняем ровно то, что видно в окне: центральный портретный кадр 3:4
  function handleCapture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const { videoWidth: vw, videoHeight: vh } = video;
    const cropWidth = Math.min(vw, vh * ASPECT);
    const cropHeight = cropWidth / ASPECT;
    canvas.width = Math.round(cropWidth);
    canvas.height = Math.round(cropHeight);
    canvas
      .getContext('2d')
      .drawImage(video, (vw - cropWidth) / 2, (vh - cropHeight) / 2, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
    setCapturedImage(canvas.toDataURL('image/jpeg', 0.88));
  }

  function handleTap() {
    if (error) {
      startCamera();
    } else if (capturedImage) {
      setCapturedImage(null);
    } else {
      handleCapture();
    }
  }

  useImperativeHandle(ref, () => ({
    getImage: () => capturedImage,
    reset: () => setCapturedImage(null),
  }));

  const label = error ? 'Повторить подключение камеры' : capturedImage ? 'Переснять' : 'Сделать фото';

  return (
    <button
      type="button"
      onClick={handleTap}
      aria-label={label}
      style={{ aspectRatio: '3 / 4' }}
      className={`group relative shrink-0 overflow-hidden rounded-[1.75rem] bg-ink transition active:scale-[0.99] ${
        capturedImage ? 'ring-4 ring-accent' : ''
      } ${className}`}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`h-full w-full object-cover ${capturedImage || error ? 'invisible' : ''}`}
      />
      {capturedImage && (
        <img src={capturedImage} alt="Фото посетителя" className="absolute inset-0 h-full w-full object-cover" />
      )}

      {/* Контур для лица — чтобы посетитель встал в кадр */}
      {!capturedImage && !error && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-[42%] h-[52%] w-[62%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-dashed border-white/60"
        />
      )}

      {error && (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-danger-soft px-6 text-center text-danger-deep">
          <CameraIcon size={36} />
          <span className="text-base font-medium">{error}</span>
          <span className="text-sm">Коснитесь, чтобы подключить снова</span>
        </span>
      )}

      {/* Подпись действия внизу окна — крупная, под касание */}
      {!error && (
        <span
          className={`absolute inset-x-3 bottom-3 flex h-[clamp(44px,6vh,56px)] items-center justify-center gap-2 rounded-full text-base font-semibold ${
            capturedImage ? 'bg-surface/90 text-ink' : 'bg-accent text-surface'
          }`}
        >
          {capturedImage ? <RetakeIcon /> : <CameraIcon size={20} />}
          {label}
        </span>
      )}
      <canvas ref={canvasRef} className="hidden" />
    </button>
  );
});

function CameraIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function RetakeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <path d="M4 4v4h4" />
    </svg>
  );
}

export default WebcamCapture;
