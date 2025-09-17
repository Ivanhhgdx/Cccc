# Air-Hands Studio

Air-Hands Studio is an iPad-friendly web experience that lets you sketch in thin air while manipulating a holographic 3D object with expressive hand gestures. It runs entirely in the browser and works offline once loaded – simply open `index.html` over HTTPS on Safari (or any modern browser with camera access) to get started.

## Features

- **Dual-hand tracking** powered by MediaPipe Tasks Hands for precise gesture recognition.
- **Air drawing** with pressure-sensitive pinch gestures, neon/marker brushes, eraser, and history (Undo/Redo/Clear).
- **3D object control** using one- and two-hand pinches for rotation, scaling, panning, and roll.
- **Glassmorphism UI** optimised for touch with adaptive panels, quality/FPS controls, and live performance indicators.
- **Camera management** including front/back switching, mirroring for the selfie cam, and automatic quality fallback when FPS drops.
- **Screenshot capture** of the combined 3D scene and drawing canvas.
- **Demo fallback** when no camera is available, allowing manual exploration with sliders.

## Getting Started

1. Host the project over HTTPS (local static server or GitHub Pages). iOS Safari blocks camera access on plain `file://` URLs.
2. Open `index.html` on your iPad (recommended orientation: landscape). Grant camera permission when prompted.
3. Choose your preferred camera (Front/Back), quality profile, and FPS limit from the top bar.
4. Follow the gestures cheat sheet in the bottom panel or open Quick Help (hold an open palm for one second) for details.

### Development Notes

- No build step is required – ES modules are loaded directly from `/src`. Third-party dependencies are served via CDN (MediaPipe Tasks & three.js).
- The app uses `requestVideoFrameCallback` when available to keep inference tied to actual video frames. On older browsers it falls back to `requestAnimationFrame`.
- Settings such as brush colour, opacity, and thickness persist in `localStorage`.
- When the tab becomes inactive, inference is paused to save battery.

## Gesture Reference

| Gesture | Action |
| --- | --- |
| **Single-hand pinch** (index + thumb) | Start drawing. The stroke thickness responds to pinch strength. Release to stop.
| **Double pinch** | Toggle between Pen and Eraser modes.
| **Single pinch + move (ΔX / ΔY)** | Rotate the 3D object around Y/X axes. Subtle circular motion adds Z rotation.
| **Two-hand pinch** (both hands pinched) | Scale the object by changing hand distance, pan by moving both hands together, roll with relative hand rotation.
| **Open palm** | Show/hide the glass UI panels. Holding for 1 second opens the Quick Help overlay.
| **Fist** | Pause/resume camera processing (saves battery when you take a break).
| **Thumbs-up** | Capture a combined screenshot of the scene and drawing.
| **Left palm swipe** | Cycle between available 3D shapes (cube → sphere → torus → icosahedron).

## Controls & Panels

- **Top bar** – Camera picker, quality presets (Low/Medium/High), FPS limiter (15/24/30), and live status for hand count, latency, and rendering FPS.
- **Left panel (3D Scene)** – Object selector, material presets (Glass/Metal/Matte), metalness/roughness sliders, shadow toggle, and Reset Pose button.
- **Right panel (Drawing)** – Colour picker, opacity/thickness sliders, brush style selector, Undo/Redo/Clear, Eraser toggle, and Screenshot button.
- **Bottom panel** – Gestures cheat sheet with icons; collapsible via the Gestures button or Open Palm gesture.

## Known Limitations & Tips

- MediaPipe Hands works best with good lighting and contrasting backgrounds. Diffuse daylight or soft desk lamps produce stable tracking.
- iPad Safari requires HTTPS for camera access and performs best at 640×480 / 24 FPS. If performance drops below the FPS limit the app steps down to a lower resolution automatically.
- Front camera feeds are mirrored in the preview for intuitive drawing. The 3D scene remains unmirrored.
- Some desktop browsers may block autoplaying muted video – tap the video area if the feed does not start automatically.
- For optimal stability keep hands within the camera frame and avoid fast motion when performing double-pinches.

## Project Structure

```
/ (root)
├── index.html
├── README.md
├── /src
│   ├── app.js
│   ├── hand-tracker.js
│   ├── gestures.js
│   ├── draw.js
│   ├── scene3d.js
│   ├── ui.js
│   └── utils.js
├── /styles
│   └── styles.css
└── /assets
    └── logo.svg
```

## Testing Checklist

- ✅ iPad Safari (landscape & portrait): camera switching, dual-hand detection, drawing with pinch pressure, Undo/Redo/Clear, object rotation/scale/pan, screenshot capture, UI toggles, automatic resolution fallback.
- ✅ Desktop Safari/Chrome: gesture controls via camera, fallback demo mode when the camera is unavailable.
- ✅ No-camera environments: demo sliders exposed, no runtime crashes.

Enjoy creating luminous sketches in mid-air!
