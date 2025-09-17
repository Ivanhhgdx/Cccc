import { OneEuroFilter, averagePoints, distance, vectorFrom, clamp } from "./utils.js";

const PINCH_THRESHOLD = 0.045;
const PINCH_RELEASE_THRESHOLD = 0.065;
const DOUBLE_PINCH_WINDOW = 280;
const PALM_HOLD_DURATION = 900;
const SWIPE_VELOCITY_THRESHOLD = 0.6;

function defaultHandState(handedness) {
  return {
    handedness,
    pinch: false,
    pinchStrength: 0,
    pinchPoint: null,
    pinchFilterX: new OneEuroFilter({ minCutoff: 1.2, beta: 0.01 }),
    pinchFilterY: new OneEuroFilter({ minCutoff: 1.2, beta: 0.01 }),
    pinchFilterZ: new OneEuroFilter({ minCutoff: 1.2, beta: 0.01 }),
    lastPinchTime: 0,
    lastPinchRelease: 0,
    lastDoublePinchTime: 0,
    events: [],
    orientation: {
      roll: 0,
      pitch: 0,
      yaw: 0,
    },
    palmNormal: { x: 0, y: 0, z: 1 },
    palmCenter: null,
    previousPalmCenter: null,
    velocity: { x: 0, y: 0, z: 0 },
    lastTimestamp: 0,
  };
}

export class GestureController {
  constructor() {
    this.handStates = new Map();
    this.lastGlobalOpenPalmTime = 0;
    this.openPalmHoldTriggered = false;
    this.lastFistToggle = 0;
    this.lastThumbsUp = 0;
    this.lastSwipe = 0;
    this.twoHandCache = null;
    this.lastOpenPalm = false;
  }

  update(hands, timestamp) {
    const result = {
      hands: [],
      commands: [],
      openPalm: false,
      openPalmHold: false,
      fist: false,
      thumbsUp: false,
      swipe: null,
      twoHand: null,
      _states: [],
    };

    const activeIds = new Set();

    for (const hand of hands) {
      const id = hand.handedness + "-" + hand.score.toFixed(2);
      if (!this.handStates.has(id)) {
        this.handStates.set(id, defaultHandState(hand.handedness));
      }
      const state = this.handStates.get(id);
      activeIds.add(id);
      this.#updateSingleHand(hand, state, timestamp);
      result.hands.push({
        handedness: hand.handedness,
        pinch: state.pinch,
        pinchPoint: state.pinchPoint,
        pinchStrength: state.pinchStrength,
        palmCenter: state.palmCenter,
        velocity: state.velocity,
        orientation: state.orientation,
        events: state.events,
      });
      result._states.push(state);
      state.events = [];
    }

    // remove stale hands
    for (const [id] of this.handStates.entries()) {
      if (!activeIds.has(id)) {
        this.handStates.delete(id);
      }
    }

    // global gestures evaluation
    this.#evaluateGlobalGestures(result, timestamp);

    // two hand gestures
    if (result.hands.length === 2) {
      const [a, b] = result.hands;
      const twoHand = this.#computeTwoHandGesture(a, b, timestamp);
      result.twoHand = twoHand;
    } else {
      this.twoHandCache = null;
    }

    const { _states, ...publicResult } = result;
    return publicResult;
  }

  #updateSingleHand(hand, state, timestamp) {
    const indexTip = hand.screenLandmarks[8];
    const thumbTip = hand.screenLandmarks[4];
    const wrist = hand.screenLandmarks[0];
    const middleMcp = hand.screenLandmarks[9];
    const palmPoints = [0, 1, 2, 5, 9, 13, 17].map((idx) => hand.screenLandmarks[idx]);
    const palmCenterRaw = averagePoints(palmPoints);

    if (!state.palmCenter) {
      state.palmCenter = palmCenterRaw;
    } else {
      state.palmCenter = {
        x: state.palmCenter.x * 0.6 + palmCenterRaw.x * 0.4,
        y: state.palmCenter.y * 0.6 + palmCenterRaw.y * 0.4,
        z: state.palmCenter.z * 0.6 + palmCenterRaw.z * 0.4,
      };
    }

