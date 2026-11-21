import os
import re
import ast
import sys
import json
import glob
import shutil
import tarfile
import requests
import tifffile
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
import matplotlib.patheffects as path_effects
import cartopy.crs as ccrs
import cartopy.feature as cfeature
import numpy as np
from scipy.ndimage import median_filter, gaussian_filter
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
import time

# ==========================================
# 1. PALETAS DE COLORES PERSONALIZADAS
# ==========================================

raw_wind_stops_kmh = [
    (0, '#00edda'), (14, '#17c947'), (29, '#399128'), (40, '#d9ff00'),
    (47, '#ffaa00'), (54, '#ff913d'), (65, '#ff5d28'), (79, '#ff0000'),
    (90, '#be0000'), (112, '#96005a'), (140, '#be00be'), (180, '#f700ff'),
    (234, '#00c8ff'), (288, '#a0e6ff'), (360, '#ffffff'), (374, '#ffffff')
]

min_wk = raw_wind_stops_kmh[0][0]
max_wk = raw_wind_stops_kmh[-1][0]

wk_cdict = {'red': [], 'green': [], 'blue': []}
for val, hex_color in raw_wind_stops_kmh:
    norm_pos = min(max((val - min_wk) / (max_wk - min_wk), 0.0), 1.0)
    rgb = mcolors.to_rgb(hex_color)
    wk_cdict['red'].append((norm_pos, rgb[0], rgb[0]))
    wk_cdict['green'].append((norm_pos, rgb[1], rgb[1]))
    wk_cdict['blue'].append((norm_pos, rgb[2], rgb[2]))

custom_wind_cmap = mcolors.LinearSegmentedColormap('custom_wind_kmh_hex', wk_cdict)
wind_levels_kmh = [0, 14, 29, 40, 47, 54, 65, 79, 90, 112, 140, 180, 234, 288, 360, 374]

raw_temp_stops = [
    (-72, '#1919f3'), (-65, '#2517dc'), (-50, '#4d158e'), (-40, '#7c1fa3'),
    (-35, '#8c23aa'), (-30, '#9f29b1'), (-28, '#a32cb3'), (-23, '#b035b6'),
    (-17, '#895be6'), (-11, '#2993f3'), (-5, '#03aaf4'), (1, '#00c0dd'),
    (3, '#00c6ed'), (4, '#00caf9'), (5, '#0ccdff'), (8, '#5ad1fe'),
    (10, '#9dd4f8'), (12, '#77d3e2'), (14, '#5bd1ce'), (17, '#36c399'),
    (19, '#3bb983'), (20, '#34bb6a'), (22, '#2bbb31'), (23, '#53cd14'),
    (25, "#dde000"), (26, '#d7b800'), (27, "#f24500"), (30, '#e32400'),
    (32, '#cc0400'), (35, '#b00200'), (40, '#8d0000')
]

min_t = raw_temp_stops[0][0]
max_t = raw_temp_stops[-1][0]

t_cdict = {'red': [], 'green': [], 'blue': []}
for temp_c, hex_color in raw_temp_stops:
    norm_pos = (temp_c - min_t) / (max_t - min_t)
    rgb = mcolors.to_rgb(hex_color)
    t_cdict['red'].append((norm_pos, rgb[0], rgb[0]))
    t_cdict['green'].append((norm_pos, rgb[1], rgb[1]))
    t_cdict['blue'].append((norm_pos, rgb[2], rgb[2]))

custom_temp_cmap = mcolors.LinearSegmentedColormap('custom_temp_hex', t_cdict)
temp_levels = np.arange(-72, 41, 2)

