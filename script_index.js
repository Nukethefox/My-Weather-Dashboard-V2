const INITIAL_CENTER = [-3.7038, 40.4168];
const INITIAL_ZOOM = 5.2;
const AEMET_WORKER_URL = 'https://weatherdashboardv2.abusomfernandez.workers.dev/';
const WIND_ARROWS = ['↓', '↙', '←', '↖', '↑', '↗', '→', '↘'];

const RADAR_OPACITY = 0.75;
const RADAR_MIN_DBZ = 15;
const API_URL = "https://api.rainviewer.com/public/weather-maps.json";
const TILE_SIZE = 256;
const COUNTRY_BORDER_LAYERS = ["boundary_country_z0-4", "boundary_country_z5-"];
const SATELLITE_WMS_URL = "https://view.eumetsat.int/geoserver/wms";
const SATELLITE_PRODUCTS = {
    satellite: {
        product: "mtg_fd:ir105_hrfi", label: "Meteosat IR",
        sourceId: "meteosat-source", layerId: "meteosat-layer", time: null, tileError: false
    },
    "satellite-ir-colour": {
        product: "mtg_fd:ir105_hrfi", style: "mtg_fd:mtg_fd_ir105_hrfi_style_02",
        label: "Meteosat IR color", sourceId: "meteosat-source-ir-colour",
        layerId: "meteosat-layer-ir-colour", time: null, tileError: false
    },
    "satellite-geocolour": {
        product: "mtg_fd:rgb_geocolour", label: "Meteosat Geo Colour",
        sourceId: "meteosat-source-geocolour", layerId: "meteosat-layer-geocolour", time: null, tileError: false
    }
};
const SATELLITE_REFRESH_INTERVAL = 5 * 60 * 1000;
const STATION_RETRY_INTERVAL = 30 * 1000;
const STATION_REQUEST_TIMEOUT = 20 * 1000;

const RAIN_SOURCE_COLORS = `
    63615914 66635a19 69665c1e 6c685d24 6f6b5f29 726e612e 75706234 78736439
    7c75653e 7f786744 827b6949 857d6a4e 88806c54 8b826d59 8e856f5e 92887164
    9e93756e aa9e7978 b6a97e82 c2b4828c cec08796 d2c48ba0 d6c88faa dacc93b4
    ded097be 88ddeeff 6cd1ebff 51c5e8ff 36bae5ff 1baee2ff 00a3e0ff 009ad5ff
    0091caff 0088bfff 007fb4ff 0077aaff 0070a3ff 00699cff 006295ff 005b8eff
    005588ff 005180ff 004e78ff 004a70ff 004768ff ffee00ff ffe000ff ffd200ff
    ffc500ff ffb700ff ffaa00ff ff9f00ff ff9500ff ff8b00ff ff8100ff ff4400ff
    f23600ff e62800ff d91b00ff cd0d00ff c10000ff a80000ff 8f0000ff 760000ff
    5d0000ff ffaaffff ff9fffff ff95ffff ff8bffff ff81ffff ff77ffff ff6cffff
    ff62ffff ff58ffff ff4effff
`.trim().split(/\s+/).map((hex, index) => ({
    dbz: index - 10,
    rgba: hex.match(/../g).map(value => parseInt(value, 16))
}));
RAIN_SOURCE_COLORS.push({ dbz: 65, rgba: [255, 255, 255, 255] });
RAIN_SOURCE_COLORS.push({ dbz: 75, rgba: [0, 255, 0, 255] });

const SNOW_SOURCE_COLORS = `
    ceffff0c cdffff19 ccffff26 cbffff33 cbffff3f caffff4c c9ffff59 c8ffff66
    c7ffff72 c7ffff7f c6ffff8c c5ffff99 c4ffffa5 c3ffffb2 c3ffffbf c2ffffcc
    c1ffffd8 c0ffffe5 bffffff2 bfffffff b8f8ffff b2f2ffff abebffff a5e5ffff
    9fdfffff 98d8ffff 92d2ffff 8bcbffff 85c5ffff 7fbfffff 78b8ffff 72b2ffff
    6babffff 65a5ffff 5f9fffff 5b9bffff 5898ffff 5595ffff 5292ffff 4f8fffff
    4b8bffff 4888ffff 4585ffff 4282ffff 3f7fffff 3b7bffff 3878ffff 3575ffff
    3272ffff 2f6fffff 2b6bffff 2868ffff 2565ffff 2262ffff 1f5fffff 1b5bffff
    1858ffff 1555ffff 1252ffff 0f4fffff 0c4bffff 0948ffff 0645ffff 0242ffff
    003fffff 003bffff 0038ffff 0035ffff 0032ffff 002fffff 002bffff 0028ffff
    0025ffff 0022ffff 001fffff 001bffff 0018ffff 0015ffff 0012ffff 000fffff
    000cffff 0009ffff 0006ffff 0002ffff 0000ffff
`.trim().split(/\s+/).map(hex => hex.match(/../g).map(value => parseInt(value, 16)));

