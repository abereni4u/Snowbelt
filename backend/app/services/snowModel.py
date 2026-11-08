"""
Snow model (Role 2 owns this file)
----------------------------------
"live" mode uses the National Weather Service gridded snowfall forecast, sampled at every
town in towns.json and blended between towns (inverse-distance weighting). If NWS can't be
reached, or USE_LIVE_NWS is false, "live" falls back to a sample storm and says so through
dataSource(). "replay" is always the illustrative Nov 2022 storm below.

Sample storms:

A lake-effect band is described by keyframes: how hard it snows at the core (inches per
hour), the point the band is centered on, and the compass heading it points toward.
For any point and hour:

    rate = peak * gauss(km across the band) * gauss(km along the band) + light background snow

Storm totals are that rate added up hour by hour from the storm's start.

Everything else (risk grid, routes, Gemini tools) calls only these functions.
"""
import math
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

from app import settings
from app.services import nws, places

KM_PER_DEG_LAT = 111.0
KM_PER_DEG_LON = 111.32 * math.cos(math.radians(42.86))

# Map area covered by the snow grid: the eight Western New York counties (Niagara, Orleans,
# Genesee, Wyoming, Erie, Chautauqua, Cattaraugus, Allegany) plus the east end of Lake Erie
BOUNDS = dict(minLat=41.99, maxLat=43.40, minLon=-79.80, maxLon=-77.70)
CELL_KM = 3.0

# Keyframes: (hour from "now", peak in/hr, center lat, center lon, heading the band points toward)
SCENARIOS = dict(
    live=dict(
        label="Today (sample storm)",
        startHour=-12, widthKm=8.0, lengthKm=30.0, backgroundInHr=0.025, windMph=26,
        keyframes=[
            (-12, 0.0, 42.780, -78.780, 70), (-8, 0.5, 42.780, -78.780, 70), (-3, 1.5, 42.765, -78.770, 72),
            (0, 2.1, 42.785, -78.780, 70), (4, 2.5, 42.835, -78.785, 68), (8, 2.0, 42.895, -78.790, 66),
            (12, 1.4, 42.860, -78.785, 68), (18, 0.9, 42.770, -78.770, 72), (24, 0.3, 42.710, -78.760, 75),
        ],
    ),
    replay=dict(
        label="Nov 17-20, 2022 lake-effect storm (illustrative replay, not observed data)",
        startHour=-20, widthKm=8.0, lengthKm=30.0, backgroundInHr=0.03, windMph=30,
        keyframes=[
            (-20, 0.4, 42.800, -78.800, 66), (-16, 1.8, 42.790, -78.795, 66), (-10, 3.0, 42.795, -78.790, 65),
            (-4, 2.8, 42.780, -78.780, 67), (0, 2.4, 42.790, -78.785, 66), (6, 1.6, 42.825, -78.800, 64),
            (12, 1.3, 42.780, -78.775, 68), (18, 1.1, 42.765, -78.765, 70), (24, 0.6, 42.775, -78.770, 69),
        ],
    ),
)


def getScenario(mode: str) -> dict:
    if (mode in SCENARIOS.keys()):
        return SCENARIOS[mode]
    return SCENARIOS["live"]


# Live NWS field. Hours are counted from the start of the current UTC hour, from
# LIVE_FIRST_HOUR (snow forecast for the last 12 hours) through hour 24 of the future slider.
LIVE_FIRST_HOUR = -12
LIVE_LAST_HOUR = 25
LIVE_TTL_SECONDS = 1800
LIVE_RETRY_SECONDS = 120
LIVE_WIND_POINT = (42.886, -78.878)   # downtown Buffalo
liveState = dict(savedAt=0.0, failedAt=0.0, field=None)
liveLock = threading.Lock()