raw_precip_stops = [
    (0.0, '#ffffff'), (0.5, '#85a2e4'), (1.5, '#5a87f7'), (2.2, '#06ba71'),
    (3.2, '#09c002'), (4.2, '#2ccf00'), (5.2, '#6bda00'), (7.0, '#a9df00'),
    (8.0, '#a5df00'), (10.0, '#e1e400'), (12.0, '#f8e600'), (16.0, '#ec7e00'),
    (22.0, '#c51718'), (30.0, '#e03b61'), (47.0, '#f25a9c'), (60.0, '#fa6ebe'),
    (80.0, '#ffbaed')
]

min_p = raw_precip_stops[0][0]
max_p = raw_precip_stops[-1][0]

p_cdict = {'red': [], 'green': [], 'blue': []}
for val, hex_color in raw_precip_stops:
    norm_pos = min(max((val - min_p) / (max_p - min_p), 0.0), 1.0)
    rgb = mcolors.to_rgb(hex_color)
    p_cdict['red'].append((norm_pos, rgb[0], rgb[0]))
    p_cdict['green'].append((norm_pos, rgb[1], rgb[1]))
    p_cdict['blue'].append((norm_pos, rgb[2], rgb[2]))

custom_precip_cmap = mcolors.LinearSegmentedColormap('custom_precip_hex', p_cdict)
precip_levels = [0, 0.5, 1, 2, 4, 6, 10, 15, 20, 30, 45, 60, 80]

raw_precip_acc_stops = [
    (0.0,   '#ffffff'), (1.0,   '#85a2e4'), (3.0,   '#5a87f7'), (5.0,   '#06ba71'),
    (10.0,  '#09c002'), (15.0,  '#2ccf00'), (20.0,  '#6bda00'), (30.0,  '#a9df00'),
    (40.0,  '#a5df00'), (50.0,  '#e1e400'), (60.0,  '#f8e600'), (80.0,  '#ec7e00'),
    (100.0, '#c51718'), (120.0, '#e03b61'), (150.0, '#f25a9c'), (200.0, '#b83361'),
    (250.0, '#800040'), (300.0, '#59002d'), (400.0, '#36001c'), (500.0, '#1a000d')
]

min_pa = raw_precip_acc_stops[0][0]
max_pa = raw_precip_acc_stops[-1][0]

pa_cdict = {'red': [], 'green': [], 'blue': []}
for val, hex_color in raw_precip_acc_stops:
    norm_pos = min(max((val - min_pa) / (max_pa - min_pa), 0.0), 1.0)
    rgb = mcolors.to_rgb(hex_color)
    pa_cdict['red'].append((norm_pos, rgb[0], rgb[0]))
    pa_cdict['green'].append((norm_pos, rgb[1], rgb[1]))
    pa_cdict['blue'].append((norm_pos, rgb[2], rgb[2]))

custom_precip_acc_cmap = mcolors.LinearSegmentedColormap('custom_precip_acc_hex', pa_cdict)
precip_acc_levels = [0, 1, 3, 5, 10, 15, 20, 30, 40, 50, 60, 80, 100, 125, 150, 200, 250, 300, 400, 500]

# ==========================================
# 2. CONFIGURACIÓN DE PRODUCTOS Y REGIONES
# ==========================================
# 'tif' = sufijo del fichero de AEMET del que se decodifican los valores
# 'smooth' = sigma (en píxeles de 0.025°) del suavizado que elimina el efecto escalón de la leyenda
PRODUCTS = {
    'TEMP2m': {
        'name': 'Temperatura (°C) 2m',
        'levels': temp_levels,
        'cmap': custom_temp_cmap,
        'tif': '11',
        'smooth': 2.0,
    },
    'PRECIP': {
        'name': 'Precipitación (mm/h)',
        'levels': precip_levels,
        'cmap': custom_precip_cmap,
        'tif': '61_1HH',
        'smooth': 0.8,
    },
    'PRECIP_ACC': {
        'name': 'Precipitación Acumulada Total (mm)',
        'levels': precip_acc_levels,
        'cmap': custom_precip_acc_cmap,
        'tif': '61_1HH',
        'smooth': 0.8,
    },
    'VIENTO10': {
        'name': 'Viento (km/h) 10m',
        'levels': wind_levels_kmh,
        'cmap': custom_wind_cmap,
        'tif': '32',
        'smooth': 1.5,
    }
}

