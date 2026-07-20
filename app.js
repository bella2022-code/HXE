const state = {
  rgb: { r: 63, g: 125, b: 88 },
  activeCategory: "all",
  toastTimer: undefined,
};

const els = {
  workspace: document.querySelector("#workspace"),
  openHelp: document.querySelector("#openHelp"),
  closeHelp: document.querySelector("#closeHelp"),
  finishHelp: document.querySelector("#finishHelp"),
  helpBackdrop: document.querySelector("#helpBackdrop"),
  helpPanel: document.querySelector("#helpPanel"),
  openDrawer: document.querySelector("#openDrawer"),
  closeDrawer: document.querySelector("#closeDrawer"),
  drawerBackdrop: document.querySelector("#drawerBackdrop"),
  paletteDrawer: document.querySelector("#paletteDrawer"),
  paletteCategories: document.querySelector("#paletteCategories"),
  paletteLibrary: document.querySelector("#paletteLibrary"),
  dailyRecommendation: document.querySelector("#dailyRecommendation"),
  mainResize: document.querySelector("#mainResize"),
  colorInput: document.querySelector("#colorInput"),
  colorPicker: document.querySelector("#colorPicker"),
  colorCard: document.querySelector("#colorCard"),
  formats: document.querySelector("#formats"),
  palette: document.querySelector("#palette"),
  copyAll: document.querySelector("#copyAll"),
  copyPalette: document.querySelector("#copyPalette"),
  randomColor: document.querySelector("#randomColor"),
  pasteButton: document.querySelector("#pasteButton"),
  lightContrast: document.querySelector("#lightContrast"),
  darkContrast: document.querySelector("#darkContrast"),
  errorMessage: document.querySelector("#errorMessage"),
  toast: document.querySelector("#toast"),
};

const resizeStorageKey = "hxe-color-tool-layout";
const recommendationStorageKey = "hxe-color-tool-recommendation-date";
const helpSeenStorageKey = "hxe-color-tool-help-seen";
const resizeDefaults = {
  left: null,
  format: null,
  contrast: null,
};
const paletteLibrary = window.HXE_PALETTES || [];
const paletteCategories = window.HXE_PALETTE_CATEGORIES || [{ id: "all", label: "全部" }];

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const round = (value, precision = 0) => Number(value.toFixed(precision));
const toHexPair = (value) => value.toString(16).padStart(2, "0");

function rgbToHex({ r, g, b }) {
  return `#${toHexPair(r)}${toHexPair(g)}${toHexPair(b)}`;
}

