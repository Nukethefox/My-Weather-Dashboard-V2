const AIRPORT_ICAOS = [
    'GCRR', 'GCFV', 'GCLP', 'GCTS', 'GCXO', 'GCGM', 'GCLA', 'GCHI',
    'LEBL', 'LELL', 'LEGE', 'LEDA', 'LERS', 'LESU', 'LEMH', 'LEPA', 'LEIB',
    'LECH', 'LEVC', 'LEAL', 'LEMI', 'LELC', 'GEML', 'LEAM', 'LEMG', 'LEJR',
    'LERT', 'LEGA', 'LEGR', 'LEMO', 'LEZL', 'LEBA', 'LEAB', 'LEBZ',
    'LEZG', 'LEHC', 'LETO', 'LEMD', 'LESA', 'LEVD', 'LESO', 'LEPP',
    'LEVT', 'LEBB', 'LEBG', 'LEXJ', 'LEAS', 'LELN', 'LECO', 'LEST',
    'LEVX', 'LPFR', 'LPPT', 'LPPR', 'LFMP', 'LFMK', 'LFBZ', 'LFBP', 'LFBT',
    'LFBO', 'LXGB'
];
const AIRPORT_ICAO_SET = new Set(AIRPORT_ICAOS);
const AIRPORT_PROXY_URL = 'https://metar-proxy.abusomfernandez.workers.dev/?url=';
const AIRPORT_REFRESH_INTERVAL = 5 * 60 * 1000;
const AIRPORT_REQUEST_TIMEOUT = 20 * 1000;
const AIRPORT_COVER_NAMES = {
    FEW: 'Pocas nubes', SCT: 'Nubes dispersas', BKN: 'Muy nuboso',
    OVC: 'Cubierto', OVX: 'Cielo oscurecido', NSC: 'Sin nubes significativas',
    NCD: 'Sin nubes detectadas', SKC: 'Cielo despejado', CLR: 'Despejado',
    CAVOK: 'CAVOK'
};

const airportsVisible = document.getElementById('airports-visible');
const airportStatus = document.getElementById('airport-status');
const airportStatusMessage = document.getElementById('airport-status-message');
const airportRetryBtn = document.getElementById('airport-retry-btn');
let airportRecords = null;
let metarRecords = null;
let airportDataLoading = false;
let airportFeatures = new Map();

function escapeAirportText(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
}

function airportTimeZone(icao) {
    if (icao.startsWith('GC')) return 'Atlantic/Canary';
    if (icao.startsWith('LP')) return 'Europe/Lisbon';
    if (icao.startsWith('LF')) return 'Europe/Paris';
    if (icao === 'LXGB') return 'Europe/Gibraltar';
    return 'Europe/Madrid';
}

function airportRow(label, value) {
    return `<div class="airport-popup-row">${escapeAirportText(label)}: <strong>${escapeAirportText(value)}</strong></div>`;
}

function decodeAirportWeather(rawWeather) {
    const descriptors = {
        FZ: 'congelante', TS: 'tormenta', SH: 'chubascos', BL: 'levantado por el viento',
        DR: 'ventisca baja', PR: 'parcial', BC: 'bancos de', MI: 'baja'
    };
    const phenomena = {
        DZ: 'llovizna', RA: 'lluvia', SN: 'nieve', SG: 'cinarra', PL: 'hielo granulado',
        GR: 'granizo', GS: 'granizo pequeño', BR: 'neblina', FG: 'niebla', FU: 'humo',
        VA: 'ceniza volcánica', DU: 'polvo', SA: 'arena', HZ: 'calima', PO: 'remolinos de polvo',
        SQ: 'turbonada', FC: 'tromba/tornado', SS: 'tormenta de arena', DS: 'tormenta de polvo'
    };
    return rawWeather.trim().split(/\s+/).map(token => {
        let remaining = token.toUpperCase();
        if (remaining === 'NSW') return `${token} (sin fenómenos significativos)`;
        const parts = [];
        if (remaining.startsWith('-') || remaining.startsWith('+')) {
            parts.push(remaining[0] === '-' ? 'ligera' : 'fuerte');
            remaining = remaining.slice(1);
        }
        if (remaining.startsWith('VC') || remaining.startsWith('RE')) {
            parts.push(remaining.startsWith('VC') ? 'en las proximidades' : 'reciente');
            remaining = remaining.slice(2);
        }
        while (remaining.length >= 2 && descriptors[remaining.slice(0, 2)]) {
            parts.push(descriptors[remaining.slice(0, 2)]);
            remaining = remaining.slice(2);
        }
        while (remaining.length >= 2 && phenomena[remaining.slice(0, 2)]) {
            parts.push(phenomena[remaining.slice(0, 2)]);
            remaining = remaining.slice(2);
        }
        if (remaining) parts.push(remaining);
        return parts.length ? `${token} (${parts.join(' ')})` : token;
    }).join(', ');
}