# label_px = separación (en píxeles) de los valores numéricos de precipitación
# barb_step = salto sobre la rejilla de 0.4° de direcciones de viento
REGIONS = {
    'iberia': {
        'display_name': 'PENÍNSULA IBÉRICA',
        'extent': [-10.5, 4.5, 35.5, 44.5],
        'scale': '50m',
        'label_px': 20,
        'barb_step': 2,
        'products': ['PRECIP', 'PRECIP_ACC', 'TEMP2m', 'VIENTO10']
    },
    'mediterraneo': {
        'display_name': 'CATALUÑA, VALÉNCIA Y BALEARES',
        'extent': [-1.5, 5.0, 37.8, 43.0],
        'scale': '10m',
        'label_px': 10,
        'barb_step': 1,
        'products': ['PRECIP', 'PRECIP_ACC', 'TEMP2m', 'VIENTO10']
    }
}

# ==========================================
# 3. DESCARGA DE DATOS (AEMET) Y LECTURA DE GEOTIFF
# ==========================================
DOWNLOAD_URL = "https://www.aemet.es/es/api-eltiempo/modelos/download/harmonie/PB"
WIND_DIR_SUFFIX = 'direcc_viento_33'
GRID_STEP = 0.025   # resolución del ráster en grados
MAX_STEP = 48       # alcance del modelo en horas

output_dir = "HARMONIE"
os.makedirs(output_dir, exist_ok=True)
work_dir = os.path.join(output_dir, "_tmp")
# Si se pasa una carpeta como argumento se usan sus ficheros en lugar de descargar
local_source = sys.argv[1] if len(sys.argv) > 1 else None


def download_with_retries(url, target, attempts=4, timeout=(10, 120)):
    """Descarga el paquete en streaming con reintentos y espera creciente."""
    for attempt in range(attempts):
        try:
            with requests.get(url, stream=True, timeout=timeout) as r:
                if r.status_code == 200:
                    with open(target, "wb") as f:
                        for chunk in r.iter_content(chunk_size=1 << 20):
                            f.write(chunk)
                    if os.path.getsize(target) > 100000:
                        return True
                print(f"    intento {attempt + 1}/{attempts}: HTTP {r.status_code}")
        except requests.exceptions.RequestException as e:
            print(f"    intento {attempt + 1}/{attempts}: {type(e).__name__}")
        if attempt < attempts - 1:
            time.sleep(5 * (attempt + 1))
    return False


def parse_scale(tif_path):
    """Lee la leyenda (tramos y colores) que AEMET incrusta en los metadatos del GeoTIFF."""
    with tifffile.TiffFile(tif_path) as t:
        xml = t.pages[0].tags[42112].value
    raw = re.search(r'<Item name="ESCALA">(.*?)</Item>', xml, re.S).group(1)
    bins = ast.literal_eval(raw)['Lista RGBA']
    colors = np.array([[int(c) for c in b['RGBA'][:3]] for b in bins], dtype=int)
    n = len(bins)
    mids = np.zeros(n)
    for i, b in enumerate(bins):
        lo, hi = b['Valores']
        if lo != '' and hi != '':
            mids[i] = (float(lo) + float(hi)) / 2
    # Tramos abiertos (sin límite inferior o superior): se extrapola con la anchura del vecino
    for i, b in enumerate(bins):
        lo, hi = b['Valores']
        if hi == '' and lo != '':
            width = abs(mids[i + 1] - float(lo)) * 2 if i + 1 < n else 0
            mids[i] = float(lo) + width / 2
        elif lo == '' and hi != '':
            width = abs(float(hi) - mids[i - 1]) * 2 if i > 0 else 0
            mids[i] = float(hi) - width / 2
    return bins, colors, mids


