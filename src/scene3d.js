import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

class Scene3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.shadowMap.enabled = true;
    this.scene = new THREE.Scene();
    this.scene.background = null;

    this.camera = new THREE.PerspectiveCamera(45, this._aspect(), 0.1, 100);
    this.camera.position.set(0, 0, 4.5);

    this.clock = new THREE.Clock();
    this.modelGroup = new THREE.Group();
    this.scene.add(this.modelGroup);

    this.envLight = new THREE.AmbientLight(0xffffff, 0.65);
    this.scene.add(this.envLight);

    this.keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
    this.keyLight.position.set(3, 4, 5);
    this.keyLight.castShadow = true;
    this.scene.add(this.keyLight);

    this.fillLight = new THREE.PointLight(0x7d8bff, 0.5);
    this.fillLight.position.set(-3, -2, 4);
    this.scene.add(this.fillLight);

    this.shadowsEnabled = true;

    this.currentMesh = null;
    this.objectType = 'cube';
    this.materialType = 'metal';
    this.materialProps = {
      metalness: 0.7,
      roughness: 0.25,
    };

    this.targetRotation = new THREE.Euler();
    this.targetPosition = new THREE.Vector3();
    this.targetScale = new THREE.Vector3(1, 1, 1);

    this._createGround();
    this.createObject(this.objectType);
    window.addEventListener('resize', () => this._resize());
    this._resize();
  }

  _aspect() {
    return this.canvas.clientWidth / this.canvas.clientHeight || 1;
  }

  _resize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = this._aspect();
    this.camera.updateProjectionMatrix();
  }

  _createGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.ShadowMaterial({ color: 0x111111, opacity: 0.25 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  _createMaterial(type = 'metal') {
    const base = {
      color: new THREE.Color('#cfd9ff'),
      roughness: this.materialProps.roughness,
      metalness: this.materialProps.metalness,
      transmission: 0,
      thickness: 0,
      clearcoat: 0.4,
      clearcoatRoughness: 0.2,
      envMapIntensity: 0.9,
    };

    if (type === 'glass') {
      base.color = new THREE.Color('#b8f1ff');
      base.transmission = 0.95;
      base.roughness = 0.1;
      base.metalness = 0.05;
      base.thickness = 0.6;
      base.envMapIntensity = 1.2;
    } else if (type === 'matte') {
      base.color = new THREE.Color('#f2f5ff');
      base.metalness = 0.2;
      base.roughness = 0.6;
    }

    return new THREE.MeshPhysicalMaterial(base);
  }

  createObject(type) {
    this.objectType = type;
    if (this.currentMesh) {
      this.modelGroup.remove(this.currentMesh);
      this.currentMesh.geometry.dispose();
      if (this.currentMesh.material) {
        this.currentMesh.material.dispose();
      }
    }

    let geometry;
    switch (type) {
      case 'sphere':
        geometry = new THREE.SphereGeometry(1.1, 64, 64);
        break;
      case 'torus':
        geometry = new THREE.TorusGeometry(0.9, 0.35, 48, 128);
        break;
      case 'icosahedron':
        geometry = new THREE.IcosahedronGeometry(1.1, 1);
        break;
      default:
        geometry = new THREE.BoxGeometry(1.6, 1.6, 1.6, 32, 32, 32);
    }

    const material = this._createMaterial(this.materialType);
    this.currentMesh = new THREE.Mesh(geometry, material);
    this.currentMesh.castShadow = true;
    this.modelGroup.add(this.currentMesh);
  }

  setMaterial(type) {
    this.materialType = type;
    if (this.currentMesh) {
      this.currentMesh.material.dispose();
      this.currentMesh.material = this._createMaterial(type);
    }
  }

  setMaterialProperty(prop, value) {
    this.materialProps[prop] = value;
    if (this.currentMesh && this.currentMesh.material) {
      this.currentMesh.material[prop] = value;
      this.currentMesh.material.needsUpdate = true;
    }
  }

  setShadows(enabled) {
    this.shadowsEnabled = enabled;
    this.renderer.shadowMap.enabled = enabled;
    if (this.currentMesh) {
      this.currentMesh.castShadow = enabled;
    }
  }

  rotate(deltaX, deltaY, deltaZ = 0) {
    this.targetRotation.x += THREE.MathUtils.degToRad(deltaY);
    this.targetRotation.y += THREE.MathUtils.degToRad(deltaX);
    this.targetRotation.z += THREE.MathUtils.degToRad(deltaZ);
  }

  translate(deltaX, deltaY) {
    this.targetPosition.x += deltaX * 3;
    this.targetPosition.y -= deltaY * 3;
  }

  scale(factor) {
    this.targetScale.multiplyScalar(factor);
    this.targetScale.clampScalar(0.4, 4);
  }

  resetPose() {
    this.targetRotation.set(0, 0, 0);
    this.targetPosition.set(0, 0, 0);
    this.targetScale.set(1, 1, 1);
  }

  update(delta) {
    if (!this.currentMesh) return;
    this.modelGroup.rotation.x = THREE.MathUtils.lerp(
      this.modelGroup.rotation.x,
      this.targetRotation.x,
      0.15
    );
    this.modelGroup.rotation.y = THREE.MathUtils.lerp(
      this.modelGroup.rotation.y,
      this.targetRotation.y,
      0.15
    );
    this.modelGroup.rotation.z = THREE.MathUtils.lerp(
      this.modelGroup.rotation.z,
      this.targetRotation.z,
      0.15
    );

    this.modelGroup.position.lerp(this.targetPosition, 0.18);

    this.modelGroup.scale.lerp(this.targetScale, 0.18);
  }

  render() {
    const delta = this.clock.getDelta();
    this.update(delta);
    this.renderer.render(this.scene, this.camera);
  }

  getCanvas() {
    return this.renderer.domElement;
  }
}

export { Scene3D };