function airportVisibility(report, observation) {
    if (/\bCAVOK\b/.test(observation)) return '10 km o más (CAVOK)';
    const token = observation.split(/\s+/).find(part => /^\d{4}$/.test(part));
    if (token === '9999') return '10 km o más (9999)';
    if (token === '0000') return 'menos de 50 m (0000)';
    if (token) return `${Number(token)} m`;
    if (report.visib === null || report.visib === undefined || report.visib === '') return 'N/D';
    const value = String(report.visib);
    const miles = Number(value.replace('+', ''));
    if (!Number.isFinite(miles)) return `${value} SM`;
    const prefix = value.endsWith('+') ? 'más de ' : '';
    return `${prefix}${miles} SM (aprox. ${prefix}${(miles * 1.609344).toFixed(1)} km)`;
}

function formatAirportPopup(airport, report) {
    const name = airport.name || 'Aeropuerto';
    let html = `<div class="airport-popup-header">${escapeAirportText(airport.icaoId)} · ${escapeAirportText(name)}</div>`;
    html += airportRow('Elevación', Number.isFinite(airport.elev) ? `${airport.elev} m` : 'N/D');
    if (airport.iataId && airport.iataId !== '-') html += airportRow('IATA', airport.iataId);

    if (!report) {
        html += airportRow('METAR', 'No disponible');
    } else {
        const raw = typeof report.rawOb === 'string' ? report.rawOb.toUpperCase() : '';
        const observation = raw.split(/\b(?:TEMPO|BECMG|NOSIG|RMK)\b/)[0];
        const time = Number.isFinite(report.obsTime)
            ? new Date(report.obsTime * 1000)
            : report.reportTime ? new Date(report.reportTime) : null;
        const validTime = time && !Number.isNaN(time.getTime());
        html += airportRow('Observación local', validTime ? formatLocalDate(time.toISOString(), airportTimeZone(airport.icaoId)) : 'N/D');
        if (validTime) {
            html += airportRow('Observación UTC', `${time.toISOString().slice(0, 16).replace('T', ' ')} UTC`);
            if (Date.now() - time.getTime() > 2 * 60 * 60 * 1000) {
                html += '<div class="airport-popup-note">Aviso: observación de más de 2 horas.</div>';
            }
        }
        if (report.rawOb) html += `<div class="airport-popup-raw">${escapeAirportText(report.rawOb)}</div>`;
        if (report.fltCat) html += airportRow('Categoría', report.fltCat);
        html += airportRow('Temperatura', Number.isFinite(report.temp) ? `${report.temp} °C` : 'N/D');
        html += airportRow('Punto de rocío', Number.isFinite(report.dewp) ? `${report.dewp} °C` : 'N/D');

        let wind = 'N/D';
        if (Number.isFinite(report.wspd)) {
            const direction = report.wdir === 'VRB' ? 'variable'
                : Number.isFinite(report.wdir) ? `${String(report.wdir).padStart(3, '0')}°` : 'dirección N/D';
            wind = `${direction}, ${report.wspd} kt (${Math.round(report.wspd * 1.852)} km/h)`;
            if (Number.isFinite(report.wgst)) wind += `, rachas ${report.wgst} kt (${Math.round(report.wgst * 1.852)} km/h)`;
            const variation = observation.match(/\b(\d{3})V(\d{3})\b/);
            if (variation) wind += `, variable entre ${variation[1]}° y ${variation[2]}°`;
            if (Number.isFinite(report.wdir) && report.wspd > 0) wind += ` ${getWindArrow(report.wdir)}`;
        }
        html += airportRow('Viento', wind);
        html += airportRow('Visibilidad', airportVisibility(report, observation));
        html += airportRow('Altímetro', Number.isFinite(report.altim) ? `${report.altim} hPa` : 'N/D');

        if (Array.isArray(report.clouds) && report.clouds.length) {
            for (const cloud of report.clouds) {
                const cover = typeof cloud.cover === 'string' ? cloud.cover : 'N/D';
                let description = `${cover}${AIRPORT_COVER_NAMES[cover] ? ` (${AIRPORT_COVER_NAMES[cover]})` : ''}`;
                if (Number.isFinite(cloud.base)) {
                    description += ` · base ${cloud.base} ft AGL (${Math.round(cloud.base * 0.3048)} m AGL)`;
                    const height = String(Math.round(cloud.base / 100)).padStart(3, '0');
                    const type = observation.match(new RegExp(`\\b${cover}${height}(CB|TCU)\\b`));
                    if (type) description += type[1] === 'CB' ? ' · cumulonimbos' : ' · torrecúmulos';
                }
                html += airportRow('Nubes', description);
            }
        } else {
            const sky = observation.match(/\b(CAVOK|NSC|NCD|SKC|CLR)\b/);
            if (sky) html += airportRow('Nubes', `${sky[1]} (${AIRPORT_COVER_NAMES[sky[1]]})`);
        }
        if (Number.isFinite(report.vertVis)) html += airportRow('Visibilidad vertical', `${report.vertVis} ft`);
        if (report.wxString) html += airportRow('Fenómenos', decodeAirportWeather(report.wxString));

        const rvrPattern = /\bR(\d{2}[LCR]?)\/([MP]?)(\d{4})(?:V([MP]?)(\d{4}))?(FT)?([UDN])?\b/g;
        const limit = value => value === 'M' ? 'menos de ' : value === 'P' ? 'más de ' : '';
        const tendency = { U: 'mejora', D: 'empeora', N: 'sin cambios' };
        for (const match of observation.matchAll(rvrPattern)) {
            const [, runway, firstLimit, first, secondLimit, second, feet, trend] = match;
            const unit = feet ? 'ft' : 'm';
            let value = `${limit(firstLimit)}${Number(first)} ${unit}`;
            if (second) value += ` a ${limit(secondLimit)}${Number(second)} ${unit}`;
            if (trend) value += ` (${tendency[trend]})`;
            html += airportRow(`RVR ${runway}`, value);
        }
        const trend = raw.match(/\b(TEMPO|BECMG|NOSIG)\b[^]*?(?=\s+RMK\b|$)/);
        if (trend) html += airportRow('Tendencia METAR (sin descodificar)', trend[0].trim());
    }

    if (airport.freqs || (Array.isArray(airport.runways) && airport.runways.length)) html += '<hr>';
    if (airport.freqs) html += airportRow('Frecuencias publicadas por AviationWeather', airport.freqs);
    if (Array.isArray(airport.runways) && airport.runways.length) {
        const runways = airport.runways.map(runway => `${runway.id || 'N/D'}${runway.dimension ? ` (${runway.dimension} ft)` : ''}`);
        html += airportRow('Pistas', runways.join(', '));
    }
    html += '<div class="airport-popup-note">Consulta fuentes aeronáuticas oficiales para operar.</div>';
    return html;
}

