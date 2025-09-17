import { HandTracker } from "./hand-tracker.js";
import { GestureController } from "./gestures.js";
import { AirDraw } from "./draw.js";
import { Scene3D } from "./scene3d.js";
import { UIController } from "./ui.js";

const QUALITY_PRESETS = {
  low: { width: 320, height: 240 },
  medium: { width: 640, height: 480 },
  high: { width: 1280, height: 720 },
};

class AirHandsApp {
  constructor() {
    this.video = document.getElementById("camera");
    this.drawCanvas = document.getElementById("draw-layer");
    this.sceneCanvas = document.getElementById("scene3d");

    this.handTracker = new HandTracker();
    this.gestures = new GestureController();
    this.draw = new AirDraw(this.drawCanvas);
    this.scene = new Scene3D(this.sceneCanvas);
    this.ui = new UIController();
    this.scene.updateQuality(this.ui.settings.quality);
    this.scene.setMaterialPreset(this.ui.settings.material);
    this.scene.updateMaterial({
      metalness: this.ui.settings.metallic,
      roughness: this.ui.settings.roughness,
    });
    this.scene.setLighting(this.ui.settings.lighting);
    this.scene.toggleShadows(Boolean(this.ui.settings.shadows));
    this.draw.setOptions({
      color: this.ui.settings.color,
      opacity: this.ui.settings.opacity,
      thickness: this.ui.settings.thickness,
      brush: this.ui.settings.brush,
    });
    this.draw.setMode(this.ui.settings.mode);

    this.mediaStream = null;
    this.isMirrored = true;
    this.activeCameraId = null;
    this.targetFps = 30;
    this.demoMode = false;
    this.isPaused = false;
    this.lastPinchPositions = new Map();

    this.init();
  }

  async init() {
    await this.handTracker.init().catch((error) => {
      console.error("Failed to initialise hand tracker", error);
      this.ui.notify("Unable to load hand tracking model");
    });
    this.handTracker.on("results", (data) => this.onHandResults(data));

    this.bindUI();

    if (navigator.mediaDevices?.getUserMedia) {
      try {
        await this.refreshDevices();
        await this.startCamera();
      } catch (error) {
        console.error("Camera initialisation failed", error);
        this.ui.showNoCamera();
      }
    } else {
      this.ui.showNoCamera();
    }
  }

  bindUI() {
    this.ui.on("camera-change", (deviceId) => {
      this.activeCameraId = deviceId;
      this.startCamera(deviceId).catch((err) => console.error(err));
    });
    this.ui.on("quality-change", (quality) => {
      this.quality = quality;
      this.scene.updateQuality(quality);
      if (!this.demoMode) this.startCamera(this.activeCameraId).catch(console.error);
    });
    this.ui.on("fps-change", (fps) => {
      this.targetFps = fps;
      this.handTracker.setFrameRate(fps);
    });
    this.ui.on("shape-change", (shape) => this.scene.setShape(shape));
    this.ui.on("material-change", (material) => this.scene.setMaterialPreset(material));
    this.ui.on("material-tweak", (values) => this.scene.updateMaterial(values));
    this.ui.on("shadow-toggle", (enabled) => this.scene.toggleShadows(enabled));
    this.ui.on("lighting-change", (lighting) => this.scene.setLighting(lighting));
    this.ui.on("reset-pose", () => this.scene.resetPose());

    this.ui.on("draw-mode", (mode) => this.draw.setMode(mode));
    this.ui.on("color-change", (color) => this.draw.setOptions({ color }));
    this.ui.on("opacity-change", (opacity) => this.draw.setOptions({ opacity }));
    this.ui.on("thickness-change", (thickness) => this.draw.setOptions({ thickness }));
    this.ui.on("brush-change", (brush) => this.draw.setOptions({ brush }));

    this.ui.on("undo", () => this.draw.undo());
    this.ui.on("redo", () => this.draw.redo());
    this.ui.on("clear", () => this.draw.clear());
    this.ui.on("screenshot", () => this.captureScreenshot());
    this.ui.on("demo-mode", () => {
      this.demoMode = true;
      this.stopCamera();
      this.handTracker.stop();
      this.ui.notify("Demo mode enabled");
    });
  }