const CUSTOM_RADAR_STOPS = [
    [0, 189, 225, 255, 255], [27.5, 93, 131, 255, 255],
    [32.5, 0, 189, 0, 255], [40.75, 255, 230, 0, 255],
    [45.3, 191, 16, 16, 255], [50.2, 255, 130, 220, 255],
    [55, 255, 255, 255, 255], [68, 255, 255, 255, 255],
    [100, 255, 255, 255, 255],
    [101, 0, 0, 0, 0], [255, 0, 0, 0, 0]
];

const recoloredColorCache = new Map();
let warnedAboutRadarRecolor = false;

let radarFrames = [];
let radarHost = "https://tilecache.rainviewer.com";
let animationPosition = 0;
let radarTimer = null;
let radarVisible = false;
let radarPlaying = false;
let pendingRadarIndex = null;
let displayedRadarIndex = null;
let radarLoading = false;
let mapReady = false;
let satelliteLoading = false;
let satelliteRefreshTimer = null;

const overlayModeSelect = document.getElementById("overlay-mode-select");
const radarControls = document.getElementById("radar-controls");
const satelliteStatus = document.getElementById("satellite-status");
const radarPlayBtn = document.getElementById("radar-play-btn");
const radarPrevBtn = document.getElementById("radar-prev-btn");
const radarNextBtn = document.getElementById("radar-next-btn");
const radarSlider = document.getElementById("radar-slider");
const radarTimestampEl = document.getElementById("radar-timestamp");
const radarLegendEl = document.getElementById("radar-legend");
const stationStatus = document.getElementById("station-status");
const stationStatusMessage = document.getElementById("station-status-message");
const stationRetryBtn = document.getElementById("station-retry-btn");
let stationLoading = false;
let stationRetryTimer = null;

function colorDistanceSquared(first, second) {
    return first.reduce((distance, value, index) => distance + (value - second[index]) ** 2, 0);
}

function findClosestColor(color, palette) {
    let closest = null;
    for (const entry of palette) {
        const rgba = entry.rgba || entry;
        const distance = colorDistanceSquared(color, rgba);
        if (!closest || distance < closest.distance) closest = { entry, distance };
    }
    return closest;
}

function getCustomRadarColor(dbz) {
    if (dbz < RADAR_MIN_DBZ) return [0, 0, 0, 0];

    let upperIndex = CUSTOM_RADAR_STOPS.findIndex(stop => stop[0] >= dbz);
    if (upperIndex < 0) upperIndex = CUSTOM_RADAR_STOPS.length - 1;
    const upper = CUSTOM_RADAR_STOPS[upperIndex];
    const lower = CUSTOM_RADAR_STOPS[Math.max(0, upperIndex - 1)];
    const fraction = upper[0] === lower[0] ? 0 : (dbz - lower[0]) / (upper[0] - lower[0]);
    return upper.slice(1).map((value, index) => Math.round(lower[index + 1] + (value - lower[index + 1]) * fraction));
}

function recolorRadarTile(context) {
    const imageData = context.getImageData(0, 0, context.canvas.width, context.canvas.height);
    const pixels = imageData.data;
    for (let index = 0; index < pixels.length; index += 4) {
        const color = [pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3]];
        if (color[3] === 0) continue;

        const cacheKey = color.join(",");
        let result = recoloredColorCache.get(cacheKey);
        if (!recoloredColorCache.has(cacheKey)) {
            const rainMatch = findClosestColor(color, RAIN_SOURCE_COLORS);
            const snowMatch = findClosestColor(color, SNOW_SOURCE_COLORS);
            result = snowMatch.distance < rainMatch.distance
                ? null
                : getCustomRadarColor(rainMatch.entry.dbz);
            recoloredColorCache.set(cacheKey, result);
        }

        if (result) {
            pixels[index] = result[0];
            pixels[index + 1] = result[1];
            pixels[index + 2] = result[2];
            pixels[index + 3] = result[3];
        }
    }
    context.putImageData(imageData, 0, 0);
}