def hourlyRates(periods: list, startOfHour: datetime) -> list:
    """Spreads each NWS period's inches evenly over its hours: one in/hr value per hour slot."""
    rates = [0.0] * (LIVE_LAST_HOUR - LIVE_FIRST_HOUR)
    for period in periods:
        if (period["hours"] <= 0):
            continue
        perHour = period["inches"] / period["hours"]
        offset = (datetime.fromisoformat(period["start"]) - startOfHour).total_seconds() / 3600
        for step in range(0, int(round(period["hours"]))):
            index = int(math.floor(offset + step)) - LIVE_FIRST_HOUR
            if ((index >= 0) and (index < len(rates))):
                rates[index] += perHour
    return rates


def fetchTownRates(town: dict, startOfHour: datetime):
    try:
        return (town["lat"], town["lon"], hourlyRates(nws.fetchSnowfallForecast(town["lat"], town["lon"]), startOfHour))
    except Exception:
        return None


def loadLiveField():
    startOfHour = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda town: fetchTownRates(town, startOfHour), places.townList))
    points = list()
    for result in results:
        if (result is None):
            continue
        lat, lon, rates = result
        totals = [0.0]
        for rate in rates:
            totals.append(totals[-1] + rate)
        points.append(dict(lat=lat, lon=lon, rates=rates, totals=totals))
    if (len(points) < 10):
        return None
    try:
        wind = nws.fetchWindAt(LIVE_WIND_POINT[0], LIVE_WIND_POINT[1], startOfHour)
    except Exception:
        wind = dict(from_deg=0, mph=0)
    return dict(points=points, startOfHour=startOfHour, wind=wind)


def getLiveField():
    """The live NWS field, refreshed every 30 minutes; None when live data is off or unavailable."""
    if (settings.useLiveNws == False):
        return None
    with liveLock:
        now = time.time()
        if ((liveState["field"] is not None) and ((now - liveState["savedAt"]) < LIVE_TTL_SECONDS)):
            return liveState["field"]
        if ((now - liveState["failedAt"]) < LIVE_RETRY_SECONDS):
            return liveState["field"]
        field = loadLiveField()
        if (field is None):
            liveState["failedAt"] = now
            return liveState["field"]
        liveState["field"] = field
        liveState["savedAt"] = now
        return field


def liveVersion(mode: str) -> float:
    """Changes whenever the live field is refreshed, so cached map layers are rebuilt."""
    if (mode != "live"):
        return 0.0
    getLiveField()
    return liveState["savedAt"]


def dataSource(mode: str) -> str:
    """'nws' for live forecast data, 'replay' for the 2022 replay, 'sample' when live fell back."""
    if (mode == "replay"):
        return "replay"
    if (getLiveField() is not None):
        return "nws"
    return "sample"


def liveBlend(field: dict, lat: float, lon: float, read) -> float:
    """Inverse-distance-weighted blend of a per-town value; read(point) picks the value."""
    weightSum = 0.0
    valueSum = 0.0
    for point in field["points"]:
        eastKm = (lon - point["lon"]) * KM_PER_DEG_LON
        northKm = (lat - point["lat"]) * KM_PER_DEG_LAT
        weight = 1.0 / (eastKm * eastKm + northKm * northKm + 1.0)
        weightSum += weight
        valueSum += weight * read(point)
    return valueSum / weightSum


def liveRate(field: dict, lat: float, lon: float, hour: float) -> float:
    index = min(max(int(math.floor(hour)) - LIVE_FIRST_HOUR, 0), LIVE_LAST_HOUR - LIVE_FIRST_HOUR - 1)
    return liveBlend(field, lat, lon, lambda point: point["rates"][index])


def liveTotal(field: dict, lat: float, lon: float, hour: float) -> float:
    position = min(max(hour - LIVE_FIRST_HOUR, 0.0), float(LIVE_LAST_HOUR - LIVE_FIRST_HOUR))
    whole = int(math.floor(position))
    fraction = position - whole

    def read(point):
        total = point["totals"][whole]
        if (whole < len(point["rates"])):
            total += point["rates"][whole] * fraction
        return total
    return liveBlend(field, lat, lon, read)


