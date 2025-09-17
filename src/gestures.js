import {
  clamp,
  distance2D,
  vectorFromPoints,
  angleBetween,
  magnitude,
} from './utils.js';

const PINCH_ON = 0.28;
const PINCH_OFF = 0.36;
const DOUBLE_PINCH_WINDOW = 320;
const PALM_OPEN_THRESHOLD = 2.8;
const FIST_THRESHOLD = 1.25;
const HELP_HOLD_TIME = 1000;
const SWIPE_VELOCITY = 0.7;
const THUMBS_UP_ANGLE = 0.9;

const TIP_INDEXES = [4, 8, 12, 16, 20];

class GestureController {
  constructor() {
    this.handStates = new Map();
    this.tool = 'draw';
    this.twoHandSession = null;
    this.lastPanelsToggle = 0;
    this.lastPauseToggle = 0;
    this.lastScreenshot = 0;
    this.lastShapeSwipe = 0;
  }

  analyzeHand(hand, timestamp) {
    const state = this.handStates.get(hand.index) || {
      pinch: false,
      pinchStartTime: 0,
      lastPinchPosition: null,
      openPalmStart: 0,
      fist: false,
      lastCenter: null,
      thumbsUp: false,
      swipeLastTime: 0,
      swipeVelocity: 0,
      lastPinchRelease: 0,
      pendingDoublePinch: false,
      newPinch: false,
      quickHelpShown: false,
    };

    const wrist = hand.landmarks[0];
    const indexMCP = hand.landmarks[5];
    const middleMCP = hand.landmarks[9];
    const ringMCP = hand.landmarks[13];
    const pinkyMCP = hand.landmarks[17];
    const indexTip = hand.landmarks[8];
    const thumbTip = hand.landmarks[4];

    const referenceSpan =
      (distance2D(wrist, middleMCP) + distance2D(wrist, indexMCP) + distance2D(wrist, ringMCP)) /
        3 || 0.15;

    const pinchDistance = distance2D(indexTip, thumbTip);
    const pinchRatio = pinchDistance / referenceSpan;

    if (!state.pinch && pinchRatio < PINCH_ON) {
      state.pinch = true;
      state.pinchStartTime = timestamp;
      state.lastPinchPosition = null;
      state.newPinch = true;
    } else if (state.pinch && pinchRatio > PINCH_OFF) {
      const duration = timestamp - state.pinchStartTime;
      state.pinch = false;
      state.lastPinchPosition = null;
      if (duration < DOUBLE_PINCH_WINDOW && timestamp - state.lastPinchRelease < DOUBLE_PINCH_WINDOW) {
        state.pendingDoublePinch = true;
      }
      state.lastPinchRelease = timestamp;
      state.pinchStartTime = 0;
      state.newPinch = false;
    }

    const tips = TIP_INDEXES.map((i) => hand.landmarks[i]);
    const distances = tips.map((tip) => distance2D(tip, wrist) / referenceSpan);
    const distanceAvg = distances.reduce((acc, n) => acc + n, 0) / distances.length;

    const isOpenPalm = distanceAvg > PALM_OPEN_THRESHOLD;
    const isFist = distanceAvg < FIST_THRESHOLD;

    if (isOpenPalm) {
      if (!state.openPalmStart) {
        state.openPalmStart = timestamp;
        state.quickHelpShown = false;
      }
    } else {
      state.openPalmStart = 0;
      state.quickHelpShown = false;
    }

    state.fist = isFist;

    const palmCenter = tips.reduce(
      (acc, tip) => {
        acc.x += tip.x;
        acc.y += tip.y;
        return acc;
      },
      { x: 0, y: 0 }
    );
    palmCenter.x /= tips.length;
    palmCenter.y /= tips.length;

    if (state.lastCenter) {
      const dt = (timestamp - state.swipeLastTime) / 1000 || 0.016;
      const velocityX = (palmCenter.x - state.lastCenter.x) / dt;
      state.swipeVelocity = velocityX;
    }
    state.lastCenter = palmCenter;
    state.swipeLastTime = timestamp;

    const thumbVec = vectorFromPoints(hand.landmarks[2], thumbTip);
    const upVector = { x: 0, y: -1, z: 0 };
    const thumbAngle = angleBetween(thumbVec, upVector);
    const thumbExtended = thumbAngle < THUMBS_UP_ANGLE;

    state.thumbsUp = thumbExtended && isFist;

    state.pinchRatio = pinchRatio;
    state.isOpenPalm = isOpenPalm;
    state.isFist = isFist;
    state.center = palmCenter;
    state.indexTip = indexTip;
    state.thumbTip = thumbTip;
    state.reference = referenceSpan;

    this.handStates.set(hand.index, state);
    return state;
  }

