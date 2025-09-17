import { OneEuroFilter, clamp } from "./utils.js";

const BRUSH_PRESETS = {
  solid: { shadowBlur: 0, globalCompositeOperation: "source-over" },
  marker: { shadowBlur: 4, shadowColor: "rgba(0,0,0,0.2)", globalCompositeOperation: "source-over" },
  neon: { shadowBlur: 24, shadowColor: "currentColor", globalCompositeOperation: "lighter" },
};

export class AirDraw {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.paths = [];
    this.redoStack = [];
    this.options = {
      mode: "pen",
      color: "#ff4f8b",
      opacity: 0.9,
      thickness: 8,
      brush: "solid",
    };
    this.currentPath = null;
    this.dpr = window.devicePixelRatio || 1;
    this.smoothingFilterX = new OneEuroFilter({ minCutoff: 1.5, beta: 0.02 });
    this.smoothingFilterY = new OneEuroFilter({ minCutoff: 1.5, beta: 0.02 });
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.canvas);
    } else {
      window.addEventListener("resize", () => this.resize());
    }
    this.resize();
  }

  resize() {
    this.dpr = window.devicePixelRatio || 1;
    const { clientWidth, clientHeight } = this.canvas;
    this.canvas.width = clientWidth * this.dpr;
    this.canvas.height = clientHeight * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.redraw();
  }

  setOptions(options) {
    Object.assign(this.options, options);
    this.redraw();
  }

  setMode(mode) {
    this.options.mode = mode;
  }

  startStroke(point, pressure = 1, timestamp = performance.now()) {
    this.currentPath = {
      points: [],
      brush: this.options.brush,
      color: this.options.color,
      opacity: this.options.opacity,
      baseThickness: this.options.thickness,
      mode: this.options.mode,
    };
    this.redoStack.length = 0;
    this.extendStroke(point, pressure, timestamp, true);
  }

  extendStroke(point, pressure = 1, timestamp = performance.now(), force = false) {
    if (!this.currentPath) return;
    const filteredPoint = {
      x: this.smoothingFilterX.filter(point.x, timestamp),
      y: this.smoothingFilterY.filter(point.y, timestamp),
    };
    const lastPoint = this.currentPath.points[this.currentPath.points.length - 1];
    const distance = lastPoint ? Math.hypot(filteredPoint.x - lastPoint.x, filteredPoint.y - lastPoint.y) : Infinity;
    if (!force && distance < 0.5) return;

    this.currentPath.points.push({
      ...filteredPoint,
      pressure: clamp(pressure, 0.1, 1.4),
    });
    this.redraw();
  }

  endStroke() {
    if (!this.currentPath) return;
    if (this.currentPath.points.length > 1) {
      this.paths.push(this.currentPath);
    }
    this.currentPath = null;
    this.smoothingFilterX = new OneEuroFilter({ minCutoff: 1.5, beta: 0.02 });
    this.smoothingFilterY = new OneEuroFilter({ minCutoff: 1.5, beta: 0.02 });
  }

  strokePath(path) {
    if (!path) return;

    this.ctx.save();
    this.applyBrush(path);
    const strokeColor = path.mode === "eraser" ? "rgba(0,0,0,1)" : this.composeColor(path);

    this.ctx.beginPath();
    const pts = path.points;
    if (pts.length < 2) {
      const point = pts[0];
      if (point) {
        const thickness = path.baseThickness * point.pressure;
        this.ctx.arc(point.x, point.y, thickness / 2, 0, Math.PI * 2);
        this.ctx.fillStyle = strokeColor;
        this.ctx.fill();
      }
      this.ctx.restore();
      return;
    }

    for (let i = 0; i < pts.length - 1; i++) {
      const current = pts[i];
      const next = pts[i + 1];
      const midPoint = {
        x: (current.x + next.x) / 2,
        y: (current.y + next.y) / 2,
      };
      const thickness = path.baseThickness * ((current.pressure + next.pressure) / 2);
      this.ctx.lineWidth = thickness;
      this.ctx.lineCap = "round";
      this.ctx.lineJoin = "round";
      this.ctx.strokeStyle = strokeColor;
      if (i === 0) {
        this.ctx.moveTo(current.x, current.y);
      }
      this.ctx.quadraticCurveTo(current.x, current.y, midPoint.x, midPoint.y);
    }
    this.ctx.stroke();
    this.ctx.restore();
  }

  composeColor(path) {
    const opacity = clamp(path.opacity, 0, 1);
    const r = parseInt(path.color.slice(1, 3), 16);
    const g = parseInt(path.color.slice(3, 5), 16);
    const b = parseInt(path.color.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  applyBrush(path) {
    const preset = BRUSH_PRESETS[path.brush] || BRUSH_PRESETS.solid;
    this.ctx.globalCompositeOperation = path.mode === "eraser" ? "destination-out" : preset.globalCompositeOperation;
    this.ctx.shadowBlur = path.mode === "eraser" ? 0 : preset.shadowBlur;
    this.ctx.shadowColor = path.mode === "eraser" ? "transparent" : preset.shadowColor || "transparent";
  }

  redraw() {
    const { ctx, canvas } = this;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    for (const path of this.paths) {
      this.strokePath(path);
    }
    if (this.currentPath) {
      this.strokePath(this.currentPath);
    }
    ctx.restore();
  }

  undo() {
    if (this.paths.length === 0) return;
    this.redoStack.push(this.paths.pop());
    this.redraw();
  }

  redo() {
    if (this.redoStack.length === 0) return;
    this.paths.push(this.redoStack.pop());
    this.redraw();
  }

  clear() {
    this.paths = [];
    this.redoStack = [];
    this.redraw();
  }

  exportImage(sceneCanvas) {
    const exportCanvas = document.createElement("canvas");
    const width = this.canvas.clientWidth || this.canvas.width / this.dpr;
    const height = this.canvas.clientHeight || this.canvas.height / this.dpr;
    exportCanvas.width = width;
    exportCanvas.height = height;
    const exportCtx = exportCanvas.getContext("2d");

    if (sceneCanvas) {
      exportCtx.drawImage(sceneCanvas, 0, 0, width, height);
    }
    exportCtx.drawImage(this.canvas, 0, 0, width, height);

    return exportCanvas.toDataURL("image/png");
  }
}
