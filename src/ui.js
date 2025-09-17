const STORAGE_KEY = 'air-hands-settings-v1';

class UIController {
  constructor() {
    this.elements = {
      cameraSelect: document.getElementById('camera-select'),
      qualitySelect: document.getElementById('quality-select'),
      fpsSelect: document.getElementById('fps-select'),
      statusHands: document.getElementById('status-hands'),
      statusLatency: document.getElementById('status-latency'),
      statusFps: document.getElementById('status-fps'),
      colorPicker: document.getElementById('color-picker'),
      opacity: document.getElementById('opacity'),
      thickness: document.getElementById('thickness'),
      brushSelect: document.getElementById('brush-select'),
      undo: document.getElementById('undo'),
      redo: document.getElementById('redo'),
      clear: document.getElementById('clear'),
      eraser: document.getElementById('toggle-eraser'),
      screenshot: document.getElementById('screenshot'),
      resetPose: document.getElementById('reset-pose'),
      materialSelect: document.getElementById('material-select'),
      metalness: document.getElementById('metalness'),
      roughness: document.getElementById('roughness'),
      shadows: document.getElementById('shadows-toggle'),
      leftPanel: document.getElementById('scene-panel'),
      rightPanel: document.getElementById('drawing-panel'),
      bottomBar: document.getElementById('gestures-help'),
      toggleHelp: document.getElementById('toggle-help'),
      quickHelp: document.getElementById('quick-help'),
      closeHelp: document.getElementById('close-help'),
      fallback: document.getElementById('fallback'),
      demoRotate: document.getElementById('demo-rotate'),
      demoScale: document.getElementById('demo-scale'),
      demoOpacity: document.getElementById('demo-opacity'),
    };

    this.listeners = {};
    this.panelsVisible = true;

    this._bindEvents();
    this._loadSettings();
    this.setTool('draw');
  }

  _bindEvents() {
    this.elements.qualitySelect.addEventListener('change', (e) =>
      this._emit('quality', e.target.value)
    );
    this.elements.fpsSelect.addEventListener('change', (e) =>
      this._emit('fps', parseInt(e.target.value, 10))
    );
    this.elements.cameraSelect.addEventListener('change', (e) =>
      this._emit('camera', e.target.value)
    );
    this.elements.colorPicker.addEventListener('input', (e) => {
      this._saveSettings();
      this._emit('color', e.target.value);
    });
    this.elements.opacity.addEventListener('input', (e) => {
      this._saveSettings();
      this._emit('opacity', parseFloat(e.target.value));
    });
    this.elements.thickness.addEventListener('input', (e) => {
      this._saveSettings();
      this._emit('thickness', parseFloat(e.target.value));
    });
    this.elements.brushSelect.addEventListener('change', (e) => {
      this._saveSettings();
      this._emit('brush', e.target.value);
    });
    this.elements.undo.addEventListener('click', () => this._emit('undo'));
    this.elements.redo.addEventListener('click', () => this._emit('redo'));
    this.elements.clear.addEventListener('click', () => this._emit('clear'));
    this.elements.eraser.addEventListener('click', () => this._emit('eraser-toggle'));
    this.elements.screenshot.addEventListener('click', () => this._emit('screenshot'));
    this.elements.resetPose.addEventListener('click', () => this._emit('reset-pose'));
    this.elements.materialSelect.addEventListener('change', (e) =>
      this._emit('material', e.target.value)
    );
    this.elements.metalness.addEventListener('input', (e) =>
      this._emit('metalness', parseFloat(e.target.value))
    );
    this.elements.roughness.addEventListener('input', (e) =>
      this._emit('roughness', parseFloat(e.target.value))
    );
    this.elements.shadows.addEventListener('change', (e) =>
      this._emit('shadows', e.target.checked)
    );
    this.elements.toggleHelp.addEventListener('click', () => this.toggleHelp(true));
    this.elements.closeHelp.addEventListener('click', () => this.toggleHelp(false));

    ['demoRotate', 'demoScale', 'demoOpacity'].forEach((key) => {
      this.elements[key].addEventListener('input', () => this._emit('demo-change'));
    });
  }

  _loadSettings() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!stored) return;
      if (stored.color) this.elements.colorPicker.value = stored.color;
      if (stored.opacity) this.elements.opacity.value = stored.opacity;
      if (stored.thickness) this.elements.thickness.value = stored.thickness;
      if (stored.brush) this.elements.brushSelect.value = stored.brush;
      this._emit('color', this.elements.colorPicker.value);
      this._emit('opacity', parseFloat(this.elements.opacity.value));
      this._emit('thickness', parseFloat(this.elements.thickness.value));
      this._emit('brush', this.elements.brushSelect.value);
    } catch (err) {
      console.warn('Could not load settings', err);
    }
  }

  _saveSettings() {
    const data = {
      color: this.elements.colorPicker.value,
      opacity: this.elements.opacity.value,
      thickness: this.elements.thickness.value,
      brush: this.elements.brushSelect.value,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  on(event, callback) {
    this.listeners[event] = callback;
  }

  _emit(event, payload) {
    if (typeof this.listeners[event] === 'function') {
      this.listeners[event](payload);
    }
  }

  updateStatus({ hands = 0, latency = '--', fps = '--' }) {
    this.elements.statusHands.textContent = `Hands: ${hands}`;
    this.elements.statusLatency.textContent = `Latency: ${latency}`;
    this.elements.statusFps.textContent = `FPS: ${fps}`;
  }

  setDevices(devices) {
    this.elements.cameraSelect.innerHTML = '';
    devices.forEach((device) => {
      const option = document.createElement('option');
      option.value = device.deviceId || device.label;
      option.textContent = device.label || `Camera ${this.elements.cameraSelect.length + 1}`;
      this.elements.cameraSelect.appendChild(option);
    });
  }

  selectCamera(deviceId) {
    this.elements.cameraSelect.value = deviceId;
  }

  setPanelsVisible(visible) {
    this.panelsVisible = visible ?? !this.panelsVisible;
    const method = this.panelsVisible ? 'remove' : 'add';
    this.elements.leftPanel.classList[method]('hidden');
    this.elements.rightPanel.classList[method]('hidden');
    this.elements.bottomBar.classList[method]('hidden');
  }

  toggleHelp(force) {
    const show = force ?? this.elements.quickHelp.classList.contains('hidden');
    this.elements.quickHelp.classList.toggle('hidden', !show);
  }

  setFallbackVisible(visible) {
    this.elements.fallback.classList.toggle('hidden', !visible);
  }

  onDemoChange(callback) {
    this.listeners['demo-change'] = () => {
      callback({
        rotate: parseFloat(this.elements.demoRotate.value),
        scale: parseFloat(this.elements.demoScale.value),
        opacity: parseFloat(this.elements.demoOpacity.value),
      });
    };
  }

  setTool(tool) {
    this.elements.eraser.textContent = tool === 'erase' ? 'Pen' : 'Eraser';
  }
}

export { UIController };
