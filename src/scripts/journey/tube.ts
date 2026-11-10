/**
 * A tube whose path can change every frame without allocating.
 *
 * THREE.TubeGeometry builds once from a curve and has to be thrown away to
 * move. The cables in the journey sag, tighten and straighten on every frame,
 * so this builds one index buffer up front and rewrites the vertex positions
 * and normals in place from a list of path points. Frames use parallel
 * transport, which never flips the way Frenet frames do on a straight run.
 */
import { BufferAttribute, BufferGeometry, Vector3 } from 'three';

export class LiveTube {
  readonly geometry = new BufferGeometry();
  private readonly pos: Float32Array;
  private readonly nor: Float32Array;
  private readonly t = new Vector3();
  private readonly n = new Vector3();
  private readonly b = new Vector3();
  private readonly tmp = new Vector3();

  constructor(readonly segments: number, readonly radial: number) {
    const ring = radial + 1;
    const count = (segments + 1) * ring;
    this.pos = new Float32Array(count * 3);
    this.nor = new Float32Array(count * 3);
    const idx: number[] = [];
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < radial; j++) {
        const a = i * ring + j;
        const b = (i + 1) * ring + j;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    this.geometry.setIndex(idx);
    this.geometry.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.geometry.setAttribute('normal', new BufferAttribute(this.nor, 3));
  }

  /** Rewrite the tube along `pts` (segments + 1 points). `radius` may vary along it. */
  update(pts: Vector3[], radius: number | ((s: number) => number)): void {
    const { segments, radial, pos, nor, t, n, b, tmp } = this;
    const ring = radial + 1;
    // Seed the normal from the first tangent, picking the least parallel axis.
    t.subVectors(pts[1], pts[0]).normalize();
    const ax = Math.abs(t.x), ay = Math.abs(t.y), az = Math.abs(t.z);
    tmp.set(ax <= ay && ax <= az ? 1 : 0, ay < ax && ay <= az ? 1 : 0, az < ax && az < ay ? 1 : 0);
    n.crossVectors(t, tmp).normalize();
    for (let i = 0; i <= segments; i++) {
      const p = pts[i];
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(segments, i + 1)];
      const nt = tmp.subVectors(next, prev);
      if (nt.lengthSq() > 1e-12) {
        nt.normalize();
        // Parallel transport: rotate the previous normal onto the new tangent.
        const d = t.dot(nt);
        if (d < 0.99999) {
          b.crossVectors(t, nt).normalize();
          const ang = Math.acos(Math.min(1, Math.max(-1, d)));
          n.applyAxisAngle(b, ang);
        }
        t.copy(nt);
      }
      b.crossVectors(t, n).normalize();
      n.crossVectors(b, t).normalize();
      const r = typeof radius === 'number' ? radius : radius(i / segments);
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * Math.PI * 2;
        const c = Math.cos(a), s = Math.sin(a);
        const nx = c * n.x + s * b.x, ny = c * n.y + s * b.y, nz = c * n.z + s * b.z;
        const k = (i * ring + j) * 3;
        nor[k] = nx; nor[k + 1] = ny; nor[k + 2] = nz;
        pos[k] = p.x + r * nx; pos[k + 1] = p.y + r * ny; pos[k + 2] = p.z + r * nz;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }

  /** Show only the first `f` (0 to 1) of the tube's length. */
  grow(f: number): void {
    const quads = Math.round(Math.max(0, Math.min(1, f)) * this.segments);
    this.geometry.setDrawRange(0, quads * this.radial * 6);
  }
}
