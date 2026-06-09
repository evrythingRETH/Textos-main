import "./main.css";
import { Recorrido3D } from "./recorrido-3d.js";

/** Territorios por defecto si no pones data-territorio en el índice del HTML */
const TERRITORIOS_FALLBACK = {
  inicio: "Centro · Axis Mundi",
  "texto-1": "NO · Regio Nebulae",
  "texto-2": "Septentrión · Specula",
  "texto-3": "Levante · Mons Horologii",
  "texto-4": "Oriente · Mare Speculi",
  "texto-5": "Austro · Margen Apertum",
  "texto-6": "Mediodía · Urbs Inversa",
  "texto-7": "Occidente · Chartae Vulnerum",
  "texto-8": "Poniente · Ultima Syllaba",
};

/** Lee títulos y territorios desde los botones del índice en index.html */
function metaDesdeIndice(id) {
  const btn = document.querySelector(`.indice-item[data-id="${id}"]`);
  if (!btn) {
    return { titulo: id, territorio: TERRITORIOS_FALLBACK[id] ?? "" };
  }
  return {
    titulo: (btn.dataset.titulo || btn.textContent).trim(),
    territorio: (btn.dataset.territorio || TERRITORIOS_FALLBACK[id] || "").trim(),
  };
}

const root = document.documentElement;

const paginaInicio = document.getElementById("pagina-inicio");
const inicioSplash = document.getElementById("inicio-splash");
const inicioContenido = document.getElementById("inicio-contenido-principal");
const btnIniciarRecorrido = document.getElementById("btn-iniciar-recorrido");
const umbralTexto = document.getElementById("inicio-umbral-texto");
const uiCapas = document.querySelector(".ui-capas");
const contenedor3d = document.getElementById("recorrido-3d");
const mapaPanel = document.getElementById("mapa-panel");
const mapaToggle = document.getElementById("mapa-toggle");
const mapaToggleLabel = mapaToggle?.querySelector(".mapa-toggle-label");
const indiceItems = document.querySelectorAll(".indice-item");

const PUNTOS_IDS = [...indiceItems].map((btn) => btn.dataset.id).filter(Boolean);
const TOTAL_PUNTOS = PUNTOS_IDS.length;
const lectura = document.getElementById("lectura");
const lecturaOverlay = document.getElementById("lectura-overlay");
const lecturaTitulo = document.getElementById("lectura-titulo");
const lecturaTerritorio = document.getElementById("lectura-territorio");
const lecturaCuerpo = document.getElementById("lectura-cuerpo");
const progresoTexto = document.getElementById("progreso-texto");
const progresoBloque = document.querySelector(".carto-progreso");
const btnCerrar = document.querySelector(".btn-cerrar");
const hintRecorrido = document.getElementById("hint-recorrido");

const visitados = new Set();
let activoId = null;
let recorrido = null;
let recorridoIniciado = false;

function actualizarPaleta(progreso) {
  root.style.setProperty("--scroll-progress", progreso);
}

function contarVisitados() {
  return PUNTOS_IDS.filter((id) => visitados.has(id)).length;
}

function calcularProgreso() {
  return contarVisitados() / TOTAL_PUNTOS;
}

function aplicarVisitadosIndice() {
  indiceItems.forEach((btn) => {
    const id = btn.dataset.id;
    btn.classList.toggle("visitado", id && visitados.has(id));
  });
}

function actualizarProgresoUI() {
  const cuentan = contarVisitados();
  if (progresoTexto) progresoTexto.textContent = String(cuentan);
  if (progresoBloque) {
    progresoBloque.setAttribute("aria-valuenow", String(cuentan));
    progresoBloque.setAttribute("aria-valuemax", String(TOTAL_PUNTOS));
  }
  actualizarPaleta(calcularProgreso());
  recorrido?.setVisitados(visitados);
}

function marcarVisitado(id) {
  if (!PUNTOS_IDS.includes(id)) return;
  const antes = visitados.size;
  visitados.add(id);
  if (visitados.size === antes) return;
  aplicarVisitadosIndice();
  actualizarProgresoUI();
}

function resaltarActivo(id) {
  activoId = id;
  indiceItems.forEach((btn) => btn.classList.toggle("activo", btn.dataset.id === id));
  recorrido?.setActivo(id);
  recorrido?.enfocarPunto(id);
}

function enlazarExpandir(contenedor) {
  contenedor.querySelectorAll(".btn-expand").forEach((btn) => {
    const etiquetaAbrir = btn.textContent.trim() || "Leer más";
    const etiquetaCerrar = btn.dataset.etiquetaCerrar || "Ocultar";

    btn.addEventListener("click", () => {
      const note = btn.nextElementSibling;
      const expanded = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!expanded));
      btn.textContent = expanded ? etiquetaAbrir : etiquetaCerrar;
      if (note?.classList.contains("texto-nota")) {
        note.hidden = expanded;
      }
    });
  });
}

