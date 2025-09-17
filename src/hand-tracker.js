import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";
import { createEventTarget, toScreenSpace } from "./utils.js";

const DEFAULT_OPTIONS = {
  numHands: 2,
  minHandDetectionConfidence: 0.7,
  minHandPresenceConfidence: 0.6,
  minTrackingConfidence: 0.6,
  runningMode: "VIDEO",
};

export class HandTracker {
  constructor({ width = 640, height = 480 } = {}) {
    this.width = width;
    this.height = height;
    this.landmarker = null;
    this.video = null;
    this.active = false;
    this.frameId = null;
    this.callbacks = createEventTarget();
    this.lastTimestamp = performance.now();
    this.latency = 0;
    this.frameInterval = 0;
    this.lastFrameTime = performance.now();
    this.useVideoFrame = typeof HTMLVideoElement !== "undefined" && "requestVideoFrameCallback" in HTMLVideoElement.prototype;
    this.targetInterval = 1000 / 30;
    this.lastProcessTime = 0;
  }

  async init() {
    if (this.landmarker) return;
    const filesetResolver = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );
    this.landmarker = await HandLandmarker.createFromOptions(filesetResolver, DEFAULT_OPTIONS);
  }

  setOptions(options) {
    if (!this.landmarker) return;
    this.landmarker.setOptions({ ...DEFAULT_OPTIONS, ...options });
  }

  setFrameRate(fps) {
    if (fps <= 0) return;
    this.targetInterval = 1000 / fps;
  }

  on(event, listener) {
    this.callbacks.on(event, listener);
  }

  off(event, listener) {
    this.callbacks.off(event, listener);
  }

  start(video) {
    this.video = video;
    this.active = true;
    this.loop();
  }

  stop() {
    this.active = false;
    if (this.frameId) {
      if (this.useVideoFrame) {
        this.video.cancelVideoFrameCallback(this.frameId);
      } else {
        cancelAnimationFrame(this.frameId);
      }
      this.frameId = null;
    }
  }

  loop() {
    if (!this.video || !this.active) return;

    const processFrame = async (now, metadata = {}) => {
      if (!this.active) return;
      const delta = now - this.lastFrameTime;
      this.frameInterval = delta;
      this.lastFrameTime = now;

      if (!this.landmarker) return;

      if (now - this.lastProcessTime < this.targetInterval) {
        return;
      }
      this.lastProcessTime = now;

      const start = performance.now();
      const results = await this.landmarker.detectForVideo(this.video, now);
      this.latency = performance.now() - start;
      const hands = (results.landmarks || []).map((landmarks, handIndex) => {
        return {
          handedness: (results.handedness?.[handIndex]?.[0]?.categoryName || "unknown"),
          score: results.handedness?.[handIndex]?.[0]?.score || 0,
          landmarks,
          worldLandmarks: results.worldLandmarks?.[handIndex] || null,
        };
      });

      const width = metadata.width || this.video.videoWidth || this.width;
      const height = metadata.height || this.video.videoHeight || this.height;

      const screenHands = hands.map((hand) => ({
        ...hand,
        screenLandmarks: hand.landmarks.map((lm) => toScreenSpace(lm, width, height)),
      }));

      this.callbacks.emit("results", {
        hands: screenHands,
        latency: this.latency,
        fps: this.frameInterval > 0 ? 1000 / this.frameInterval : 0,
        timestamp: now,
      });
    };

    if (this.useVideoFrame) {
      this.frameId = this.video.requestVideoFrameCallback((now, metadata) => {
        processFrame(now, metadata);
        this.loop();
      });
    } else {
      this.frameId = requestAnimationFrame((now) => {
        processFrame(now, { width: this.video.videoWidth, height: this.video.videoHeight });
        this.loop();
      });
    }
  }
}
