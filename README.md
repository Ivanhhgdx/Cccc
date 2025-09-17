# Air-Hands Studio

Air-Hands Studio is an iPad-friendly web experience for sketching in thin air and sculpting a hero 3D figure using nothing but hand gestures. The project is a static site: open `index.html` over HTTPS in Safari (iPadOS 16+ recommended) or any modern desktop browser.

## Features

- Real-time dual-hand tracking powered by MediaPipe Tasks Vision running fully in-browser.
- Glassmorphism UI with adaptive panels for camera, drawing and 3D scene controls.
- Gesture-based drawing with dynamic pressure, One-Euro smoothing, undo/redo, eraser, neon/marker brushes and screenshot export.
- Manipulate a physically based Three.js scene: rotate, scale, pan and reset stylised primitives with HDR-inspired lighting.
- Front/back camera switching, FPS limiter and quality presets optimised for iPad Safari.
- Demo fallback mode when camera access is unavailable.

## Getting started

1. Host the project over HTTPS (for example with `python3 -m http.server` behind an HTTPS proxy) or deploy to any static host.
2. Open `index.html` on iPad (Safari) or desktop.
3. Grant camera permission. The front camera feed is mirrored to match the live preview.

### Camera & performance settings

- **Camera** – choose available `user` (front, mirrored) or `environment` cameras.
- **Quality** – Low (320×240), Medium (640×480) or High (1280×720) input resolution.
- **FPS** – target detection rate 15/24/30. The hand tracker throttles MediaPipe inference accordingly.

The 3D renderer adapts pixel ratio per preset and automatically resizes on orientation changes. When FPS drops the UI suggests switching to a lower preset.

## Gestures

| Gesture | Action |
| --- | --- |
| Single pinch | Draw/erase in the air. Stroke thickness reacts to pinch strength. |
| Double pinch | Toggle pen ↔ eraser. |
| Pinch + move (single hand) | Rotate the 3D figure around X/Y. Wrist twist adds Z rotation. |
| Two-hand pinch | Scale (distance), pan (parallel motion) and roll (relative wrist rotation) the figure. |
| Open palm | Show/hide glass UI panels. |
| Open palm (hold 1 s) | Reveal Quick Help overlay. |
| Closed fist | Pause/resume camera inference. |
| Thumbs up | Capture a PNG screenshot (3D + drawing layers). |
| Left palm swipe | Cycle through available figure types. |

Quick Help can also be toggled via the button in the top bar.

## Demo mode (no camera)

If a camera is blocked or unavailable, the app displays a fallback pane. Press **Enter demo mode** to continue with manual UI controls only (no gesture input). Drawing and 3D adjustments remain available via the side panels.

## Known limitations

- MediaPipe Tasks Vision requires WASM SIMD support; legacy browsers are not supported.
- Safari on iOS/iPadOS must load the page via HTTPS to unlock camera streams.
- Wrist rotation estimation for roll gestures depends on model stability; large occlusions may reduce accuracy.
- Screenshot export captures the 3D scene and drawing canvas (not the raw camera feed).

## Development notes

- No build tooling is required. All code is organised under `/src` with ES modules and uses CDN versions of Three.js and MediaPipe.
- Hand tracking runs via `requestVideoFrameCallback` when available and falls back to `requestAnimationFrame` otherwise.
- Gesture detection uses finite-state logic with hysteresis thresholds, pinch debouncing and optional double pinch windows.
- Drawing strokes are stored vectorially and rendered with adaptive smoothing, neon/marker shadowing and destination-out erasing.
- Three.js scene leverages MeshPhysicalMaterial with generated gradient environment maps to mimic PBR reflections.

### Suggested testing checklist

- iPad Safari (landscape & portrait): verify camera switch, drawing, undo/redo, neon brush, screenshot.
- Two-handed gestures: scale, pan, roll the figure.
- Open/close panels with an open palm; hold to trigger Quick Help.
- Pause/resume tracking with a fist, then resume and draw again.
- Desktop Safari/Chrome without camera permission: ensure demo mode works and UI remains responsive.

Enjoy exploring the studio! ✨
