import * as THREE from "three";

const MAX_GOTAS = 130;
const MAX_FLUJO = 320;
const CANTIDAD_GRIFOS = 22;
const MAX_MANCHAS = 120;
const GRAVEDAD = 0.00016;
const ARRASTRE = 0.9994;
const VEL_TERMINAL = -0.0072;
const DURACION_FLUJO = 2.6;
const DURACION_MANCHA = 16;

const _ejeY = new THREE.Vector3(0, 1, 0);
const _vel = new THREE.Vector3();

export class InkScene {
  constructor() {
    this.gotasLibres = [];
    this.flujosLibres = [];
    this.tiempo = 0;
    this.sueloY = -4;

    const sinAnimacion = matchMedia("(prefers-reduced-motion: reduce)").matches;

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
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.z = 8;

    this.scene.add(new THREE.AmbientLight(0xfff5f0, 0.7));
    const luz = new THREE.DirectionalLight(0xffffff, 0.85);
    luz.position.set(2, 6, 5);
    this.scene.add(luz);

    this.matGota = new THREE.MeshStandardMaterial({
      color: 0x6e0808,
      metalness: 0.02,
      roughness: 0.38,
    });

    this.matFlujoBase = new THREE.MeshStandardMaterial({
      color: 0x750909,
      metalness: 0,
      roughness: 0.5,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    });

    this.matMancha = new THREE.MeshStandardMaterial({
      color: 0x5a0000,
      metalness: 0,
      roughness: 0.58,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });

    this.geoGota = new THREE.SphereGeometry(1, 16, 12);
    this.geoFlujo = new THREE.SphereGeometry(1, 8, 8);
    this.geoMancha = new THREE.CircleGeometry(1, 40);

    this.gotas = [];
    for (let i = 0; i < MAX_GOTAS; i++) {
      const malla = new THREE.Mesh(this.geoGota, this.matGota);
      malla.visible = false;
      this.scene.add(malla);
      const g = { malla, vida: 0, vy: 0, vx: 0, radio: 0.015, timerRastro: 0, peso: 1 };
      this.gotas.push(g);
      this.gotasLibres.push(g);
    }

    this.flujos = [];
    for (let i = 0; i < MAX_FLUJO; i++) {
      const mat = this.matFlujoBase.clone();
      const malla = new THREE.Mesh(this.geoFlujo, mat);
      malla.visible = false;
      this.scene.add(malla);
      const f = { malla, mat, vida: 0, grosor: 0.01, largo: 0.03 };
      this.flujos.push(f);
      this.flujosLibres.push(f);
    }

    this.grifos = Array.from({ length: CANTIDAD_GRIFOS }, (_, i) => {
      const grifo = {
        xBase: 0.04 + (i / (CANTIDAD_GRIFOS - 1)) * 0.92,
        yBase: 0.02 + (i % 5) * 0.018,
        fase: Math.random() * Math.PI * 2,
        velMecha: 0.3 + Math.random() * 0.5,
        actividad: 0.25 + Math.random() * 0.5,
        temporizador: 0,
        proximaGota: 0,
        enRacha: false,
        gotasRestantesRacha: 0,
      };
      grifo.proximaGota = this.esperaEntreGotas(grifo) + (i / CANTIDAD_GRIFOS) * 2.5;
      return grifo;
    });

    this.manchas = [];
    for (let i = 0; i < MAX_MANCHAS; i++) {
      const malla = new THREE.Mesh(this.geoMancha, this.matMancha);
      malla.rotation.x = -Math.PI / 2;
      malla.visible = false;
      this.scene.add(malla);
      this.manchas.push({
        malla,
        activa: false,
        vida: 0,
        radio: 0.04,
        crecer: 0,
        rx: 1,
        rz: 1,
      });
    }

    this.redimensionar();
    addEventListener("resize", () => this.redimensionar());
    if (!sinAnimacion) this.animar();
  }

