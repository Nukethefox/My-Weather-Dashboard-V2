"use strict";

const elements = Object.fromEntries(
  ["region", "product", "hour", "hour-label", "first-hour", "last-hour", "previous", "play", "next", "folder", "choose-folder", "source-info", "model-info", "map", "message"]
    .map(id => [id, document.getElementById(id)])
);
const modelButtons = [...document.querySelectorAll("[data-model]")];
const models = ["HARMONIE", "ECMWF", "GFS"];
const productNames = {
  PRECIP: "Precipitación",
  PRECIP_ACC: "Precipitación acumulada (mm)",
  TEMP2m: "Temperatura a 2 m (°C)",
  TEMP850: "Temperatura a 850 hPa (°C)",
  GEOP500: "Geopotencial a 500 hPa y presión en superficie",
  VIENTO10: "Viento a 10 m (km/h)",
  VIENTO850: "Viento a 850 hPa (km/h)",
  VIENTO700: "Viento a 700 hPa (km/h)"
};
const regionNames = { iberia: "Península ibérica", mediterraneo: "Mediterráneo", europe: "Europa" };
const filenamePattern = /^(HARMONIE|ECMWF|GFS)-(iberia|mediterraneo|europe)-([A-Za-z0-9_]+)-(\d{10})-(\d{3})\.png$/i;
const hourMs = 60 * 60 * 1000;
let records = [];
let latestRuns = {};
let referenceTime = 0;
let currentModel = "HARMONIE";
let timer = null;
let objectUrl = null;
let imageRequest = 0;
let folderRequest = 0;
let discoveryPending = true;

