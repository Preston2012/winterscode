/**
 * Everything the journey draws as a texture: the tool card faces and the four
 * phone screens. Drawn on 2D canvases with the site's own self-hosted fonts,
 * so the 3D type matches the HTML type exactly.
 */
import { CanvasTexture, SRGBColorSpace, LinearFilter, type Texture } from 'three';
import type { Card, Link } from './data';

export const C = {
  deep: '#0a0d0c', stone: '#11151a', card: '#161b1f', raised: '#1d2429',
  ash100: '#dde4e6', ash300: '#aab7ba', ash500: '#97a3a6', ash700: '#3a4549',
  green: '#4dd8a8', copper: '#d3823c', copperBright: '#f4a874',
  red: '#e86a6a', orange: '#f0b878', gray: '#8d9a9d',
};

const SANS = '"IBM Plex Sans", system-ui, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, monospace';
const SERIF = 'Fraunces, Georgia, serif';

export async function fontsReady(): Promise<void> {
  const f = document.fonts;
  if (!f) return;
  await Promise.race([
    Promise.all([
      f.load(`600 60px ${SANS}`), f.load(`500 30px ${SANS}`), f.load(`400 30px ${SANS}`),
      f.load(`500 28px ${MONO}`), f.load(`500 120px ${SERIF}`), f.load(`italic 500 60px ${SERIF}`),
    ]),
    new Promise((r) => setTimeout(r, 2500)),
  ]).catch(() => undefined);
}

function tex(c: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  t.minFilter = LinearFilter;
  t.generateMipmaps = false;
  return t;
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

/** Fit text by shrinking the font until it is under maxW. */
function fit(g: CanvasRenderingContext2D, text: string, font: (px: number) => string, px: number, maxW: number): number {
  let s = px;
  g.font = font(s);
  while (s > 10 && g.measureText(text).width > maxW) { s -= 2; g.font = font(s); }
  return s;
}

/**
 * Card face, transparent except the type: the card body is a lit 3D slab.
 * `aspect` is card width over height.
 */
export function cardFace(card: Card, worst: Link | null, aspect: number): Texture {
  const W = 640, H = Math.round(W / aspect);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const pad = card.kind === 'replaced' ? H * 0.42 : 56;
  // Name
  g.fillStyle = C.ash100;
  g.textBaseline = 'alphabetic';
  fit(g, card.name, (s) => `600 ${s}px ${SANS}`, 76, W - pad * 2);
  g.fillText(card.name, pad, H * 0.47);
  // Badge pill, colored by the worst link this tool sits on.
  const col = worst === 'red' ? C.red : worst === 'orange' ? C.orange : C.gray;
  const bs = fit(g, card.badge, (s) => `500 ${s}px ${MONO}`, 34, W - pad * 2 - 44);
  const bw = g.measureText(card.badge).width + 44;
  const by = H * 0.6, bh = bs + 22;
  rr(g, pad - 2, by, bw, bh, bh / 2);
  g.fillStyle = col + '24';
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = col + '88';
  g.stroke();
  g.fillStyle = col;
  g.textBaseline = 'middle';
  g.fillText(card.badge, pad + 20, by + bh / 2 + 1);
  return tex(c);
}

/** The red notification dot that pops onto a card as the knot tightens. */
export function dotTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 20, 64, 64, 64);
  grd.addColorStop(0, 'rgba(232,106,106,0.55)');
  grd.addColorStop(1, 'rgba(232,106,106,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  g.beginPath(); g.arc(64, 64, 30, 0, Math.PI * 2);
  g.fillStyle = '#e5484d'; g.fill();
  g.beginPath(); g.arc(64, 64, 30, 0, Math.PI * 2);
  g.lineWidth = 6; g.strokeStyle = '#0a0d0c'; g.stroke();
  return tex(c);
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.decoding = 'async';
    i.onload = () => res(i);
    i.onerror = () => rej(new Error(`image ${src}`));
    i.src = src;
  });
}

/**
 * The phone screen. One canvas, redrawn whenever the journey moves through
 * the phone beats: Grand, then US Survey Supply, the quote, then a text thread.
 */
export class PhoneScreen {
  readonly canvas = document.createElement('canvas');
  readonly texture: CanvasTexture;
  private g: CanvasRenderingContext2D;
  private last = '';
  constructor(private shots: { grand: HTMLImageElement; uss: HTMLImageElement; seal: HTMLImageElement }) {
    this.canvas.width = 600;
    this.canvas.height = 1276;
    this.g = this.canvas.getContext('2d')!;
    this.texture = tex(this.canvas);
  }

  /** s: 0 Grand, 1 USS, 2 quote, 3 thread (fractional values cross-fade). m: thread progress 0..1. */
  draw(s: number, m: number): void {
    const key = `${s.toFixed(3)}|${m.toFixed(3)}`;
    if (key === this.last) return;
    this.last = key;
    const { g, canvas: cv } = this;
    g.globalAlpha = 1;
    g.fillStyle = C.deep;
    g.fillRect(0, 0, cv.width, cv.height);
    // The next screen slides up over the last, the way a phone moves between
    // apps, so a visitor who stops halfway sees two clean screens, not a blur.
    const base = Math.floor(s), f = s - base;
    const e = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
    this.layer(base, m, 1 - e * 0.5, -e * cv.height * 0.25);
    if (f > 0.001 && base < 3) this.layer(base + 1, m, 1, (1 - e) * cv.height);
    g.globalAlpha = 1;
    this.texture.needsUpdate = true;
  }

