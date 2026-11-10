/**
 * Look through the window: head tracking, opt-in only.
 *
 * Nothing here loads until the visitor taps the button. The camera picture
 * never leaves the device: MediaPipe's face detector runs in this tab from
 * files served by winterscode.com, and only the face box is kept, as a head
 * position the 3D view reads to shift its perspective.
 */
export interface Head { x: number; y: number; z: number; ok: boolean }

export interface HeadTracker { stop(): void }

// The wasm runtime is copied from node_modules at build (scripts/copy-mediapipe.mjs);
// the face model (Apache-2.0, MediaPipe BlazeFace short range) is committed beside it.
const BASE = '/journey/mp';

export async function startHead(video: HTMLVideoElement, onHead: (h: Head) => void): Promise<HeadTracker> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();

  const { FilesetResolver, FaceDetector } = await import('@mediapipe/tasks-vision');
  const files = await FilesetResolver.forVisionTasks(BASE);
  const make = (delegate: 'GPU' | 'CPU') => FaceDetector.createFromOptions(files, {
    baseOptions: { modelAssetPath: '/journey/blaze_face_short_range.tflite', delegate },
    runningMode: 'VIDEO',
    minDetectionConfidence: 0.5,
  });
  let det;
  try { det = await make('GPU'); } catch { det = await make('CPU'); }

  let raf = 0, lastT = -1, stopped = false, miss = 0;
  const loop = () => {
    if (stopped) return;
    raf = requestAnimationFrame(loop);
    if (video.readyState < 2 || video.currentTime === lastT) return;
    lastT = video.currentTime;
    const r = det.detectForVideo(video, performance.now());
    const d = r.detections[0]?.boundingBox;
    if (!d) { if (++miss > 20) onHead({ x: 0, y: 0, z: 1, ok: false }); return; }
    miss = 0;
    const vw = video.videoWidth || 640, vh = video.videoHeight || 480;
    const cx = (d.originX + d.width / 2) / vw;
    const cy = (d.originY + d.height / 2) / vh;
    // The front camera sees you mirrored: your move to the right is its left.
    onHead({ x: (0.5 - cx) * 2, y: (0.5 - cy) * 2, z: 0.26 / Math.max(0.08, d.width / vw), ok: true });
  };
  loop();

  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      det.close();
    },
  };
}