function runTime(run) {
  const date = new Date(Date.UTC(Number(run.slice(0, 4)), Number(run.slice(4, 6)) - 1, Number(run.slice(6, 8)), Number(run.slice(8, 10))));
  const formatted = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}${String(date.getUTCHours()).padStart(2, "0")}`;
  return formatted === run ? date.getTime() : null;
}

function parseRecord(name, source) {
  const match = filenamePattern.exec(name);
  if (!match) return null;
  const time = runTime(match[4]);
  if (time === null) return null;
  const product = Object.keys(productNames).find(key => key.toLowerCase() === match[3].toLowerCase()) || match[3];
  return { model: match[1].toUpperCase(), region: match[2].toLowerCase(), product, run: match[4], time, hour: Number(match[5]), source };
}

function formatRun(time) {
  const date = new Date(time);
  return `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()} ${String(date.getUTCHours()).padStart(2, "0")} UTC`;
}

function setMessage(text) {
  elements.map.hidden = true;
  elements.message.hidden = false;
  elements.message.textContent = text;
}

function clearImage() {
  imageRequest++;
  elements.map.removeAttribute("src");
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
}

function stopPlayback() {
  clearInterval(timer);
  timer = null;
  elements.play.innerHTML = "▶ <span>Reproducir</span>";
}

function activeRecords() {
  return records.filter(record =>
    record.run === latestRuns[record.model] &&
    record.region === elements.region.value &&
    record.product === elements.product.value
  );
}

function latestRecords(model) {
  return records.filter(record => record.model === model && record.run === latestRuns[model]);
}

function isCommonOption(region, product) {
  return models.every(model => latestRecords(model).some(record =>
    record.region === region && (product === undefined || record.product === product)
  ));
}

function updateRegions() {
  const previousRegion = elements.region.value;
  const regions = [...new Set(latestRecords(currentModel).map(record => record.region))].sort();
  elements.region.replaceChildren(...regions.map(region =>
    new Option(`${isCommonOption(region) ? "★ " : ""}${regionNames[region] || region}`, region)
  ));
  if (regions.includes(previousRegion)) elements.region.value = previousRegion;
  else elements.region.value = regions.includes("iberia") ? "iberia" : regions[0];
  elements.region.disabled = regions.length === 0;
}

function updateModelButtons() {
  for (const button of modelButtons) {
    button.disabled = !latestRuns[button.dataset.model];
    button.setAttribute("aria-pressed", String(button.dataset.model === currentModel && !button.disabled));
  }
}

function updateModelInfo(record, targetHour) {
  const time = runTime(latestRuns[currentModel]);
  const offset = (referenceTime - time) / hourMs;
  const adjustment = offset ? ` Diferencia: +${offset} h.` : "";
  const frame = record && record.hour !== targetHour ? ` Se muestra el mapa +${record.hour} h para el plazo +${targetHour} h del modelo.` : "";
  elements["model-info"].textContent = `Referencia: ${formatRun(referenceTime)}. ${currentModel}: ${formatRun(time)}.${adjustment}${frame}`;
}

async function updateImage() {
  const hour = Number(elements.hour.value);
  const targetTime = referenceTime + hour * hourMs;
  const targetHour = (targetTime - runTime(latestRuns[currentModel])) / hourMs;
  const candidates = activeRecords().filter(record => record.model === currentModel);
  const tolerance = currentModel === "HARMONIE" ? 0 : 1;
  const record = candidates
    .filter(item => Math.abs(item.hour - targetHour) <= tolerance)
    .sort((a, b) => Math.abs(a.hour - targetHour) - Math.abs(b.hour - targetHour) || a.hour - b.hour)[0];
  const request = ++imageRequest;
  elements["hour-label"].textContent = `+${hour} h`;
  elements.previous.disabled = hour <= Number(elements.hour.min);
  elements.next.disabled = hour >= Number(elements.hour.max);
  updateModelInfo(record, targetHour);
  if (!record) {
    clearImage();
    setMessage(`No hay mapa de ${currentModel} para esta región y producto en el plazo equivalente +${targetHour} h.`);
    return;
  }
  if (elements.map.hidden) setMessage("Cargando mapa...");
  const nextUrl = record.source instanceof File ? URL.createObjectURL(record.source) : null;
  const image = new Image();
  image.src = nextUrl || record.source;
  try {
    await image.decode();
    if (request !== imageRequest) {
      if (nextUrl) URL.revokeObjectURL(nextUrl);
      return;
    }
    image.id = "map";
    image.alt = `${currentModel}, ${productNames[record.product] || record.product}, ${regionNames[record.region]}, plazo +${record.hour} h`;
    elements.map.replaceWith(image);
    elements.map = image;
    elements.message.hidden = true;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = nextUrl;
  } catch (error) {
    if (nextUrl) URL.revokeObjectURL(nextUrl);
    if (request !== imageRequest) return;
    console.error("No se pudo cargar el mapa:", error);
    clearImage();
    setMessage("No se pudo cargar el mapa. Comprueba que el archivo siga existiendo y vuelve a seleccionar la carpeta.");
  }
}

function updateSelection(stopAnimation = true) {
  if (stopAnimation) stopPlayback();
  const matchingRegion = latestRecords(currentModel).filter(record => record.region === elements.region.value);
  const previousProduct = elements.product.value;
  const products = [...new Set(matchingRegion.map(record => record.product))].sort();
  elements.product.replaceChildren(...products.map(product =>
    new Option(`${isCommonOption(elements.region.value, product) ? "★ " : ""}${productNames[product] || product}`, product)
  ));
  if (products.includes(previousProduct)) elements.product.value = previousProduct;
  else if (matchingRegion.length) elements.product.value = matchingRegion[0].product;
  elements.product.disabled = products.length === 0;

  const hours = activeRecords().flatMap(record => {
    const relativeHour = (record.time - referenceTime) / hourMs + record.hour;
    const tolerance = record.model === "HARMONIE" ? 0 : 1;
    const lastHour = relativeHour + tolerance;
    return lastHour < 0 ? [] : [Math.max(0, relativeHour - tolerance), lastHour];
  });
  if (!hours.length) {
    stopPlayback();
    elements.hour.disabled = true;
    elements.play.disabled = true;
    elements.previous.disabled = true;
    elements.next.disabled = true;
    elements["hour-label"].textContent = "—";
    elements["first-hour"].textContent = "—";
    elements["last-hour"].textContent = "—";
    updateModelInfo(null, 0);
    clearImage();
    setMessage("No hay mapas para esta región y producto a partir de la salida de referencia.");
    return;
  }
  const oldHour = Number(elements.hour.value);
  elements.hour.min = Math.min(...hours);
  elements.hour.max = Math.max(...hours);
  elements.hour.value = Math.max(Number(elements.hour.min), Math.min(oldHour, Number(elements.hour.max)));
  elements.hour.disabled = false;
  elements.play.disabled = elements.hour.min === elements.hour.max;
  if (elements.play.disabled) stopPlayback();
  elements["first-hour"].textContent = `+${elements.hour.min} h`;
  elements["last-hour"].textContent = `+${elements.hour.max} h`;
  updateImage();
}

function loadRecords(newRecords, errorMessage) {
  stopPlayback();
  clearImage();
  records = newRecords.filter(Boolean);
  latestRuns = {};
  for (const record of records) {
    if (!latestRuns[record.model] || record.run > latestRuns[record.model]) latestRuns[record.model] = record.run;
  }
  updateModelButtons();
  if (!records.length) {
    elements.region.disabled = true;
    elements.product.disabled = true;
    elements.hour.disabled = true;
    elements.previous.disabled = true;
    elements.next.disabled = true;
    elements.play.disabled = true;
    elements["model-info"].textContent = "";
    elements["hour-label"].textContent = "—";
    elements["first-hour"].textContent = "—";
    elements["last-hour"].textContent = "—";
    setMessage(errorMessage || "No se encontraron mapas. Selecciona la carpeta MAPAS MODELOS que contiene HARMONIE, ECMWF o GFS.");
    return;
  }
  referenceTime = Math.max(...Object.values(latestRuns).map(runTime));
  if (!latestRuns[currentModel]) currentModel = models.find(model => latestRuns[model]);
  updateModelButtons();
  updateRegions();
  setMessage("Cargando mapa...");
  updateSelection();
}

function stepHour(step) {
  if (elements.hour.disabled) return;
  elements.hour.value = Math.max(Number(elements.hour.min), Math.min(Number(elements.hour.max), Number(elements.hour.value) + step));
  updateImage();
}

function togglePlayback() {
  if (elements.play.disabled) return;
  if (timer) {
    stopPlayback();
    return;
  }
  elements.play.innerHTML = "❚❚ <span>Pausar</span>";
  timer = setInterval(() => {
    elements.hour.value = Number(elements.hour.value) >= Number(elements.hour.max) ? elements.hour.min : Number(elements.hour.value) + 1;
    updateImage();
  }, 800);
}

for (const button of modelButtons) {
  button.addEventListener("click", () => {
    currentModel = button.dataset.model;
    updateModelButtons();
    updateRegions();
    updateSelection(false);
  });
}
elements.region.addEventListener("change", () => updateSelection());
elements.product.addEventListener("change", () => updateSelection());
elements.hour.addEventListener("input", updateImage);
elements.previous.addEventListener("click", () => stepHour(-1));
elements.next.addEventListener("click", () => stepHour(1));
elements.play.addEventListener("click", togglePlayback);
document.addEventListener("keydown", event => {
  if (event.ctrlKey || event.altKey || event.metaKey || event.target.isContentEditable ||
      event.target.closest("#choose-folder, select, textarea, input:not([type='range'])")) return;
  if (event.code === "Space" && !elements.play.disabled) {
    event.preventDefault();
    if (!event.repeat) togglePlayback();
  } else if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && !elements.hour.disabled) {
    event.preventDefault();
    stepHour(event.key === "ArrowLeft" ? -1 : 1);
  }
});
elements["choose-folder"].addEventListener("click", async () => {
  if (!window.showDirectoryPicker) {
    elements.folder.click();
    return;
  }
  let directory;
  try {
    directory = await window.showDirectoryPicker({ mode: "read" });
  } catch (error) {
    if (error.name === "AbortError") return;
    console.error("No se pudo seleccionar la carpeta:", error);
    elements["source-info"].textContent = "No se pudo abrir la carpeta. Comprueba los permisos y vuelve a intentarlo.";
    return;
  }
  discoveryPending = false;
  const request = ++folderRequest;
  elements["source-info"].textContent = "Leyendo carpetas de modelos...";
  const results = await Promise.allSettled(models.map(async model => {
    let subdirectory;
    try {
      subdirectory = await directory.getDirectoryHandle(model);
    } catch (error) {
      if (error.name === "NotFoundError") return [];
      throw error;
    }
    const found = [];
    for await (const entry of subdirectory.values()) {
      if (entry.kind !== "file") continue;
      const record = parseRecord(entry.name, null);
      if (record && record.model === model) {
        record.source = await entry.getFile();
        found.push(record);
      }
    }
    return found;
  }));
  if (request !== folderRequest) return;
  const failures = results.filter(result => result.status === "rejected");
  if (failures.length) console.error("No se pudieron leer algunas carpetas de modelos:", failures.map(result => result.reason));
  elements["source-info"].textContent = failures.length ? "No se pudieron leer algunas carpetas. Comprueba los permisos." : "";
  loadRecords(results.flatMap(result => result.status === "fulfilled" ? result.value : []),
    failures.length ? "No se pudieron leer las carpetas. Comprueba los permisos y vuelve a intentarlo." : undefined);
});
elements.folder.addEventListener("change", event => {
  const files = Array.from(event.target.files);
  if (!files.length) return;
  discoveryPending = false;
  folderRequest++;
  elements["source-info"].textContent = "";
  const found = files.map(file => {
    const parts = file.webkitRelativePath.split("/");
    if (parts.length !== 3) return null;
    const record = parseRecord(file.name, file);
    return record && parts[1].toUpperCase() === record.model ? record : null;
  });
  loadRecords(found);
  event.target.value = "";
});

async function discoverMaps() {
  if (location.protocol === "file:") {
    setMessage("Selecciona la carpeta MAPAS MODELOS para cargar los mapas locales.");
    return;
  }
  setMessage("Buscando imágenes de los modelos...");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const results = await Promise.allSettled(models.map(async model => {
      if (model === "HARMONIE") {
        const indexResponse = await fetch("harmonie-index.json", { cache: "no-store", signal: controller.signal });
        if (indexResponse.status !== 404) {
          if (!indexResponse.ok) throw new Error(`HARMONIE: HTTP ${indexResponse.status}`);
          const index = await indexResponse.json();
          if (index.model !== model || typeof index.run !== "string" ||
              !Array.isArray(index.images) || !index.images.length) {
            throw new Error("HARMONIE: índice de mapas inválido");
          }
          return index.images.map(path => {
            const match = typeof path === "string" && /^HARMONIE\/([^/]+)$/.exec(path);
            if (!match) throw new Error("HARMONIE: ruta de imagen inválida");
            const url = new URL(path, indexResponse.url);
            const record = parseRecord(match[1], url.href);
            if (!record || record.model !== model || record.run !== index.run) {
              throw new Error("HARMONIE: imagen incompatible con el índice");
            }
            return record;
          });
        }
      }
      const response = await fetch(`${model}/`, { cache: "no-store", signal: controller.signal });
      if (response.status === 404) return [];
      if (!response.ok) throw new Error(`${model}: HTTP ${response.status}`);
      const page = new DOMParser().parseFromString(await response.text(), "text/html");
      return Array.from(page.querySelectorAll("a[href]")).map(link => {
        const url = new URL(link.getAttribute("href"), response.url);
        const record = parseRecord(decodeURIComponent(url.pathname.split("/").pop()), url.href);
        return record && record.model === model ? record : null;
      });
    }));
    if (!discoveryPending) return;
    const failures = results.filter(result => result.status === "rejected");
    if (failures.length) console.error("No se pudieron leer algunas carpetas de modelos:", failures.map(result => result.reason));
    const found = results.flatMap(result => result.status === "fulfilled" ? result.value : []);
    loadRecords(found, failures.length ? "No se pudieron leer las carpetas automáticamente. Selecciona la carpeta MAPAS MODELOS." : undefined);
    elements["source-info"].textContent = failures.length ? "No se pudieron leer algunas carpetas automáticamente; selecciona MAPAS MODELOS." : "";
  } finally {
    clearTimeout(timeout);
  }
}

discoverMaps();