function rgbToHsl({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  const l = (max + min) / 2;

  if (delta) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    if (max === gn) h = (bn - rn) / delta + 2;
    if (max === bn) h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const s = delta ? delta / (1 - Math.abs(2 * l - 1)) : 0;
  return { h: round(h), s: round(s * 100), l: round(l * 100) };
}

function hslToRgb({ h, s, l }) {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  let rn = 0;
  let gn = 0;
  let bn = 0;

  if (h < 60) [rn, gn, bn] = [c, x, 0];
  else if (h < 120) [rn, gn, bn] = [x, c, 0];
  else if (h < 180) [rn, gn, bn] = [0, c, x];
  else if (h < 240) [rn, gn, bn] = [0, x, c];
  else if (h < 300) [rn, gn, bn] = [x, 0, c];
  else [rn, gn, bn] = [c, 0, x];

  return {
    r: Math.round((rn + m) * 255),
    g: Math.round((gn + m) * 255),
    b: Math.round((bn + m) * 255),
  };
}

function rgbToOklch({ r, g, b }) {
  const linear = [r, g, b].map((value) => {
    const v = value / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });

  const l = Math.cbrt(0.4122214708 * linear[0] + 0.5363325363 * linear[1] + 0.0514459929 * linear[2]);
  const m = Math.cbrt(0.2119034982 * linear[0] + 0.6806995451 * linear[1] + 0.1073969566 * linear[2]);
  const s = Math.cbrt(0.0883024619 * linear[0] + 0.2817188376 * linear[1] + 0.6299787005 * linear[2]);
  const okL = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bAxis = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const chroma = Math.sqrt(a * a + bAxis * bAxis);
  const hue = (Math.atan2(bAxis, a) * 180) / Math.PI;

  return {
    l: round(okL * 100, 2),
    c: round(chroma, 4),
    h: round(hue < 0 ? hue + 360 : hue, 2),
  };
}

function parseColor(input) {
  const value = input.trim().toLowerCase();
  const hex = value.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const raw = hex[1].length === 3 ? hex[1].replace(/./g, "$&$&") : hex[1];
    return {
      r: parseInt(raw.slice(0, 2), 16),
      g: parseInt(raw.slice(2, 4), 16),
      b: parseInt(raw.slice(4, 6), 16),
    };
  }

  const numbers = value.match(/-?\d*\.?\d+%?/g) || [];
  if (value.startsWith("rgb") && numbers.length >= 3) {
    return {
      r: normalizeChannel(numbers[0]),
      g: normalizeChannel(numbers[1]),
      b: normalizeChannel(numbers[2]),
    };
  }

  if (value.startsWith("hsl") && numbers.length >= 3) {
    return hslToRgb({
      h: ((Number.parseFloat(numbers[0]) % 360) + 360) % 360,
      s: clamp(Number.parseFloat(numbers[1]), 0, 100),
      l: clamp(Number.parseFloat(numbers[2]), 0, 100),
    });
  }

  return null;
}

function normalizeChannel(value) {
  if (value.endsWith("%")) return Math.round((clamp(Number.parseFloat(value), 0, 100) / 100) * 255);
  return Math.round(clamp(Number.parseFloat(value), 0, 255));
}

