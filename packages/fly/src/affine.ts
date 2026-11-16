// Rigid transforms stored as twelve floats in a typed array, row-major 3×4:
// [r00 r01 r02 tx, r10 r11 r12 ty, r20 r21 r22 tz]. That is the layout the
// vertex shader reads (three vec4 rows per joint), so the rig writes its
// results straight into the uniform array. Everything here works in place on
// (array, offset) pairs so the per-frame rig allocates nothing; three's
// Matrix4 would mean an object per joint and a 4×4 multiply where a 3×4 does.

export type Affine = Float32Array | Float64Array;

export function identity(m: Affine, o: number): void {
  m[o] = 1; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0;
  m[o + 4] = 0; m[o + 5] = 1; m[o + 6] = 0; m[o + 7] = 0;
  m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = 1; m[o + 11] = 0;
}

export function copy(out: Affine, oo: number, m: Affine, o: number): void {
  for (let i = 0; i < 12; i++) out[oo + i] = m[o + i];
}

/** out = a · b. `out` may be `b` or `a` only if the offsets differ. */
export function multiply(out: Affine, oo: number, a: Affine, ao: number, b: Affine, bo: number): void {
  const a00 = a[ao], a01 = a[ao + 1], a02 = a[ao + 2], a03 = a[ao + 3];
  const a10 = a[ao + 4], a11 = a[ao + 5], a12 = a[ao + 6], a13 = a[ao + 7];
  const a20 = a[ao + 8], a21 = a[ao + 9], a22 = a[ao + 10], a23 = a[ao + 11];
  const b00 = b[bo], b01 = b[bo + 1], b02 = b[bo + 2], b03 = b[bo + 3];
  const b10 = b[bo + 4], b11 = b[bo + 5], b12 = b[bo + 6], b13 = b[bo + 7];
  const b20 = b[bo + 8], b21 = b[bo + 9], b22 = b[bo + 10], b23 = b[bo + 11];
  out[oo] = a00 * b00 + a01 * b10 + a02 * b20;
  out[oo + 1] = a00 * b01 + a01 * b11 + a02 * b21;
  out[oo + 2] = a00 * b02 + a01 * b12 + a02 * b22;
  out[oo + 3] = a00 * b03 + a01 * b13 + a02 * b23 + a03;
  out[oo + 4] = a10 * b00 + a11 * b10 + a12 * b20;
  out[oo + 5] = a10 * b01 + a11 * b11 + a12 * b21;
  out[oo + 6] = a10 * b02 + a11 * b12 + a12 * b22;
  out[oo + 7] = a10 * b03 + a11 * b13 + a12 * b23 + a13;
  out[oo + 8] = a20 * b00 + a21 * b10 + a22 * b20;
  out[oo + 9] = a20 * b01 + a21 * b11 + a22 * b21;
  out[oo + 10] = a20 * b02 + a21 * b12 + a22 * b22;
  out[oo + 11] = a20 * b03 + a21 * b13 + a22 * b23 + a23;
}

/** A frame from its axes (columns) and origin. */
export function setFrame(
  m: Affine, o: number,
  xx: number, xy: number, xz: number,
  yx: number, yy: number, yz: number,
  zx: number, zy: number, zz: number,
  tx: number, ty: number, tz: number,
): void {
  m[o] = xx; m[o + 1] = yx; m[o + 2] = zx; m[o + 3] = tx;
  m[o + 4] = xy; m[o + 5] = yy; m[o + 6] = zy; m[o + 7] = ty;
  m[o + 8] = xz; m[o + 9] = yz; m[o + 10] = zz; m[o + 11] = tz;
}

/** m = m · T(x, y, z): moves the origin along the frame's own axes. */
export function translate(m: Affine, o: number, x: number, y: number, z: number): void {
  m[o + 3] += m[o] * x + m[o + 1] * y + m[o + 2] * z;
  m[o + 7] += m[o + 4] * x + m[o + 5] * y + m[o + 6] * z;
  m[o + 11] += m[o + 8] * x + m[o + 9] * y + m[o + 10] * z;
}

/** m = m · Rx(a). */
export function rotateX(m: Affine, o: number, a: number): void {
  if (a === 0) return;
  const c = Math.cos(a), s = Math.sin(a);
  for (let r = 0; r < 12; r += 4) {
    const m1 = m[o + r + 1], m2 = m[o + r + 2];
    m[o + r + 1] = m1 * c + m2 * s;
    m[o + r + 2] = m2 * c - m1 * s;
  }
}

/** m = m · Ry(a). */
export function rotateY(m: Affine, o: number, a: number): void {
  if (a === 0) return;
  const c = Math.cos(a), s = Math.sin(a);
  for (let r = 0; r < 12; r += 4) {
    const m0 = m[o + r], m2 = m[o + r + 2];
    m[o + r] = m0 * c - m2 * s;
    m[o + r + 2] = m0 * s + m2 * c;
  }
}

/** m = m · Rz(a). */
export function rotateZ(m: Affine, o: number, a: number): void {
  if (a === 0) return;
  const c = Math.cos(a), s = Math.sin(a);
  for (let r = 0; r < 12; r += 4) {
    const m0 = m[o + r], m1 = m[o + r + 1];
    m[o + r] = m0 * c + m1 * s;
    m[o + r + 1] = m1 * c - m0 * s;
  }
}

/** Scales the frame's x axis only: how the telescoping proboscis stretches. */
export function scaleX(m: Affine, o: number, s: number): void {
  m[o] *= s; m[o + 4] *= s; m[o + 8] *= s;
}

/** Scales the frame's three axes: how the abdomen swells. */
export function scale(m: Affine, o: number, sx: number, sy: number, sz: number): void {
  for (let r = 0; r < 12; r += 4) {
    m[o + r] *= sx; m[o + r + 1] *= sy; m[o + r + 2] *= sz;
  }
}

/** Writes m · (x, y, z, 1) to out[oi..oi+2]. */
export function transformPoint(m: Affine, o: number, x: number, y: number, z: number, out: Affine, oi: number): void {
  out[oi] = m[o] * x + m[o + 1] * y + m[o + 2] * z + m[o + 3];
  out[oi + 1] = m[o + 4] * x + m[o + 5] * y + m[o + 6] * z + m[o + 7];
  out[oi + 2] = m[o + 8] * x + m[o + 9] * y + m[o + 10] * z + m[o + 11];
}