def getBandFrame(mode: str, hour: float) -> dict:
    """Band state at any hour, blended linearly between the two nearest keyframes."""
    keyframes = getScenario(mode)["keyframes"]
    if (hour <= keyframes[0][0]):
        hourA, peak, lat, lon, heading = keyframes[0]
        return dict(peak=peak, lat=lat, lon=lon, heading=heading)
    if (hour >= keyframes[-1][0]):
        hourA, peak, lat, lon, heading = keyframes[-1]
        return dict(peak=peak, lat=lat, lon=lon, heading=heading)
    for index in range(0, len(keyframes) - 1):
        frameA = keyframes[index]
        frameB = keyframes[index + 1]
        if ((hour >= frameA[0]) and (hour <= frameB[0])):
            t = (hour - frameA[0]) / (frameB[0] - frameA[0])
            blend = lambda a, b: a + (b - a) * t
            return dict(peak=blend(frameA[1], frameB[1]), lat=blend(frameA[2], frameB[2]),
                        lon=blend(frameA[3], frameB[3]), heading=blend(frameA[4], frameB[4]))
    hourA, peak, lat, lon, heading = keyframes[-1]
    return dict(peak=peak, lat=lat, lon=lon, heading=heading)


def getRateInHr(mode: str, lat: float, lon: float, hour: float) -> float:
    """Snowfall rate in inches per hour at a point and hour (0 = now, up to 24)."""
    if (mode == "live"):
        field = getLiveField()
        if (field is not None):
            return liveRate(field, lat, lon, hour)
    scenario = getScenario(mode)
    frame = getBandFrame(mode, hour)
    if (frame["peak"] <= 0):
        return 0.0
    eastKm = (lon - frame["lon"]) * KM_PER_DEG_LON
    northKm = (lat - frame["lat"]) * KM_PER_DEG_LAT
    headingRad = math.radians(frame["heading"])
    alongKm = eastKm * math.sin(headingRad) + northKm * math.cos(headingRad)
    acrossKm = eastKm * math.cos(headingRad) - northKm * math.sin(headingRad)
    core = math.exp(-(acrossKm ** 2) / (scenario["widthKm"] ** 2)) * math.exp(-(alongKm ** 2) / (scenario["lengthKm"] ** 2))
    background = scenario["backgroundInHr"] * min(1.0, frame["peak"] / 0.5)
    return frame["peak"] * core + background


def getTotalIn(mode: str, lat: float, lon: float, hour: float) -> float:
    """Storm total in inches from the start of the storm (live: 12 hours ago) up to the given hour."""
    if (mode == "live"):
        field = getLiveField()
        if (field is not None):
            return liveTotal(field, lat, lon, hour)
    scenario = getScenario(mode)
    totalIn = 0.0
    step = scenario["startHour"]
    while ((step + 1) <= hour):
        totalIn += getRateInHr(mode, lat, lon, step + 0.5)
        step += 1
    leftover = hour - step
    if (leftover > 0):
        totalIn += getRateInHr(mode, lat, lon, step + leftover / 2) * leftover
    return totalIn


def getRiskLevel(totalIn: float, rateInHr: float) -> tuple:
    """Returns (level, score). level is 'low', 'med' or 'high'; score runs 0 to 1.

    Starting thresholds, tune them on replay data:
      high: snowing 1.5+ in/hr, or 10+ in on the ground
      med:  snowing 0.5+ in/hr, or 4+ in on the ground
    """
    score = max(min(totalIn / 20.0, 1.0), min(rateInHr / 2.5, 1.0))
    if ((rateInHr >= 1.5) or (totalIn >= 10)):
        return ("high", round(score, 2))
    if ((rateInHr >= 0.5) or (totalIn >= 4)):
        return ("med", round(score, 2))
    return ("low", round(score, 2))