function relativeLuminance({ r, g, b }) {
  const [rs, gs, bs] = [r, g, b].map((value) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(first, second) {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

function contrastMeta(ratio) {
  if (ratio >= 7) {
    return {
      grade: "AAA",
      verdict: "內文很穩",
      note: "適合小字、按鈕與長段文字。",
      tone: "strong",
    };
  }
  if (ratio >= 4.5) {
    return {
      grade: "AA",
      verdict: "內文可用",
      note: "適合一般文字與介面標籤。",
      tone: "good",
    };
  }
  if (ratio >= 3) {
    return {
      grade: "AA 大字",
      verdict: "只建議大字",
      note: "適合標題，不適合小字內文。",
      tone: "warn",
    };
  }
  return {
    grade: "低",
    verdict: "不建議",
    note: "文字容易糊在背景裡，請換色。",
    tone: "risk",
  };
}

function getFormats(rgb) {
  const hsl = rgbToHsl(rgb);
  const oklch = rgbToOklch(rgb);
  return [
    ["HEX", rgbToHex(rgb)],
    ["RGB", `rgb(${rgb.r} ${rgb.g} ${rgb.b})`],
    ["HSL", `hsl(${hsl.h} ${hsl.s}% ${hsl.l}%)`],
    ["OKLCH", `oklch(${oklch.l}% ${oklch.c} ${oklch.h})`],
  ];
}

function getPalette(rgb) {
  const hsl = rgbToHsl(rgb);
  return [92, 80, 66, hsl.l, 34, 24, 16].map((lightness) =>
    rgbToHex(hslToRgb({ h: hsl.h, s: clamp(hsl.s, 12, 86), l: lightness })),
  );
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function hashString(value) {
  return [...value].reduce((total, char) => (total * 31 + char.charCodeAt(0)) % 100000, 17);
}

function getDailyPalette() {
  if (!paletteLibrary.length) return null;
  const weighted = paletteLibrary
    .flatMap((palette) => Array.from({ length: Math.max(1, Math.round((palette.score || 80) / 12)) }, () => palette));
  return weighted[hashString(todayKey()) % weighted.length];
}

function hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function paletteToText(palette) {
  return `${palette.name}\n${palette.colors.join("\n")}`;
}

function renderPaletteStrip(palette) {
  return `
    <div class="palette-strip">
      ${palette.colors
        .map((color) => `<button type="button" style="background:${color}" data-copy="${color}" aria-label="複製 ${color}"></button>`)
        .join("")}
    </div>
  `;
}

function applyPalette(palette) {
  const main = palette.colors[0] || "#3f7d58";
  els.colorInput.value = main;
  applyInput(main, true);
  showToast(`已套用 ${palette.name}`);
}

function renderPaletteCard(palette, featured = false) {
  const actionPrefix = featured ? "daily" : "library";
  return `
    <article class="${featured ? "daily-card-inner" : "palette-card"}">
      <div class="${featured ? "daily-card-head" : "palette-card-head"}">
        <div>
          <h3>${palette.name}</h3>
          <p>${palette.mood}</p>
        </div>
        <span class="palette-score">${palette.score}</span>
      </div>
      ${renderPaletteStrip(palette)}
      <p>${palette.usage}</p>
      <div class="palette-actions">
        <button class="quiet-action" type="button" data-apply-palette="${palette.id}" aria-label="套用主色" data-tooltip="套用主色">
          <span aria-hidden="true">●</span>
        </button>
        <button class="quiet-action" type="button" data-copy-palette="${palette.id}" aria-label="複製色系" data-tooltip="複製色系">
          <span aria-hidden="true">⧉</span>
        </button>
      </div>
    </article>
  `;
}

function renderDailyRecommendation() {
  const palette = getDailyPalette();
  if (!palette) return;

  els.dailyRecommendation.innerHTML = `
    <div class="daily-card-head">
      <div>
        <p class="eyebrow">今日推薦 · ${todayKey()}</p>
        <h3>${palette.name}</h3>
        <p>${palette.mood}</p>
      </div>
      <span class="palette-score">${palette.score}</span>
    </div>
    ${renderPaletteStrip(palette)}
    <div class="palette-actions">
      <button class="quiet-action" type="button" data-apply-palette="${palette.id}" aria-label="套用主色" data-tooltip="套用主色">
        <span aria-hidden="true">●</span>
      </button>
      <button class="quiet-action" type="button" data-copy-palette="${palette.id}" aria-label="複製色系" data-tooltip="複製色系">
        <span aria-hidden="true">⧉</span>
      </button>
    </div>
  `;

  try {
    localStorage.setItem(recommendationStorageKey, todayKey());
  } catch {
    return;
  }
}

function renderPaletteLibrary() {
  els.paletteCategories.innerHTML = paletteCategories
    .map(
      (category) => `
        <button class="tab-button ${category.id === state.activeCategory ? "is-active" : ""}" type="button" data-category="${category.id}">
          ${category.label}
        </button>
      `,
    )
    .join("");

  const palettes = state.activeCategory === "all"
    ? paletteLibrary
    : paletteLibrary.filter((palette) => palette.category === state.activeCategory);

  els.paletteLibrary.innerHTML = palettes.map((palette) => renderPaletteCard(palette)).join("");
}

function findPalette(id) {
  return paletteLibrary.find((palette) => palette.id === id);
}

function openDrawer() {
  els.drawerBackdrop.hidden = false;
  els.paletteDrawer.classList.add("is-open");
  els.paletteDrawer.setAttribute("aria-hidden", "false");
}

function closeDrawer() {
  els.paletteDrawer.classList.remove("is-open");
  els.paletteDrawer.setAttribute("aria-hidden", "true");
  window.setTimeout(() => {
    if (!els.paletteDrawer.classList.contains("is-open")) els.drawerBackdrop.hidden = true;
  }, 220);
}

function markHelpSeen() {
  try {
    localStorage.setItem(helpSeenStorageKey, "true");
  } catch {
    return;
  }
}

function openHelp() {
  els.helpBackdrop.hidden = false;
  els.helpPanel.classList.add("is-open");
  els.helpPanel.setAttribute("aria-hidden", "false");
}

function closeHelp(markSeen = true) {
  els.helpPanel.classList.remove("is-open");
  els.helpPanel.setAttribute("aria-hidden", "true");
  if (markSeen) markHelpSeen();
  window.setTimeout(() => {
    if (!els.helpPanel.classList.contains("is-open")) els.helpBackdrop.hidden = true;
  }, 180);
}

function maybeShowFirstRunHelp() {
  try {
    if (localStorage.getItem(helpSeenStorageKey) === "true") return;
  } catch {
    return;
  }

  window.setTimeout(openHelp, 450);
}

function render() {
  const rgb = state.rgb;
  const hex = rgbToHex(rgb);
  const textRgb = contrastRatio(rgb, { r: 255, g: 255, b: 255 }) >= 4.5 ? "#fffdfa" : "#1e2424";
  const palette = getPalette(rgb);

  document.documentElement.style.setProperty("--accent", hex);
  document.documentElement.style.setProperty("--accent-ink", textRgb);
  els.colorPicker.value = hex;
  els.colorCard.style.background = hex;
  els.colorCard.style.color = textRgb;
  els.errorMessage.hidden = true;

  els.formats.innerHTML = getFormats(rgb)
    .map(
      ([label, value]) => `
        <div class="format-row">
          <div>
            <span>${label}</span>
            <code>${value}</code>
          </div>
          <button class="copy-button quiet-action" type="button" data-copy="${value}" aria-label="複製 ${label}" data-tooltip="複製">
            <span aria-hidden="true">⧉</span>
          </button>
        </div>
      `,
    )
    .join("");

  els.palette.innerHTML = palette
    .map(
      (color) => `
        <button class="swatch-copy" type="button" style="background:${color}" data-copy="${color}" aria-label="複製 ${color}">
          <code>${color}</code>
        </button>
      `,
    )
    .join("");

  renderContrastTile(els.lightContrast, rgb, { r: 255, g: 255, b: 255 }, "#fffdfa", "#1e2424", "白底", "白色背景");
  renderContrastTile(els.darkContrast, rgb, { r: 30, g: 36, b: 36 }, "#1e2424", "#fffdfa", "深底", "深色背景");
}

function renderContrastTile(el, color, base, bg, fg, title, context) {
  const ratio = contrastRatio(color, base);
  const meta = contrastMeta(ratio);
  const hex = rgbToHex(color);
  el.style.background = bg;
  el.style.color = fg;
  el.style.setProperty("--contrast-bg", bg);
  el.style.setProperty("--contrast-fg", fg);
  el.style.setProperty("--sample-color", hex);
  el.dataset.tone = meta.tone;
  el.innerHTML = `
    <div class="contrast-topline">
      <span class="contrast-context">${context}</span>
      <span class="contrast-grade">${meta.grade}</span>
    </div>
    <div class="contrast-pair" aria-hidden="true">
      <i style="background:${hex}"></i>
      <i style="background:${bg}"></i>
    </div>
    <strong class="contrast-sample">${meta.verdict}</strong>
    <span class="contrast-ratio">${round(ratio, 2)}:1</span>
    <p>${meta.note}</p>
  `;
  el.dataset.copy = `${title} ${meta.verdict} ${round(ratio, 2)}:1`;
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    showToast(`已複製 ${value}`);
  } catch {
    showToast("瀏覽器不允許直接複製");
  }
}

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  state.toastTimer = window.setTimeout(() => els.toast.classList.remove("is-visible"), 1700);
}

function readLayout() {
  try {
    return { ...resizeDefaults, ...JSON.parse(localStorage.getItem(resizeStorageKey)) };
  } catch {
    return { ...resizeDefaults };
  }
}

function saveLayout(next) {
  try {
    localStorage.setItem(resizeStorageKey, JSON.stringify({ ...readLayout(), ...next }));
  } catch {
    return;
  }
}

function applyLayout() {
  const layout = readLayout();
  if (Number.isFinite(layout.left)) els.workspace.style.setProperty("--left-panel", `${layout.left}px`);
  if (Number.isFinite(layout.format)) els.workspace.style.setProperty("--format-panel", `${layout.format}px`);
  if (Number.isFinite(layout.contrast)) {
    const contrast = clamp(layout.contrast, 260, 420);
    els.workspace.style.setProperty("--contrast-panel", `${contrast}px`);
    if (contrast !== layout.contrast) saveLayout({ contrast });
  }
}

function resetLayout() {
  try {
    localStorage.removeItem(resizeStorageKey);
  } catch {
    return;
  }

  els.workspace.style.removeProperty("--left-panel");
  els.workspace.style.removeProperty("--format-panel");
  els.workspace.style.removeProperty("--contrast-panel");
  showToast("版面已重置");
}

function panelWidth(selector) {
  return els.workspace.querySelector(selector).getBoundingClientRect().width;
}

function panelHeight(selector) {
  return els.workspace.querySelector(selector).getBoundingClientRect().height;
}

function setMainPanelWidth(width) {
  const workspaceWidth = els.workspace.getBoundingClientRect().width;
  const max = Math.max(320, workspaceWidth - 404);
  const next = clamp(width, 280, max);
  els.workspace.style.setProperty("--left-panel", `${next}px`);
  saveLayout({ left: next });
}

function setVerticalPanelHeights(kind, nextPrimary, nextSecondary) {
  if (kind === "format") {
    const format = clamp(nextPrimary, 150, 420);
    const contrast = clamp(nextSecondary, 180, 380);
    els.workspace.style.setProperty("--format-panel", `${format}px`);
    els.workspace.style.setProperty("--contrast-panel", `${contrast}px`);
    saveLayout({ format, contrast });
    return;
  }

  const contrast = clamp(nextPrimary, 180, 420);
  els.workspace.style.setProperty("--contrast-panel", `${contrast}px`);
  saveLayout({ contrast });
}

function startMainResize(event) {
  if (!window.matchMedia("(min-width: 861px)").matches) return;
  if (event.detail > 1) return;

  const startX = event.clientX;
  const startWidth = panelWidth(".preview-panel");
  els.mainResize.setPointerCapture(event.pointerId);
  els.workspace.classList.add("is-resizing");
  els.mainResize.classList.add("is-active");
  document.body.classList.add("is-dragging-panel");

  const onMove = (moveEvent) => setMainPanelWidth(startWidth + moveEvent.clientX - startX);
  const onUp = () => {
    els.workspace.classList.remove("is-resizing");
    els.mainResize.classList.remove("is-active");
    document.body.classList.remove("is-dragging-panel");
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp, { once: true });
}

function startVerticalResize(event) {
  if (!window.matchMedia("(min-width: 861px)").matches) return;
  if (event.detail > 1) return;

  const handle = event.currentTarget;
  const kind = handle.dataset.resizeY;
  const startY = event.clientY;
  const startFormat = panelHeight(".details-panel .module[aria-label='色碼格式']");
  const startContrast = panelHeight(".details-panel .module[aria-label='文字可讀性']");
  handle.setPointerCapture(event.pointerId);
  els.workspace.classList.add("is-resizing");
  handle.classList.add("is-active");
  document.body.classList.add("is-dragging-panel-y");

  const onMove = (moveEvent) => {
    const delta = moveEvent.clientY - startY;
    if (kind === "format") setVerticalPanelHeights(kind, startFormat + delta, startContrast - delta);
    else setVerticalPanelHeights(kind, startContrast + delta);
  };

  const onUp = () => {
    els.workspace.classList.remove("is-resizing");
    handle.classList.remove("is-active");
    document.body.classList.remove("is-dragging-panel-y");
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp, { once: true });
}

function nudgeResize(handle, amount) {
  if (handle.id === "mainResize") {
    setMainPanelWidth(panelWidth(".preview-panel") + amount);
    return;
  }

  const kind = handle.dataset.resizeY;
  const format = panelHeight(".details-panel .module[aria-label='色碼格式']");
  const contrast = panelHeight(".details-panel .module[aria-label='文字可讀性']");
  if (kind === "format") setVerticalPanelHeights(kind, format + amount, contrast - amount);
  else setVerticalPanelHeights(kind, contrast + amount);
}

function initResizers() {
  applyLayout();
  els.mainResize.addEventListener("pointerdown", startMainResize);
  document.querySelectorAll("[data-resize-y]").forEach((handle) => {
    handle.addEventListener("pointerdown", startVerticalResize);
  });

  document.querySelectorAll(".resize-handle").forEach((handle) => {
    handle.addEventListener("dblclick", resetLayout);
    handle.addEventListener("keydown", (event) => {
      if (event.key === "Home") {
        event.preventDefault();
        resetLayout();
        return;
      }

      const isMain = handle.id === "mainResize";
      const forward = isMain ? event.key === "ArrowRight" : event.key === "ArrowDown";
      const backward = isMain ? event.key === "ArrowLeft" : event.key === "ArrowUp";
      if (!forward && !backward) return;
      event.preventDefault();
      nudgeResize(handle, forward ? 18 : -18);
    });
  });
}

function applyInput(value, syncInput = false) {
  const rgb = parseColor(value);
  if (!rgb) {
    els.errorMessage.textContent = "讀不到這個色碼，請試試 HEX、RGB 或 HSL。";
    els.errorMessage.hidden = false;
    return;
  }

  state.rgb = rgb;
  if (syncInput) els.colorInput.value = rgbToHex(rgb);
  render();
}

els.colorInput.addEventListener("input", (event) => applyInput(event.target.value));
els.colorPicker.addEventListener("input", (event) => applyInput(event.target.value, true));

document.addEventListener("click", (event) => {
  const copyTarget = event.target.closest("[data-copy]");
  if (copyTarget) copyText(copyTarget.dataset.copy);

  const applyTarget = event.target.closest("[data-apply-palette]");
  if (applyTarget) {
    const palette = findPalette(applyTarget.dataset.applyPalette);
    if (palette) applyPalette(palette);
  }

  const paletteTarget = event.target.closest("[data-copy-palette]");
  if (paletteTarget) {
    const palette = findPalette(paletteTarget.dataset.copyPalette);
    if (palette) copyText(paletteToText(palette));
  }

  const categoryTarget = event.target.closest("[data-category]");
  if (categoryTarget) {
    state.activeCategory = categoryTarget.dataset.category;
    renderPaletteLibrary();
  }
});

els.openDrawer.addEventListener("click", openDrawer);
els.closeDrawer.addEventListener("click", closeDrawer);
els.drawerBackdrop.addEventListener("click", closeDrawer);
document.addEventListener("click", (event) => {
  if (event.target.closest("#openHelp")) openHelp();
  if (event.target.closest("#closeHelp") || event.target.closest("#finishHelp")) closeHelp();
});
els.helpBackdrop.addEventListener("click", () => closeHelp());
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && els.helpPanel.classList.contains("is-open")) closeHelp();
});

els.copyAll.addEventListener("click", () => {
  const text = getFormats(state.rgb)
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
  copyText(text);
});

els.copyPalette.addEventListener("click", () => copyText(getPalette(state.rgb).join("\n")));

els.randomColor.addEventListener("click", () => {
  const rgb = {
    r: Math.floor(Math.random() * 256),
    g: Math.floor(Math.random() * 256),
    b: Math.floor(Math.random() * 256),
  };
  els.colorInput.value = rgbToHex(rgb);
  applyInput(els.colorInput.value);
});

els.pasteButton.addEventListener("click", async () => {
  try {
    const value = await navigator.clipboard.readText();
    els.colorInput.value = value.trim();
    applyInput(els.colorInput.value);
  } catch {
    showToast("瀏覽器不允許讀取剪貼簿");
  }
});

initResizers();
renderDailyRecommendation();
renderPaletteLibrary();
render();
maybeShowFirstRunHelp();