  setScrollProgress(progreso) {
    const r = (100 + progreso * 100) / 255;
    const g = (4 + progreso * 18) / 255;
    const b = (4 + progreso * 18) / 255;
    this.matGota.color.setRGB(r, g, b);
    this.matFlujoBase.color.setRGB(r * 1.03, g * 0.95, b * 0.95);
    this.matMancha.color.setRGB(r * 0.82, g * 0.75, b * 0.75);
  }

  redimensionar() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.sueloY = this.pantallaAMundo(innerWidth * 0.5, innerHeight).y;
  }

  pantallaAMundo(x, y) {
    const v = new THREE.Vector3(
      (x / innerWidth) * 2 - 1,
      -(y / innerHeight) * 2 + 1,
      0.5
    );
    v.unproject(this.camera);
    v.sub(this.camera.position).normalize();
    return this.camera.position
      .clone()
      .add(v.multiplyScalar(-this.camera.position.z / v.z));
  }

  orientarConVelocidad(malla, vx, vy, vz = 0) {
    _vel.set(vx, vy, vz);
    if (_vel.lengthSq() < 1e-12) return;
    _vel.normalize();
    malla.quaternion.setFromUnitVectors(_ejeY, _vel);
  }

  tomarGota() {
    return this.gotasLibres.length ? this.gotasLibres.pop() : null;
  }

  liberarGota(g) {
    g.malla.visible = false;
    g.vida = 0;
    this.gotasLibres.push(g);
  }

  tomarFlujo() {
    return this.flujosLibres.length ? this.flujosLibres.pop() : null;
  }

  liberarFlujo(f) {
    f.malla.visible = false;
    f.vida = 0;
    this.flujosLibres.push(f);
  }

  dejarRastro(x, y, z, vy, vx, radio, opacidad = 1) {
    const f = this.tomarFlujo();
    if (!f) return;

    f.malla.position.set(x, y, z);
    f.vida = 1;
    const vel = Math.sqrt(vx * vx + vy * vy);
    f.grosor = radio * (0.55 + Math.random() * 0.3) * (0.7 + Math.min(vel * 80, 0.5));
    f.largo = f.grosor * (1.4 + vel * 42 + Math.random() * 0.9);
    f.mat.opacity = 0.72 * opacidad;
    f.malla.visible = true;
    this.orientarConVelocidad(f.malla, vx, vy);
    this.actualizarFlujo(f);
  }

  actualizarFlujo(f) {
    const t = f.vida;
    const fade = t * t * (3 - 2 * t);
    f.mat.opacity = fade * 0.78;
    const g = f.grosor * (0.3 + fade * 0.7);
    const l = f.largo * (0.35 + fade * 0.65);
    f.malla.scale.set(g, l, g);
  }

  buscarMancha(x, z) {
    let masCerca = null;
    let minDist = 0.1;

    for (const m of this.manchas) {
      if (!m.activa) continue;
      const dx = m.malla.position.x - x;
      const dz = m.malla.position.z - z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const umbral = m.radio * 0.9;
      if (dist < umbral && dist < minDist) {
        minDist = dist;
        masCerca = m;
      }
    }
    return masCerca;
  }

  slotManchaLibre() {
    const libre = this.manchas.find((m) => !m.activa);
    if (libre) return libre;

    let masVieja = this.manchas[0];
    for (const m of this.manchas) {
      if (m.vida < masVieja.vida) masVieja = m;
    }
    return masVieja;
  }

  agregarMancha(x, z, radio, opts = {}) {
    const { fusionar = true, rx, rz } = opts;

    if (fusionar) {
      const existente = this.buscarMancha(x, z);
      if (existente) {
        existente.radio = Math.min(0.16, existente.radio + radio * 0.45);
        existente.vida = Math.min(1, existente.vida + 0.15);
        existente.crecer = Math.min(1, existente.crecer + 0.08);
        return;
      }
    }

    const m = this.slotManchaLibre();
    m.activa = true;
    m.vida = 1;
    m.radio = radio;
    m.crecer = 0;
    m.rx = rx ?? 0.82 + Math.random() * 0.36;
    m.rz = rz ?? 0.82 + Math.random() * 0.36;
    m.malla.position.set(x, this.sueloY + 0.003, z);
    m.malla.rotation.z = Math.random() * Math.PI * 2;
    m.malla.visible = true;
    this.actualizarMancha(m);
  }

  actualizarMancha(m) {
    const ease = 1 - (1 - m.crecer) ** 4;
    const secado = 0.4 + m.vida * 0.6;
    const r = m.radio * (0.2 + ease * 0.8) * secado;
    m.malla.scale.set(r * m.rx, r * m.rz, 1);
    m.malla.material.opacity = 0.5 + m.vida * 0.42;
  }

  crearGota(xPx, yPx, opts = {}) {
    const g = this.tomarGota();
    if (!g) return;

    const peso = opts.peso ?? 0.7 + Math.random() * 0.6;
    const pos = this.pantallaAMundo(xPx, yPx);
    g.malla.position.copy(pos);
    g.peso = peso;
    g.vida = 0.85 + Math.random() * 0.4;
    g.vy = -0.0018 - Math.random() * 0.0018 * peso;
    g.vx = (Math.random() - 0.5) * 0.0014;
    g.radio = (0.009 + Math.random() * 0.011) * Math.cbrt(peso);
    g.timerRastro = Math.random() * 0.012;
    g.malla.visible = true;

    const r = g.radio;
    g.malla.scale.set(r, r, r);
    this.orientarConVelocidad(g.malla, g.vx, g.vy);

    this.dejarRastro(pos.x, pos.y, pos.z, g.vy, g.vx, g.radio * 0.7, 0.6);
  }

  impacto(x, z, radioGota, vy, vx) {
    const fuerza = Math.min(Math.abs(vy) * 120 + radioGota * 40, 1);
    const radio = 0.022 + radioGota * 2.2 + fuerza * 0.02 + Math.random() * 0.014;
    this.agregarMancha(x, z, radio);

    const salpicaduras = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < salpicaduras; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = radio * (0.4 + Math.random() * 0.9);
      this.agregarMancha(
        x + Math.cos(ang) * dist,
        z + Math.sin(ang) * dist,
        radio * (0.15 + Math.random() * 0.25),
        { fusionar: false, rx: 0.5 + Math.random() * 0.4, rz: 0.5 + Math.random() * 0.4 }
      );
    }

    this.dejarRastro(x, this.sueloY + 0.015, z, vy * 0.15, vx * 0.5, radioGota * 1.4, 0.85);
  }

  posicionGrifo(grifo) {
    const mecha = Math.sin(this.tiempo * grifo.velMecha + grifo.fase);
    const x =
      innerWidth *
      (grifo.xBase + mecha * 0.01 + Math.sin(grifo.fase * 2) * 0.003);
    const y =
      innerHeight * grifo.yBase +
      2 +
      mecha * 2.2 +
      Math.sin(this.tiempo * 0.9 + grifo.fase) * 1.1;
    return { xPx: x, yPx: y };
  }

  /** Pausa aleatoria tipo Poisson: a veces larga, a veces corta */
  esperaEntreGotas(grifo) {
    const media = 2.4 + (1 - grifo.actividad) * 4.5;
    const exponencial = -Math.log(Math.max(Math.random(), 1e-6)) * media;
    if (Math.random() < 0.18) return exponencial * (2.8 + Math.random() * 2.2);
    return exponencial;
  }

  esperaEnRacha() {
    return 0.06 + Math.random() * 0.14;
  }

  lanzarGota(grifo, xPx, yPx) {
    const jitter = (Math.random() - 0.5) * 6;
    const peso = Math.random() < 0.15 ? 1.3 + Math.random() * 0.7 : 0.75 + Math.random() * 0.5;
    this.crearGota(xPx + jitter, yPx, { peso });

    if (Math.random() < 0.22) {
      const pos = this.pantallaAMundo(xPx + jitter * 0.5, yPx);
      this.dejarRastro(
        pos.x,
        pos.y,
        pos.z,
        -0.0024 - Math.random() * 0.0008,
        (Math.random() - 0.5) * 0.0006,
        0.004 + Math.random() * 0.003,
        0.45
      );
    }
  }

  programarSiguienteGota(grifo) {
    if (grifo.enRacha && grifo.gotasRestantesRacha > 0) {
      grifo.proximaGota = this.esperaEnRacha();
      return;
    }

    grifo.enRacha = false;

    if (Math.random() < 0.2) {
      grifo.enRacha = true;
      grifo.gotasRestantesRacha = 1 + Math.floor(Math.random() * 3);
      grifo.proximaGota = this.esperaEntreGotas(grifo) * 0.15;
      return;
    }

    grifo.proximaGota = this.esperaEntreGotas(grifo);
  }

  goteoContinuo(dt) {
    for (const grifo of this.grifos) {
      grifo.temporizador += dt;
      if (grifo.temporizador < grifo.proximaGota) continue;

      grifo.temporizador = 0;

      if (Math.random() > grifo.actividad * 0.55 + 0.35) {
        this.programarSiguienteGota(grifo);
        continue;
      }

      const { xPx, yPx } = this.posicionGrifo(grifo);
      this.lanzarGota(grifo, xPx, yPx);

      if (grifo.enRacha) grifo.gotasRestantesRacha -= 1;

      this.programarSiguienteGota(grifo);
    }
  }

  animar() {
    requestAnimationFrame(() => this.animar());

    const dt = 0.016;
    this.tiempo += dt;
    this.sueloY = this.pantallaAMundo(innerWidth * 0.5, innerHeight).y;

    this.goteoContinuo(dt);

    for (const g of this.gotas) {
      if (g.vida <= 0) continue;

      g.vy -= GRAVEDAD * g.peso;
      g.vy = Math.max(g.vy, VEL_TERMINAL);
      g.vx *= ARRASTRE;
      g.malla.position.x += g.vx;
      g.malla.position.y += g.vy;

      g.timerRastro += dt;
      const intervalo = 0.011 + g.radio * 0.8;
      if (g.timerRastro >= intervalo) {
        g.timerRastro = 0;
        const { x, y, z } = g.malla.position;
        const vel = Math.abs(g.vy);
        const op = 0.5 + Math.min(vel * 20, 0.45);
        this.dejarRastro(x, y, z, g.vy, g.vx, g.radio * 0.85, op);
      }

      const vel = Math.abs(g.vy);
      const estirar = 1 + Math.min(vel * 22, 1.1);
      const afinar = 1 - Math.min(vel * 8, 0.22);
      const r = g.radio;
      g.malla.scale.set(r * afinar, r * estirar, r * afinar);
      this.orientarConVelocidad(g.malla, g.vx, g.vy);

      g.vida -= dt * 0.08;

      if (g.malla.position.y <= this.sueloY) {
        const { x, z } = g.malla.position;
        this.impacto(x, z, g.radio, g.vy, g.vx);
        this.liberarGota(g);
        continue;
      }

      if (g.vida <= 0) this.liberarGota(g);
    }

    for (const f of this.flujos) {
      if (f.vida <= 0) continue;

      f.vida -= dt / DURACION_FLUJO;
      this.actualizarFlujo(f);

      if (f.vida <= 0) this.liberarFlujo(f);
    }

    for (const m of this.manchas) {
      if (!m.activa) continue;

      if (m.crecer < 1) m.crecer = Math.min(1, m.crecer + dt * 2.2);

      m.vida -= dt / DURACION_MANCHA;
      this.actualizarMancha(m);

      if (m.vida <= 0) {
        m.activa = false;
        m.malla.visible = false;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}
