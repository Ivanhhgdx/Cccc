import { createEventTarget } from "./utils.js";

const STORAGE_KEY = "air-hands-settings";

export class UIController {
  constructor() {
    this.events = createEventTarget();
    this.elements = {
      cameraSelect: document.getElementById("camera-select"),
      qualitySelect: document.getElementById("quality-select"),
      fpsSelect: document.getElementById("fps-select"),
      shapeSelect: document.getElementById("shape-select"),
      materialSelect: document.getElementById("material-select"),
      metallicRange: document.getElementById("metallic-range"),
      roughnessRange: document.getElementById("roughness-range"),
      shadowToggle: document.getElementById("shadow-toggle"),
      lightingSelect: document.getElementById("lighting-select"),
      resetPose: document.getElementById("reset-pose"),
      modeSelect: document.getElementById("mode-select"),
      colorPicker: document.getElementById("color-picker"),
      opacityRange: document.getElementById("opacity-range"),
      thicknessRange: document.getElementById("thickness-range"),
      brushSelect: document.getElementById("brush-select"),
      undo: document.getElementById("undo"),
      redo: document.getElementById("redo"),
      clear: document.getElementById("clear"),
      screenshot: document.getElementById("screenshot"),
      quickHelpToggle: document.getElementById("quick-help-toggle"),
      gesturesPanel: document.getElementById("gestures-panel"),
      handsCount: document.getElementById("hands-count"),
      latency: document.getElementById("latency"),
      fps: document.getElementById("fps"),
      noCamera: document.getElementById("no-camera"),
      enterDemo: document.getElementById("enter-demo"),
      overlay: document.getElementById("glass-overlay"),
    };

    this.state = {
      uiVisible: true,
      helpVisible: false,
      demoMode: false,
    };

    this.settings = this.#loadSettings();
    this.#applySettings();
    this.#bind();
  }

  on(event, handler) {
    this.events.on(event, handler);
  }

  emit(event, detail) {
    this.events.emit(event, detail);
  }

  #bind() {
    const {
      cameraSelect,
      qualitySelect,
      fpsSelect,
      shapeSelect,
      materialSelect,
      metallicRange,
      roughnessRange,
      shadowToggle,
      lightingSelect,
      resetPose,
      modeSelect,
      colorPicker,
      opacityRange,
      thicknessRange,
      brushSelect,
      undo,
      redo,
      clear,
      screenshot,
      quickHelpToggle,
      enterDemo,
    } = this.elements;

    cameraSelect?.addEventListener("change", () => this.emit("camera-change", cameraSelect.value));
    qualitySelect?.addEventListener("change", () => {
      this.settings.quality = qualitySelect.value;
      this.#saveSettings();
      this.emit("quality-change", qualitySelect.value);
    });
    fpsSelect?.addEventListener("change", () => {
      this.settings.fps = fpsSelect.value;
      this.#saveSettings();
      this.emit("fps-change", Number(fpsSelect.value));
    });

    shapeSelect?.addEventListener("change", () => {
      this.settings.shape = shapeSelect.value;
      this.#saveSettings();
      this.emit("shape-change", shapeSelect.value);
    });

    materialSelect?.addEventListener("change", () => {
      this.settings.material = materialSelect.value;
      this.#saveSettings();
      this.emit("material-change", materialSelect.value);
    });

    metallicRange?.addEventListener("input", () => {
      this.settings.metallic = Number(metallicRange.value);
      this.#saveSettings();
      this.emit("material-tweak", { metalness: Number(metallicRange.value) });
    });

    roughnessRange?.addEventListener("input", () => {
      this.settings.roughness = Number(roughnessRange.value);
      this.#saveSettings();
      this.emit("material-tweak", { roughness: Number(roughnessRange.value) });
    });

    shadowToggle?.addEventListener("change", () => {
      this.settings.shadows = shadowToggle.checked;
      this.#saveSettings();
      this.emit("shadow-toggle", shadowToggle.checked);
    });

    lightingSelect?.addEventListener("change", () => {
      this.settings.lighting = lightingSelect.value;
      this.#saveSettings();
      this.emit("lighting-change", lightingSelect.value);
    });

    resetPose?.addEventListener("click", () => this.emit("reset-pose"));

    modeSelect?.addEventListener("change", () => {
      this.settings.mode = modeSelect.value;
      this.#saveSettings();
      this.emit("draw-mode", modeSelect.value);
    });

    colorPicker?.addEventListener("input", () => {
      this.settings.color = colorPicker.value;
      this.#saveSettings();
      this.emit("color-change", colorPicker.value);
    });

    opacityRange?.addEventListener("input", () => {
      this.settings.opacity = Number(opacityRange.value);
      this.#saveSettings();
      this.emit("opacity-change", Number(opacityRange.value));
    });