  private layer(i: number, m: number, a: number, dy: number) {
    const g = this.g;
    g.save();
    g.translate(0, dy);
    g.globalAlpha = a;
    if (i === 0) this.shot(this.shots.grand);
    else if (i === 1) this.shot(this.shots.uss);
    else if (i === 2) this.quote();
    else this.thread(m);
    g.restore();
  }

  private shot(img: HTMLImageElement) {
    const { g, canvas: cv } = this;
    const s = Math.max(cv.width / img.width, cv.height / img.height);
    const w = img.width * s, h = img.height * s;
    g.drawImage(img, (cv.width - w) / 2, 0, w, h);
  }

  private check(x: number, y: number) {
    const g = this.g;
    g.beginPath();
    g.moveTo(x, y); g.lineTo(x + 11, y + 11); g.lineTo(x + 30, y - 12);
    g.lineWidth = 6; g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = C.green; g.stroke();
  }

  private quote() {
    const { g, canvas: cv } = this;
    g.fillStyle = C.stone; g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(this.shots.seal, cv.width / 2 - 70, 120, 140, 140);
    g.textAlign = 'center';
    g.fillStyle = C.copperBright;
    g.font = `500 24px ${MONO}`;
    g.fillText('MOST LOCAL SITES START AT', cv.width / 2, 330);
    g.fillStyle = C.ash100;
    g.font = `500 150px ${SERIF}`;
    g.fillText('$1,750', cv.width / 2, 500);
    g.fillStyle = C.ash500;
    g.font = `400 28px ${SANS}`;
    g.fillText('flat, with everything in', cv.width / 2, 560);
    g.textAlign = 'left';
    const rows = ['Custom code, yours to keep', 'Domain in your name', 'Pages, words, real photos', 'Set up on Google Search Console', 'Scored live on the Wall'];
    rows.forEach((r, k) => {
      const y = 690 + k * 86;
      g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(60, y + 40); g.lineTo(cv.width - 60, y + 40); g.stroke();
      this.check(70, y - 2);
      g.fillStyle = C.ash100; g.font = `500 30px ${SANS}`;
      g.fillText(r, 126, y + 8);
    });
    g.textAlign = 'center';
    g.fillStyle = C.ash300;
    g.font = `italic 500 34px ${SERIF}`;
    g.fillText('The price I quote is the price you pay.', cv.width / 2, 1170);
    g.textAlign = 'left';
  }

  private bubble(text: string[], right: boolean, y: number, a: number, rise: number) {
    const { g, canvas: cv } = this;
    if (a <= 0) return 0;
    g.save();
    g.globalAlpha *= a;
    g.font = `400 31px ${SANS}`;
    const lh = 42;
    const w = Math.max(...text.map((t) => g.measureText(t).width)) + 52;
    const h = text.length * lh + 34;
    const x = right ? cv.width - 40 - w : 40;
    const yy = y + (1 - rise) * 30;
    rr(g, x, yy, w, h, 34);
    g.fillStyle = right ? C.green : C.raised;
    g.fill();
    g.fillStyle = right ? '#062018' : C.ash100;
    text.forEach((t, k) => g.fillText(t, x + 26, yy + 50 + k * lh));
    g.restore();
    return h;
  }

  private thread(m: number) {
    const { g, canvas: cv } = this;
    g.fillStyle = C.deep; g.fillRect(0, 0, cv.width, cv.height);
    // Header: who you are texting.
    g.fillStyle = C.stone; g.fillRect(0, 0, cv.width, 210);
    g.drawImage(this.shots.seal, cv.width / 2 - 46, 44, 92, 92);
    g.textAlign = 'center';
    g.fillStyle = C.ash100; g.font = `600 30px ${SANS}`;
    g.fillText('Preston', cv.width / 2, 178);
    g.textAlign = 'left';
    const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
    const a1 = ease(m / 0.25);
    let y = 420;
    const h1 = this.bubble(['Can you put our holiday', 'hours on the site?'], true, y, a1, a1);
    y += h1 + 26;
    // Typing dots between the two messages.
    const typing = m > 0.32 && m < 0.62;
    if (typing) {
      rr(g, 40, y, 128, 70, 35); g.fillStyle = C.raised; g.fill();
      for (let k = 0; k < 3; k++) {
        const ph = (performance.now() / 380 + k * 0.33) % 1;
        g.globalAlpha = 0.4 + 0.6 * Math.max(0, Math.sin(ph * Math.PI));
        g.beginPath(); g.arc(72 + k * 32, y + 35, 9, 0, Math.PI * 2);
        g.fillStyle = C.ash300; g.fill();
      }
      g.globalAlpha = 1;
    }
    const a2 = ease((m - 0.62) / 0.25);
    this.bubble(['On it. I’ll text you', 'when it’s up.'], false, y, a2, a2);
    if (a2 > 0.6) {
      g.globalAlpha = (a2 - 0.6) / 0.4;
      g.fillStyle = C.ash500; g.font = `400 22px ${SANS}`;
      g.fillText('Preston, down the road in Bandon', 46, y + 170);
      g.globalAlpha = 1;
    }
    // Input bar.
    rr(g, 32, cv.height - 128, cv.width - 64, 80, 40);
    g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = 3; g.stroke();
    g.fillStyle = C.ash500; g.font = `400 28px ${SANS}`;
    g.fillText('Text message', 70, cv.height - 78);
  }

  /** True while the thread is animating on its own (typing dots). */
  live(s: number, m: number): boolean { return s > 2.5 && m > 0.32 && m < 0.62; }
}