def getConditions(mode: str, lat: float, lon: float, hour: float) -> dict:
    """Everything the UI and Gemini need about one point."""
    totalIn = getTotalIn(mode, lat, lon, hour)
    rateInHr = getRateInHr(mode, lat, lon, hour)
    endHour = min(24.0, hour + 6)
    next6In = getTotalIn(mode, lat, lon, endHour) - totalIn
    level, score = getRiskLevel(totalIn, rateInHr)
    return dict(snow_total_in=round(totalIn, 1), rate_in_hr=round(rateInHr, 2),
                next_6h_in=round(next6In, 1), level=level, risk=score)


def getWind(mode: str, hour: float) -> dict:
    field = getLiveField() if (mode == "live") else None
    if (field is not None):
        if (hour == 0):
            return field["wind"]
        try:
            return nws.fetchWindAt(LIVE_WIND_POINT[0], LIVE_WIND_POINT[1], field["startOfHour"] + timedelta(hours=hour))
        except Exception:
            return field["wind"]
    frame = getBandFrame(mode, hour)
    fromDeg = (frame["heading"] + 180) % 360
    return dict(from_deg=round(fromDeg), mph=getScenario(mode)["windMph"])


def buildRiskGrid(mode: str, hour: float) -> dict:
    """GeoJSON FeatureCollection with one square cell per CELL_KM across BOUNDS."""
    latStep = CELL_KM / KM_PER_DEG_LAT
    lonStep = CELL_KM / KM_PER_DEG_LON
    features = list()
    rows = int((BOUNDS["maxLat"] - BOUNDS["minLat"]) / latStep) + 1
    cols = int((BOUNDS["maxLon"] - BOUNDS["minLon"]) / lonStep) + 1
    for row in range(0, rows):
        for col in range(0, cols):
            south = BOUNDS["minLat"] + row * latStep
            west = BOUNDS["minLon"] + col * lonStep
            north = south + latStep
            east = west + lonStep
            conditions = getConditions(mode, south + latStep / 2, west + lonStep / 2, hour)
            features.append(dict(
                type="Feature",
                geometry=dict(type="Polygon", coordinates=[[[west, south], [east, south], [east, north], [west, north], [west, south]]]),
                properties=conditions,
            ))
    return dict(type="FeatureCollection", features=features)


def buildSnowRaster(mode: str, hour: float) -> dict:
    """The same CELL_KM grid as buildRiskGrid, as plain number arrays for the map (a few KB
    instead of a polygon per cell).

    snow_total_in[row][col] and rate_in_hr[row][col] are taken at cell centers. Row 0 is the
    southern edge and col 0 the western edge; bounds are the outer edges of the grid.
    """
    latStep = CELL_KM / KM_PER_DEG_LAT
    lonStep = CELL_KM / KM_PER_DEG_LON
    rows = int((BOUNDS["maxLat"] - BOUNDS["minLat"]) / latStep) + 1
    cols = int((BOUNDS["maxLon"] - BOUNDS["minLon"]) / lonStep) + 1
    totals = list()
    rates = list()
    for row in range(0, rows):
        centerLat = BOUNDS["minLat"] + (row + 0.5) * latStep
        totalRow = list()
        rateRow = list()
        for col in range(0, cols):
            centerLon = BOUNDS["minLon"] + (col + 0.5) * lonStep
            totalRow.append(round(getTotalIn(mode, centerLat, centerLon, hour), 1))
            rateRow.append(round(getRateInHr(mode, centerLat, centerLon, hour), 2))
        totals.append(totalRow)
        rates.append(rateRow)
    bounds = dict(south=BOUNDS["minLat"], west=BOUNDS["minLon"],
                  north=round(BOUNDS["minLat"] + rows * latStep, 4), east=round(BOUNDS["minLon"] + cols * lonStep, 4))
    return dict(bounds=bounds, rows=rows, cols=cols, cell_km=CELL_KM, snow_total_in=totals, rate_in_hr=rates)