async function fetchAirportProduct(item) {
    const target = new URL(`https://aviationweather.gov/api/data/${item}`);
    target.searchParams.set('ids', AIRPORT_ICAOS.join(','));
    target.searchParams.set('format', 'json');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AIRPORT_REQUEST_TIMEOUT);
    try {
        const response = await fetch(`${AIRPORT_PROXY_URL}${encodeURIComponent(target.href)}`, { signal: controller.signal });
        if (response.status === 204) return [];
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('La respuesta no contiene una lista');
        return data.filter(record => record && AIRPORT_ICAO_SET.has(record.icaoId));
    } finally {
        clearTimeout(timeout);
    }
}

function hasAirportPosition(record) {
    return record && Number.isFinite(record.lat) && Number.isFinite(record.lon)
        && Math.abs(record.lat) <= 90 && Math.abs(record.lon) <= 180;
}

function updateAirportMarkers() {
    const airports = new Map((airportRecords || []).map(airport => [airport.icaoId, airport]));
    const reports = new Map();
    for (const report of metarRecords || []) {
        const previous = reports.get(report.icaoId);
        if (!previous || (report.obsTime || 0) > (previous.obsTime || 0)) reports.set(report.icaoId, report);
    }
    const features = [];
    airportFeatures = new Map();
    for (const icao of AIRPORT_ICAOS) {
        const airport = airports.get(icao);
        const report = reports.get(icao);
        const position = hasAirportPosition(airport) ? airport : hasAirportPosition(report) ? report : null;
        if (!position) continue;
        const details = airport || { icaoId: icao, name: report.name, elev: report.elev };
        airportFeatures.set(icao, { airport: details, report });
        features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [position.lon, position.lat] },
            properties: { icao }
        });
    }
    const data = { type: 'FeatureCollection', features };
    if (map.getSource('airports')) {
        map.getSource('airports').setData(data);
    } else {
        map.addSource('airports', { type: 'geojson', data });
        map.addLayer({
            id: 'airport-markers',
            type: 'circle',
            source: 'airports',
            layout: { visibility: airportsVisible.checked ? 'visible' : 'none' },
            paint: {
                'circle-radius': 7,
                'circle-color': '#ffc615',
                'circle-stroke-width': 2,
                'circle-stroke-color': '#1a130f'
            }
        });
        bindAirportEvents();
    }
    return AIRPORT_ICAOS.filter(icao => !airportFeatures.has(icao));
}