def decode_raster(tif_path, zero_when_transparent=False):
    """Convierte el GeoTIFF RGBA de AEMET en una matriz de valores físicos.

    Cada píxel se asigna al color de leyenda más cercano (el JPEG introduce ruido) y
    se le da el valor central de su tramo. Con zero_when_transparent los píxeles
    transparentes (precipitación inferior a 0.5 mm) valen 0.
    """
    with tifffile.TiffFile(tif_path) as t:
        rgba = t.pages[0].asarray()
    bins, colors, mids = parse_scale(tif_path)
    rgb = rgba[..., :3].astype(int)

    if zero_when_transparent:
        # El último tramo es el transparente: no participa en la clasificación por color
        colors, mids = colors[:-1], mids[:-1]

    dist = np.abs(rgb[..., None, :] - colors[None, None, :, :]).sum(-1)
    idx = dist.argmin(-1)
    idx = median_filter(idx, size=3)
    values = mids[idx]
    if zero_when_transparent:
        values = np.where(rgba[..., 3] < 128, 0.0, values)
    return values.astype(float)


def crop_to_extent(arr, extent, lons_full, lats_full, margin=0.5):
    """Recorta un ráster (lats descendentes) a la región con un pequeño margen."""
    li = np.where((lons_full >= extent[0] - margin) & (lons_full <= extent[1] + margin))[0]
    la = np.where((lats_full >= extent[2] - margin) & (lats_full <= extent[3] + margin))[0]
    sl_lat, sl_lon = slice(la[0], la[-1] + 1), slice(li[0], li[-1] + 1)
    return lons_full[sl_lon], lats_full[sl_lat], arr[sl_lat, sl_lon]


def prepare_files():
    """Descarga y extrae (o localiza) los ficheros y devuelve {(fecha_valida, sufijo): ruta}."""
    if local_source:
        src_dir = local_source
        print(f"-> Usando ficheros locales de: {src_dir}")
    else:
        shutil.rmtree(work_dir, ignore_errors=True)
        os.makedirs(work_dir, exist_ok=True)
        tar_path = os.path.join(work_dir, "harmonie.tar.gz")
        print(f"-> Descargando HARMONIE-AROME (AEMET): {DOWNLOAD_URL}")
        if not download_with_retries(DOWNLOAD_URL, tar_path):
            return None
        print("-> Descomprimiendo...")
        src_dir = os.path.join(work_dir, "extracted")
        os.makedirs(src_dir, exist_ok=True)
        with tarfile.open(tar_path, "r:*") as tar:
            for member in tar.getmembers():
                if member.isfile():
                    clean_name = os.path.basename(member.name).replace(":", "_")
                    member.name = clean_name
                    tar.extract(member, path=src_dir, filter='fully_trusted')
        os.remove(tar_path)

    
    files = {}
    pattern = re.compile(
        r'down_(\d{4}-\d{2}-\d{2}T\d{2}[:_]\d{2}[:_]\d{2}\+00[:_]00)_(.+)\.(?:tif|geojson)$'
    )

    for path in glob.glob(os.path.join(src_dir, "**", "down_*"), recursive=True):
        m = pattern.search(os.path.basename(path))
        if m:
            date_str = m.group(1).replace("_", ":")
            valid = datetime.fromisoformat(date_str)
            files[(valid, m.group(2))] = path

    return files



metric_times = {}


def record_time(phase, start):
    elapsed = time.perf_counter() - start
    total, count = metric_times.get(phase, (0.0, 0))
    metric_times[phase] = (total + elapsed, count + 1)


prepare_start = time.perf_counter()
files = prepare_files()
record_time('Preparación de archivos', prepare_start)
if not files:
    print("Error: no se pudieron obtener los ficheros de HARMONIE-AROME.")
    sys.exit(1)

