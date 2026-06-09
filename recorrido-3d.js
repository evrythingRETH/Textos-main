import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

/** Paleta nocturna (referencia: púrpuras, grises, cian emisivo) */
const C = {
  fondo: 0x05060c,
  niebla: 0x0c0e1a,
  particula: 0x77ddff,
  particulaSuave: 0xbbeeff,
  ruta: 0xff3344,
  marcador: 0xff2233,
  marcadorActivo: 0xff6677,
  emisivo: 0xff1122,
  marcadorLeido: 0x44dd66,
  marcadorLeidoActivo: 0x88ffaa,
  emisivoLeido: 0x22aa44,
  anilloLeido: 0x66ee88,
};

/** Posiciones normalizadas (0–1) en el núcleo 4×4 — un punto por zona del mapa */
const ANCHORS_RECORRIDO = {
  inicio: { nx: 0.5, nz: 0.5 },
  "texto-2": { nx: 0.12, nz: 0.12 },
  "texto-3": { nx: 0.88, nz: 0.12 },
  "texto-4": { nx: 0.88, nz: 0.5 },
  "texto-5": { nx: 0.88, nz: 0.88 },
  "texto-6": { nx: 0.38, nz: 0.88 },
  "texto-7": { nx: 0.12, nz: 0.88 },
  "texto-8": { nx: 0.12, nz: 0.38 },
  "texto-1": { nx: 0.5, nz: 0.12 },
};

/** Núcleo jugable (marcadores) + alas decorativas para llenar los costados */
const CAMPUS_NUCLEO = { columnas: 4, filas: 4, separacion: 0.96 };
const CAMPUS_ALAS = { columnasPorLado: 3, filasPorLado: 1 };

const CARGA_LOGO_MS = 2000;
const CARGA_FADE_MS = 1000;

export const PUNTOS_RECORRIDO = [
  { id: "inicio", label: "Cartografía del recuerdo" },
  { id: "texto-2", label: "La infección no se detiene" },
  { id: "texto-3", label: "El dragón que olvidó su nombre" },
  { id: "texto-4", label: "Las lunas de cristal" },
  { id: "texto-5", label: "El cuento que se niega a terminar" },
  { id: "texto-6", label: "La ciudad que respira al revés" },
  { id: "texto-7", label: "El mapa de las cicatrices" },
  { id: "texto-8", label: "La última palabra del mundo" },
  { id: "texto-1", label: "El marchitar de las flores" },
];

/** Texturas PNG + parámetros PBR alineados al GLTF (UV TEXCOORD_0) */
const CONFIG_MATERIAL = {
  initialShadingGroup: {
    map: "initialShadingGroup_baseColor.png",
    emissiveMap: "initialShadingGroup_emissive.png",
    emissiveIntensity: 0.38,
    roughness: 0.72,
    metalness: 0.05,
    alphaTest: 0.15,
    doubleSide: true,
  },
  map_3_castle: {
    map: "map_3_castle_baseColor.png",
    emissiveMap: "map_3_castle_emissive.png",
    emissiveIntensity: 0.4,
    roughness: 0.62,
    metalness: 0.05,
    doubleSide: true,
  },
  map_3_objects1: {
    map: "map_3_objects1_baseColor.png",
    emissiveMap: "map_3_objects1_emissive.png",
    emissiveIntensity: 0.36,
    roughness: 0.68,
    metalness: 0.05,
    alphaTest: 0.72,
    doubleSide: true,
  },
  map_3_terrain1: {
    map: "map_3_terrain1_baseColor.png",
    emissiveIntensity: 0,
    roughness: 0.9,
    metalness: 0,
    doubleSide: true,
  },
};

export class Recorrido3D {
  constructor(container, { onPuntoClick, onMarcadoresListos, etiquetaPunto } = {}) {
    this.container = container;
    this.onPuntoClick = onPuntoClick;
    this.onMarcadoresListos = onMarcadoresListos;
    this.etiquetaPunto =
      etiquetaPunto ??
      ((id) => PUNTOS_RECORRIDO.find((p) => p.id === id)?.label ?? id);
    this.marcadores = new Map();
    this.activoId = null;
    this.visitados = new Set();
    this.box = new THREE.Box3();
    this.boxNucleo = new THREE.Box3();
    this.boxCentral = new THREE.Box3();
    this.centro = new THREE.Vector3();
    this.grupoCampus = null;
    this._modoEnfoque = false;
    this._pointerDown = null;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.objetivosMarcador = [];
    this.mallasTerreno = [];
    this.mallasTileCentral = [];
    this.mallasEscena = [];
    this.lucesPunto = [];
    this.lucesCampus = [];
    this.limitesCamara = new THREE.Box3();
    this.limitesObjetivo = new THREE.Box3();
    this._teclas = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
    this._ultimoFrame = performance.now();
    this._ejeFrente = new THREE.Vector3();
    this._ejeLateral = new THREE.Vector3();
    this._deltaMov = new THREE.Vector3();
    this._offsetCam = new THREE.Vector3();
    this._centroLimites = new THREE.Vector3();
    this._textureLoader = new THREE.TextureLoader();
    this._cacheTexturas = new Map();
    this._rutaTexturas = `${import.meta.env.BASE_URL}3d/textures/`;

    this._initScene();
    this._initPostproceso();
    this._initParticulas();
    this._initLuces();
    this._initControles();
    this._enlazarEventos();
    this._cargarModelo();
    this._animar();
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(C.fondo);
    this.scene.fog = new THREE.FogExp2(C.niebla, 0.0026);

    const aspect = window.innerWidth / Math.max(window.innerHeight, 1);
    this.camera = new THREE.PerspectiveCamera(48, aspect, 0.5, 800);
    this.camera.position.set(55, 42, 55);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.container.appendChild(this.renderer.domElement);

    this.grupoMarcadores = new THREE.Group();
    this.scene.add(this.grupoMarcadores);

    this.cameraObjetivo = new THREE.Vector3();
    this.lookObjetivo = new THREE.Vector3();
    this.lookActual = new THREE.Vector3();
  }