maplibregl.addProtocol("rainviewer", async (params) => {
    const remoteUrl = params.url.replace("rainviewer://", "https://");
    const response = await fetch(remoteUrl);
    if (!response.ok) {
        throw new Error(`Error tile RainViewer: ${response.status}`);
    }
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });

    try {
        context.drawImage(bitmap, 0, 0, TILE_SIZE, TILE_SIZE);
        recolorRadarTile(context);
    } catch (error) {
        if (!warnedAboutRadarRecolor) {
            console.warn("No se pudo repintar un tile RainViewer; se muestra el original.", error);
            warnedAboutRadarRecolor = true;
        }
    }

    const outBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    return { data: new Uint8Array(await outBlob.arrayBuffer()) };
});

function renderRadarLegend() {
    if (!radarLegendEl) return;
    const visibleStops = CUSTOM_RADAR_STOPS.filter(stop => stop[0] >= RADAR_MIN_DBZ && stop[0] <= 55 && stop[4] > 0);
    const minimumColor = getCustomRadarColor(RADAR_MIN_DBZ);
    visibleStops.unshift([RADAR_MIN_DBZ, ...minimumColor]);
    // Marshall-Palmer: Z = 200 R^1.6; this is an estimate for rain, not snow.
    radarLegendEl.title = "Intensidad de lluvia estimada con Z = 200 R^1,6; no aplicable a la nieve";
    radarLegendEl.innerHTML = '<span>Lluvia aprox. (mm/h)</span>' + visibleStops.map(stop => {
        const rgba = `rgba(${stop[1]}, ${stop[2]}, ${stop[3]}, ${stop[4] / 255})`;
        const rainRate = Math.pow(Math.pow(10, stop[0] / 10) / 200, 1 / 1.6);
        const label = rainRate.toLocaleString("es-ES", { maximumFractionDigits: 1 });
        return `<span class="radar-legend-item"><span class="radar-legend-swatch" style="background:${rgba}"></span>${label}</span>`;
    }).join("");
}

function updateRadarTimestamp(frame) {
    if (!radarTimestampEl) return;
    if (!frame || !frame.time) {
        radarTimestampEl.textContent = "--:--";
        return;
    }
    const date = new Date(frame.time * 1000);
    radarTimestampEl.textContent = date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function weatherLayerBeforeId() {
    return COUNTRY_BORDER_LAYERS.find(id => map.getLayer(id))
        || (map.getLayer("aemet-stations-layer") ? "aemet-stations-layer" : undefined);
}

function applyRadarFrame(index) {
    if (!radarFrames.length) return;
    const nextIndex = Math.max(0, Math.min(radarFrames.length - 1, index));
    const frame = radarFrames[nextIndex];
    const sourceId = `rainviewer-radar-source-${nextIndex}`;
    const layerId = `rainviewer-radar-layer-${nextIndex}`;
    pendingRadarIndex = nextIndex;

    const cleanHost = radarHost.replace(/^https?:\/\//, "");
    const tileUrl = `rainviewer://${cleanHost}${frame.path}/${TILE_SIZE}/{z}/{x}/{y}/2/0_1.png`;

    if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
            type: "raster",
            tiles: [tileUrl],
            tileSize: TILE_SIZE,
            maxzoom: 7
        });

        map.addLayer({
            id: layerId,
            type: "raster",
            source: sourceId,
            layout: { visibility: radarVisible ? "visible" : "none" },
            paint: {
                "raster-opacity": 0,
                "raster-opacity-transition": { duration: 0 },
                "raster-resampling": "nearest",
                "raster-fade-duration": 0
            }
        }, weatherLayerBeforeId());
    }

    showLoadedRadarFrame();
}

