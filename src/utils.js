const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const lerp = (a, b, t) => a + (b - a) * t;

const distance2D = (a, b) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
};

const vectorFromPoints = (a, b) => ({
  x: b.x - a.x,
  y: b.y - a.y,
  z: (b.z ?? 0) - (a.z ?? 0),
});

const dot = (a, b) => a.x * b.x + a.y * b.y + (a.z ?? 0) * (b.z ?? 0);

const magnitude = (v) => Math.sqrt(v.x * v.x + v.y * v.y + (v.z ?? 0) * (v.z ?? 0));

const angleBetween = (a, b) => {
  const mag = magnitude(a) * magnitude(b) || 1e-6;
  return Math.acos(clamp(dot(a, b) / mag, -1, 1));
};

class OneEuroFilter {
  constructor({ freq = 120, minCutoff = 1, beta = 0.007, dCutoff = 1 } = {}) {
    this.freq = freq;
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.lastTime = null;
    this.xPrev = null;
    this.dxPrev = null;
  }

  alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(value, timestamp) {
    if (this.lastTime == null) {
      this.lastTime = timestamp;
      this.xPrev = value;
      this.dxPrev = 0;
      return value;
    }

    const dt = (timestamp - this.lastTime) / 1000;
    this.lastTime = timestamp;

    const dx = this.xPrev != null ? (value - this.xPrev) / dt : 0;
    const alphaD = this.alpha(this.dCutoff, dt);
    const dxHat = this.dxPrev != null ? lerp(this.dxPrev, dx, alphaD) : dx;

    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const alpha = this.alpha(cutoff, dt);
    const xHat = this.xPrev != null ? lerp(this.xPrev, value, alpha) : value;

    this.xPrev = xHat;
    this.dxPrev = dxHat;

    return xHat;
  }
}

const smoothPoint = (filterMap, key, point, timestamp) => {
  if (!filterMap.has(key)) {
    filterMap.set(key, {
      x: new OneEuroFilter({ minCutoff: 1.2, beta: 0.02 }),
      y: new OneEuroFilter({ minCutoff: 1.2, beta: 0.02 }),
      z: new OneEuroFilter({ minCutoff: 1.4, beta: 0.015 }),
    });
  }

  const filters = filterMap.get(key);
  return {
    x: filters.x.filter(point.x, timestamp),
    y: filters.y.filter(point.y, timestamp),
    z: filters.z.filter(point.z ?? 0, timestamp),
  };
};

const average = (arr) => (arr.length ? arr.reduce((acc, n) => acc + n, 0) / arr.length : 0);

const formatMs = (ms) => `${Math.round(ms)}ms`;

const formatFps = (fps) => `${Math.round(fps)}`;

const isMobileSafari = () => {
  const ua = navigator.userAgent;
  return /iP(ad|hone|od)/.test(ua) && /Safari/.test(ua) && !/CriOS/.test(ua);
};

export {
  clamp,
  lerp,
  distance2D,
  vectorFromPoints,
  dot,
  magnitude,
  angleBetween,
  OneEuroFilter,
  smoothPoint,
  average,
  formatMs,
  formatFps,
  isMobileSafari,
};