  _initPostproceso() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.14,
      0.28,
      0.42
    );
    this.composer.addPass(this.bloomPass);
  }

  _initParticulas() {
    const cantidad = 2200;
    const posiciones = new Float32Array(cantidad * 3);
    const r = 140;

    for (let i = 0; i < cantidad; i++) {
      const i3 = i * 3;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const dist = r * (0.35 + Math.random() * 0.65);
      posiciones[i3] = dist * Math.sin(phi) * Math.cos(theta);
      posiciones[i3 + 1] = dist * Math.cos(phi) * 0.6 + 8;
      posiciones[i3 + 2] = dist * Math.sin(phi) * Math.sin(theta);
    }

    const colores = new Float32Array(cantidad * 3);
    const cA = new THREE.Color(C.particula);
    const cB = new THREE.Color(C.particulaSuave);
    for (let i = 0; i < cantidad; i++) {
      const mezcla = Math.random();
      const c = cA.clone().lerp(cB, mezcla);
      colores[i * 3] = c.r;
      colores[i * 3 + 1] = c.g;
      colores[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(posiciones, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colores, 3));

    this.particulasMat = new THREE.PointsMaterial({
      vertexColors: true,
      size: 0.32,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.particulas = new THREE.Points(geo, this.particulasMat);
    this.particulasBase = posiciones.slice();
    this.scene.add(this.particulas);
  }

  _initLuces() {
    const hemi = new THREE.HemisphereLight(0xa8b8d8, 0x181420, 0.58);
    this.scene.add(hemi);

    const amb = new THREE.AmbientLight(0x4a5678, 0.48);
    this.scene.add(amb);

    const luna = new THREE.DirectionalLight(0xd8e4ff, 0.72);
    luna.position.set(-28, 42, 22);
    this.scene.add(luna);

    const contra = new THREE.DirectionalLight(0x6a7a9a, 0.32);
    contra.position.set(32, 18, -30);
    this.scene.add(contra);
  }

  _iluminarCampus() {
    for (const luz of this.lucesCampus) {
      this.scene.remove(luz);
      if (luz.target) this.scene.remove(luz.target);
    }
    this.lucesCampus.length = 0;

    const caja = this.box.isEmpty() ? this._cajaRecorrido() : this.box;
    const centro = new THREE.Vector3();
    const size = new THREE.Vector3();
    caja.getCenter(centro);
    caja.getSize(size);
    const radio = Math.max(size.x, size.z) * 0.55;

    const key = new THREE.DirectionalLight(0xf2f6ff, 1.45);
    key.position.set(centro.x + radio * 0.65, centro.y + size.y * 1.35, centro.z + radio * 0.45);
    key.target.position.copy(centro);
    this.scene.add(key.target);
    this.scene.add(key);
    this.lucesCampus.push(key);

    const fill = new THREE.DirectionalLight(0xb8c8e8, 0.62);
    fill.position.set(centro.x - radio * 0.85, centro.y + size.y * 0.75, centro.z - radio * 0.55);
    fill.target.position.copy(centro);
    this.scene.add(fill.target);
    this.scene.add(fill);
    this.lucesCampus.push(fill);

    const base = new THREE.DirectionalLight(0x8898b8, 0.38);
    base.position.set(centro.x, centro.y + size.y * 2.2, centro.z);
    base.target.position.copy(centro);
    this.scene.add(base.target);
    this.scene.add(base);
    this.lucesCampus.push(base);
  }

  _colocarLucesEscena() {
    for (const luz of this.lucesPunto) this.scene.remove(luz);
    this.lucesPunto.length = 0;

    const caja = this._cajaRecorrido();
    const size = new THREE.Vector3();
    caja.getSize(size);
    const centroTile = new THREE.Vector3();
    caja.getCenter(centroTile);

    const centroLuz = new THREE.PointLight(0xb8d4ff, 0.75, size.length() * 0.85);
    centroLuz.position.set(centroTile.x, caja.min.y + size.y * 0.65, centroTile.z);
    centroLuz.userData.baseInt = 0.75;
    centroLuz.userData.fase = 0;
    this.scene.add(centroLuz);
    this.lucesPunto.push(centroLuz);

    let i = 1;
    for (const [, m] of this.marcadores) {
      const pl = new THREE.PointLight(0xff6677, 0.22, 9);
      pl.position.copy(m.grupo.position);
      pl.position.y += 2;
      pl.userData.baseInt = 0.22;
      pl.userData.fase = i++ * 0.7;
      this.scene.add(pl);
      this.lucesPunto.push(pl);
    }
  }

  _initControles() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.rotateSpeed = 0.7;
    this.controls.enableZoom = true;
    this.controls.zoomSpeed = 1.35;
    this.controls.enablePan = false;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 80;
    this.controls.minPolarAngle = 0.35;
    this.controls.maxPolarAngle = Math.PI * 0.78;
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };

    this.controls.addEventListener("start", () => {
      this._modoEnfoque = false;
      this.cameraObjetivo.copy(this.camera.position);
      this.lookObjetivo.copy(this.controls.target);
    });

    this.controls.addEventListener("change", () => this._limitarObjetivo());
    this.controls.addEventListener("end", () => this._limitarCamara());
  }

  _enlazarEventos() {
    this._onResize = () => this._redimensionar();
    window.addEventListener("resize", this._onResize);

    const canvas = this.renderer.domElement;
    this._hoverId = null;

    canvas.addEventListener("pointerdown", (e) => {
      this._pointerDown = { x: e.clientX, y: e.clientY, id: this._marcadorBajoPointer(e) };
    });

    canvas.addEventListener("pointermove", (e) => {
      if (!this.modelo) return;
      const id = this._marcadorBajoPointer(e);
      if (id !== this._hoverId) {
        this._hoverId = id;
        canvas.style.cursor = id ? "pointer" : "grab";
      }
    });

    canvas.addEventListener("pointerup", (e) => {
      if (!this._pointerDown || !this.modelo) return;
      const dx = e.clientX - this._pointerDown.x;
      const dy = e.clientY - this._pointerDown.y;
      const esClic = dx * dx + dy * dy < 36;
      const id = esClic ? this._pointerDown.id ?? this._marcadorBajoPointer(e) : null;
      if (id) this.onPuntoClick?.(id);
      this._pointerDown = null;
    });

    this._onKeyDown = (e) => this._manejarTecla(e, true);
    this._onKeyUp = (e) => this._manejarTecla(e, false);
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
  }

  _inputActivo() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
  }

  _manejarTecla(e, pulsada) {
    if (!Object.hasOwn(this._teclas, e.key)) return;
    if (this._inputActivo()) return;
    e.preventDefault();
    this._teclas[e.key] = pulsada;
    if (pulsada) this._modoEnfoque = false;
  }

  _configurarLimitesCamara() {
    if (this.box.isEmpty()) return;

    const sizeCampus = new THREE.Vector3();
    this.box.getSize(sizeCampus);
    const margenObj = Math.max(sizeCampus.x, sizeCampus.z) * 0.02;

    this.limitesObjetivo.copy(this.box);
    this.limitesObjetivo.min.x += margenObj;
    this.limitesObjetivo.min.z += margenObj;
    this.limitesObjetivo.max.x -= margenObj;
    this.limitesObjetivo.max.z -= margenObj;
    this.limitesObjetivo.min.y = this.box.min.y + sizeCampus.y * 0.06;
    this.limitesObjetivo.max.y = this.box.max.y + sizeCampus.y * 0.08;

    const margenCam = Math.max(sizeCampus.x, sizeCampus.z) * 0.02;
    this.limitesCamara.copy(this.box);
    this.limitesCamara.min.x += margenCam;
    this.limitesCamara.min.z += margenCam;
    this.limitesCamara.max.x -= margenCam;
    this.limitesCamara.max.z -= margenCam;
    this.limitesCamara.min.y = this.box.min.y + sizeCampus.y * 0.05;
    this.limitesCamara.max.y = this.box.max.y + sizeCampus.y * 0.2;

    this.controls.maxDistance = sizeCampus.length() * 0.48;
    this.controls.minDistance = Math.max(3.5, sizeCampus.y * 0.04);
  }

  _limitarObjetivo() {
    if (this.limitesObjetivo.isEmpty()) return;
    this.controls.target.clamp(this.limitesObjetivo.min, this.limitesObjetivo.max);
  }

  _limitarCamara() {
    if (this.limitesCamara.isEmpty() || this.limitesObjetivo.isEmpty()) return;

    const oMin = this.limitesObjetivo.min;
    const oMax = this.limitesObjetivo.max;
    const cMin = this.limitesCamara.min;
    const cMax = this.limitesCamara.max;

    this.controls.target.clamp(oMin, oMax);

    this._offsetCam.subVectors(this.camera.position, this.controls.target);
    let dist = this._offsetCam.length();

    if (dist < 1e-5) {
      this._offsetCam.set(1, 0.55, 1).normalize();
      dist = this.controls.minDistance;
    }

    dist = THREE.MathUtils.clamp(dist, this.controls.minDistance, this.controls.maxDistance);
    this._offsetCam.normalize().multiplyScalar(dist);
    this.camera.position.copy(this.controls.target).add(this._offsetCam);

    if (!this.limitesCamara.containsPoint(this.camera.position)) {
      this.camera.position.clamp(cMin, cMax);
      this.limitesCamara.getCenter(this._centroLimites);

      for (let i = 0; i < 6 && !this.limitesCamara.containsPoint(this.camera.position); i++) {
        this.camera.position.lerp(this._centroLimites, 0.22);
        this.camera.position.clamp(cMin, cMax);
      }

      this._offsetCam.subVectors(this.camera.position, this.controls.target);
      dist = THREE.MathUtils.clamp(this._offsetCam.length(), this.controls.minDistance, this.controls.maxDistance);
      if (this._offsetCam.lengthSq() > 1e-6) {
        this._offsetCam.normalize().multiplyScalar(dist);
        this.camera.position.copy(this.controls.target).add(this._offsetCam);
        this.camera.position.clamp(cMin, cMax);
      }
    }

    this.controls.target.clamp(oMin, oMax);
  }

  _moverConFlechas(dt) {
    if (this._modoEnfoque || !this.modelo) return;

    const { ArrowUp, ArrowDown, ArrowLeft, ArrowRight } = this._teclas;
    if (!ArrowUp && !ArrowDown && !ArrowLeft && !ArrowRight) return;

    this.camera.getWorldDirection(this._ejeFrente);
    this._ejeFrente.y = 0;
    if (this._ejeFrente.lengthSq() < 0.0001) this._ejeFrente.set(0, 0, -1);
    this._ejeFrente.normalize();

    this._ejeLateral.crossVectors(this._ejeFrente, new THREE.Vector3(0, 1, 0)).normalize();

    const vel = 24 * dt;
    this._deltaMov.set(0, 0, 0);
    if (ArrowUp) this._deltaMov.add(this._ejeFrente);
    if (ArrowDown) this._deltaMov.sub(this._ejeFrente);
    if (ArrowRight) this._deltaMov.add(this._ejeLateral);
    if (ArrowLeft) this._deltaMov.sub(this._ejeLateral);

    if (this._deltaMov.lengthSq() > 0) {
      this._deltaMov.normalize().multiplyScalar(vel);
      this.camera.position.add(this._deltaMov);
      this.controls.target.add(this._deltaMov);
      this._limitarCamara();
    }
  }

  _marcadorBajoPointer(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.objetivosMarcador, false);
    if (!hits.length) return null;
    return hits[0].object.parent?.userData?.id ?? null;
  }

  _redimensionar() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
    this.bloomPass?.setSize(w, h);
  }

  _finalizarCarga() {
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fadeMs = reduceMotion ? 0 : CARGA_FADE_MS;

    const terminar = () => {
      this.container.classList.remove("recorrido-cargando", "recorrido-carga-desvaneciendo");
      this.container.classList.add("recorrido-listo");
      this.container.removeAttribute("aria-busy");
      const carga = this.container.querySelector(".recorrido-carga");
      carga?.setAttribute("aria-hidden", "true");
    };

    if (reduceMotion) {
      terminar();
      return;
    }

    this.container.classList.add("recorrido-carga-desvaneciendo");
    window.setTimeout(terminar, fadeMs);
  }

  _cargarModelo() {
    const base = `${import.meta.env.BASE_URL}3d/`;
    const loader = new GLTFLoader();
    loader.setPath(base);
    this._tiempoInicioCarga = performance.now();
    this.container.classList.add("recorrido-cargando");
    this.container.classList.remove("recorrido-listo", "recorrido-carga-desvaneciendo");
    this.container.setAttribute("aria-busy", "true");
    const carga = this.container.querySelector(".recorrido-carga");
    carga?.setAttribute("aria-hidden", "false");

    loader.load(
      "scene.gltf",
      (gltf) => {
        const plantilla = gltf.scene;

        this._precargarTexturas()
          .then(() => {
            this._prepararMateriales(plantilla);
            this._montarCampusDesdePlantilla(plantilla);
          })
          .catch((err) => {
            console.error("Error cargando texturas del mapa:", err);
            this._prepararMateriales(plantilla);
            this._montarCampusDesdePlantilla(plantilla);
          });
      },
      (xhr) => {
        if (xhr.total) {
          const pct = this.container.querySelector(".recorrido-carga-pct");
          if (pct) pct.textContent = ` ${Math.round((xhr.loaded / xhr.total) * 100)}%`;
        }
      },
      (err) => {
        console.error("Error cargando el modelo 3D:", err);
        this.container.classList.remove("recorrido-cargando");
        this.container.classList.add("recorrido-error");
      }
    );
  }

  _medirHuellaTile(objeto) {
    const caja = new THREE.Box3();
    const vertice = new THREE.Vector3();
    let hayTerreno = false;

    objeto.traverse((child) => {
      if (!child.isMesh) return;
      const mat = Array.isArray(child.material) ? child.material[0] : child.material;
      if (mat?.name !== "map_3_terrain1") return;

      const pos = child.geometry?.attributes?.position;
      if (!pos) return;

      child.updateWorldMatrix(true, false);
      let minY = Infinity;
      for (let i = 0; i < pos.count; i++) {
        vertice.fromBufferAttribute(pos, i).applyMatrix4(child.matrixWorld);
        if (vertice.y < minY) minY = vertice.y;
      }

      const tamMalla = new THREE.Vector3();
      new THREE.Box3().setFromObject(child).getSize(tamMalla);
      const alturaSuelo = Math.max(0.8, tamMalla.y * 0.22);
      const techoSuelo = minY + alturaSuelo;

      for (let i = 0; i < pos.count; i++) {
        vertice.fromBufferAttribute(pos, i).applyMatrix4(child.matrixWorld);
        if (vertice.y <= techoSuelo) {
          caja.expandByPoint(vertice);
          hayTerreno = true;
        }
      }
    });

    if (!hayTerreno) {
      caja.setFromObject(objeto);
    }

    const size = new THREE.Vector3();
    const centro = new THREE.Vector3();
    caja.getSize(size);
    caja.getCenter(centro);
    return { caja, size, centro };
  }

  _montarCampusDesdePlantilla(plantilla) {
    const huellaInicial = this._medirHuellaTile(plantilla);
    plantilla.position.sub(huellaInicial.centro);

    const maxDim = Math.max(huellaInicial.size.x, huellaInicial.size.y, huellaInicial.size.z);
    const escala = 32 / maxDim;
    plantilla.scale.setScalar(escala);

    const estirarSuelo = 1.14;
    plantilla.scale.x *= estirarSuelo;
    plantilla.scale.z *= estirarSuelo;
    const huellaFinal = this._medirHuellaTile(plantilla);

    this.grupoCampus = new THREE.Group();
    this.modelo = this._multiplicarCampus(plantilla, huellaFinal.size);
    this.grupoCampus.traverse((child) => {
      if (!child.isMesh) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((mat) => mat && this._aplicarConfigMaterial(mat));
    });
    this.scene.add(this.grupoCampus);

    this.box.setFromObject(this.grupoCampus);
    this.box.getCenter(this.centro);

    const cajaCentral = this._cajaRecorrido();
    const sizeCentral = new THREE.Vector3();
    cajaCentral.getSize(sizeCentral);
    const camDist = sizeCentral.length() * 0.32;
    cajaCentral.getCenter(this._centroLimites);
    this.camera.position.set(
      this._centroLimites.x + camDist * 0.6,
      this._centroLimites.y + sizeCentral.y * 0.35,
      this._centroLimites.z + camDist * 0.6
    );
    this.cameraObjetivo.copy(this.camera.position);

    cajaCentral.getCenter(this.centro);
    this.controls.target.copy(this.centro);
    this.lookActual.copy(this.centro);
    this.lookObjetivo.copy(this.centro);

    this._configurarLimitesCamara();
    this._limitarCamara();

    this._iluminarCampus();
    this._crearMarcadores();
    this.onMarcadoresListos?.();
    this._colocarLucesEscena();
    this._enfocarPunto("inicio", false);

    const transcurrido = performance.now() - this._tiempoInicioCarga;
    const restante = Math.max(0, CARGA_LOGO_MS - transcurrido);
    window.setTimeout(() => this._finalizarCarga(), restante);
  }

  _multiplicarCampus(plantilla, tileSize) {
    const { columnas, filas, separacion } = CAMPUS_NUCLEO;
    const { columnasPorLado, filasPorLado } = CAMPUS_ALAS;
    const espX = tileSize.x * separacion;
    const espZ = tileSize.z * separacion;
    const colCentro = Math.floor(columnas / 2);
    const filaCentro = Math.floor(filas / 2);
    const offsetX = -colCentro * espX;
    const offsetZ = -filaCentro * espZ;

    this.mallasEscena = [];
    this.mallasTerreno = [];
    this.mallasTileCentral = [];
    this.boxNucleo.makeEmpty();
    let tileCentral = null;

    const colocarTile = (col, fila, esCentral) => {
      const tile = plantilla.clone(true);
      tile.position.set(offsetX + col * espX, 0, offsetZ + fila * espZ);

      const esNucleo = col >= 0 && col < columnas && fila >= 0 && fila < filas;
      this._registrarMallasTile(tile, esCentral);
      this.grupoCampus.add(tile);

      if (esNucleo) this.boxNucleo.union(new THREE.Box3().setFromObject(tile));
      if (esCentral) tileCentral = tile;
    };

    for (let fila = 0; fila < filas; fila++) {
      for (let col = 0; col < columnas; col++) {
        colocarTile(col, fila, col === colCentro && fila === filaCentro);
      }
    }

    const filaAlaMin = -filasPorLado;
    const filaAlaMax = filas + filasPorLado - 1;
    for (let fila = filaAlaMin; fila <= filaAlaMax; fila++) {
      for (let w = 1; w <= columnasPorLado; w++) {
        colocarTile(-w, fila, false);
        colocarTile(columnas - 1 + w, fila, false);
      }
    }

    for (let fila = -filasPorLado; fila < 0; fila++) {
      for (let col = 0; col < columnas; col++) {
        colocarTile(col, fila, false);
      }
    }
    for (let fila = filas; fila < filas + filasPorLado; fila++) {
      for (let col = 0; col < columnas; col++) {
        colocarTile(col, fila, false);
      }
    }

    if (tileCentral) {
      this.boxCentral.setFromObject(tileCentral);
    } else if (!this.boxNucleo.isEmpty()) {
      this.boxCentral.copy(this.boxNucleo);
    }

    return tileCentral ?? plantilla;
  }

  _registrarMallasTile(tile, esCentral) {
    tile.traverse((child) => {
      if (!child.isMesh) return;
      this.mallasEscena.push(child);

      const nombreMat = (Array.isArray(child.material) ? child.material[0] : child.material)?.name;
      if (nombreMat === "map_3_terrain1") this.mallasTerreno.push(child);
      if (esCentral) this.mallasTileCentral.push(child);
    });
  }

  _registrarTextura(tex) {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    const aniso = this.renderer?.capabilities?.getMaxAnisotropy?.() ?? 4;
    tex.anisotropy = aniso;
  }

  _precargarTexturas() {
    const archivos = new Set();
    for (const cfg of Object.values(CONFIG_MATERIAL)) {
      if (cfg.map) archivos.add(cfg.map);
      if (cfg.emissiveMap) archivos.add(cfg.emissiveMap);
    }

    const cargas = [...archivos].map(
      (archivo) =>
        new Promise((resolve, reject) => {
          if (this._cacheTexturas.has(archivo)) {
            resolve();
            return;
          }
          this._textureLoader.load(
            `${this._rutaTexturas}${archivo}`,
            (tex) => {
              this._registrarTextura(tex);
              this._cacheTexturas.set(archivo, tex);
              resolve();
            },
            undefined,
            reject
          );
        })
    );

    return Promise.all(cargas);
  }

  _aplicarConfigMaterial(mat) {
    const cfg = CONFIG_MATERIAL[mat.name] ?? CONFIG_MATERIAL.map_3_terrain1;

    if (cfg.map) mat.map = this._cacheTexturas.get(cfg.map) ?? null;
    if (cfg.emissiveMap) mat.emissiveMap = this._cacheTexturas.get(cfg.emissiveMap) ?? null;

    mat.color.setHex(0xffffff);
    mat.metalness = cfg.metalness ?? 0;
    mat.roughness = cfg.roughness ?? 0.85;
    mat.side = cfg.doubleSide ? THREE.DoubleSide : THREE.FrontSide;

    if (cfg.alphaTest != null) {
      mat.alphaTest = cfg.alphaTest;
      mat.transparent = false;
      mat.depthWrite = true;
    } else {
      mat.alphaTest = 0;
      mat.transparent = false;
      mat.depthWrite = true;
    }

    if (mat.emissive) {
      if (mat.emissiveMap && cfg.emissiveIntensity > 0) {
        mat.emissive.setHex(0xffffff);
        mat.emissiveIntensity = cfg.emissiveIntensity;
      } else {
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0;
      }
    }

    mat.needsUpdate = true;
  }

  _prepararMateriales(objeto) {
    objeto.traverse((child) => {
      if (!child.isMesh) return;

      child.castShadow = false;
      child.receiveShadow = false;

      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((mat) => {
        if (!mat) return;
        this._aplicarConfigMaterial(mat);
      });
    });
  }

  _cajaRecorrido() {
    return this.boxCentral.isEmpty() ? this.box : this.boxCentral;
  }

  _raycastTerreno(x, z) {
    const caja = this.box.isEmpty() ? this._cajaRecorrido() : this.box;
    const size = new THREE.Vector3();
    caja.getSize(size);
    const origen = new THREE.Vector3(x, caja.max.y + size.y * 0.2, z);
    const dir = new THREE.Vector3(0, -1, 0);
    this.raycaster.far = size.y + 80;
    this.raycaster.set(origen, dir);

    const blancos =
      this.mallasEscena.length > 0
        ? this.mallasEscena
        : this.mallasTerreno.length > 0
          ? this.mallasTerreno
          : this.mallasTileCentral;
    const hits = this.raycaster.intersectObjects(blancos, false);

    if (hits.length) {
      const p = hits[0].point.clone();
      p.y += 0.25;
      return p;
    }

    return new THREE.Vector3(x, caja.min.y + size.y * 0.38, z);
  }

  _cajaCampus() {
    if (!this.boxNucleo.isEmpty()) return this.boxNucleo;
    return this.box.isEmpty() ? this._cajaRecorrido() : this.box;
  }

  _posicionMarcador(id) {
    const caja = this._cajaCampus();
    const size = new THREE.Vector3();
    caja.getSize(size);
    const anchor = ANCHORS_RECORRIDO[id] ?? { nx: 0.5, nz: 0.5 };
    const x = caja.min.x + anchor.nx * size.x;
    const z = caja.min.z + anchor.nz * size.z;
    return this._raycastTerreno(x, z);
  }

  _crearRutaGuia(posiciones) {
    const curva = [];
    for (let i = 0; i < posiciones.length - 1; i++) {
      const a = posiciones[i];
      const b = posiciones[i + 1];
      const pasos = 10;
      for (let s = 0; s < pasos; s++) {
        const t = s / pasos;
        curva.push(
          new THREE.Vector3(
            THREE.MathUtils.lerp(a.x, b.x, t),
            THREE.MathUtils.lerp(a.y, b.y, t) - 0.08,
            THREE.MathUtils.lerp(a.z, b.z, t)
          )
        );
      }
    }

    const geo = new THREE.BufferGeometry().setFromPoints(curva);
    const linea = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({
        color: C.ruta,
        transparent: true,
        opacity: 0.24,
      })
    );
    this.scene.add(linea);
  }

  _crearMarcadores() {
    const posicionesRuta = [];

    for (const punto of PUNTOS_RECORRIDO) {
      const pos = this._posicionMarcador(punto.id);
      posicionesRuta.push(pos);
      const grupo = new THREE.Group();
      grupo.position.copy(pos);
      grupo.userData.id = punto.id;

      const poste = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.085, 1.05, 8),
        new THREE.MeshStandardMaterial({ color: 0x1e2238, roughness: 0.92, metalness: 0.05 })
      );
      poste.position.y = 0.52;

      const esfera = new THREE.Mesh(
        new THREE.SphereGeometry(0.34, 16, 16),
        new THREE.MeshStandardMaterial({
          color: C.marcador,
          emissive: C.emisivo,
          emissiveIntensity: 1.2,
          roughness: 0.12,
          metalness: 0.05,
        })
      );
      esfera.position.y = 1.1;

      const hitArea = new THREE.Mesh(
        new THREE.SphereGeometry(1.05, 8, 8),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hitArea.position.y = 1.1;

      const anillo = new THREE.Mesh(
        new THREE.RingGeometry(0.4, 0.52, 24),
        new THREE.MeshBasicMaterial({
          color: C.marcador,
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide,
        })
      );
      anillo.rotation.x = -Math.PI / 2;
      anillo.position.y = 0.04;

      const etiqueta = this._crearEtiqueta(this.etiquetaPunto(punto.id));
      etiqueta.position.y = 1.5 + etiqueta.userData.alto * 0.42;

      grupo.add(poste, esfera, hitArea, anillo, etiqueta);
      this.grupoMarcadores.add(grupo);
      this.marcadores.set(punto.id, { grupo, poste, esfera, anillo, etiqueta, punto });
      this.objetivosMarcador.push(hitArea, esfera);
    }

    this._crearRutaGuia(posicionesRuta);
  }

  _partirLineasEtiqueta(ctx, texto, maxAncho) {
    const palabras = texto.split(/\s+/);
    const lineas = [];
    let linea = "";

    for (const palabra of palabras) {
      const prueba = linea ? `${linea} ${palabra}` : palabra;
      if (ctx.measureText(prueba).width > maxAncho && linea) {
        lineas.push(linea);
        linea = palabra;
      } else {
        linea = prueba;
      }
    }
    if (linea) lineas.push(linea);
    return lineas.length ? lineas : [texto];
  }

  _crearEtiqueta(texto) {
    const paddingX = 16;
    const paddingY = 12;
    const fontSize = 15;
    const lineHeight = 22;
    const anchoLogico = 260;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    ctx.font = `600 ${fontSize}px Cinzel, "EB Garamond", serif`;

    const lineas = this._partirLineasEtiqueta(ctx, texto, anchoLogico - paddingX * 2);
    const altoLogico = paddingY * 2 + lineas.length * lineHeight;
    const dpr = Math.min(typeof devicePixelRatio === "number" ? devicePixelRatio : 1, 2);

    canvas.width = Math.ceil(anchoLogico * dpr);
    canvas.height = Math.ceil(altoLogico * dpr);
    ctx.scale(dpr, dpr);
    ctx.font = `600 ${fontSize}px Cinzel, "EB Garamond", serif`;

    ctx.fillStyle = "rgba(8,12,28,0.88)";
    ctx.fillRect(0, 0, anchoLogico, altoLogico);
    ctx.strokeStyle = "#ff5566";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, anchoLogico - 2, altoLogico - 2);

    ctx.fillStyle = "#ffe8e8";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    lineas.forEach((linea, i) => {
      ctx.fillText(linea, anchoLogico / 2, paddingY + lineHeight * (i + 0.5));
    });

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;

    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
    );

    const altoMundo = 0.68 + lineas.length * 0.3;
    const anchoMundo = altoMundo * (anchoLogico / altoLogico);
    sprite.scale.set(anchoMundo, altoMundo, 1);
    sprite.userData.alto = altoMundo;

    return sprite;
  }

  _aplicarEstiloMarcador(mid, m) {
    const activo = this.activoId != null && mid === this.activoId;
    const leido = this.visitados.has(mid);

    if (activo && leido) {
      m.esfera.material.color.set(C.marcadorLeidoActivo);
      m.esfera.material.emissive.set(0xaaffbb);
      m.esfera.material.emissiveIntensity = 1.6;
      m.anillo.material.color.set(C.anilloLeido);
      m.anillo.material.opacity = 1;
      m.poste.material.color.set(0x1e5038);
    } else if (activo) {
      m.esfera.material.color.set(C.marcadorActivo);
      m.esfera.material.emissive.set(0xff8888);
      m.esfera.material.emissiveIntensity = 1.7;
      m.anillo.material.color.set(C.marcador);
      m.anillo.material.opacity = 1;
      m.poste.material.color.set(0x1e2238);
    } else if (leido) {
      m.esfera.material.color.set(C.marcadorLeido);
      m.esfera.material.emissive.set(C.emisivoLeido);
      m.esfera.material.emissiveIntensity = 1.2;
      m.anillo.material.color.set(C.anilloLeido);
      m.anillo.material.opacity = 0.85;
      m.poste.material.color.set(0x1a4030);
    } else {
      m.esfera.material.color.set(C.marcador);
      m.esfera.material.emissive.set(C.emisivo);
      m.esfera.material.emissiveIntensity = 1.2;
      m.anillo.material.color.set(C.marcador);
      m.anillo.material.opacity = 0.55;
      m.poste.material.color.set(0x1e2238);
    }

    m.anillo.scale.setScalar(activo ? 1.4 : 1);

    if (m.etiqueta?.material) {
      m.etiqueta.material.color.set(leido ? 0xbbffcc : 0xffffff);
      m.etiqueta.material.opacity = activo ? 1 : 0.92;
    }
  }

  setActivo(id) {
    this.activoId = id;
    for (const [mid, m] of this.marcadores) {
      this._aplicarEstiloMarcador(mid, m);
    }
  }

  setVisitados(ids) {
    this.visitados = new Set(ids);
    for (const [mid, m] of this.marcadores) {
      this._aplicarEstiloMarcador(mid, m);
    }
  }

  actualizarEtiquetasMarcadores() {
    for (const [id, m] of this.marcadores) {
      const label = this.etiquetaPunto(id);
      const y = m.etiqueta.position.y;
      const nueva = this._crearEtiqueta(label);

      m.grupo.remove(m.etiqueta);
      m.etiqueta.material.map?.dispose();
      m.etiqueta.material?.dispose();

      nueva.position.y = y;
      m.grupo.add(nueva);
      m.etiqueta = nueva;
      if (m.punto) m.punto.label = label;
    }
  }

  _enfocarPunto(id, animar = true) {
    const m = this.marcadores.get(id);
    if (!m) return;

    const offset = new THREE.Vector3(5, 4.5, 5);
    if (id === "inicio") offset.set(9, 7, 9);

    this.cameraObjetivo.copy(m.grupo.position).add(offset);
    this.lookObjetivo.copy(m.grupo.position);
    this._modoEnfoque = animar;

    if (!animar) {
      this.camera.position.copy(this.cameraObjetivo);
      this.lookActual.copy(this.lookObjetivo);
      this.controls.target.copy(this.lookObjetivo);
      this._modoEnfoque = false;
      this._limitarCamara();
    }
  }

  enfocarPunto(id) {
    this._enfocarPunto(id, true);
  }

  _animarParticulas(tiempo) {
    const pos = this.particulas.geometry.attributes.position;
    const base = this.particulasBase;
    for (let i = 0; i < pos.count; i++) {
      const i3 = i * 3;
      pos.array[i3 + 1] = base[i3 + 1] + Math.sin(tiempo * 0.8 + i * 0.05) * 1.2;
    }
    pos.needsUpdate = true;
  }

  _animar() {
    requestAnimationFrame(() => this._animar());

    const ahora = performance.now();
    const dt = Math.min((ahora - this._ultimoFrame) / 1000, 0.05);
    this._ultimoFrame = ahora;
    const tiempo = ahora * 0.001;

    this._animarParticulas(tiempo);
    this._moverConFlechas(dt);

    if (this._modoEnfoque) {
      this.camera.position.lerp(this.cameraObjetivo, 0.06);
      this.lookActual.lerp(this.lookObjetivo, 0.08);
      this.controls.target.copy(this.lookActual);
      this._limitarCamara();

      if (
        this.camera.position.distanceTo(this.cameraObjetivo) < 0.15 &&
        this.lookActual.distanceTo(this.lookObjetivo) < 0.1
      ) {
        this._modoEnfoque = false;
      }
    }

    for (const [, m] of this.marcadores) {
      if (m.grupo.userData.id === this.activoId) {
        const pulso = 1 + Math.sin(tiempo * 3) * 0.08;
        m.anillo.scale.setScalar(1.4 * pulso);
      }
    }

    for (const luz of this.lucesPunto) {
      const base = luz.userData.baseInt ?? 1;
      const fase = luz.userData.fase ?? 0;
      luz.intensity = base * (0.85 + Math.sin(tiempo * 2.2 + fase) * 0.12);
    }

    this.controls.update();
    this._limitarObjetivo();
    this.composer.render();
  }

  dispose() {
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
    this.composer?.dispose();
    this.renderer.dispose();
  }
}