  process(hands, timestamp) {
    const events = {
      drawing: {
        active: false,
        point: null,
        pressure: 0,
        tool: this.tool,
        justStarted: false,
        justEnded: false,
      },
      scene: {
        rotate: { x: 0, y: 0, z: 0 },
        scale: 1,
        translate: { x: 0, y: 0 },
        activeHands: 0,
        reset: false,
      },
      global: {
        togglePanels: false,
        pauseCamera: false,
        screenshot: false,
        quickHelp: false,
        cycleShape: null,
      },
      info: {
        pinchHands: 0,
      },
    };

    const analyzed = hands.map((hand) => this.analyzeHand(hand, timestamp));

    const pinchHands = analyzed.filter((state) => state.pinch);
    events.info.pinchHands = pinchHands.length;

    if (pinchHands.length === 1) {
      const state = pinchHands[0];
      const currentPoint = state.indexTip;
      const prev = state.lastPinchPosition;
      if (state.newPinch) {
        events.drawing.justStarted = true;
        state.newPinch = false;
      }
      state.lastPinchPosition = currentPoint;
      events.drawing.active = true;
      events.drawing.point = currentPoint;
      const pressure = clamp(1 - state.pinchRatio / PINCH_ON, 0, 1);
      events.drawing.pressure = pressure;

      if (prev) {
        const dx = currentPoint.x - prev.x;
        const dy = currentPoint.y - prev.y;
        events.scene.rotate.y = dx * -220;
        events.scene.rotate.x = dy * -180;
        events.scene.activeHands = 1;
      }
    } else if (pinchHands.length === 0) {
      analyzed.forEach((state) => {
        if (state.lastPinchPosition) {
          state.lastPinchPosition = null;
          events.drawing.justEnded = true;
        }
      });
    }

    if (pinchHands.length === 2) {
      const [left, right] = pinchHands;
      const leftIdx = analyzed.indexOf(left);
      const rightIdx = analyzed.indexOf(right);
      const leftHand = hands[leftIdx];
      const rightHand = hands[rightIdx];
      const p1 = left.indexTip;
      const p2 = right.indexTip;
      const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const distance = distance2D(p1, p2);
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

      if (!this.twoHandSession) {
        this.twoHandSession = {
          baseDistance: distance,
          lastCenter: center,
          baseAngle: angle,
        };
      } else {
        const scaleFactor = distance / this.twoHandSession.baseDistance;
        events.scene.scale = scaleFactor;
        events.scene.translate.x = center.x - this.twoHandSession.lastCenter.x;
        events.scene.translate.y = center.y - this.twoHandSession.lastCenter.y;
        events.scene.rotate.z = angle - this.twoHandSession.baseAngle;
        this.twoHandSession.lastCenter = center;
        this.twoHandSession.baseDistance = distance;
        this.twoHandSession.baseAngle = angle;
        events.scene.activeHands = 2;
      }
    } else {
      this.twoHandSession = null;
    }

    analyzed.forEach((state, index) => {
      if (state.pendingDoublePinch) {
        this.tool = this.tool === 'draw' ? 'erase' : 'draw';
        state.pendingDoublePinch = false;
      }

      if (state.isOpenPalm) {
        if (timestamp - this.lastPanelsToggle > 600 && state.openPalmStart && timestamp - state.openPalmStart > 200) {
          events.global.togglePanels = true;
          this.lastPanelsToggle = timestamp;
          state.openPalmStart = timestamp;
          state.quickHelpShown = false;
        }

        if (!state.quickHelpShown && timestamp - state.openPalmStart > HELP_HOLD_TIME) {
          events.global.quickHelp = true;
          state.quickHelpShown = true;
        }

        const velocityX = state.swipeVelocity;
        if (Math.abs(velocityX) > SWIPE_VELOCITY && timestamp - this.lastShapeSwipe > 600) {
          events.global.cycleShape = velocityX > 0 ? 'next' : 'prev';
          this.lastShapeSwipe = timestamp;
        }
      }

      if (state.isFist && timestamp - this.lastPauseToggle > 800) {
        events.global.pauseCamera = true;
        this.lastPauseToggle = timestamp;
      }

      if (state.thumbsUp && timestamp - this.lastScreenshot > 1500) {
        events.global.screenshot = true;
        this.lastScreenshot = timestamp;
      }
    });

    events.drawing.tool = this.tool;
    return events;
  }
}

export { GestureController };