function showLoadedRadarFrame() {
    if (pendingRadarIndex === null) return;
    const index = pendingRadarIndex;
    if (!map.isSourceLoaded(`rainviewer-radar-source-${index}`)) return;

    if (displayedRadarIndex !== null && displayedRadarIndex !== index) {
        map.setPaintProperty(`rainviewer-radar-layer-${displayedRadarIndex}`, "raster-opacity", 0);
    }
    map.setPaintProperty(`rainviewer-radar-layer-${index}`, "raster-opacity", radarVisible ? RADAR_OPACITY : 0);
    displayedRadarIndex = index;
    pendingRadarIndex = null;
    animationPosition = index;
    if (radarSlider) radarSlider.value = String(index);
    updateRadarTimestamp(radarFrames[index]);

    if (radarPlaying) {
        radarTimer = setTimeout(() => {
            radarTimer = null;
            applyRadarFrame((animationPosition + 1) % radarFrames.length);
        }, index === radarFrames.length - 1 ? 2000 : 600);
    }
}

function stopAnimation() {
    radarPlaying = false;
    if (radarTimer !== null) {
        clearTimeout(radarTimer);
        radarTimer = null;
    }
    if (radarPlayBtn) {
        radarPlayBtn.textContent = "▶";
        radarPlayBtn.setAttribute("aria-label", "Reproducir radar");
    }
}

function startAnimation() {
    if (radarPlaying || !radarVisible || !radarFrames.length) return;
    radarPlaying = true;
    if (radarPlayBtn) {
        radarPlayBtn.textContent = "⏸";
        radarPlayBtn.setAttribute("aria-label", "Pausar radar");
    }
    if (pendingRadarIndex === null) applyRadarFrame((animationPosition + 1) % radarFrames.length);
}

function toggleAnimation() {
    if (radarPlaying) {
        stopAnimation();
    } else {
        startAnimation();
    }
}

function stepRadarFrame(delta) {
    stopAnimation();
    if (!radarFrames.length) return;
    const position = pendingRadarIndex === null ? animationPosition : pendingRadarIndex;
    const nextIndex = (position + delta + radarFrames.length) % radarFrames.length;
    applyRadarFrame(nextIndex);
}

