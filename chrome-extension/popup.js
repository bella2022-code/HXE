const els = {
  pickButton: document.querySelector("#pickButton"),
  captureButton: document.querySelector("#captureButton"),
  helpButton: document.querySelector("#helpButton"),
  canvas: document.querySelector("#previewCanvas"),
  palette: document.querySelector("#palette"),
  status: document.querySelector("#status"),
};

const ctx = els.canvas.getContext("2d", { willReadFrequently: true });

function toHex(value) {
  return value.toString(16).padStart(2, "0");
}

function rgbToHex([r, g, b]) {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function colorDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function getReadableTextColor([r, g, b]) {
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.58 ? "#202625" : "#fffdfa";
}

function extractPalette(imageData, count = 6) {
  const buckets = new Map();
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 16) {
    const alpha = data[i + 3];
    if (alpha < 180) continue;

    const rgb = [data[i], data[i + 1], data[i + 2]];
    const max = Math.max(...rgb);
    const min = Math.min(...rgb);
    if (max > 246 && min > 246) continue;
    if (max < 18 && min < 18) continue;

    const key = rgb.map((channel) => Math.round(channel / 24) * 24).join(",");
    const bucket = buckets.get(key) || { total: [0, 0, 0], hits: 0 };
    bucket.total[0] += rgb[0];
    bucket.total[1] += rgb[1];
    bucket.total[2] += rgb[2];
    bucket.hits += 1;
    buckets.set(key, bucket);
  }

  return [...buckets.values()]
    .map((bucket) => ({
      rgb: bucket.total.map((channel) => Math.round(channel / bucket.hits)),
      hits: bucket.hits,
    }))
    .sort((a, b) => b.hits - a.hits)
    .reduce((colors, bucket) => {
      if (colors.length >= count) return colors;
      const isTooClose = colors.some((color) => colorDistance(color.rgb, bucket.rgb) < 34);
      return isTooClose ? colors : [...colors, bucket];
    }, [])
    .map((bucket) => bucket.rgb);
}

function renderPalette(colors) {
  els.palette.innerHTML = colors
    .map((rgb) => {
      const hex = rgbToHex(rgb);
      return `
        <button class="swatch" type="button" data-copy="${hex}" style="background:${hex}; color:${getReadableTextColor(rgb)}">
          <code>${hex}</code>
        </button>
      `;
    })
    .join("");
}

function setStatus(message) {
  els.status.textContent = message;
}

function paintPickedPreview(hex) {
  const rgb = hexToRgb(hex);
  const labelColor = getReadableTextColor(rgb);

  els.canvas.width = 360;
  els.canvas.height = 202;
  ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, els.canvas.width, els.canvas.height);
  ctx.fillStyle = labelColor;
  ctx.font = "800 32px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText(hex, 24, 104);
  ctx.font = "700 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText("滴管取色", 26, 132);
}

async function setPickedColor(hex) {
  const rgb = hexToRgb(hex);

  paintPickedPreview(hex);
  renderPalette([rgb]);
  await chrome.storage.local.set({ lastPalette: [hex], lastPickedColor: hex });
  setStatus(`已選取 ${hex}，點色票可複製。`);
}

async function pickColor() {
  if (!("EyeDropper" in window)) {
    setStatus("這個 Chrome 版本不支援滴管工具，請改用截圖分析。");
    return;
  }

  els.pickButton.disabled = true;
  setStatus("請在頁面上點選一個顏色。");

  try {
    const result = await new EyeDropper().open();
    await setPickedColor(result.sRGBHex);
  } catch (error) {
    setStatus("已取消滴管取色。");
  } finally {
    els.pickButton.disabled = false;
  }
}

function friendlyCaptureError(message) {
  if (!message) return "截圖失敗，請切到一般網頁再試一次。";
  if (message.includes("Cannot access") || message.includes("chrome://") || message.includes("extensions")) {
    return "Chrome 系統頁不能截圖，請切到一般網站後再打開外掛。";
  }
  if (message.includes("activeTab") || message.includes("permission")) {
    return "這個頁面暫時沒有截圖權限，請重新點一次外掛圖示。";
  }
  return message;
}

function captureVisibleTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab({ format: "png" }, (dataUrl) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(dataUrl);
    });
  });
}

async function analyzeScreenshot() {
  setStatus("正在分析目前分頁...");
  els.captureButton.disabled = true;

  try {
    const dataUrl = await captureVisibleTab();
    const image = new Image();
    image.src = dataUrl;
    await image.decode();

    const ratio = image.width / image.height;
    els.canvas.width = 360;
    els.canvas.height = Math.round(els.canvas.width / ratio);
    ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
    ctx.drawImage(image, 0, 0, els.canvas.width, els.canvas.height);

    const imageData = ctx.getImageData(0, 0, els.canvas.width, els.canvas.height);
    const colors = extractPalette(imageData);
    renderPalette(colors);
    await chrome.storage.local.set({ lastPalette: colors.map(rgbToHex) });
    setStatus(colors.length ? `已擷取 ${colors.length} 組色票。` : "這張畫面沒有抓到明顯色票。");
  } catch (error) {
    setStatus(friendlyCaptureError(error.message));
  } finally {
    els.captureButton.disabled = false;
  }
}

els.pickButton.addEventListener("click", pickColor);
els.captureButton.addEventListener("click", analyzeScreenshot);
els.helpButton.addEventListener("click", () => {
  setStatus("按滴管圖示可直接取色；按 ▣ 可截圖分析整個頁面色系；點色票可複製色碼。");
});

els.palette.addEventListener("click", async (event) => {
  const swatch = event.target.closest("[data-copy]");
  if (!swatch) return;
  await navigator.clipboard.writeText(swatch.dataset.copy);
  setStatus(`已複製 ${swatch.dataset.copy}`);
});

chrome.storage.local.get("lastPalette", ({ lastPalette }) => {
  if (Array.isArray(lastPalette) && lastPalette.length) {
    renderPalette(lastPalette.map(hexToRgb));
  }
});