function bindAirportEvents() {
    map.on('mousemove', 'airport-markers', event => {
        const feature = event.features && event.features[0];
        const details = feature && airportFeatures.get(feature.properties.icao);
        if (!details) return;
        map.getCanvas().style.cursor = 'pointer';
        hoverPopup.setLngLat(feature.geometry.coordinates.slice())
            .setHTML(`<div class="station-hover-title">${escapeAirportText(details.airport.icaoId)} · ${escapeAirportText(details.airport.name || 'Aeropuerto')}</div>`)
            .addTo(map);
    });
    map.on('mouseleave', 'airport-markers', () => {
        map.getCanvas().style.cursor = '';
        hoverPopup.remove();
    });
    map.on('click', 'airport-markers', event => {
        const feature = event.features && event.features[0];
        const details = feature && airportFeatures.get(feature.properties.icao);
        if (!details) return;
        if (activeClickPopup) activeClickPopup.remove();
        activeClickPopup = new maplibregl.Popup({ offset: 12, className: 'airport-popup', maxWidth: '360px' })
            .setLngLat(feature.geometry.coordinates.slice())
            .setHTML(formatAirportPopup(details.airport, details.report))
            .addTo(map);
    });
}

async function loadAirportData(refreshAirports = false) {
    if (airportDataLoading) return;
    airportDataLoading = true;
    airportRetryBtn.disabled = true;
    airportStatus.hidden = false;
    airportStatusMessage.textContent = 'Cargando aeropuertos y METAR…';
    const requests = [
        airportRecords === null || refreshAirports ? fetchAirportProduct('airport') : Promise.resolve(airportRecords),
        fetchAirportProduct('metar')
    ];
    const [airportsResult, metarsResult] = await Promise.allSettled(requests);
    const errors = [];
    if (airportsResult.status === 'fulfilled') {
        const airports = new Map((airportRecords || []).map(airport => [airport.icaoId, airport]));
        for (const airport of airportsResult.value) airports.set(airport.icaoId, airport);
        airportRecords = [...airports.values()];
    } else {
        console.error('Error cargando aeropuertos AviationWeather:', airportsResult.reason);
        errors.push(airportRecords ? 'Error al actualizar aeropuertos; se conservan los anteriores' : 'Error al cargar aeropuertos');
    }
    if (metarsResult.status === 'fulfilled') {
        metarRecords = metarsResult.value;
    } else {
        console.error('Error cargando METAR AviationWeather:', metarsResult.reason);
        errors.push(metarRecords ? 'Error al actualizar METAR; se conservan los anteriores' : 'Error al cargar METAR');
    }
    if (airportRecords !== null || metarRecords !== null) {
        try {
            const missing = updateAirportMarkers();
            if (missing.length) errors.push(`Sin ubicación: ${missing.join(', ')}`);
            if (metarsResult.status === 'fulfilled') {
                const available = new Set(metarRecords.map(report => report.icaoId));
                const withoutMetar = AIRPORT_ICAOS.filter(icao => airportFeatures.has(icao) && !available.has(icao));
                if (withoutMetar.length) errors.push(`Sin METAR: ${withoutMetar.join(', ')}`);
            }
        } catch (error) {
            console.error('Error al mostrar aeropuertos en el mapa:', error);
            errors.push('Error al mostrar aeropuertos en el mapa');
        }
    }
    airportStatusMessage.textContent = errors.join(' · ');
    airportStatus.hidden = !errors.length;
    airportRetryBtn.disabled = false;
    airportDataLoading = false;
}

airportsVisible.addEventListener('change', () => {
    if (map.getLayer('airport-markers')) {
        map.setLayoutProperty('airport-markers', 'visibility', airportsVisible.checked ? 'visible' : 'none');
    }
    if (!airportsVisible.checked) {
        hoverPopup.remove();
        const popupElement = activeClickPopup && activeClickPopup.getElement();
        if (popupElement && popupElement.classList.contains('airport-popup')) {
            activeClickPopup.remove();
            activeClickPopup = null;
        }
    }
});
airportRetryBtn.addEventListener('click', () => loadAirportData(true));

function initializeAirports() {
    loadAirportData();
    setInterval(loadAirportData, AIRPORT_REFRESH_INTERVAL);
}

if (mapReady) initializeAirports();
else map.on('load', initializeAirports);
