import { OneEuroFilter, clamp } from './utils.js';

class DrawingCanvas {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.paths = [];
    this.redoStack = [];
    this.currentStroke = null;
    this.mode = 'draw';
    this.settings = {
      color: '#ff3b81',
      opacity: 0.9,
      thickness: 10,
      brush: 'solid',
    };
    this.strokeFilter = null;
    this.pixelRatio = window.devicePixelRatio || 1;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const { clientWidth, clientHeight } = this.canvas;
    const ratio = this.pixelRatio;
    this.canvas.width = clientWidth * ratio;
    this.canvas.height = clientHeight * ratio;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(ratio, ratio);
    this.render();
  }

  setSettings(settings) {
    this.settings = { ...this.settings, ...settings };
  }

  setMode(mode) {
    this.mode = mode;
  }

  startStroke(point, pressure = 0.5) {
    this.redoStack = [];
    this.strokeFilter = {
      x: new OneEuroFilter({ minCutoff: 2.4, beta: 0.02 }),
      y: new OneEuroFilter({ minCutoff: 2.4, beta: 0.02 }),
    };
    const smoothed = this._filterPoint(point, performance.now());
    const stroke = {
      points: [
        {
          ...smoothed,
          pressure,
        },
      ],
      color: this.settings.color,
      opacity: this.settings.opacity,
      thickness: this.settings.thickness,
      brush: this.settings.brush,
      mode: this.mode,
    };
    this.currentStroke = stroke;
    this.render();
  }

  addPoint(point, pressure, timestamp = performance.now()) {
    if (!this.currentStroke) return;
    const smoothed = this._filterPoint(point, timestamp);
    this.currentStroke.points.push({ ...smoothed, pressure });
    this.render();
  }

  endStroke() {
    if (!this.currentStroke) return;
    if (this.currentStroke.points.length > 1) {
      this.paths.push(this.currentStroke);
    }
    this.currentStroke = null;
    this.strokeFilter = null;
    this.render();
  }

  undo() {
    if (this.paths.length) {
      const path = this.paths.pop();
      this.redoStack.push(path);
      this.render();
    }
  }

  redo() {
    if (this.redoStack.length) {
      const path = this.redoStack.pop();
      this.paths.push(path);
      this.render();
    }
  }

  clear() {
    this.paths = [];
    this.redoStack = [];
    this.render();
  }

  _filterPoint(point, timestamp) {
    if (!this.strokeFilter) return this._normalizePoint(point);
    const normalized = this._normalizePoint(point);
    return {
      x: this.strokeFilter.x.filter(normalized.x, timestamp),
      y: this.strokeFilter.y.filter(normalized.y, timestamp),
    };
  }

  _normalizePoint(point) {
    return {
      x: clamp(point.x, 0, 1),
      y: clamp(point.y, 0, 1),
    };
  }

  _drawStroke(stroke) {
    const ctx = this.ctx;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    ctx.save();
    ctx.globalAlpha = stroke.opacity;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (stroke.mode === 'erase') {
      ctx.globalCompositeOperation = 'destination-out';
    } else {
      ctx.globalCompositeOperation = 'lighter';
    }

    const points = stroke.points;
    if (points.length < 2) {
      const p = points[0];
      ctx.beginPath();
      ctx.arc(p.x * width, p.y * height, stroke.thickness / 2, 0, Math.PI * 2);
      ctx.fillStyle = stroke.color;
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.beginPath();
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const mx = (p0.x + p1.x) / 2;
      const my = (p0.y + p1.y) / 2;
      const thickness = stroke.thickness * (0.35 + clamp((p1.pressure + p0.pressure) / 2, 0.2, 1));
      ctx.lineWidth = thickness;
      ctx.strokeStyle = this._strokeStyle(stroke);
      ctx.moveTo(p0.x * width, p0.y * height);
      ctx.quadraticCurveTo(p0.x * width, p0.y * height, mx * width, my * height);
      ctx.stroke();
    }

    if (stroke.brush === 'neon' && stroke.mode !== 'erase') {
      ctx.shadowColor = stroke.color;
      ctx.shadowBlur = stroke.thickness * 2;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.thickness * 0.6;
      ctx.stroke();
    }

    ctx.restore();
  }

  _strokeStyle(stroke) {
    switch (stroke.brush) {
      case 'marker':
        return this._markerGradient(stroke.color);
      case 'neon':
        return stroke.color;
      default:
        return stroke.color;
    }
  }

  _markerGradient(color) {
    const ctx = this.ctx;
    const gradient = ctx.createLinearGradient(0, 0, 0, this.canvas.clientHeight);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, `${color}66`);
    return gradient;
  }

  render() {
    const ctx = this.ctx;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();

    for (const stroke of this.paths) {
      this._drawStroke(stroke);
    }

    if (this.currentStroke) {
      this._drawStroke(this.currentStroke);
    }
  }

  exportImage(sceneCanvas) {
    const exportCanvas = document.createElement('canvas');
    const ratio = window.devicePixelRatio || 1;
    exportCanvas.width = this.canvas.clientWidth * ratio;
    exportCanvas.height = this.canvas.clientHeight * ratio;
    const ctx = exportCanvas.getContext('2d');
    ctx.scale(ratio, ratio);

    if (sceneCanvas) {
      ctx.drawImage(sceneCanvas, 0, 0, sceneCanvas.clientWidth, sceneCanvas.clientHeight);
    }

    ctx.drawImage(this.canvas, 0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
    return exportCanvas.toDataURL('image/png');
  }
}

export { DrawingCanvas };
