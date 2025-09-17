import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.module.js";

function createGradientTexture(preset = "studio") {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(128, 96, 10, 128, 128, 180);
  switch (preset) {
    case "sunset":
      gradient.addColorStop(0, "#ffb37a");
      gradient.addColorStop(0.45, "#ff6f91");
      gradient.addColorStop(1, "#5b2c83");
      break;
    case "cool":
      gradient.addColorStop(0, "#6bf5ff");
      gradient.addColorStop(0.5, "#3580ff");
      gradient.addColorStop(1, "#141d4d");
      break;
    case "studio":
    default:
      gradient.addColorStop(0, "#ffffff");
      gradient.addColorStop(0.6, "#d0d5ff");
      gradient.addColorStop(1, "#1d233d");
      break;
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}

const MATERIAL_PRESETS = {
  glass: { color: 0xffffff, metalness: 0.15, roughness: 0.1, transmission: 0.75, transparent: true },
  metal: { color: 0xb7c5ff, metalness: 0.85, roughness: 0.25 },
  matte: { color: 0xf5f5f7, metalness: 0.05, roughness: 0.65 },
};

export class Scene3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.physicallyCorrectLights = true;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 0.8, 2.4);
    this.clock = new THREE.Clock();
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.currentEnvMap = null;
    this.currentEnvTarget = null;

    this.mixer = null;

    this.material = new THREE.MeshPhysicalMaterial({
      metalness: 0.8,
      roughness: 0.2,
      color: new THREE.Color(MATERIAL_PRESETS.metal.color),
      envMapIntensity: 1.2,
    });

    this.mesh = null;
    this.currentShape = "cube";
    this.currentLighting = "studio";

    this.#setupLights();
    this.setLighting("studio");
    this.setShape("cube");

    this.rotationVelocity = new THREE.Vector3();
    this.translation = new THREE.Vector3();
    this.scaleFactor = 1;

    this.quality = "medium";
    this.handleResize();
    window.addEventListener("resize", () => this.handleResize());

    this.isPaused = false;
    this.renderer.setAnimationLoop(() => this.animate());
  }

  handleResize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = rect.width;
    const height = rect.height;
    this.renderer.setPixelRatio(Math.min(2, dpr));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height || 1;
    this.camera.updateProjectionMatrix();
  }

  #setupLights() {
    this.scene.clear();
    this.group = new THREE.Group();
    this.scene.add(this.group);

    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    const hemi = new THREE.HemisphereLight(0xb5c7ff, 0x1b233d, 0.5);
    this.scene.add(ambient);
    this.scene.add(hemi);

    this.keyLight = new THREE.DirectionalLight(0xffffff, 1.25);
    this.keyLight.position.set(2.5, 3.5, 2.2);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.bias = -0.0004;
    this.scene.add(this.keyLight);

    this.fillLight = new THREE.SpotLight(0xff9ef5, 0.65);
    this.fillLight.position.set(-3, 2.5, 2.4);
    this.fillLight.castShadow = false;
    this.scene.add(this.fillLight);

    this.rimLight = new THREE.DirectionalLight(0x92b4ff, 0.75);
    this.rimLight.position.set(1.5, 2.8, -2.6);
    this.scene.add(this.rimLight);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 10),
      new THREE.ShadowMaterial({ opacity: 0.18 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.85;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  setShape(shape) {
    this.currentShape = shape;
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
    }

    let geometry;
    switch (shape) {
      case "sphere":
        geometry = new THREE.SphereGeometry(0.6, 64, 64);
        break;
      case "torus":
        geometry = new THREE.TorusKnotGeometry(0.45, 0.16, 200, 32);
        break;
      case "icosahedron":
        geometry = new THREE.IcosahedronGeometry(0.7, 1);
        break;
      case "cube":
      default:
        geometry = new THREE.BoxGeometry(1, 1, 1, 16, 16, 16);
        break;
    }

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);
  }

  setMaterialPreset(preset) {
    const settings = MATERIAL_PRESETS[preset] || MATERIAL_PRESETS.metal;
    this.material.color = new THREE.Color(settings.color);
    this.material.metalness = settings.metalness;
    this.material.roughness = settings.roughness;
    this.material.transmission = settings.transmission ?? 0;
    this.material.transparent = Boolean(settings.transparent);
    this.material.opacity = settings.transparent ? 0.85 : 1;
    this.material.needsUpdate = true;
  }

  updateMaterial({ metalness, roughness }) {
    if (typeof metalness === "number") this.material.metalness = metalness;
    if (typeof roughness === "number") this.material.roughness = roughness;
  }

  setLighting(preset) {
    this.currentLighting = preset;
    const texture = createGradientTexture(preset);
    const envTarget = this.pmremGenerator.fromEquirectangular(texture);
    if (this.currentEnvMap) {
      this.currentEnvMap.dispose();
    }
    if (this.currentEnvTarget) {
      this.currentEnvTarget.dispose();
    }
    this.currentEnvTarget = envTarget;
    this.currentEnvMap = envTarget.texture;
    this.scene.environment = this.currentEnvMap;
    this.scene.background = null;
    texture.dispose?.();
  }

  toggleShadows(enabled) {
    this.renderer.shadowMap.enabled = enabled;
    if (this.mesh) {
      this.mesh.castShadow = enabled;
      this.mesh.receiveShadow = enabled;
    }
  }

  applyRotation(deltaX, deltaY, deltaZ = 0) {
    if (!this.mesh) return;
    const factor = 0.005;
    this.mesh.rotation.y += deltaX * factor;
    this.mesh.rotation.x += deltaY * factor;
    this.mesh.rotation.z += deltaZ * factor;
  }

  applyTranslation(deltaX, deltaY) {
    if (!this.mesh) return;
    const factor = 0.0015;
    this.mesh.position.x += deltaX * factor;
    this.mesh.position.y -= deltaY * factor;
    this.mesh.position.x = THREE.MathUtils.clamp(this.mesh.position.x, -0.8, 0.8);
    this.mesh.position.y = THREE.MathUtils.clamp(this.mesh.position.y, -0.6, 0.8);
  }

  applyScale(scale) {
    if (!this.mesh || !scale) return;
    this.scaleFactor = THREE.MathUtils.clamp(this.scaleFactor * scale, 0.35, 2.5);
    this.mesh.scale.setScalar(this.scaleFactor);
  }

  resetPose() {
    if (!this.mesh) return;
    this.mesh.rotation.set(0.3, 0.6, 0);
    this.mesh.position.set(0, 0, 0);
    this.scaleFactor = 1;
    this.mesh.scale.setScalar(1);
  }

  updateQuality(level) {
    this.quality = level;
    let maxDpr = 1.5;
    let scale = 1;
    switch (level) {
      case "low":
        maxDpr = 1;
        scale = 0.75;
        break;
      case "high":
        maxDpr = 2;
        scale = 1;
        break;
      case "medium":
      default:
        maxDpr = 1.5;
        scale = 0.85;
        break;
    }
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(rect.width * scale, rect.height * scale, false);
    this.camera.aspect = (rect.width || 1) / (rect.height || 1);
    this.camera.updateProjectionMatrix();
  }

  animate() {
    if (this.isPaused) return;
    const elapsed = this.clock.getElapsedTime();
    if (this.mesh && !isNaN(elapsed)) {
      this.mesh.rotation.y += 0.0006;
    }
    this.renderer.render(this.scene, this.camera);
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
  }
}
