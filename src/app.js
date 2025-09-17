import { HandTracker } from './hand-tracker.js';
import { GestureController } from './gestures.js';
import { DrawingCanvas } from './draw.js';
import { Scene3D } from './scene3d.js';
import { UIController } from './ui.js';
import { average, formatMs, formatFps, isMobileSafari } from './utils.js';

class App {
  constructor() {
    this.video = document.getElementById('camera');
    this.sceneCanvas = document.getElementById('scene3d');
    this.drawCanvas = document.getElementById('draw-layer');

    this.scene = new Scene3D(this.sceneCanvas);
    this.drawing = new DrawingCanvas(this.drawCanvas);
    this.ui = new UIController();
    this.handTracker = new HandTracker();
    this.gestures = new GestureController();

    this.devices = [];
    this.currentDeviceId = null;
    this.currentQuality = 'medium';
    this.fpsLimit = 30;
    this.frameInterval = 1000 / this.fpsLimit;
    this.lastFrameTime = 0;
    this.cameraPaused = false;
    this.running = true;
    this.autoQuality = true;
    this.fpsSamples = [];
    this.lastProcessTime = performance.now();
    this.lastFrameTimestamp = 0;

    this.shapes = ['cube', 'sphere', 'torus', 'icosahedron'];
    this.shapeIndex = 0;
    this.defaultFacing = isMobileSafari() ? 'environment' : 'user';

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pauseInference(true);
      } else {
        this.pauseInference(false);
      }
    });

    this._bindUI();
  }

  async init() {
    try {
      await this.setupCamera();
      await this.handTracker.init();
      this.startLoop();
    } catch (error) {
      console.error('Failed to initialize camera', error);
      this.ui.setFallbackVisible(true);
      this.running = false;
      this.setupDemoMode();
    }
  }

  _bindUI() {
    this.ui.on('quality', (quality) => this.setQuality(quality));
    this.ui.on('fps', (fps) => this.setFpsLimit(fps));
    this.ui.on('camera', (deviceId) => this.switchCamera(deviceId));
    this.ui.on('color', (color) => this.drawing.setSettings({ color }));
    this.ui.on('opacity', (opacity) => this.drawing.setSettings({ opacity }));
    this.ui.on('thickness', (thickness) => this.drawing.setSettings({ thickness }));
    this.ui.on('brush', (brush) => this.drawing.setSettings({ brush }));
    this.ui.on('undo', () => this.drawing.undo());
    this.ui.on('redo', () => this.drawing.redo());
    this.ui.on('clear', () => this.drawing.clear());
    this.ui.on('eraser-toggle', () => this.toggleTool());
    this.ui.on('screenshot', () => this.captureScreenshot());
    this.ui.on('reset-pose', () => this.scene.resetPose());
    this.ui.on('material', (material) => this.scene.setMaterial(material));
    this.ui.on('metalness', (value) => this.scene.setMaterialProperty('metalness', value));
    this.ui.on('roughness', (value) => this.scene.setMaterialProperty('roughness', value));
    this.ui.on('shadows', (enabled) => this.scene.setShadows(enabled));
    window.addEventListener('resize', () => {
      this.scene.render();
      this.drawing.render();
    });
  }

  async setupCamera(deviceId, forceQuality) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera API not available');
    }

    const quality = forceQuality || this.currentQuality;
    const constraints = this._buildConstraints(deviceId, quality);

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
    }

    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.video.srcObject = this.stream;
    await this.video.play();
    this.ui.setFallbackVisible(false);

    const track = this.stream.getVideoTracks()[0];
    const settings = track.getSettings();
    this.currentDeviceId = settings.deviceId || deviceId;

    if (!this.devices.length) {
      await this.loadDevices();
    }

    if (this.currentDeviceId) {
      this.ui.selectCamera(this.currentDeviceId);
    }

    const isFront = settings.facingMode === 'user' || settings.facingMode === 'front';
    this.handTracker.setMirror(isFront);
    this.video.classList.toggle('mirrored', isFront);
  }

  _buildConstraints(deviceId, quality) {
    const presets = {
      low: { width: 320, height: 240 },
      medium: { width: 640, height: 480 },
      high: { width: 1280, height: 720 },
    };
    const preset = presets[quality] || presets.medium;
    const video = {
      width: { ideal: preset.width },
      height: { ideal: preset.height },
      frameRate: { ideal: this.fpsLimit },
      facingMode: deviceId ? undefined : this.defaultFacing,
    };
    if (deviceId) {
      video.deviceId = { exact: deviceId };
    }
    return { video, audio: false };
  }

  async loadDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    this.devices = devices.filter((device) => device.kind === 'videoinput');
    this.ui.setDevices(this.devices);
  }

  async switchCamera(deviceId) {
    await this.setupCamera(deviceId);
  }

  setQuality(quality) {
    this.currentQuality = quality;
    this.setupCamera(this.currentDeviceId, quality).catch((err) =>
      console.error('Failed to switch quality', err)
    );
  }

  setFpsLimit(fps) {
    this.fpsLimit = fps;
    this.frameInterval = 1000 / fps;
  }

  pauseInference(paused) {
    this.cameraPaused = paused;
    this.handTracker.setRunning(!paused);
  }

  toggleTool() {
    const next = this.gestures.tool === 'draw' ? 'erase' : 'draw';
    this.gestures.tool = next;
    this.drawing.setMode(next);
    this.ui.setTool(next);
  }

  applySceneGestures(sceneEvents) {
    if (sceneEvents.rotate.x || sceneEvents.rotate.y || sceneEvents.rotate.z) {
      this.scene.rotate(sceneEvents.rotate.y, sceneEvents.rotate.x, sceneEvents.rotate.z);
    }
    if (sceneEvents.scale !== 1) {
      this.scene.scale(sceneEvents.scale);
    }
    if (sceneEvents.translate.x || sceneEvents.translate.y) {
      this.scene.translate(sceneEvents.translate.x, sceneEvents.translate.y);
    }
  }

  applyDrawingGestures(drawingEvents, timestamp) {
    this.drawing.setMode(drawingEvents.tool);
    this.ui.setTool(drawingEvents.tool);
    if (drawingEvents.justStarted) {
      this.drawing.startStroke(drawingEvents.point, drawingEvents.pressure);
    }
    if (drawingEvents.active) {
      this.drawing.addPoint(drawingEvents.point, drawingEvents.pressure, timestamp);
    }
    if (drawingEvents.justEnded) {
      this.drawing.endStroke();
    }
  }

  applyGlobalGestures(globalEvents) {
    if (globalEvents.togglePanels) {
      this.ui.setPanelsVisible(!this.ui.panelsVisible);
    }
    if (globalEvents.pauseCamera) {
      this.pauseInference(!this.cameraPaused);
    }
    if (globalEvents.screenshot) {
      this.captureScreenshot();
    }
    if (globalEvents.quickHelp) {
      this.ui.toggleHelp(true);
    }
    if (globalEvents.cycleShape) {
      if (globalEvents.cycleShape === 'next') {
        this.shapeIndex = (this.shapeIndex + 1) % this.shapes.length;
      } else {
        this.shapeIndex = (this.shapeIndex - 1 + this.shapes.length) % this.shapes.length;
      }
      this.scene.createObject(this.shapes[this.shapeIndex]);
    }
  }

  startLoop() {
    const processFrame = async (now) => {
      if (!this.running || this.cameraPaused) {
        return;
      }

      if (now - this.lastFrameTime < this.frameInterval) {
        return;
      }
      this.lastFrameTime = now;

      const t0 = performance.now();
      const hands = await this.handTracker.detect(this.video, now);
      const gestureEvents = this.gestures.process(hands, now);
      this.applyDrawingGestures(gestureEvents.drawing, now);
      this.applySceneGestures(gestureEvents.scene, now);
      this.applyGlobalGestures(gestureEvents.global, now);

      const latency = performance.now() - t0;
      this.fpsSamples.push(1000 / (now - this.lastFrameTimestamp || 16));
      this.lastFrameTimestamp = now;
      if (this.fpsSamples.length > 30) this.fpsSamples.shift();
      const fpsAvg = average(this.fpsSamples);

      this.ui.updateStatus({
        hands: hands.length,
        latency: formatMs(latency),
        fps: formatFps(fpsAvg || this.fpsLimit),
      });

      this.scene.render();
      this.drawing.render();

      if (this.autoQuality && fpsAvg && fpsAvg < this.fpsLimit - 8 && this.currentQuality !== 'low') {
        this.setQuality(this.currentQuality === 'high' ? 'medium' : 'low');
      }
    };

    const loop = (timestamp) => {
      if (!this.running) return;
      processFrame(timestamp).catch((err) => console.error('Frame error', err));
      requestAnimationFrame(loop);
    };

    if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
      const frameCallback = (timestamp) => {
        processFrame(timestamp).catch((err) => console.error('Frame error', err));
        this.video.requestVideoFrameCallback(frameCallback);
      };
      this.video.requestVideoFrameCallback(frameCallback);
    } else {
      requestAnimationFrame(loop);
    }
  }

  captureScreenshot() {
    const dataUrl = this.drawing.exportImage(this.scene.getCanvas());
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `air-hands-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  setupDemoMode() {
    this.ui.onDemoChange((values) => {
      this.scene.targetRotation.y = (values.rotate * Math.PI) / 180;
      this.scene.targetScale.set(values.scale, values.scale, values.scale);
      this.drawing.setSettings({ opacity: values.opacity });
      this.scene.render();
    });
    if (typeof this.ui.listeners['demo-change'] === 'function') {
      this.ui.listeners['demo-change']();
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