# El primer plazo disponible es +1h respecto a la salida del modelo
valid_times = sorted({k[0] for k in files if k[1] == '11'})
run_datetime = valid_times[0] - timedelta(hours=1)
year_str, month_str, day_str = run_datetime.strftime("%Y"), run_datetime.strftime("%m"), run_datetime.strftime("%d")
run_str = run_datetime.strftime("%H")
date_key = f"{year_str}{month_str}{day_str}"
print(f"-> Run detectado: {date_key} {run_str}Z | Plazos disponibles: {len(valid_times)}")

# Rejilla de los GeoTIFF: esquina superior izquierda de pixel en (-11.0125, 44.4875)
sample_tif = files[(valid_times[0], '11')]
with tifffile.TiffFile(sample_tif) as t:
    page = t.pages[0]
    ny, nx = page.shape[:2]
    tie = page.tags[33922].value
lons_full = tie[3] + GRID_STEP * (np.arange(nx) + 0.5)
lats_full = tie[4] - GRID_STEP * (np.arange(ny) + 0.5)

# ==========================================
# 4. BUCLE DE PROCESAMIENTO Y GENERACIÓN DE MAPAS
# ==========================================
image_counters = {reg: {prod: 0 for prod in REGIONS[reg]['products']} for reg in REGIONS}
total_images = 0
start_time_global = time.perf_counter()
madrid_tz = ZoneInfo("Europe/Madrid")

cumulative_precip = None   # mm acumulados (rejilla completa)
precip_chain_ok = True     # se rompe si falta alguna hora de precipitación

