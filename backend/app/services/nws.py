"""
National Weather Service client (Role 2)
----------------------------------------
Free, no key, but NWS asks every app to send a User-Agent (set NWS_USER_AGENT in .env).
Docs: https://www.weather.gov/documentation/services-web-api

What's here and working:
  - fetchActiveAlerts(): active alerts for Western New York, trimmed for the UI, cached 5 minutes.
  - fetchSnowfallForecast(): the raw gridded snowfall forecast for one point, converted to inches.

  - fetchWindAt(): forecast wind at a point and time.

snowModel.py samples fetchSnowfallForecast at every town in towns.json for the "live" map.
"""
import re
import time
from datetime import datetime

import httpx

from app import settings

NWS_BASE = "https://api.weather.gov"
cacheStore = dict()

# NWS Buffalo forecast zones for the eight Western New York counties
# (Niagara, Orleans, Northern Erie, Southern Erie, Genesee, Wyoming, Chautauqua, Cattaraugus, Allegany)
WNY_ZONES = ("NYZ001", "NYZ002", "NYZ010", "NYZ085", "NYZ011", "NYZ012", "NYZ019", "NYZ020", "NYZ021")


def nwsGet(path: str) -> dict:
    headers = {"User-Agent": settings.nwsUserAgent, "Accept": "application/geo+json"}
    with httpx.Client(timeout=10.0, headers=headers) as client:
        response = client.get(NWS_BASE + path)
        response.raise_for_status()
        return response.json()


def readCache(key: str, maxAgeSeconds: int):
    if (key in cacheStore.keys()):
        savedAt, value = cacheStore[key]
        if ((time.time() - savedAt) < maxAgeSeconds):
            return value
    return None


def fetchActiveAlerts(zones: tuple = WNY_ZONES) -> list:
    """Active NWS alerts for the given forecast zones (defaults to all of Western New York).
    An alert issued for several counties at once is listed once."""
    cacheKey = "alerts:" + ",".join(zones)
    cached = readCache(cacheKey, 300)
    if (cached is not None):
        return cached
    data = nwsGet("/alerts/active?zone=" + ",".join(zones))
    alerts = list()
    seen = set()
    for feature in data.get("features", list()):
        properties = feature.get("properties", dict())
        alertKey = (properties.get("event", ""), properties.get("headline", ""))
        if (alertKey in seen):
            continue
        seen.add(alertKey)
        alerts.append(dict(
            event=properties.get("event", ""),
            headline=properties.get("headline", ""),
            severity=properties.get("severity", ""),
            ends=properties.get("ends") or properties.get("expires"),
        ))
    cacheStore[cacheKey] = (time.time(), alerts)
    return alerts


def parseDurationHours(isoDuration: str) -> float:
    """Turns an ISO-8601 duration like PT6H or P1DT6H into hours."""
    match = re.match(r"P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?", isoDuration)
    if (match is None):
        return 0.0
    days, hours, minutes = (int(part) if (part is not None) else 0 for part in match.groups())
    return days * 24 + hours + minutes / 60


def fetchGridData(lat: float, lon: float) -> dict:
    """The NWS forecast grid for one point (properties only), cached 30 minutes.
    The /points lookup that finds the grid cell never changes, so it is kept for the whole run."""
    gridKey = "grid:%.3f,%.3f" % (lat, lon)
    cached = readCache(gridKey, 1800)
    if (cached is not None):
        return cached
    pointKey = "points:%.4f,%.4f" % (lat, lon)
    gridUrl = readCache(pointKey, 10 ** 9)
    if (gridUrl is None):
        gridUrl = nwsGet("/points/%.4f,%.4f" % (lat, lon))["properties"]["forecastGridData"]
        cacheStore[pointKey] = (time.time(), gridUrl)
    properties = nwsGet(gridUrl.replace(NWS_BASE, ""))["properties"]
    cacheStore[gridKey] = (time.time(), properties)
    return properties


def readSeries(properties: dict, name: str) -> list:
    """One gridded field as [{start, hours, value}, ...] with value in the field's own unit."""
    periods = list()
    for entry in properties.get(name, dict()).get("values", list()):
        startText, durationText = entry["validTime"].split("/")
        periods.append(dict(start=datetime.fromisoformat(startText), hours=parseDurationHours(durationText), value=entry.get("value")))
    return periods


def valueAt(periods: list, when: datetime):
    """The value of the period that covers `when`, or None."""
    for period in periods:
        offsetHours = (when - period["start"]).total_seconds() / 3600
        if ((offsetHours >= 0) and (offsetHours < period["hours"])):
            return period["value"]
    return None


def fetchSnowfallForecast(lat: float, lon: float) -> list:
    """Forecast snowfall for one point: [{start, hours, inches}, ...].

    NWS reports snowfallAmount in millimeters over a time span such as
    "2026-11-07T18:00:00+00:00/PT6H". Two calls: /points finds the grid cell, then the grid data.
    """
    periods = list()
    for period in readSeries(fetchGridData(lat, lon), "snowfallAmount"):
        periods.append(dict(start=period["start"].isoformat(), hours=period["hours"],
                            inches=round((period["value"] or 0) / 25.4, 2)))
    return periods


def fetchWindAt(lat: float, lon: float, when: datetime) -> dict:
    """Forecast wind at one point and time: {from_deg, mph}. NWS gives speed in km/h."""
    properties = fetchGridData(lat, lon)
    fromDeg = valueAt(readSeries(properties, "windDirection"), when)
    speedKmh = valueAt(readSeries(properties, "windSpeed"), when)
    return dict(from_deg=round(fromDeg or 0), mph=round((speedKmh or 0) * 0.621371))
