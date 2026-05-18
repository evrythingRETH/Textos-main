import "./main.css";
import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/400-italic.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/literata/400.css";
import "@fontsource/literata/500.css";
import { InkScene } from "./ink-scene.js";

const sections = document.querySelectorAll(".section");
const navDots = document.querySelectorAll(".nav-dot");
const navLabels = document.querySelectorAll(".nav-label");
const scenes = document.querySelectorAll(".texto-scene");
const root = document.documentElement;

const inkScene = new InkScene();
document.querySelectorAll(".ink-source").forEach((el) => inkScene.registerSource(el));

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function updateScrollColors() {
  const scrollTop = window.scrollY;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  const progress = docHeight > 0 ? Math.min(scrollTop / docHeight, 1) : 0;

  root.style.setProperty("--scroll-progress", progress);

  const bg = Math.round(lerp(232, 18, progress));
  root.style.setProperty("--bg", `rgb(${bg}, ${bg}, ${bg})`);

  const panelBg = Math.round(lerp(255, 22, progress));
  const panelFg = Math.round(lerp(13, 245, progress));
  const panelMuted = Math.round(lerp(61, 170, progress));

  root.style.setProperty("--panel-bg", `rgb(${panelBg}, ${panelBg}, ${panelBg})`);
  root.style.setProperty("--panel-fg", `rgb(${panelFg}, ${panelFg}, ${panelFg})`);
  root.style.setProperty("--panel-muted", `rgb(${panelMuted}, ${panelMuted}, ${panelMuted})`);
  root.style.setProperty("--fg", `rgb(${panelFg}, ${panelFg}, ${panelFg})`);
  root.style.setProperty("--muted", `rgb(${panelMuted}, ${panelMuted}, ${panelMuted})`);

  inkScene.setScrollProgress(progress);
}

function updateSceneTilt() {
  scenes.forEach((scene) => {
    const rect = scene.getBoundingClientRect();
    const center = rect.top + rect.height / 2;
    const viewCenter = window.innerHeight / 2;
    const offset = (center - viewCenter) / window.innerHeight;
    const rotateX = offset * -6;
    const rotateY = offset * 2;

    scene.classList.add("is-tilted");
    scene.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  });
}

function setActiveSection(id) {
  navDots.forEach((dot) => {
    dot.classList.toggle("active", dot.dataset.section === id);
  });
  navLabels.forEach((label) => {
    label.classList.toggle("active", label.dataset.for === id);
  });
}

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        setActiveSection(entry.target.id);
      }
    });
  },
  { threshold: 0.3, rootMargin: "-8% 0px -8% 0px" }
);

sections.forEach((section) => observer.observe(section));

let ticking = false;
window.addEventListener(
  "scroll",
  () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        updateScrollColors();
        updateSceneTilt();
        ticking = false;
      });
      ticking = true;
    }
  },
  { passive: true }
);

document.querySelector(".btn-scroll")?.addEventListener("click", () => {
  document.getElementById("texto-1")?.scrollIntoView({ behavior: "smooth" });
});

document.querySelector(".btn-top")?.addEventListener("click", () => {
  document.getElementById("inicio")?.scrollIntoView({ behavior: "smooth" });
});

document.querySelectorAll(".btn-expand").forEach((btn) => {
  btn.addEventListener("click", () => {
    const note = btn.nextElementSibling;
    const expanded = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", String(!expanded));
    btn.textContent = expanded ? "Leer análisis" : "Ocultar análisis";
    if (note?.classList.contains("texto-nota")) {
      note.hidden = expanded;
    }
  });
});

navDots.forEach((dot) => {
  dot.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById(dot.dataset.section)?.scrollIntoView({ behavior: "smooth" });
  });
});

updateScrollColors();
updateSceneTilt();
sections[0]?.classList.add("visible");
setActiveSection("inicio");