for valid_dt in valid_times:
    f_hour = int((valid_dt - run_datetime).total_seconds() // 3600)
    if f_hour > MAX_STEP:
        continue
    f_str = f"{f_hour:03d}"
    valid_local_str = valid_dt.astimezone(madrid_tz).strftime("%d/%m %H:00")
    print(f"Procesando plazo +{f_str}h...")

    smoothing_cache = {}
    rasters = {}
    for suffix in ('11', '32', '61_1HH'):
        path = files.get((valid_dt, suffix))
        if path is None:
            print(f" -> Aviso: falta el fichero '{suffix}' en +{f_str}h")
            continue
        decode_start = time.perf_counter()
        try:
            rasters[suffix] = decode_raster(path, zero_when_transparent=(suffix == '61_1HH'))
        except Exception as e:
            print(f" -> Error decodificando '{suffix}' en +{f_str}h: {e}")
        finally:
            record_time('Decodificación', decode_start)

    if '61_1HH' in rasters and precip_chain_ok:
        cumulative_precip = rasters['61_1HH'].copy() if cumulative_precip is None else cumulative_precip + rasters['61_1HH']
    else:
        precip_chain_ok = False

    wind_points = None
    wind_path = files.get((valid_dt, WIND_DIR_SUFFIX))
    if wind_path:
        try:
            with open(wind_path) as f:
                feats = json.load(f)['features']
            wind_points = np.array([[*ft['geometry']['coordinates'], ft['properties']['ang_viento']] for ft in feats])
        except Exception as e:
            print(f" -> Aviso: no se pudo leer la dirección del viento en +{f_str}h: {e}")

    for reg_key, reg_config in REGIONS.items():
        extent = reg_config['extent']
        for prod_key in reg_config['products']:
            config = PRODUCTS[prod_key]
            fig = None
            try:
                if prod_key == 'PRECIP_ACC':
                    full = cumulative_precip if precip_chain_ok else None
                elif prod_key == 'PRECIP':
                    full = rasters.get('61_1HH')
                else:
                    full = rasters.get(config['tif'])
                if full is None:
                    print(f" -> Aviso: sin datos para {prod_key} ({reg_key}) en +{f_str}h")
                    continue

                smooth_start = time.perf_counter()
                # La precipitación horaria y la acumulada comparten TIFF, pero no datos.
                cache_key = (prod_key, config['smooth'])
                if cache_key not in smoothing_cache:
                    smoothing_cache[cache_key] = gaussian_filter(full, config['smooth']) if config['smooth'] else full
                    record_time('Suavizado calculado', smooth_start)
                else:
                    record_time('Suavizado reutilizado', smooth_start)
                data = smoothing_cache[cache_key]

                crop_start = time.perf_counter()
                lons_sub, lats_sub, data_sub = crop_to_extent(data, extent, lons_full, lats_full)
                record_time('Recorte', crop_start)

                filepath = os.path.join(output_dir, f"HARMONIE-{reg_key}-{prod_key}-{date_key}{run_str}-{f_str}.png")

                draw_start = time.perf_counter()
                fig = plt.figure(figsize=(10, 7.5), facecolor='white')
                ax = plt.axes(projection=ccrs.PlateCarree(), facecolor='white')
                ax.set_extent(extent, crs=ccrs.PlateCarree())

                ax.add_feature(cfeature.LAND.with_scale(reg_config['scale']), facecolor='#f0f0f0')
                ax.add_feature(cfeature.OCEAN.with_scale(reg_config['scale']), facecolor='#e8f4f8')
                ax.add_feature(cfeature.COASTLINE.with_scale(reg_config['scale']), edgecolor='#333333', linewidth=1.1)
                ax.add_feature(cfeature.BORDERS.with_scale(reg_config['scale']), edgecolor='#666666', linestyle=':', linewidth=0.8)

                contour = ax.contourf(
                    lons_sub, lats_sub, data_sub, levels=config['levels'], cmap=config['cmap'],
                    transform=ccrs.PlateCarree(), extend='both', alpha=0.9
                )

                if prod_key == 'VIENTO10' and wind_points is not None:
                    try:
                        lon_p, lat_p, ang = wind_points[:, 0], wind_points[:, 1], wind_points[:, 2]
                        ix = np.round((lon_p - lon_p.min()) / 0.4).astype(int)
                        iy = np.round((lat_p - lat_p.min()) / 0.4).astype(int)
                        step = reg_config['barb_step']
                        keep = (ix % step == 0) & (iy % step == 0) \
                            & (lon_p >= extent[0]) & (lon_p <= extent[1]) & (lat_p >= extent[2]) & (lat_p <= extent[3])
                        lon_p, lat_p, ang = lon_p[keep], lat_p[keep], ang[keep]
                        # Velocidad (km/h) de la rejilla fina en cada punto y dirección meteorológica (de donde sopla)
                        ci = np.clip(np.round((lon_p - lons_full[0]) / GRID_STEP).astype(int), 0, nx - 1)
                        cj = np.clip(np.round((lats_full[0] - lat_p) / GRID_STEP).astype(int), 0, ny - 1)
                        speed = data[cj, ci]
                        rad = np.radians(ang)
                        ax.barbs(
                            lon_p, lat_p, speed * np.sin(rad), speed * np.cos(rad),
                            transform=ccrs.PlateCarree(),
                            length=5, color='black', alpha=0.7, linewidth=0.5
                        )
                    except Exception as wind_err:
                        print(f" -> Aviso: No se pudieron pintar las barbas de viento: {wind_err}")

                # Valores numéricos de precipitación (estilo Meteociel)
                if 'PRECIP' in prod_key:
                    px = reg_config['label_px']
                    for yi in range(px // 2, lats_sub.shape[0], px):
                        for xi in range(px // 2, lons_sub.shape[0], px):
                            val = data_sub[yi, xi]
                            lon_val, lat_val = lons_sub[xi], lats_sub[yi]
                            if val >= 1.0 and extent[0] <= lon_val <= extent[1] and extent[2] <= lat_val <= extent[3]:
                                txt = ax.text(
                                    lon_val, lat_val, f"{val:.0f}",
                                    color='black', fontsize=6, fontweight='bold',
                                    ha='center', va='center', transform=ccrs.PlateCarree()
                                )
                                txt.set_path_effects([path_effects.withStroke(linewidth=2, foreground='white')])

                if 'TEMP' in prod_key:
                    temp_contours = ax.contour(
                        lons_sub, lats_sub, data_sub, levels=np.arange(-40, 45, 4),
                        colors='black', linewidths=0.7, transform=ccrs.PlateCarree(), alpha=0.8
                    )
                    t_labels = ax.clabel(temp_contours, inline=True, fontsize=7, fmt='%d', colors='black')
                    for txt in t_labels:
                        txt.set_path_effects([path_effects.withStroke(linewidth=2.5, foreground='white')])

                cbar = plt.colorbar(contour, ax=ax, orientation='horizontal', pad=0.03, shrink=0.85)
                cbar.set_label(config['name'], color='black', fontsize=10)
                cbar.ax.tick_params(labelsize=7, labelcolor='black')

                if 'TEMP' in prod_key:
                    desired_ticks = np.arange(-30, 41, 2)
                    cbar.ax.set_xlim(-30, 40)
                    cbar.set_ticks(desired_ticks)
                    cbar.set_ticklabels([str(t) for t in desired_ticks])
                elif 'VIENTO' in prod_key:
                    cbar.set_ticks(wind_levels_kmh)
                    cbar.set_ticklabels([str(int(t)) for t in wind_levels_kmh])
                elif prod_key == 'PRECIP_ACC':
                    cbar.set_ticks(precip_acc_levels)
                    cbar.set_ticklabels([str(p) for p in precip_acc_levels])
                elif prod_key == 'PRECIP':
                    cbar.set_ticks(precip_levels)
                    cbar.set_ticklabels([str(p) for p in precip_levels])

                plt.title(
                    f"HARMONIE 2.5 km [{reg_config['display_name']}]\n"
                    f"Salida: {day_str}/{month_str}/{year_str} {run_str}:00 UTC | Plazo: +{f_str}h (Válido: {valid_local_str} local)",
                    color='black', fontsize=10.5, fontweight='bold', loc='left', pad=12
                )

                fig.text(
                    0.98, 0.02, "© Andreu Busom",
                    color='white', fontsize=11, alpha=0.9,
                    ha='right', va='bottom', transform=ax.transAxes,
                    fontweight='bold',
                    path_effects=[path_effects.withStroke(linewidth=2, foreground='black')]
                )

                record_time('Preparación de imagen', draw_start)
                save_start = time.perf_counter()
                plt.savefig(filepath, dpi=150, bbox_inches='tight', facecolor=fig.get_facecolor())
                record_time('Renderizado y guardado', save_start)
                image_counters[reg_key][prod_key] += 1
                total_images += 1
                print(f" -> Guardado [{reg_key} | {prod_key}]: {filepath}")

            except Exception as sub_e:
                print(f" -> Error en producto {prod_key} ({reg_key}): {sub_e}")
            finally:
                plt.close('all')

if not local_source:
    shutil.rmtree(work_dir, ignore_errors=True)

elapsed_time = time.perf_counter() - start_time_global
avg_time = (elapsed_time / total_images) if total_images > 0 else 0

print("\n¡Proceso completado con éxito!")
print(f"Total de imágenes generadas: {total_images}")
print(f"Tiempo total: {elapsed_time:.2f} segundos (~{elapsed_time/60:.1f} minutos)")
print(f"Tiempo medio por imagen: {avg_time:.2f} segundos")
for reg_key, prods in image_counters.items():
    print(f"  - Región [{reg_key.upper()}]:")
    for prod_key, count in prods.items():
        print(f"      {prod_key}: {count} imágenes")

print("\nTiempos por fase (la preparación de archivos queda fuera del tiempo total anterior):")
for phase, (total, count) in metric_times.items():
    print(f"  {phase}: {total:.2f} s ({count} veces; media {total / count:.3f} s)")
