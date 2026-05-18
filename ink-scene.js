import * as THREE from "three";

function lerpColor(a, b, t) {
  return Math.round(a + (b - a) * t);
}

const MAX_DROPS = 100;
const POOL_SIZE = 100;

export class InkScene {
  constructor() {
    this.sources = [];
    this.activeSource = null;
    this.scrollProgress = 0;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    this.canvas = document.createElement("canvas");
    this.canvas.className = "ink-canvas";
    this.canvas.setAttribute("aria-hidden", "true");
    this.canvas.tabIndex = -1;
    document.body.prepend(this.canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 0, 8);

    this.ambient = new THREE.AmbientLight(0xffffff, 0.55);
    this.keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
    this.keyLight.position.set(2, 4, 6);
    this.rimLight = new THREE.DirectionalLight(0xaaaaaa, 0.45);
    this.rimLight.position.set(-4, -2, 3);
    this.scene.add(this.ambient, this.keyLight, this.rimLight);

    this.inkMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x080808,
      metalness: 0.15,
      roughness: 0.18,
      clearcoat: 0.85,
      clearcoatRoughness: 0.12,
    });

    this.dropPool = [];
    this.freeDrops = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const geo = new THREE.SphereGeometry(1, 12, 12);
      const mesh = new THREE.Mesh(geo, this.inkMaterial);
      mesh.visible = false;
      this.scene.add(mesh);
      const drop = {
        mesh,
        life: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        stretch: 1,
        baseRadius: 0.04,
      };
      this.dropPool.push(drop);
      this.freeDrops.push(drop);
    }

    this.floorY = -4.2;
    this.puddles = [];
    this.spawnTimer = 0;

    this.onResize();
    window.addEventListener("resize", () => this.onResize());

    if (!this.reducedMotion) {
      this.animate();
    }
  }

  registerSource(el) {
    this.sources.push(el);
  }

  setScrollProgress(p) {
    this.scrollProgress = p;
    const inkTone = Math.round(lerpColor(8, 210, p));
    this.inkMaterial.color.setRGB(inkTone / 255, inkTone / 255, inkTone / 255);
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  screenToWorld(sx, sy, depth = 0) {
    const ndc = new THREE.Vector3(
      (sx / window.innerWidth) * 2 - 1,
      -(sy / window.innerHeight) * 2 + 1,
      0.5
    );
    ndc.unproject(this.camera);
    const dir = ndc.sub(this.camera.position).normalize();
    const dist = (depth - this.camera.position.z) / dir.z;
    return this.camera.position.clone().add(dir.multiplyScalar(dist));
  }

  spawnFromRect(rect) {
    if (this.freeDrops.length === 0) return;

    const x = rect.left + Math.random() * rect.width;
    const y = rect.bottom - 2 + Math.random() * 6;
    const pos = this.screenToWorld(x, y, 0);

    const drop = this.freeDrops.pop();
    drop.life = 1;
    drop.vx = (Math.random() - 0.5) * 0.012;
    drop.vy = -0.018 - Math.random() * 0.022;
    drop.vz = (Math.random() - 0.5) * 0.008;
    drop.stretch = 1;
    drop.baseRadius = 0.028 + Math.random() * 0.045;
    drop.mesh.position.copy(pos);
    drop.mesh.visible = true;
  }

  updateSources() {
    let best = null;
    let bestArea = 0;

    this.sources.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const visible =
        rect.bottom > 0 &&
        rect.top < window.innerHeight &&
        rect.width > 0;
      if (!visible) return;
      const area =
        Math.min(rect.bottom, window.innerHeight) -
        Math.max(rect.top, 0);
      if (area > bestArea) {
        bestArea = area;
        best = el;
      }
    });

    this.activeSource = best;
  }

  acquireDrop() {
    if (this.freeDrops.length === 0) return null;
    return this.freeDrops.pop();
  }

  releaseDrop(drop) {
    drop.mesh.visible = false;
    drop.life = 0;
    this.freeDrops.push(drop);
  }

  updateDrops(dt) {
    const active = this.dropPool.filter((d) => d.life > 0);

    active.forEach((drop) => {
      drop.vy -= 0.00085;
      drop.mesh.position.x += drop.vx;
      drop.mesh.position.y += drop.vy;
      drop.mesh.position.z += drop.vz;

      const speed = Math.abs(drop.vy);
      drop.stretch = 1 + speed * 38;
      const r = drop.baseRadius;
      drop.mesh.scale.set(r, r * drop.stretch, r);

      drop.life -= dt * 0.35;

      if (drop.mesh.position.y < this.floorY) {
        drop.mesh.position.y = this.floorY;
        drop.vy *= -0.08;
        drop.vx *= 0.6;
        drop.stretch = 0.55;
        drop.mesh.scale.set(r * 1.8, r * 0.35, r * 1.8);
        drop.life -= dt * 1.2;
      }

      if (drop.life <= 0) this.releaseDrop(drop);
    });
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const dt = 0.016;
    this.updateSources();

    this.spawnTimer -= dt;
    if (this.activeSource && this.spawnTimer <= 0) {
      const rect = this.activeSource.getBoundingClientRect();
      const count = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < count; i++) {
        if (this.dropPool.filter((d) => d.life > 0).length < MAX_DROPS) {
          this.spawnFromRect(rect);
        }
      }
      this.spawnTimer = 0.06 + Math.random() * 0.1;
    }

    this.updateDrops(dt);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.dispose();
    this.dropPool.forEach((d) => d.mesh.geometry.dispose());
  }
}
