/**
 * Journey boot. Runs on every visit; the 3D stage and the head tracker load
 * only when they can run.
 *
 * Static first: the page is complete HTML with every word in it, so a search
 * engine, a screen reader, an old phone or a visitor who asked for less
 * motion gets the whole story as plain sections. The 3D stage takes over only
 * once it has drawn its first frame, and if anything fails on the way the
 * page stays static instead of going blank.
 */
const root = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const params = new URLSearchParams(location.search);

function fallback(reason: string) {
  if (root.classList.contains('ready')) return;
  root.classList.add('static');
  root.classList.remove('booting');
  const note = document.getElementById('static-note');
  if (note) note.textContent = `Plain view: ${reason}.`;
}

function webgl2(): boolean {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}

const beats = Array.from(document.querySelectorAll<HTMLElement>('.beat'));
const rail = Array.from(document.querySelectorAll<HTMLButtonElement>('.rail button'));

rail.forEach((b, i) => b.addEventListener('click', () => beats[i]?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' })));

let unit = 1;
const measure = () => { unit = Math.max(1, (beats[1]?.offsetTop ?? innerHeight) - (beats[0]?.offsetTop ?? 0)); };
measure();
addEventListener('resize', measure);

function beatNow(): number { return scrollY / unit; }

function markRail(t: number) {
  const i = Math.round(t);
  rail.forEach((b, k) => b.setAttribute('aria-current', k === i ? 'step' : 'false'));
  root.style.setProperty('--beat', t.toFixed(3));
}
markRail(beatNow());

if (reduce || params.has('static')) fallback(reduce ? 'your device asks for less motion' : 'requested');
else if (!webgl2()) fallback('this browser cannot draw the 3D view');
else boot();

async function boot() {
  root.classList.add('booting');
  const timer = setTimeout(() => fallback('the 3D view took too long to load'), 15000);
  try {
    const { Stage } = await import('./stage');
    const canvas = document.getElementById('stage') as HTMLCanvasElement;
    const stage = new Stage(canvas);
    stage.onLost = () => fallback('the graphics card reset');
    await stage.init({
      photo: innerWidth / innerHeight < 0.85 ? '/photo/local/facerock-sunset-768.webp' : '/photo/local/facerock-sunset-1600.webp',
      grand: '/work/grand-phone-400.webp',
      uss: '/work/uss-phone-400.webp',
      seal: '/wc-seal-256.webp',
    });
    stage.setScroll(beatNow());
    stage.onBeat = markRail;
    stage.renderOnce();
    clearTimeout(timer);
    if (root.classList.contains('static')) return;
    root.classList.remove('booting');
    root.classList.add('ready');
    stage.start();
    wire(stage);
  } catch (e) {
    console.error(e);
    clearTimeout(timer);
    fallback('the 3D view could not start');
  }
}

type StageT = InstanceType<Awaited<typeof import('./stage')>['Stage']>;

function wire(stage: StageT) {
  addEventListener('scroll', () => stage.setScroll(beatNow()), { passive: true });

  const canvasNdc = (e: PointerEvent | MouseEvent) => [(e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1] as const;
  let headOn = false;

  // Pointer: lean with the mouse. Taps reach the cards through the text layer.
  addEventListener('pointermove', (e) => {
    const [x, y] = canvasNdc(e);
    stage.pointer(x, y);
    if (!headOn && e.pointerType === 'mouse') stage.look(x, y, 1, 0.6);
    document.body.classList.toggle('over-card', stage.hovering);
  }, { passive: true });
  addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    if (el.closest('a, button, input, textarea, label')) return;
    const [x, y] = canvasNdc(e);
    stage.tap(x, y);
  });

  // Tilt: Android sends orientation with no prompt; iOS needs a tap to ask.
  let base: number | null = null;
  const onTilt = (e: DeviceOrientationEvent) => {
    if (headOn || e.gamma == null || e.beta == null) return;
    base = base == null ? e.beta : base + (e.beta - base) * 0.01; // drift back to however you hold it
    stage.look(e.gamma / 25, -(e.beta - base) / 22, 1, 0.9);
  };
  const tiltBtn = document.getElementById('tilt') as HTMLButtonElement | null;
  const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
  if (matchMedia('(pointer: coarse)').matches && DOE) {
    if (typeof DOE.requestPermission === 'function' && tiltBtn) {
      tiltBtn.hidden = false;
      tiltBtn.addEventListener('click', async () => {
        try {
          if ((await DOE.requestPermission!()) === 'granted') { addEventListener('deviceorientation', onTilt); tiltBtn.hidden = true; }
        } catch { tiltBtn.hidden = true; }
      });
    } else {
      addEventListener('deviceorientation', onTilt);
    }
  }

  // Head tracking, opt-in.
  const headBtn = document.getElementById('head') as HTMLButtonElement | null;
  const video = document.getElementById('cam') as HTMLVideoElement | null;
  const label = headBtn?.querySelector('.lbl');
  if (headBtn && video && navigator.mediaDevices?.getUserMedia) {
    headBtn.hidden = false;
    let tracker: { stop(): void } | null = null;
    const set = (s: string, txt: string) => { headBtn.dataset.state = s; if (label) label.textContent = txt; };
    headBtn.addEventListener('click', async () => {
      if (tracker) { tracker.stop(); tracker = null; headOn = false; root.classList.remove('cam-on'); set('off', 'Look through the window'); return; }
      if (headBtn.dataset.state === 'loading') return;
      set('loading', 'Starting the camera');
      try {
        const { startHead } = await import('./head');
        tracker = await startHead(video, (h) => {
          if (!h.ok) return;
          headOn = true;
          stage.look(h.x * 1.8, h.y * 1.8, h.z, 1);
        });
        root.classList.add('cam-on');
        set('on', 'Camera on. Tap to stop');
      } catch (e) {
        console.warn(e);
        tracker = null;
        set('off', (e as Error)?.name === 'NotAllowedError' ? 'Camera not allowed' : 'Camera unavailable');
      }
    });
  }
}
