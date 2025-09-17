export class OneEuroFilter {
  constructor({
    minCutoff = 1,
    beta = 0.007,
    dCutoff = 1,
  } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.prevTimestamp = null;
    this.prevValue = null;
    this.prevDerivative = 0;
  }

  alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(value, timestamp) {
    if (this.prevTimestamp == null) {
      this.prevTimestamp = timestamp;
      this.prevValue = value;
      return value;
    }

    const dt = (timestamp - this.prevTimestamp) / 1000;
    this.prevTimestamp = timestamp;

    if (dt <= 0) {
      return this.prevValue;
    }

    const dx = (value - this.prevValue) / dt;
    const alphaDerivative = this.alpha(this.dCutoff, dt);
    this.prevDerivative = alphaDerivative * dx + (1 - alphaDerivative) * this.prevDerivative;

    const cutoff = this.minCutoff + this.beta * Math.abs(this.prevDerivative);
    const alphaValue = this.alpha(cutoff, dt);
    const filtered = alphaValue * value + (1 - alphaValue) * this.prevValue;
    this.prevValue = filtered;
    return filtered;
  }
}

export function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z || 0) - (b.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function averagePoints(points) {
  if (!points || points.length === 0) return null;
  const sum = points.reduce((acc, p) => {
    acc.x += p.x;
    acc.y += p.y;
    acc.z += p.z || 0;
    return acc;
  }, { x: 0, y: 0, z: 0 });
  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
    z: sum.z / points.length,
  };
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function throttle(fn, limit) {
  let last = 0;
  let deferTimer;
  return (...args) => {
    const now = performance.now();
    if (now - last >= limit) {
      last = now;
      fn.apply(null, args);
    } else {
      clearTimeout(deferTimer);
      deferTimer = setTimeout(() => {
        last = performance.now();
        fn.apply(null, args);
      }, limit - (now - last));
    }
  };
}

export function lowPass(previous, next, smoothing = 0.5) {
  if (!previous) return next;
  return {
    x: lerp(previous.x, next.x, smoothing),
    y: lerp(previous.y, next.y, smoothing),
    z: lerp(previous.z ?? 0, next.z ?? 0, smoothing),
  };
}

export function toScreenSpace(landmark, width, height) {
  return {
    x: landmark.x * width,
    y: landmark.y * height,
    z: landmark.z,
  };
}

export function angleBetween(v1, v2) {
  const dot = v1.x * v2.x + v1.y * v2.y + (v1.z || 0) * (v2.z || 0);
  const mag1 = Math.sqrt(v1.x ** 2 + v1.y ** 2 + (v1.z || 0) ** 2);
  const mag2 = Math.sqrt(v2.x ** 2 + v2.y ** 2 + (v2.z || 0) ** 2);
  if (mag1 === 0 || mag2 === 0) return 0;
  return Math.acos(clamp(dot / (mag1 * mag2), -1, 1));
}

export function vectorFrom(a, b) {
  return {
    x: b.x - a.x,
    y: b.y - a.y,
    z: (b.z || 0) - (a.z || 0),
  };
}

export function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function movingAverageBuffer(size = 10) {
  const buffer = [];
  return {
    push(value) {
      buffer.push(value);
      if (buffer.length > size) buffer.shift();
    },
    value() {
      if (buffer.length === 0) return 0;
      return buffer.reduce((a, b) => a + b, 0) / buffer.length;
    },
  };
}

export function createEventTarget() {
  const listeners = new Map();
  return {
    on(type, listener) {
      const set = listeners.get(type) || new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    off(type, listener) {
      const set = listeners.get(type);
      if (set) set.delete(listener);
    },
    emit(type, detail) {
      const set = listeners.get(type);
      if (set) set.forEach((listener) => listener(detail));
    },
  };
}