/** Clona el contenido actual del <template> (lee el HTML en cada apertura) */
function clonarPlantilla(id) {
  const tpl = document.getElementById(`tpl-${id}`);
  if (!tpl) return null;

  if (tpl.content?.childNodes?.length) {
    return document.importNode(tpl.content, true);
  }

  const envoltorio = document.createElement("div");
  envoltorio.innerHTML = tpl.innerHTML;
  const frag = document.createDocumentFragment();
  while (envoltorio.firstChild) frag.appendChild(envoltorio.firstChild);
  return frag.childNodes.length ? frag : null;
}

function abrirLectura(id) {
  const meta = metaDesdeIndice(id);
  const contenido = clonarPlantilla(id);
  if (!contenido || !lectura) return;

  lecturaTitulo.textContent = meta.titulo;
  lecturaTerritorio.textContent = meta.territorio;

  lecturaCuerpo.replaceChildren(contenido);
  enlazarExpandir(lecturaCuerpo);

  marcarVisitado(id);
  resaltarActivo(id);

  if (hintRecorrido) hintRecorrido.hidden = true;

  lectura.hidden = false;
  lecturaOverlay.hidden = false;
  lectura.setAttribute("aria-hidden", "false");
  lecturaOverlay.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => {
    lectura.classList.add("abierta");
    lecturaOverlay.classList.add("visible");
    document.body.classList.add("lectura-abierta");
  });
}

function cerrarLectura() {
  lectura?.classList.remove("abierta");
  lecturaOverlay?.classList.remove("visible");
  document.body.classList.remove("lectura-abierta");

  const cerrar = () => {
    if (lectura) {
      lectura.hidden = true;
      lectura.setAttribute("aria-hidden", "true");
    }
    if (lecturaOverlay) {
      lecturaOverlay.hidden = true;
      lecturaOverlay.setAttribute("aria-hidden", "true");
    }
    indiceItems.forEach((btn) => btn.classList.remove("activo"));
    activoId = null;
    if (recorrido) recorrido.setActivo(null);
  };

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    cerrar();
    return;
  }

  setTimeout(cerrar, 380);
}

function setMapaAbierto(abierto) {
  if (!mapaPanel || !mapaToggle) return;
  mapaPanel.classList.toggle("abierto", abierto);
  mapaToggle.setAttribute("aria-expanded", String(abierto));
  if (mapaToggleLabel) mapaToggleLabel.textContent = abierto ? "Cerrar" : "Mapa";
}

mapaToggle?.addEventListener("click", () => {
  setMapaAbierto(!mapaPanel.classList.contains("abierto"));
});

function montarTextoUmbral() {
  const tpl = document.getElementById("tpl-portada");
  if (!tpl || !umbralTexto) return;
  umbralTexto.innerHTML = "";
  umbralTexto.appendChild(tpl.content.cloneNode(true));
}

function iniciarRecorrido() {
  if (recorridoIniciado) return;
  recorridoIniciado = true;

  document.body.classList.remove("estado-inicio");
  document.body.classList.add("estado-recorrido");

  if (paginaInicio) {
    paginaInicio.hidden = true;
    paginaInicio.setAttribute("aria-hidden", "true");
  }

  if (contenedor3d) contenedor3d.hidden = false;
  if (uiCapas) uiCapas.hidden = false;

  if (btnIniciarRecorrido) {
    btnIniciarRecorrido.disabled = true;
    btnIniciarRecorrido.textContent = "Cargando mapa…";
  }

  if (contenedor3d) {
    recorrido = new Recorrido3D(contenedor3d, {
      onPuntoClick: (id) => abrirLectura(id),
      onMarcadoresListos: () => {
        recorrido?.actualizarEtiquetasMarcadores();
        actualizarProgresoUI();
      },
      etiquetaPunto: (id) => metaDesdeIndice(id).titulo,
    });
  }

  actualizarProgresoUI();

  if (mapaPanel && matchMedia("(min-width: 901px)").matches) {
    setMapaAbierto(true);
  }
}

function animarLogoInicio() {
  if (!inicioSplash || !inicioContenido) {
    inicioContenido?.classList.remove("inicio-contenido--pendiente");
    inicioContenido?.classList.add("inicio-contenido--visible");
    return;
  }

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const esperaLogo = reduceMotion ? 0 : 2000;
  const duracionFade = reduceMotion ? 0 : 1000;

  window.setTimeout(() => {
    inicioSplash.classList.add("desvaneciendo");
    inicioSplash.setAttribute("aria-hidden", "true");

    window.setTimeout(() => {
      inicioSplash.classList.add("oculto");
      inicioContenido.classList.remove("inicio-contenido--pendiente");
      inicioContenido.classList.add("inicio-contenido--visible");
    }, duracionFade);
  }, esperaLogo);
}

montarTextoUmbral();
actualizarProgresoUI();
animarLogoInicio();
btnIniciarRecorrido?.addEventListener("click", iniciarRecorrido);

indiceItems.forEach((btn) => {
  btn.addEventListener("click", () => {
    abrirLectura(btn.dataset.id);
    if (matchMedia("(max-width: 900px)").matches) setMapaAbierto(false);
  });
});

btnCerrar?.addEventListener("click", cerrarLectura);
lecturaOverlay?.addEventListener("click", cerrarLectura);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && activoId) cerrarLectura();
});

actualizarPaleta(0);
