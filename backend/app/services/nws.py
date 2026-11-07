"""
National Weather Service client (Role 2)
----------------------------------------
Free, no key, but NWS asks every app to send a User-Agent (set NWS_USER_AGENT in .env).
Docs: https://www.weather.gov/documentation/services-web-api

What's here and working:
  - fetchActiveAlerts(): active alerts for a point, trimmed for the UI, cached 5 minutes.
  - fetchSnowfallForecast(): the raw gridded snowfall forecast for one point, converted to inches.

What Role 2 builds next:
  - Sample ~60 points across the metro with fetchSnowfallForecast, cache for 30-60 min,
    and use those numbers in place of the sample model in snowModel.py.
"""
import re
import time
from datetime import datetime

import httpx

from app import settings

NWS_BASE = "https://api.weather.gov"
cacheStore = dict()


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


def fetchActiveAlerts(lat: float = 42.886, lon: float = -78.878) -> list:
    """Active NWS alerts covering a point (defaults to downtown Buffalo)."""
    cacheKey = "alerts:%.2f,%.2f" % (lat, lon)
    cached = readCache(cacheKey, 300)
    if (cached is not None):
        return cached
    data = nwsGet("/alerts/active?point=%.4f,%.4f" % (lat, lon))
    alerts = list()
    for feature in data.get("features", list()):
        properties = feature.get("properties", dict())
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


def fetchSnowfallForecast(lat: float, lon: float) -> list:
    """Forecast snowfall for one point: [{start, hours, inches}, ...].

    NWS reports snowfallAmount in millimeters over a time span such as
    "2026-11-07T18:00:00+00:00/PT6H". Two calls: /points finds the grid cell, then the grid data.
    """
    cacheKey = "snow:%.3f,%.3f" % (lat, lon)
    cached = readCache(cacheKey, 1800)
    if (cached is not None):
        return cached
    pointInfo = nwsGet("/points/%.4f,%.4f" % (lat, lon))
    gridUrl = pointInfo["properties"]["forecastGridData"]
    gridData = nwsGet(gridUrl.replace(NWS_BASE, ""))
    snowfall = gridData["properties"].get("snowfallAmount", dict())
    periods = list()
    for entry in snowfall.get("values", list()):
        startText, durationText = entry["validTime"].split("/")
        millimeters = entry.get("value") or 0
        periods.append(dict(
            start=datetime.fromisoformat(startText).isoformat(),
            hours=parseDurationHours(durationText),
            inches=round(millimeters / 25.4, 2),
        ))
    cacheStore[cacheKey] = (time.time(), periods)
    return periods