    if (state.lastTimestamp) {
      const dt = (timestamp - state.lastTimestamp) / 1000;
      if (dt > 0) {
        state.velocity = {
          x: (state.palmCenter.x - (state.previousPalmCenter?.x ?? state.palmCenter.x)) / dt,
          y: (state.palmCenter.y - (state.previousPalmCenter?.y ?? state.palmCenter.y)) / dt,
          z: (state.palmCenter.z - (state.previousPalmCenter?.z ?? state.palmCenter.z)) / dt,
        };
      }
    }
    state.previousPalmCenter = { ...state.palmCenter };
    state.lastTimestamp = timestamp;

    const pinchDistance = distance(indexTip, thumbTip);
    const wristToIndex = distance(wrist, hand.screenLandmarks[5]);
    const normalizedPinch = pinchDistance / (wristToIndex || 1);

    const wasPinching = state.pinch;
    if (!state.pinch && normalizedPinch < PINCH_THRESHOLD) {
      state.pinch = true;
      state.lastPinchTime = timestamp;
      if (timestamp - state.lastPinchRelease < DOUBLE_PINCH_WINDOW) {
        state.events.push("double-pinch");
        state.events.push("pinch-start");
        state.lastDoublePinchTime = timestamp;
      } else {
        state.events.push("pinch-start");
      }
    } else if (state.pinch && normalizedPinch > PINCH_RELEASE_THRESHOLD) {
      state.pinch = false;
      state.lastPinchRelease = timestamp;
      state.events.push("pinch-end");
    }

    state.pinchStrength = clamp(1 - normalizedPinch / PINCH_THRESHOLD, 0, 1);

    if (state.pinch) {
      const filteredX = state.pinchFilterX.filter(indexTip.x, timestamp);
      const filteredY = state.pinchFilterY.filter(indexTip.y, timestamp);
      const filteredZ = state.pinchFilterZ.filter(indexTip.z ?? 0, timestamp);
      state.pinchPoint = { x: filteredX, y: filteredY, z: filteredZ };
    } else {
      state.pinchPoint = null;
    }

    // orientation estimates
    const wristToIndexVec = vectorFrom(wrist, indexTip);
    const wristToMiddleVec = vectorFrom(wrist, middleMcp);
    const yaw = Math.atan2(wristToIndexVec.x, wristToIndexVec.z || 0.0001);
    const pitch = Math.atan2(wristToIndexVec.y, wristToIndexVec.z || 0.0001);
    const roll = Math.atan2(wristToMiddleVec.y, wristToMiddleVec.x);
    state.orientation = { roll, pitch, yaw };

    // posture detection
    const fingerTips = [8, 12, 16, 20].map((idx) => hand.screenLandmarks[idx]);
    const totalExtension = fingerTips.reduce((acc, tip) => acc + distance(wrist, tip), 0);
    const thumbIp = hand.screenLandmarks[3];
    const thumbExtension = distance(thumbTip, wrist);
    const palmSize = distance(hand.screenLandmarks[0], hand.screenLandmarks[9]);
    state.isOpenPalm = totalExtension / (palmSize || 1) > 5.6;
    state.isFist = totalExtension / (palmSize || 1) < 3.1;
    state.isThumbsUp =
      thumbExtension > palmSize * 1.4 &&
      fingerTips.slice(1).every((tip) => distance(tip, wrist) < palmSize * 1.2);

