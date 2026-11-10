/**
 * The journey's 3D stage.
 *
 * The screen is a window. The camera is the visitor's eye, and every frame
 * the projection is rebuilt off-axis from where that eye is (pointer, phone
 * tilt, or the opt-in head tracker), so the scene behind the glass shifts the
 * way a real view does when you lean. Behind it all sits Face Rock at sunset,
 * a real Bandon photo laid on a depth-shaped grid so the sea and the grass
 * move against the sky.
 *
 * Every visual is a pure function of one number, t, the scroll position in
 * beats (0 = the opening, 8 = the close). Scroll back and it all plays in
 * reverse. Nothing is time-based except idle sway, the typing dots and the
 * text thread once you reach it.
 *
 *   0  window      the H1 over a calm view
 *   1  the pile    16 tools fly in, cables grow between them
 *   2  the knot    it tightens, notifications pop
 *   3  one pull    the copper thread pulls, 8 tools fall away, 8 ring the seal
 *   4  one site    the ring folds into a phone: Grand Management
 *   5  fast        US Survey Supply
 *   6  the price   the quote screen
 *   7  a text      a text thread plays
 *   8  the close   the window clears back to the view
 */
import {
  ACESFilmicToneMapping, Color, DirectionalLight, ExtrudeGeometry, Group, HemisphereLight,
  Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry,
  PMREMGenerator, Raycaster, Scene, ShaderMaterial, Shape, SRGBColorSpace, Texture, TextureLoader,
  Vector2, Vector3, WebGLRenderer, BufferAttribute, LinearMipmapLinearFilter, type Material,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CARDS, LINKS, RING, hash, type Card, type Link } from './data';