async function loadRainviewerRadar() {
    radarLoading = true;
    try {
        renderRadarLegend();
        const res = await fetch(API_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        radarHost = data.host || "https://tilecache.rainviewer.com";
        const pastFrames = (data.radar && Array.isArray(data.radar.past)) ? data.radar.past : [];
        if (!pastFrames.length) throw new Error("RainViewer no ha devuelto fotogramas de radar");

        const latestTime = pastFrames[pastFrames.length - 1].time;
        const twoHoursAgoTime = latestTime - 7200;
        const filteredFrames = pastFrames.filter(f => f.time >= twoHoursAgoTime);
        radarFrames = filteredFrames.length ? filteredFrames : pastFrames;

        if (radarSlider) {
            radarSlider.min = "0";
            radarSlider.max = String(radarFrames.length - 1);
            radarSlider.step = "1";
            radarSlider.value = String(radarFrames.length - 1);
        }

        applyRadarFrame(radarFrames.length - 1);
    } catch (err) {
        console.error("Error cargando radar RainViewer:", err);
        if (radarTimestampEl) radarTimestampEl.textContent = "Error al cargar radar";
    } finally {
        radarLoading = false;
    }
}

function satelliteTileUrl(satellite, time) {
    const params = new URLSearchParams({
        SERVICE: "WMS",
        VERSION: "1.1.1",
        REQUEST: "GetMap",
        LAYERS: satellite.product,
        STYLES: satellite.style || "",
        FORMAT: "image/png",
        TRANSPARENT: "true",
        SRS: "EPSG:3857",
        WIDTH: String(TILE_SIZE),
        HEIGHT: String(TILE_SIZE),
        TIME: time
    });
    return `${SATELLITE_WMS_URL}?${params}&BBOX={bbox-epsg-3857}`;
}

async function refreshSatellite() {
    const mode = overlayModeSelect.value;
    const satellite = SATELLITE_PRODUCTS[mode];
    if (!satellite || satelliteLoading) return;
    satelliteLoading = true;
    try {
        const response = await fetch(`${SATELLITE_WMS_URL}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const xml = new DOMParser().parseFromString(await response.text(), "application/xml");
        if (xml.querySelector("parsererror")) throw new Error("Respuesta WMS inválida");
        const layer = Array.from(xml.getElementsByTagNameNS("*", "Layer")).find(element =>
            Array.from(element.children).some(child => child.localName === "Name" && child.textContent === satellite.product)
        );
        const dimension = layer && Array.from(layer.children).find(child =>
            child.localName === "Dimension" && child.getAttribute("name") === "time"
        );
        const time = dimension && dimension.getAttribute("default");
        if (!time || Number.isNaN(Date.parse(time))) throw new Error("No se encontró la fecha del último fotograma Meteosat");
        if (overlayModeSelect.value !== mode) return;

        const tileUrl = satelliteTileUrl(satellite, time);
        if (!map.getSource(satellite.sourceId)) {
            map.addSource(satellite.sourceId, {
                type: "raster",
                tiles: [tileUrl],
                tileSize: TILE_SIZE,
                attribution: '<a href="https://www.eumetsat.int/" target="_blank" rel="noopener noreferrer">EUMETSAT</a>'
            });
            map.addLayer({
                id: satellite.layerId,
                type: "raster",
                source: satellite.sourceId,
                paint: { "raster-opacity": 0.85 }
            }, weatherLayerBeforeId());
        } else if (time !== satellite.time || satellite.tileError) {
            satellite.tileError = false;
            map.getSource(satellite.sourceId).setTiles([tileUrl]);
        }
        satellite.time = time;
        const date = new Date(time).toLocaleString("es-ES", {
            timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
        });
        satelliteStatus.textContent = `${satellite.label}: ${date} UTC`;
    } catch (error) {
        console.error("Error cargando el satélite Meteosat:", error);
        if (overlayModeSelect.value === mode) {
            satelliteStatus.textContent = satellite.time
                ? "Error al actualizar Meteosat; se conserva la imagen anterior"
                : "Error al cargar el satélite Meteosat";
        }
    } finally {
        satelliteLoading = false;
        if (overlayModeSelect.value !== mode && SATELLITE_PRODUCTS[overlayModeSelect.value]) {
            refreshSatellite();
        }
    }
}

function updateWeatherOverlay() {
    const mode = overlayModeSelect.value;
    const satellite = SATELLITE_PRODUCTS[mode];
    radarVisible = mode === "radar";
    radarControls.hidden = !radarVisible;
    radarLegendEl.hidden = !radarVisible;
    satelliteStatus.hidden = !satellite;
    if (!radarVisible) stopAnimation();
    if (!mapReady) return;

    for (let index = 0; index < radarFrames.length; index++) {
        const layerId = `rainviewer-radar-layer-${index}`;
        if (map.getLayer(layerId)) {
            map.setLayoutProperty(layerId, "visibility", radarVisible ? "visible" : "none");
            map.setPaintProperty(layerId, "raster-opacity", radarVisible && index === displayedRadarIndex ? RADAR_OPACITY : 0);
        }
    }
    for (const product of Object.values(SATELLITE_PRODUCTS)) {
        if (map.getLayer(product.layerId)) {
            map.setLayoutProperty(product.layerId, "visibility", product === satellite ? "visible" : "none");
        }
    }
    if (satelliteRefreshTimer !== null) {
        clearInterval(satelliteRefreshTimer);
        satelliteRefreshTimer = null;
    }

    if (radarVisible && !radarFrames.length && !radarLoading) {
        radarTimestampEl.textContent = "Cargando radar…";
        loadRainviewerRadar();
    } else if (satellite) {
        satelliteStatus.textContent = `Cargando ${satellite.label}…`;
        refreshSatellite();
        satelliteRefreshTimer = setInterval(refreshSatellite, SATELLITE_REFRESH_INTERVAL);
    }
}

const map = new maplibregl.Map({
    container: 'map',
    style: 'https://tiles.openfreemap.org/styles/dark',
    center: INITIAL_CENTER,
    zoom: INITIAL_ZOOM
});

map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

const btn1 = document.getElementById('btn-1');
const stationModeSelect = document.getElementById('station-mode-select');
let currentStationMode = stationModeSelect ? stationModeSelect.value : 'dots';

btn1.addEventListener('click', () => {
    map.flyTo({
        center: INITIAL_CENTER,
        zoom: INITIAL_ZOOM
    });
});

const hoverPopup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 10,
    className: 'hover-popup'
});

let activeClickPopup = null;

function getWindArrow(deg) {
    if (deg === null || deg === undefined || Number.isNaN(Number(deg))) return '';
    const normalized = ((Number(deg) % 360) + 360) % 360;
    const index = Math.round(normalized / 45) % 8;
    return WIND_ARROWS[index];
}

function formatRainfall(value) {
    return typeof value === 'number' && Number.isFinite(value)
        ? String(Number(value.toFixed(2)))
        : String(value);
}

function formatLocalDate(isoString, timeZone) {
    if (!isoString) return 'Sin fecha';
    const parsed = new Date(isoString);
    if (Number.isNaN(parsed.getTime())) return isoString;

    return parsed.toLocaleString('es-ES', {
        timeZone,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
    });
}

function formatHoverPopup(props) {
    const altText = props.alt !== null && props.alt !== undefined ? `${Math.round(props.alt)} m` : 'Altitud N/D';
    return `
        <div class="station-hover-title">${props.nombre}</div>
        <div class="station-hover-alt">${altText}</div>
    `;
}

function formatStationPopup(props, coordinates) {
    const altText = props.alt !== null && props.alt !== undefined ? `${Math.round(props.alt)} m` : 'N/D';
    const tempText = props.temp !== null && props.temp !== undefined ? `${props.temp} °C` : 'N/D';
    const rainText = props.lluvia !== null && props.lluvia !== undefined ? `${formatRainfall(props.lluvia)} mm` : 'N/D';    
    const windText = props.viento !== null && props.viento !== undefined ? `${props.viento} km/h` : 'N/D';
    const gustText = props.racha !== null && props.racha !== undefined ? `${props.racha} km/h` : null;
    const humText = props.humedad !== null && props.humedad !== undefined ? `${Math.round(props.humedad)} %` : null;
    const presText = props.presion !== null && props.presion !== undefined ? `${props.presion} hPa` : null;
    const arrow = props.viento !== null && props.viento !== undefined ? getWindArrow(props.dirViento) : '';
    const [lon, lat] = coordinates;
    const timeZone = lon >= -19 && lon <= -13 && lat >= 27 && lat <= 30
        ? 'Atlantic/Canary'
        : 'Europe/Madrid';
    const dateText = formatLocalDate(props.fecha, timeZone);

    return `
        <div class="station-popup-header">${props.nombre}</div>
        <div class="station-popup-row">Altitud: <strong>${altText}</strong></div>
        <div class="station-popup-row">Temp: <strong>${tempText}</strong></div>
        <div class="station-popup-row">Lluvia (1h): <strong>${rainText}</strong></div>
        <div class="station-popup-row">
            Viento: <strong>${windText}</strong>
            ${arrow ? `<span class="station-wind-arrow">${arrow}</span>` : ''}
        </div>
        ${gustText ? `<div class="station-popup-row">Racha máx: <strong>${gustText}</strong></div>` : ''}
        ${humText ? `<div class="station-popup-row">Humedad: <strong>${humText}</strong></div>` : ''}
        ${presText ? `<div class="station-popup-row">Presión: <strong>${presText}</strong></div>` : ''}
        <div class="station-popup-date">${dateText} (hora local)</div>
    `;
}

function enrichStationsForDisplay(geojson) {
    if (!geojson || !Array.isArray(geojson.features)) return geojson;

    const latestByStation = new Map();

    for (const feat of geojson.features) {
        const coords = feat.geometry && feat.geometry.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) continue;

        const p = feat.properties || {};
        const stationKey = p.id || `${Number(coords[0]).toFixed(4)},${Number(coords[1]).toFixed(4)}`;

        const existing = latestByStation.get(stationKey);
        if (existing) {
            const existingTime = Date.parse(existing.properties && existing.properties.fecha) || 0;
            const currentTime = Date.parse(p.fecha) || 0;
            if (currentTime < existingTime) continue;
        }

        const tempStr = p.temp !== null && p.temp !== undefined ? `${p.temp}°` : '';
        const rainStr = p.lluvia !== null && p.lluvia !== undefined ? formatRainfall(p.lluvia) : '';
        const windStr = p.viento !== null && p.viento !== undefined ? `${p.viento}` : '';

        latestByStation.set(stationKey, {
            ...feat,
            properties: {
                ...p,
                tempLabel: tempStr,
                lluviaLabel: rainStr,
                vientoLabel: windStr
            }
        });
    }

    return {
        ...geojson,
        features: Array.from(latestByStation.values())
    };
}

function getActiveLabelProperty(mode) {
    if (mode === 'temp') return 'tempLabel';
    if (mode === 'lluvia') return 'lluviaLabel';
    if (mode === 'viento') return 'vientoLabel';
    return '';
}

function getLabelColor(mode) {
    if (mode === 'temp') return '#fbbf24';
    if (mode === 'lluvia') return '#38bdf8';
    if (mode === 'viento') return '#4ade80';
    return '#f4f4f5';
}

function applyStationDisplayMode(mode) {
    currentStationMode = mode;
    if (!map.getLayer("aemet-stations-layer") || !map.getLayer("aemet-stations-labels")) return;

    if (mode === "none") {
        map.setLayoutProperty("aemet-stations-layer", "visibility", "none");
        map.setLayoutProperty("aemet-stations-labels", "visibility", "none");
        return;
    }

    map.setLayoutProperty("aemet-stations-layer", "visibility", "visible");

    const propName = getActiveLabelProperty(mode);

    if (mode === "dots") {
        map.setPaintProperty("aemet-stations-layer", "circle-radius", 5);
        map.setPaintProperty("aemet-stations-layer", "circle-color", "#38bdf8");
        map.setPaintProperty("aemet-stations-layer", "circle-stroke-width", 1.5);
        map.setPaintProperty("aemet-stations-layer", "circle-stroke-color", "#0f172a");
        map.setLayoutProperty("aemet-stations-labels", "visibility", "none");
        return;
    }

    const safeTextExpr = ["coalesce", ["get", propName], ""];

    map.setPaintProperty("aemet-stations-layer", "circle-radius", [
        "case",
        ["==", safeTextExpr, ""],
        0,
        ["+", 7, ["*", 1.8, ["length", safeTextExpr]]]
    ]);
    map.setPaintProperty("aemet-stations-layer", "circle-color", "#18181b");
    map.setPaintProperty("aemet-stations-layer", "circle-stroke-width", 1.5);
    map.setPaintProperty("aemet-stations-layer", "circle-stroke-color", "#38bdf8");

    map.setLayoutProperty("aemet-stations-labels", "text-field", safeTextExpr);
    map.setPaintProperty("aemet-stations-labels", "text-color", getLabelColor(mode));
    map.setPaintProperty("aemet-stations-labels", "text-halo-width", 1);
    map.setLayoutProperty("aemet-stations-labels", "visibility", "visible");
}

function bindStationEvents() {
    const layers = ['aemet-stations-layer', 'aemet-stations-labels'];

    layers.forEach((layerId) => {
        map.on('mousemove', layerId, (e) => {
            if (airportAtPoint(e.point)) return;
            const feature = e.features && e.features[0];
            if (!feature) return;

            map.getCanvas().style.cursor = 'pointer';
            const coords = feature.geometry.coordinates.slice();
            hoverPopup
                .setLngLat(coords)
                .setHTML(formatHoverPopup(feature.properties))
                .addTo(map);
        });

        map.on('mouseleave', layerId, () => {
            map.getCanvas().style.cursor = '';
            hoverPopup.remove();
        });

        map.on('click', layerId, (e) => {
            if (airportAtPoint(e.point)) return;
            const feature = e.features && e.features[0];
            if (!feature) return;

            if (activeClickPopup) {
                activeClickPopup.remove();
            }

            const coords = feature.geometry.coordinates.slice();
            activeClickPopup = new maplibregl.Popup({ offset: 12 })
                .setLngLat(coords)
                .setHTML(formatStationPopup(feature.properties, feature.geometry.coordinates))
                .addTo(map);
        });
    });
}

function airportAtPoint(point) {
    return !!map.getLayer('airport-markers')
        && map.getLayoutProperty('airport-markers', 'visibility') !== 'none'
        && map.queryRenderedFeatures(point, { layers: ['airport-markers'] }).length > 0;
}

async function loadAemetStations() {
    if (stationLoading) return;
    stationLoading = true;
    if (stationRetryTimer !== null) {
        clearTimeout(stationRetryTimer);
        stationRetryTimer = null;
    }
    stationStatus.hidden = false;
    stationStatusMessage.textContent = "Cargando estaciones AEMET…";
    stationRetryBtn.disabled = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), STATION_REQUEST_TIMEOUT);
    try {
        const res = await fetch(AEMET_WORKER_URL, { signal: controller.signal });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        const rawGeojson = await res.json();
        const geojson = enrichStationsForDisplay(rawGeojson);
        if (!geojson || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features) || !geojson.features.length) {
            throw new Error('No hay estaciones válidas en la respuesta');
        }

        if (map.getSource('aemet-stations')) {
            map.getSource('aemet-stations').setData(geojson);
            applyStationDisplayMode(currentStationMode);
            stationStatus.hidden = true;
            return;
        }

        map.addSource('aemet-stations', {
            type: 'geojson',
            data: geojson
        });

        const beforeAirport = map.getLayer('airport-markers') ? 'airport-markers' : undefined;
        map.addLayer({
            id: 'aemet-stations-layer',
            type: 'circle',
            source: 'aemet-stations',
            paint: {
                'circle-radius': 5,
                'circle-color': '#38bdf8',
                'circle-stroke-width': 1.5,
                'circle-stroke-color': '#0f172a'
            }
        }, beforeAirport);

        map.addLayer({
            id: 'aemet-stations-labels',
            type: 'symbol',
            source: 'aemet-stations',
            layout: {
                'visibility': 'none',
                'text-field': '',
                'text-font': ['Noto Sans Regular'],
                'text-size': 11,
                'text-allow-overlap': true,
                'text-ignore-placement': false
            },
            paint: {
                'text-color': '#f4f4f5',
                'text-halo-color': '#18181b',
                'text-halo-width': 1
            }
        }, beforeAirport);

        bindStationEvents();
        applyStationDisplayMode(currentStationMode);
        stationStatus.hidden = true;
    } catch (err) {
        console.error('Error cargando estaciones AEMET:', err);
        stationStatusMessage.textContent = 'No se pudieron cargar las estaciones AEMET. Reintentando…';
        stationRetryTimer = setTimeout(loadAemetStations, STATION_RETRY_INTERVAL);
    } finally {
        clearTimeout(timeout);
        stationLoading = false;
        stationRetryBtn.disabled = false;
    }
}

stationRetryBtn.addEventListener('click', loadAemetStations);

if (stationModeSelect) {
    stationModeSelect.addEventListener('change', (e) => {
        applyStationDisplayMode(e.target.value);
    });
}

overlayModeSelect.addEventListener("change", updateWeatherOverlay);

if (radarPlayBtn) radarPlayBtn.addEventListener("click", toggleAnimation);
if (radarPrevBtn) radarPrevBtn.addEventListener("click", () => stepRadarFrame(-1));
if (radarNextBtn) radarNextBtn.addEventListener("click", () => stepRadarFrame(1));

if (radarSlider) {
    radarSlider.addEventListener("input", (e) => {
        stopAnimation();
        applyRadarFrame(Number(e.target.value));
    });
}

document.addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest('input, select, textarea, button, a, [contenteditable="true"]')) return;
    if (!radarVisible) return;

    if (e.code === "Space") {
        e.preventDefault();
        toggleAnimation();
    } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        stepRadarFrame(-1);
    } else if (e.key === "ArrowRight") {
        e.preventDefault();
        stepRadarFrame(1);
    }
});

map.on('load', () => {
    mapReady = true;
    for (const layerId of COUNTRY_BORDER_LAYERS) {
        if (!map.getLayer(layerId)) {
            console.warn(`No se encontró la capa de fronteras ${layerId}`);
            continue;
        }
        map.setPaintProperty(layerId, "line-color", "#e0d9ce");
        map.setPaintProperty(layerId, "line-blur", 0);
        map.setFilter(layerId, ["all", map.getFilter(layerId), ["!=", ["coalesce", ["get", "maritime"], 0], 1]]);
    }
    map.addLayer({
        id: "coastline",
        type: "line",
        source: "openmaptiles",
        "source-layer": "water",
        filter: ["==", ["get", "class"], "ocean"],
        paint: {
            "line-color": "#e0d9ce",
            "line-width": 1.2
        }
    });
    loadAemetStations();
    updateWeatherOverlay();
});

map.on('sourcedata', (event) => {
    if (pendingRadarIndex !== null && event.sourceId === `rainviewer-radar-source-${pendingRadarIndex}`) {
        showLoadedRadarFrame();
    }
});

map.on('error', (event) => {
    console.error("Error del mapa:", event.error);
    const satellite = SATELLITE_PRODUCTS[overlayModeSelect.value];
    if (satellite && event.sourceId === satellite.sourceId) {
        satellite.tileError = true;
        satelliteStatus.textContent = "Error al cargar parte de la imagen Meteosat; se reintentará";
    }
});