    const indexMcp = hand.screenLandmarks[5];
    const ringMcp = hand.screenLandmarks[13];
    const palmVector = vectorFrom(indexMcp, ringMcp);
    const thumbVector = vectorFrom(thumbTip, thumbIp);
    const palmNormal = {
      x: palmVector.y * thumbVector.z - palmVector.z * thumbVector.y,
      y: palmVector.z * thumbVector.x - palmVector.x * thumbVector.z,
      z: palmVector.x * thumbVector.y - palmVector.y * thumbVector.x,
    };
    const mag = Math.sqrt(palmNormal.x ** 2 + palmNormal.y ** 2 + palmNormal.z ** 2) || 1;
    state.palmNormal = {
      x: palmNormal.x / mag,
      y: palmNormal.y / mag,
      z: palmNormal.z / mag,
    };
  }

  #evaluateGlobalGestures(result, timestamp) {
    result.openPalm = result._states.some((state) => state?.isOpenPalm);

    if (result.openPalm) {
      if (!this.openPalmHoldTriggered) {
        if (!this.lastGlobalOpenPalmTime) {
          this.lastGlobalOpenPalmTime = timestamp;
        } else if (timestamp - this.lastGlobalOpenPalmTime > PALM_HOLD_DURATION) {
          result.openPalmHold = true;
          this.openPalmHoldTriggered = true;
        }
      }
    } else {
      this.lastGlobalOpenPalmTime = 0;
      this.openPalmHoldTriggered = false;
    }

    result.fist = result._states.some((state) => state?.isFist);

    if (result.fist && timestamp - this.lastFistToggle > 800) {
      result.commands.push({ type: "toggle-pause" });
      this.lastFistToggle = timestamp;
    }

    const thumbsUp = result._states.find((state) => state?.isThumbsUp);
    if (thumbsUp && timestamp - this.lastThumbsUp > 1200) {
      result.thumbsUp = true;
      result.commands.push({ type: "screenshot" });
      this.lastThumbsUp = timestamp;
    }

    const leftIndex = result.hands.findIndex((hand) => hand.handedness.toLowerCase() === "left");
    const leftState = leftIndex >= 0 ? result._states[leftIndex] : null;
    if (leftState) {
      const velocityX = leftState.velocity.x;
      if (Math.abs(velocityX) > SWIPE_VELOCITY_THRESHOLD && !leftState.pinch) {
        const direction = velocityX > 0 ? "right" : "left";
        if (timestamp - this.lastSwipe > 800) {
          result.swipe = direction;
          result.commands.push({ type: "switch-shape", direction });
          this.lastSwipe = timestamp;
        }
      }
    }

    if (result.openPalm && !this.lastOpenPalm) {
      result.commands.push({ type: "toggle-ui" });
    }
    this.lastOpenPalm = result.openPalm;

    if (result.openPalmHold) {
      result.commands.push({ type: "show-help" });
    }

    for (const hand of result.hands) {
      for (const event of hand.events) {
        if (event === "double-pinch") {
          result.commands.push({ type: "toggle-draw-mode", handedness: hand.handedness });
        }
      }
    }
  }

  #computeTwoHandGesture(handA, handB, timestamp) {
    const idA = handA.handedness.toLowerCase();
    const idB = handB.handedness.toLowerCase();
    const key = [idA, idB].sort().join("-");

    const stateA = [...this.handStates.values()].find((s) => s.handedness === handA.handedness);
    const stateB = [...this.handStates.values()].find((s) => s.handedness === handB.handedness);

    if (!(stateA?.pinch && stateB?.pinch)) {
      this.twoHandCache = null;
      return null;
    }

    const pinchA = stateA.pinchPoint;
    const pinchB = stateB.pinchPoint;
    if (!pinchA || !pinchB) return null;

    const center = {
      x: (pinchA.x + pinchB.x) / 2,
      y: (pinchA.y + pinchB.y) / 2,
      z: (pinchA.z + pinchB.z) / 2,
    };
    const distanceHands = distance(pinchA, pinchB);

    let scale = 1;
    let translate = { x: 0, y: 0 };
    let rotateZ = 0;

    if (this.twoHandCache) {
      scale = distanceHands / (this.twoHandCache.distance || distanceHands);
      translate = {
        x: center.x - this.twoHandCache.center.x,
        y: center.y - this.twoHandCache.center.y,
      };
      const wristVecA = stateA.orientation;
      const wristVecB = stateB.orientation;
      rotateZ = wristVecA.roll - wristVecB.roll;
    }

    this.twoHandCache = { center, distance: distanceHands, timestamp };
    return {
      active: true,
      scale,
      translate,
      rotateZ,
      center,
    };
  }
}