    thicknessRange?.addEventListener("input", () => {
      this.settings.thickness = Number(thicknessRange.value);
      this.#saveSettings();
      this.emit("thickness-change", Number(thicknessRange.value));
    });

    brushSelect?.addEventListener("change", () => {
      this.settings.brush = brushSelect.value;
      this.#saveSettings();
      this.emit("brush-change", brushSelect.value);
    });

    undo?.addEventListener("click", () => this.emit("undo"));
    redo?.addEventListener("click", () => this.emit("redo"));
    clear?.addEventListener("click", () => this.emit("clear"));
    screenshot?.addEventListener("click", () => this.emit("screenshot"));

    quickHelpToggle?.addEventListener("click", () => {
      this.state.helpVisible = !this.state.helpVisible;
      this.toggleHelp(this.state.helpVisible);
    });

    enterDemo?.addEventListener("click", () => {
      this.state.demoMode = true;
      this.emit("demo-mode", true);
      this.hideNoCamera();
    });
  }

  #loadSettings() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch (error) {
      console.warn("Unable to access localStorage", error);
    }
    return {
      quality: "medium",
      fps: 30,
      shape: "cube",
      material: "metal",
      metallic: 0.8,
      roughness: 0.2,
      lighting: "studio",
      shadows: true,
      mode: "pen",
      color: "#ff4f8b",
      opacity: 0.9,
      thickness: 8,
      brush: "solid",
    };
  }

  #applySettings() {
    const s = this.settings;
    Object.assign(this.elements.qualitySelect || {}, { value: s.quality });
    Object.assign(this.elements.fpsSelect || {}, { value: String(s.fps) });
    Object.assign(this.elements.shapeSelect || {}, { value: s.shape });
    Object.assign(this.elements.materialSelect || {}, { value: s.material });
    Object.assign(this.elements.metallicRange || {}, { value: s.metallic });
    Object.assign(this.elements.roughnessRange || {}, { value: s.roughness });
    if (this.elements.shadowToggle) this.elements.shadowToggle.checked = Boolean(s.shadows);
    Object.assign(this.elements.lightingSelect || {}, { value: s.lighting });
    Object.assign(this.elements.modeSelect || {}, { value: s.mode });
    Object.assign(this.elements.colorPicker || {}, { value: s.color });
    Object.assign(this.elements.opacityRange || {}, { value: s.opacity });
    Object.assign(this.elements.thicknessRange || {}, { value: s.thickness });
    Object.assign(this.elements.brushSelect || {}, { value: s.brush });
  }

  #saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch (error) {
      console.warn("localStorage unavailable", error);
    }
  }

  updateCameraList(devices, activeId) {
    const select = this.elements.cameraSelect;
    if (!select) return;
    const current = select.value;
    select.innerHTML = "";
    devices.forEach((device) => {
      const option = document.createElement("option");
      option.value = device.deviceId || device.id;
      option.textContent = device.label || `${device.kind} ${select.length + 1}`;
      option.dataset.facing = device.facingMode || "";
      select.appendChild(option);
    });
    if (activeId && [...select.options].some((opt) => opt.value === activeId)) {
      select.value = activeId;
    } else if (current) {
      select.value = current;
    }
  }

  updateStats({ hands = 0, latency = 0, fps = 0 }) {
    if (this.elements.handsCount) this.elements.handsCount.textContent = `Hands: ${hands}`;
    if (this.elements.latency) this.elements.latency.textContent = `Latency: ${latency.toFixed(0)}ms`;
    if (this.elements.fps) this.elements.fps.textContent = `FPS: ${fps.toFixed(0)}`;
  }

  toggleUI(visible) {
    this.state.uiVisible = visible ?? !this.state.uiVisible;
    const panels = document.querySelectorAll(".glass-panel");
    panels.forEach((panel) => {
      if (panel.id === "no-camera") return;
      panel.classList.toggle("hidden", !this.state.uiVisible);
    });
  }

  toggleHelp(visible) {
    this.state.helpVisible = visible ?? !this.state.helpVisible;
    const { gesturesPanel, quickHelpToggle } = this.elements;
    if (!gesturesPanel) return;
    if (this.state.helpVisible) {
      gesturesPanel.hidden = false;
      quickHelpToggle?.setAttribute("aria-expanded", "true");
    } else {
      gesturesPanel.hidden = true;
      quickHelpToggle?.setAttribute("aria-expanded", "false");
    }
  }

  showNoCamera() {
    this.elements.noCamera?.removeAttribute("hidden");
    this.toggleUI(false);
  }

  hideNoCamera() {
    this.elements.noCamera?.setAttribute("hidden", "");
    this.toggleUI(true);
  }

  notify(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("visible"));
    setTimeout(() => {
      toast.classList.remove("visible");
      setTimeout(() => toast.remove(), 320);
    }, 2600);
  }
}