  async refreshDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((device) => device.kind === "videoinput");
      const labelled = videoInputs.map((device, index) => {
        const facing = device.facingMode || (device.label?.toLowerCase().includes("back") ? "environment" : "user");
        let label = device.label || `Camera ${index + 1}`;
        if (!device.label && facing) {
          label = facing === "environment" ? "Back camera" : "Front camera";
        }
        return { ...device, label, facingMode: facing };
      });
      this.ui.updateCameraList(labelled, this.activeCameraId);
    } catch (error) {
      console.warn("enumerateDevices failed", error);
    }
  }

  async startCamera(deviceId) {
    if (this.demoMode) return;
    const quality = this.quality || this.ui.settings.quality || "medium";
    const preset = QUALITY_PRESETS[quality] || QUALITY_PRESETS.medium;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
    }

    const constraints = {
      audio: false,
      video: {
        width: { ideal: preset.width },
        height: { ideal: preset.height },
        frameRate: { ideal: this.targetFps, max: this.targetFps },
      },
    };

    if (deviceId) {
      constraints.video.deviceId = { exact: deviceId };
    } else {
      constraints.video.facingMode = this.ui.settings?.lastFacing || "user";
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      console.warn("Primary constraints failed, retrying without frameRate", error);
      delete constraints.video.frameRate;
      try {
        this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (finalError) {
        console.error("Unable to start camera", finalError);
        this.ui.showNoCamera();
        return;
      }
    }

    if (!this.mediaStream) {
      this.ui.showNoCamera();
      return;
    }

    try {
      this.video.srcObject = this.mediaStream;
      await this.video.play();
    } catch (error) {
      console.error("Unable to play video", error);
      this.ui.showNoCamera();
      return;
    }

    const track = this.mediaStream.getVideoTracks()[0];
    const settings = track?.getSettings?.() || {};
    const facing = settings.facingMode || (this.ui.settings?.lastFacing ?? "user");
    this.isMirrored = facing !== "environment";
    this.video.dataset.facing = facing;
    this.ui.settings.lastFacing = facing;
    if (settings.deviceId) {
      this.activeCameraId = settings.deviceId;
    }

    this.handTracker.stop();
    this.handTracker.setOptions({ numHands: 2 });
    this.handTracker.setFrameRate(this.targetFps);
    this.handTracker.start(this.video);
    await this.refreshDevices();
  }

  stopCamera() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    this.handTracker.stop();
  }

  onHandResults({ hands, latency, fps, timestamp }) {
    this.ui.updateStats({ hands: hands.length, latency, fps });
    if (this.isPaused || this.demoMode) return;
    if (!hands.length) {
      this.finishDrawing();
      return;
    }
    const gestureState = this.gestures.update(hands, timestamp);
    this.handleCommands(gestureState.commands);
    this.handleDrawing(gestureState);
    this.handleSceneGestures(gestureState);
  }

  handleCommands(commands = []) {
    for (const command of commands) {
      switch (command.type) {
        case "toggle-ui":
          this.ui.toggleUI();
          break;
        case "show-help":
          this.ui.toggleHelp(true);
          break;
        case "toggle-draw-mode": {
          const newMode = this.ui.settings.mode === "pen" ? "eraser" : "pen";
          const select = this.ui.elements.modeSelect;
          if (select) {
            select.value = newMode;
            select.dispatchEvent(new Event("change", { bubbles: true }));
          } else {
            this.draw.setMode(newMode);
            this.ui.settings.mode = newMode;
          }
          this.ui.notify(newMode === "pen" ? "Pen" : "Eraser");
          break;
        }
        case "toggle-pause":
          this.togglePause();
          break;
        case "screenshot":
          this.captureScreenshot();
          break;
        case "switch-shape":
          this.switchShape(command.direction);
          break;
        default:
          break;
      }
    }
  }

  handleDrawing(gestureState) {
    const activePinchHands = gestureState.hands.filter((hand) => hand.pinch);
    if (activePinchHands.length !== 1 || gestureState.twoHand) {
      this.finishDrawing();
      return;
    }
    const hand = activePinchHands[0];
    if (!hand.pinchPoint) return;
    const point = this.toCanvasPoint(hand.pinchPoint);
    const pressure = 0.4 + hand.pinchStrength * 0.8;
    const hasStarted = Boolean(this.currentDrawingHand);

    if (!hasStarted) {
      this.draw.startStroke(point, pressure, performance.now());
      this.currentDrawingHand = hand.handedness;
    } else if (this.currentDrawingHand !== hand.handedness) {
      this.finishDrawing();
      return;
    } else {
      this.draw.extendStroke(point, pressure, performance.now());
    }

    gestureState.hands.forEach((h) => {
      if (h.events.includes("pinch-end") && this.currentDrawingHand === h.handedness) {
        this.finishDrawing();
      }
    });
  }

  finishDrawing() {
    if (this.currentDrawingHand) {
      this.draw.endStroke();
      this.currentDrawingHand = null;
    }
  }

  handleSceneGestures(gestureState) {
    if (gestureState.twoHand?.active) {
      const translate = gestureState.twoHand.translate;
      const canvasTranslate = this.scaleDelta(translate);
      this.scene.applyScale(gestureState.twoHand.scale);
      this.scene.applyTranslation(canvasTranslate.x, canvasTranslate.y);
      this.scene.applyRotation(0, 0, gestureState.twoHand.rotateZ);
      this.lastPinchPositions.clear();
      return;
    }

    for (const hand of gestureState.hands) {
      if (!hand.pinch || !hand.pinchPoint) {
        this.lastPinchPositions.delete(hand.handedness);
        continue;
      }
      const current = this.toCanvasPoint(hand.pinchPoint);
      const last = this.lastPinchPositions.get(hand.handedness);
      if (last) {
        const dx = current.x - last.x;
        const dy = current.y - last.y;
        this.scene.applyRotation(dx, dy, 0);
      }
      this.lastPinchPositions.set(hand.handedness, current);
    }
  }

  scaleDelta(delta) {
    const rect = this.drawCanvas.getBoundingClientRect();
    const videoWidth = this.video.videoWidth || rect.width;
    const videoHeight = this.video.videoHeight || rect.height;
    const scaleX = rect.width / videoWidth;
    const scaleY = rect.height / videoHeight;
    return {
      x: delta.x * scaleX,
      y: delta.y * scaleY,
    };
  }

  toCanvasPoint(point) {
    const rect = this.drawCanvas.getBoundingClientRect();
    const videoWidth = this.video.videoWidth || rect.width;
    const videoHeight = this.video.videoHeight || rect.height;
    const scaleX = rect.width / videoWidth;
    const scaleY = rect.height / videoHeight;
    const x = (this.isMirrored ? videoWidth - point.x : point.x) * scaleX;
    const y = point.y * scaleY;
    return { x, y };
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      this.handTracker.stop();
      this.scene.pause();
      this.ui.notify("Tracking paused");
    } else {
      if (this.mediaStream) {
        this.handTracker.start(this.video);
        this.handTracker.setFrameRate(this.targetFps);
      }
      this.scene.resume();
      this.ui.notify("Tracking resumed");
    }
  }

  captureScreenshot() {
    const dataUrl = this.draw.exportImage(this.sceneCanvas);
    const link = document.createElement("a");
    link.href = dataUrl;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.download = `air-hands-${timestamp}.png`;
    link.click();
    this.ui.notify("Screenshot saved");
  }

  switchShape(direction) {
    const select = this.ui.elements.shapeSelect;
    if (!select) return;
    const options = [...select.options];
    const currentIndex = options.findIndex((option) => option.value === select.value);
    if (currentIndex === -1) return;
    const nextIndex = direction === "right"
      ? (currentIndex + 1) % options.length
      : (currentIndex - 1 + options.length) % options.length;
    select.value = options[nextIndex].value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

window.addEventListener("DOMContentLoaded", () => {
  new AirHandsApp();
});
