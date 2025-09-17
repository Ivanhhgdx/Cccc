import { smoothPoint } from './utils.js';

const MEDIAPIPE_VERSION = '0.10.0';
const BUNDLE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`;
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;

let visionModulePromise = null;

class HandTracker {
  constructor({ maxHands = 2 } = {}) {
    this.maxHands = maxHands;
    this.detector = null;
    this.running = false;
    this.mirror = false;
    this.smoothingFilters = new Map();
    this.onResults = null;
    this.ready = false;
  }

  async init() {
    if (!visionModulePromise) {
      visionModulePromise = import(/* @vite-ignore */ BUNDLE_URL);
    }

    const vision = await visionModulePromise;
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);
    this.detector = await vision.HandLandmarker.createFromOptions(fileset, {
      numHands: this.maxHands,
      runningMode: 'VIDEO',
      baseOptions: {
        modelAssetPath: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/hand_landmarker.task`,
      },
    });
    this.running = true;
    this.ready = true;
    return this;
  }

  setMirror(enabled) {
    this.mirror = enabled;
  }

  setRunning(enabled) {
    this.running = enabled;
  }

  async detect(video, timestamp) {
    if (!this.detector || !this.running) {
      return [];
    }

    let results;
    try {
      results = this.detector.detectForVideo(video, timestamp);
    } catch (error) {
      console.warn('Hand detection error', error);
      return [];
    }
    if (!results || !results.landmarks) {
      return [];
    }

    const processed = results.landmarks.map((landmarks, index) => {
      const handedness = results.handednesses?.[index]?.[0]?.categoryName ?? 'unknown';
      const normalized = landmarks.map((lm, i) => {
        const x = this.mirror ? 1 - lm.x : lm.x;
        const key = `${index}-${i}`;
        return smoothPoint(this.smoothingFilters, key, { x, y: lm.y, z: lm.z }, timestamp);
      });
      return {
        index,
        handedness,
        landmarks: normalized,
      };
    });

    if (typeof this.onResults === 'function') {
      this.onResults(processed);
    }

    return processed;
  }

  dispose() {
    if (this.detector) {
      this.detector.close();
      this.detector = null;
    }
    this.running = false;
    this.ready = false;
    this.smoothingFilters.clear();
  }
}

export { HandTracker };