import { LiveTube } from './tube';
import { C, PhoneScreen, cardFace, dotTexture, fontsReady, loadImage } from './textures';

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ss = (a: number, b: number, x: number) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
const easeOut = (k: number) => 1 - Math.pow(1 - clamp(k), 3);
const easeInOut = (k: number) => { k = clamp(k); return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };
const backOut = (k: number) => { k = clamp(k); const c = 1.6; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

const H = 10; // world height of the window at the screen plane
const HORIZON = 0.502; // where the sea meets the sky in the Face Rock photo, from the bottom

interface Tile {
  card: Card; worst: Link | null; group: Group; body: Mesh; face: Mesh; dot: Mesh;
  mats: Material[]; h: number[]; ring: number; hover: number; kick: number;
  pos: Vector3;
}

export interface StageOpts { photo: string; grand: string; uss: string; seal: string }

export class Stage {
  readonly renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera();
  private tiles: Tile[] = [];
  private byId = new Map<string, Tile>();
  private links: { a: Tile; b: Tile; kind: Link; tube: LiveTube; mesh: Mesh; off: Vector3[]; h: number }[] = [];
  private strands: { tube: LiveTube; mesh: Mesh; pts: Vector3[]; ctrl: Vector3[]; a: Tile; b: Tile; pull: boolean }[] = [];
  private syncs: { tube: LiveTube; mesh: Mesh; tile: Tile }[] = [];
  private seal!: Mesh;
  private phone = new Group();
  private screen!: PhoneScreen;
  private photo!: Mesh;
  private photoMat!: ShaderMaterial;
  private photoKey = '';
  private ray = new Raycaster();
  private ndc = new Vector2(9, 9);
  private tapAt: Vector2 | null = null;

  // Layout, recomputed on resize.
  private W = 16; private D = 14; private portrait = false; private scale = 1;
  private focus = new Vector3();

  // Inputs.
  private tTarget = 0; private t = 0;
  private eyeT = new Vector3(0, 0, 1); private eye = new Vector3(0, 0, 1);
  private inputAt = -1e9; private gain = 0.35;
  private threadClock = -1;
  private last = performance.now();
  private raf = 0;
  private running = false;
  private tmpA = new Vector3(); private tmpB = new Vector3();
  private pts: Vector3[] = Array.from({ length: 65 }, () => new Vector3());

  /** Called each frame with the smoothed beat position, for the HTML chrome. */
  onBeat: (t: number) => void = () => {};

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.setClearColor(new Color(C.deep));
    this.camera.matrixAutoUpdate = true;
  }

  async init(o: StageOpts): Promise<void> {
    const [photoTex, grand, uss, seal] = await Promise.all([
      new TextureLoader().loadAsync(o.photo), loadImage(o.grand), loadImage(o.uss), loadImage(o.seal), fontsReady(),
    ]);
    photoTex.colorSpace = SRGBColorSpace;
    photoTex.minFilter = LinearMipmapLinearFilter;
    photoTex.anisotropy = 8;

    const pm = new PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.3;
    pm.dispose();
    // The sun is in the photo, low and behind everything: it rims the cards and the
    // phone from behind. A soft cool fill from the viewer's side keeps faces readable.
    const sun = new DirectionalLight(new Color('#ffb27a'), 3.2);
    sun.position.set(3, 2.5, -10);
    const fill = new DirectionalLight(new Color('#c9dcff'), 0.55);
    fill.position.set(-2, 4, 10);
    this.scene.add(sun, fill, new HemisphereLight(new Color('#9fc4ff'), new Color('#20160f'), 0.45));

    this.buildPhoto(photoTex);
    this.buildTiles();
    this.buildCables();
    this.buildSeal(seal);
    this.buildPhone(grand, uss, seal);
    this.resize();
    addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => (document.hidden ? this.stop() : this.start()));
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.stop(); this.onLost(); });
  }

  onLost: () => void = () => {};

  // ───────────────────────── inputs ─────────────────────────

  setScroll(t: number) { this.tTarget = clamp(t, 0, 8); }

  /** x, y in -1..1 (right and up positive), z = distance factor (1 = normal). */
  look(x: number, y: number, z: number, gain: number) {
    this.eyeT.set(clamp(x, -1, 1), clamp(y, -1, 1), clamp(z, 0.8, 1.5));
    this.gain = gain;
    this.inputAt = performance.now();
  }

  pointer(nx: number, ny: number) { this.ndc.set(nx, ny); }
  tap(nx: number, ny: number) { this.tapAt = new Vector2(nx, ny); }
  hovering = false;

  // ───────────────────────── build ─────────────────────────

  private buildPhoto(tex: Texture) {
    this.photoMat = new ShaderMaterial({
      uniforms: { map: { value: tex }, dim: { value: 0.3 }, blur: { value: 0 }, time: { value: 0 }, tint: { value: new Color(C.deep) } },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform sampler2D map; uniform float dim; uniform float blur; uniform float time; uniform vec3 tint;
        varying vec2 vUv;
        void main() {
          vec2 uv = vUv;
          // The sea breathes: a faint ripple below the horizon, none on the grass or the sky.
          float sea = smoothstep(${(HORIZON + 0.004).toFixed(3)}, ${(HORIZON - 0.04).toFixed(3)}, uv.y) * smoothstep(0.12, 0.24, uv.y);
          uv.x += sin(uv.y * 900.0 + time * 1.6 + uv.x * 30.0) * 0.00042 * sea;
          uv.y += sin(uv.x * 260.0 - time * 1.1) * 0.00025 * sea;
          vec3 c = texture2D(map, uv, blur).rgb;
          float l = dot(c, vec3(0.299, 0.587, 0.114));
          c = mix(c, vec3(l), dim * 0.45);
          c = mix(c, tint, dim);
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
      depthWrite: false,
      depthTest: false,
    });
    this.photo = new Mesh(new PlaneGeometry(1, 1, 1, 1), this.photoMat);
    this.photo.renderOrder = -10;
    this.photo.frustumCulled = false;
    this.scene.add(this.photo);
  }

  /** Lay the photo on a grid shaped like the scene: sky far, sea nearer toward the shore, grass closest. */
  private shapePhoto() {
    const key = `${this.W.toFixed(2)}|${this.D.toFixed(2)}`;
    if (key === this.photoKey) return;
    this.photoKey = key;
    // Overscan so leaning never shows an edge. With the sky at depth 30 and the eye
    // held to 0.16W, 0.12H and 0.8 to 1.5 times its distance, 1.35 covers every corner.
    const over = 1.35;
    let hc = H * over, wc = hc * 16 / 9;
    if (wc < this.W * over) { wc = this.W * over; hc = wc * 9 / 16; }
    const sx = 160, sy = 120;
    const g = new PlaneGeometry(1, 1, sx, sy);
    const p = g.attributes.position as BufferAttribute;
    const uv = g.attributes.uv as BufferAttribute;
    const D = this.D;
    for (let i = 0; i < p.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      const d = v >= HORIZON ? 30 : Math.min(30, Math.max(4.4, 2.3 / (HORIZON - v + 0.02)));
      const k = (D + d) / D;
      p.setXYZ(i, (u - 0.5) * wc * k, (v - 0.5) * hc * k, -d);
    }
    p.needsUpdate = true;
    this.photo.geometry.dispose();
    this.photo.geometry = g;
  }

  private shape(w: number, h: number, r: number): Shape {
    const s = new Shape();
    const x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }

  private buildTiles() {
    // Kept tools are rounded squares, replaced ones are pills: shape, not color, carries the difference.
    const dims = { kept: [1.9, 1.2, 0.22], replaced: [2.4, 0.9, 0.45] } as const;
    const geo = {
      kept: new ExtrudeGeometry(this.shape(1.9, 1.2, 0.22), { depth: 0.1, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelSegments: 3, curveSegments: 10 }),
      replaced: new ExtrudeGeometry(this.shape(2.4, 0.9, 0.45), { depth: 0.1, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelSegments: 3, curveSegments: 14 }),
    };
    geo.kept.translate(0, 0, -0.05); geo.replaced.translate(0, 0, -0.05);
    const dot = dotTexture();
    const worstOf = (id: string): Link | null => {
      const ks = LINKS.filter((l) => l.from === id || l.to === id).map((l) => l.kind);
      return ks.includes('red') ? 'red' : ks.includes('orange') ? 'orange' : ks.length ? 'gray' : null;
    };
    for (const card of CARDS) {
      const [w, h] = dims[card.kind];
      const worst = worstOf(card.id);
      const bodyMat = new MeshStandardMaterial({ color: new Color('#12171b'), roughness: 0.55, metalness: 0.15, envMapIntensity: 0.7, transparent: true });
      const body = new Mesh(geo[card.kind], bodyMat);
      const faceMat = new MeshBasicMaterial({ map: cardFace(card, worst, w / h), transparent: true, toneMapped: false, depthWrite: false });
      const face = new Mesh(new PlaneGeometry(w, h), faceMat);
      face.position.z = 0.09;
      const dotMat = new MeshBasicMaterial({ map: dot, transparent: true, toneMapped: false, depthWrite: false });
      const dm = new Mesh(new PlaneGeometry(0.62, 0.62), dotMat);
      dm.position.set(w / 2 - 0.12, h / 2 - 0.1, 0.12);
      const group = new Group();
      group.add(body, face, dm);
      body.userData.tile = card.id;
      this.scene.add(group);
      const t: Tile = {
        card, worst, group, body, face, dot: dm, mats: [bodyMat, faceMat, dotMat],
        h: [0, 1, 2, 3, 4, 5].map((s) => hash(card.id, s)), ring: RING.indexOf(card.id), hover: 0, kick: 0,
        pos: new Vector3(),
      };
      this.tiles.push(t);
      this.byId.set(card.id, t);
    }
  }

  private cableMat(color: string, emissive = 0.15) {
    return new MeshStandardMaterial({
      color: new Color(color), emissive: new Color(color), emissiveIntensity: emissive,
      roughness: 0.5, metalness: 0.1, transparent: true,
    });
  }

  private buildCables() {
    const col: Record<Link, string> = { red: C.red, orange: C.orange, gray: '#56646a' };
    for (const l of LINKS) {
      const tube = new LiveTube(28, 6);
      const mesh = new Mesh(tube.geometry, this.cableMat(col[l.kind], l.kind === 'gray' ? 0.02 : 0.22));
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      const h = hash(l.from + l.to);
      const off = [1, 2].map((s) => new Vector3(hash(l.from + l.to, s) * 2 - 1, hash(l.to + l.from, s) * 2 - 1.5, hash(l.from, s + 9) * 2 - 1));
      this.links.push({ a: this.byId.get(l.from)!, b: this.byId.get(l.to)!, kind: l.kind, tube, mesh, off, h });
    }
    // The knot: long strands looping through the middle, each tied to two tools.
    // Strand 0 is copper. It is the one that gets pulled.
    for (let s = 0; s < 7; s++) {
      const tube = new LiveTube(64, 6);
      const pull = s === 0;
      const mesh = new Mesh(tube.geometry, this.cableMat(pull ? C.copper : s % 2 ? '#3d4a50' : '#4a3a33', pull ? 0.35 : 0.04));
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      const pts = Array.from({ length: 6 }, (_, k) => new Vector3(
        hash(`k${s}`, k) * 2 - 1, hash(`k${s}`, k + 20) * 2 - 1, hash(`k${s}`, k + 40) * 2 - 1,
      ));
      const a = this.tiles[Math.floor(hash(`a${s}`) * 16)];
      let b = this.tiles[Math.floor(hash(`b${s}`) * 16)];
      if (b === a) b = this.tiles[(this.tiles.indexOf(a) + 7) % 16];
      this.strands.push({ tube, mesh, pts, ctrl: Array.from({ length: pts.length + 2 }, () => new Vector3()), a, b, pull });
    }
    // Clean green lines from the seal to each kept tool, for after the pull.
    for (const id of RING) {
      const tube = new LiveTube(16, 6);
      const mesh = new Mesh(tube.geometry, this.cableMat(C.green, 0.6));
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.syncs.push({ tube, mesh, tile: this.byId.get(id)! });
    }
  }

  private buildSeal(img: HTMLImageElement) {
    const tex = new Texture(img);
    tex.colorSpace = SRGBColorSpace;
    tex.needsUpdate = true;
    this.seal = new Mesh(new PlaneGeometry(2, 2), new MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }));
    this.scene.add(this.seal);
  }

  private buildPhone(grand: HTMLImageElement, uss: HTMLImageElement, seal: HTMLImageElement) {
    this.screen = new PhoneScreen({ grand, uss, seal });
    const body = new Mesh(
      new RoundedBoxGeometry(2.34, 4.84, 0.26, 6, 0.34),
      new MeshPhysicalMaterial({ color: new Color('#1b2227'), metalness: 0.7, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.15 }),
    );
    const bezel = new Mesh(new PlaneGeometry(2.2, 4.7), new MeshBasicMaterial({ color: new Color('#050707'), toneMapped: false }));
    bezel.position.z = 0.132;
    const scr = new Mesh(new PlaneGeometry(2.1, 4.466), new MeshBasicMaterial({ map: this.screen.texture, toneMapped: false }));
    scr.position.z = 0.134;
    // Rounded screen corners: mask with the bezel color at the corners via a shaped plane.
    const g = new ExtrudeGeometry(this.shape(2.1, 4.466, 0.22), { depth: 0, bevelEnabled: false, curveSegments: 10 });
    const uv = g.attributes.uv as BufferAttribute;
    const pp = g.attributes.position as BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pp.getX(i) / 2.1 + 0.5, pp.getY(i) / 4.466 + 0.5);
    scr.geometry = g;
    this.phone.add(body, bezel, scr);
    this.phone.visible = false;
    this.scene.add(this.phone);
  }

  // ───────────────────────── frame ─────────────────────────

  resize() {
    const w = innerWidth, h = innerHeight;
    const aspect = w / h;
    this.portrait = aspect < 0.85;
    this.W = H * aspect;
    const fov = this.portrait ? 52 : 38;
    this.D = (H / 2) / Math.tan((fov * Math.PI) / 360);
    this.scale = this.portrait ? clamp(this.W / 7.4, 0.5, 0.75) : clamp(this.W / 17.8, 0.72, 1);
    this.focus.set(this.portrait ? 0 : this.W * 0.22, this.portrait ? H * 0.15 : 0, 0);
    const dpr = Math.min(devicePixelRatio || 1, this.portrait ? 2 : 1.5);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.shapePhoto();
  }

  start() {
    if (this.running || document.hidden) return;
    this.running = true;
    this.last = performance.now();
    const loop = () => { if (!this.running) return; this.raf = requestAnimationFrame(loop); this.frame(); };
    loop();
  }

  stop() { this.running = false; cancelAnimationFrame(this.raf); }

  renderOnce() { this.frame(); }

  private frame() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const time = now / 1000;
    this.t += (this.tTarget - this.t) * (1 - Math.exp(-dt * 7));
    if (Math.abs(this.tTarget - this.t) < 1e-4) this.t = this.tTarget;
    const t = this.t;
    this.onBeat(t);

    // ── eye ──
    const idle = now - this.inputAt > 3500;
    const tgt = idle
      ? this.tmpA.set(Math.sin(time * 0.23) * 0.5, Math.sin(time * 0.17 + 1) * 0.35, 1)
      : this.eyeT;
    const g = idle ? 0.4 : this.gain;
    this.eye.x += (tgt.x * g - this.eye.x) * (1 - Math.exp(-dt * 5));
    this.eye.y += (tgt.y * g - this.eye.y) * (1 - Math.exp(-dt * 5));
    this.eye.z += ((idle ? 1 : tgt.z) - this.eye.z) * (1 - Math.exp(-dt * 4));
    const W = this.W, D = this.D;
    // The photo is built to cover the window for an eye anywhere in this box (see shapePhoto).
    const ex = this.eye.x * W * 0.16, ey = this.eye.y * H * 0.12, ez = D * this.eye.z;
    const n = 0.1, f = 400;
    this.camera.position.set(ex, ey, ez);
    this.camera.quaternion.identity();
    this.camera.updateMatrixWorld();
    this.camera.projectionMatrix.makePerspective(
      ((-W / 2 - ex) * n) / ez, ((W / 2 - ex) * n) / ez, ((H / 2 - ey) * n) / ez, ((-H / 2 - ey) * n) / ez, n, f,
    );
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();

    // ── window ──
    const dim = lerp(lerp(0.3, 0.8, ss(0.15, 1.3, t)), 0.04, ss(7.15, 8, t));
    this.photoMat.uniforms.dim.value = dim;
    this.photoMat.uniforms.blur.value = 2.6 * ss(0.4, 1.6, t) * (1 - ss(7.0, 7.9, t));
    this.photoMat.uniforms.time.value = time;

    const s = this.scale, F = this.focus;
    const knot = ss(1.0, 2.0, t);
    const pullGlow = ss(1.7, 2.05, t);
    const fold = ss(3.12, 3.68, t);

    // ── hover and tap ──
    let hovered: Tile | null = null;
    if (t < 2.1) {
      this.ray.setFromCamera(this.ndc, this.camera);
      const hit = this.ray.intersectObjects(this.tiles.map((x) => x.body), false)[0];
      if (hit) hovered = this.byId.get(hit.object.userData.tile) ?? null;
      if (this.tapAt) {
        this.ray.setFromCamera(this.tapAt, this.camera);
        const th = this.ray.intersectObjects(this.tiles.map((x) => x.body), false)[0];
        if (th) { const tt = this.byId.get(th.object.userData.tile); if (tt) tt.kick = 1; }
      }
    }
    this.tapAt = null;
    this.hovering = !!hovered;

    // ── tiles ──
    for (const tile of this.tiles) {
      const [h0, h1, h2, h3, h4, h5] = tile.h;
      const enter = easeOut((t - 0.12 - h0 * 0.5) / 0.6);
      // Desktop keeps the pile mostly right of the text column; phones use the full width.
      const mx = this.portrait ? (tile.card.x / 100 - 0.5) * W * 0.98 : lerp(-0.3, 0.46, tile.card.x / 100) * W;
      const my = (0.5 - tile.card.y / 100) * H * (this.portrait ? 0.86 : 0.84) + (this.portrait ? H * 0.04 : 0);
      const mz = -2.4 + h1 * 3.6;
      // Flying in from beside the viewer.
      const sx = mx * 2.2 + (h2 - 0.5) * 4, sy = my * 2.2 + (h3 - 0.5) * 3, sz = D * 0.85;
      let x = lerp(sx, mx, enter), y = lerp(sy, my, enter), z = lerp(sz, mz, enter);
      // The knot pulls everything inward and closer.
      x = lerp(x, x * 0.74 + F.x * 0.1, knot); y = lerp(y, y * 0.74 + F.y * 0.1, knot); z += knot * 0.9;
      const shake = knot * (1 - ss(2.0, 2.4, t)) * 0.05;
      x += Math.sin(time * 33 + h4 * 20) * shake; y += Math.cos(time * 29 + h5 * 20) * shake;
      // Sway.
      const sway = 1 - ss(2.1, 2.8, t);
      y += Math.sin(time * 0.6 + h4 * 6) * 0.08 * sway;
      let rz = (tile.card.rot * Math.PI) / 180, rx = (h2 - 0.5) * 0.5 + Math.sin(time * 0.5 + h5 * 5) * 0.05 * sway, ry = (h3 - 0.5) * 0.7;
      let sc = s, op = enter > 0.001 ? 1 : 0, dotS = ss(1.15 + h0 * 0.6, 1.35 + h0 * 0.6, t);
      // Tap: a little jolt and its notification lights up.
      tile.kick *= Math.exp(-dt * 3.2);
      if (tile.kick > 0.01) { rz += Math.sin(time * 38) * tile.kick * 0.22; z += tile.kick * 0.6; dotS = Math.max(dotS, tile.kick); }
      tile.hover += ((hovered === tile ? 1 : 0) - tile.hover) * (1 - Math.exp(-dt * 10));
      z += tile.hover * 0.55; sc *= 1 + tile.hover * 0.06; rx *= 1 - tile.hover; ry *= 1 - tile.hover;

      // The pull.
      if (tile.card.kind === 'replaced') {
        const fall = clamp((t - 2.05 - h1 * 0.3) / 0.7);
        y -= fall * fall * H * 1.25;
        rx += fall * 2.4; rz += fall * (h2 - 0.5) * 3;
        op *= 1 - ss(0.5, 1, fall);
      } else {
        const u = easeInOut((t - 2.05 - h1 * 0.12) / 0.72);
        const a = Math.PI * 0.75 - (tile.ring / RING.length) * Math.PI * 2;
        const R = this.portrait ? Math.min(W * 0.33, H * 0.26) : Math.min(W * 0.17, H * 0.32);
        const rxp = F.x + Math.cos(a) * R * (this.portrait ? 1.05 : 1.2), ryp = F.y + Math.sin(a) * R, rzp = 0.4;
        x = lerp(x, rxp, u); y = lerp(y, ryp, u); z = lerp(z, rzp, u);
        rz = lerp(rz, 0, u); rx = lerp(rx, 0, u); ry = lerp(ry, 0, u);
        sc = lerp(sc, s * (this.portrait ? 0.72 : 0.78), u);
        dotS *= 1 - ss(0, 0.5, u);
        // Fold into the phone.
        const fk = easeInOut(fold - tile.ring * 0.02);
        x = lerp(x, F.x, fk); y = lerp(y, F.y, fk); z = lerp(z, 0.2, fk);
        sc *= 1 - fk * 0.85;
        op *= 1 - ss(0.55, 1, fk);
      }
      tile.group.position.set(x, y, z);
      tile.pos.copy(tile.group.position);
      tile.group.rotation.set(rx, ry, rz);
      tile.group.scale.setScalar(Math.max(0.0001, sc));
      tile.group.visible = op > 0.004;
      (tile.mats[0] as MeshStandardMaterial).opacity = op;
      (tile.mats[1] as MeshBasicMaterial).opacity = op;
      tile.dot.scale.setScalar(Math.max(0.0001, backOut(dotS)));
      (tile.mats[2] as MeshBasicMaterial).opacity = op * clamp(dotS * 3);
    }

    // ── cables ──
    const straight = 1 - ss(1.9, 2.4, t);
    const cableOp = 1 - ss(2.15, 2.6, t);
    for (const l of this.links) {
      const grow = ss(0.45 + l.h * 0.5, 1.15 + l.h * 0.5, t);
      l.mesh.visible = grow > 0.001 && cableOp > 0.004;
      if (!l.mesh.visible) continue;
      const A = l.a.pos, B = l.b.pos;
      const len = A.distanceTo(B);
      const amp = (0.25 + len * 0.18) * straight * (1 + knot * 0.5) * s;
      const p0 = A, p3 = B;
      const p1 = this.tmpA.lerpVectors(A, B, 0.33).addScaledVector(l.off[0], amp);
      const p2 = this.tmpB.lerpVectors(A, B, 0.66).addScaledVector(l.off[1], amp);
      this.bezier(p0, p1, p2, p3, l.tube.segments);
      l.tube.update(this.pts, 0.03 * s);
      l.tube.grow(grow);
      (l.mesh.material as MeshStandardMaterial).opacity = cableOp * (l.kind === 'gray' ? 0.6 : 0.95);
    }
    const pull = ss(2.0, 2.8, t);
    for (const st of this.strands) {
      const grow = ss(0.65, 1.55, t);
      const op = st.pull ? 1 - ss(2.6, 2.9, t) : 1 - ss(2.1, 2.55, t);
      st.mesh.visible = grow > 0.001 && op > 0.004;
      if (!st.mesh.visible) continue;
      const r = (this.portrait ? Math.min(W * 0.36, H * 0.22) : Math.min(W * 0.17, H * 0.3)) * (1 - knot * 0.25);
      const cx = this.portrait ? 0 : F.x * 0.35, cy = this.portrait ? H * 0.06 : 0, cz = -0.6 + knot * 0.6;
      const ctrl = st.ctrl;
      ctrl[0].copy(st.a.pos);
      st.pts.forEach((p, k) => ctrl[k + 1].set(cx + p.x * r * 1.3, cy + p.y * r, cz + p.z * r * 0.8));
      ctrl[ctrl.length - 1].copy(st.b.pos);
      const N = st.tube.segments;
      for (let i = 0; i <= N; i++) this.catmull(ctrl, i / N, this.pts[i]);
      if (st.pull) {
        // Pulled taut, then drawn out of the frame to the right.
        const taut = ss(0, 0.55, pull), out = ss(0.4, 1, pull);
        for (let i = 0; i <= N; i++) {
          const k = i / N;
          const lx = lerp(-W * 0.55, W * 0.7, k) + out * W * 1.3, ly = F.y + (this.portrait ? 0 : 0), lz = 0.8;
          this.pts[i].set(lerp(this.pts[i].x, lx, taut), lerp(this.pts[i].y, ly, taut), lerp(this.pts[i].z, lz, taut));
        }
      } else {
        // The rest go slack and drop.
        const drop = ss(0.1, 1, pull);
        for (let i = 0; i <= N; i++) this.pts[i].y -= drop * drop * H * 0.9 * Math.sin((i / N) * Math.PI);
      }
      const thick = (st.pull ? 0.05 : 0.036) * s * (st.pull ? 1 + pullGlow * 0.4 : 1);
      st.tube.update(this.pts, (k) => thick * (0.6 + 0.4 * Math.sin(Math.PI * k)));
      st.tube.grow(grow);
      const m = st.mesh.material as MeshStandardMaterial;
      m.opacity = op;
      if (st.pull) m.emissiveIntensity = 0.35 + pullGlow * (1.6 + Math.sin(time * 6) * 0.3);
    }
    // Sync lines, seal to each kept tool.
    const syncG = ss(2.6, 3.05, t);
    for (const sy of this.syncs) {
      const op = 1 - ss(3.1, 3.45, t);
      sy.mesh.visible = syncG > 0.001 && op > 0.004;
      if (!sy.mesh.visible) continue;
      const N = sy.tube.segments;
      for (let i = 0; i <= N; i++) this.pts[i].lerpVectors(F, sy.tile.pos, i / N).setZ(lerp(0.3, sy.tile.pos.z - 0.05, i / N));
      sy.tube.update(this.pts, 0.022 * s);
      sy.tube.grow(syncG);
      (sy.mesh.material as MeshStandardMaterial).opacity = op;
    }

    // ── seal ──
    const sealIn = backOut(ss(2.4, 2.95, t));
    const sealS = sealIn * (1 - easeInOut(fold)) * s * (this.portrait ? 0.9 : 1.15);
    this.seal.visible = sealS > 0.002;
    this.seal.position.set(F.x, F.y, 0.3);
    this.seal.rotation.z = -0.08 + Math.sin(time * 0.4) * 0.04;
    this.seal.scale.setScalar(Math.max(0.0001, sealS));

    // ── phone ──
    const ap = easeOut(ss(3.3, 3.95, t));
    const leave = ss(7.2, 7.95, t);
    this.phone.visible = ap > 0.002 && leave < 0.999;
    if (this.phone.visible) {
      const ph = this.portrait ? H * 0.42 : H * 0.64;
      const k = ph / 4.84;
      this.phone.position.set(F.x, F.y - (1 - ap) * 1.2 - leave * leave * H * 1.1, lerp(-2.5, 0.6, ap));
      this.phone.rotation.set(
        leave * 0.6 + Math.sin(time * 0.4) * 0.03,
        (1 - ap) * -1.1 + Math.sin(time * 0.33) * 0.07 - this.eye.x * 0.12,
        (1 - ap) * 0.15,
      );
      this.phone.scale.setScalar(k * lerp(0.7, 1, ap));
      const scr = ss(4.4, 4.95, t) + ss(5.4, 5.95, t) + ss(6.35, 6.8, t);
      if (t > 6.55) { if (this.threadClock < 0) this.threadClock = now; } else if (t < 6.4) this.threadClock = -1;
      const m = this.threadClock < 0 ? 0 : clamp((now - this.threadClock) / 2600);
      this.screen.draw(scr, m);
    }

    this.renderer.render(this.scene, this.camera);
  }

  private bezier(p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, n: number) {
    for (let i = 0; i <= n; i++) {
      const k = i / n, a = 1 - k;
      const w0 = a * a * a, w1 = 3 * a * a * k, w2 = 3 * a * k * k, w3 = k * k * k;
      this.pts[i].set(
        p0.x * w0 + p1.x * w1 + p2.x * w2 + p3.x * w3,
        p0.y * w0 + p1.y * w1 + p2.y * w2 + p3.y * w3,
        p0.z * w0 + p1.z * w1 + p2.z * w2 + p3.z * w3,
      );
    }
  }

  /** Centripetal-free uniform Catmull-Rom through `c`, sampled at k in 0..1. */
  private catmull(c: Vector3[], k: number, out: Vector3) {
    const n = c.length - 1;
    const f = k * n;
    const i = Math.min(n - 1, Math.floor(f));
    const u = f - i;
    const p0 = c[Math.max(0, i - 1)], p1 = c[i], p2 = c[i + 1], p3 = c[Math.min(n, i + 2)];
    const u2 = u * u, u3 = u2 * u;
    const q = (a: number, b: number, cc: number, d: number) =>
      0.5 * (2 * b + (-a + cc) * u + (2 * a - 5 * b + 4 * cc - d) * u2 + (-a + 3 * b - 3 * cc + d) * u3);
    out.set(q(p0.x, p1.x, p2.x, p3.x), q(p0.y, p1.y, p2.y, p3.y), q(p0.z, p1.z, p2.z, p3.z));
  }

  /** Beat the visitor is on, smoothed. */
  get beat() { return this.t; }
}

