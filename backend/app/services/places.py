"""
Places
------
Loads the town list and the resources list from app/data, and answers
"what's near here" questions. Role 4 owns resources.json: replace the SAMPLE pins
with verified warming centers, shelters and offices (keep the same fields).
"""
import json
import math
from pathlib import Path

dataDir = Path(__file__).resolve().parent.parent / "data"
townList = json.loads((dataDir / "towns.json").read_text())
resourceList = json.loads((dataDir / "resources.json").read_text())

KM_PER_DEG_LAT = 111.0
KM_PER_DEG_LON = 111.32 * math.cos(math.radians(42.86))
COMPASS_POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]


def distanceMi(latA: float, lonA: float, latB: float, lonB: float) -> float:
    eastKm = (lonB - lonA) * KM_PER_DEG_LON
    northKm = (latB - latA) * KM_PER_DEG_LAT
    return math.hypot(eastKm, northKm) * 0.621371


def compassFrom(latA: float, lonA: float, latB: float, lonB: float) -> str:
    eastKm = (lonB - lonA) * KM_PER_DEG_LON
    northKm = (latB - latA) * KM_PER_DEG_LAT
    degrees = (math.degrees(math.atan2(eastKm, northKm)) + 360) % 360
    return COMPASS_POINTS[round(degrees / 22.5) % 16]


def findTown(name: str):
    """Case-insensitive match on a town name; returns the town dict or None."""
    wanted = name.strip().lower()
    for town in townList:
        if (town["name"].lower() == wanted):
            return town
    for town in townList:
        if ((wanted in town["name"].lower()) or (town["name"].lower() in wanted)):
            return town
    return None


def nearestTown(lat: float, lon: float) -> dict:
    listedTowns = [town for town in townList if (town["listed"] == True)]
    return min(listedTowns, key=lambda town: distanceMi(lat, lon, town["lat"], town["lon"]))


def nearbyResources(lat: float, lon: float, kind: str = "", limit: int = 5) -> list:
    """Closest resources, optionally filtered by type (warming_center, shelter, police, government)."""
    results = list()
    for resource in resourceList:
        if ((kind != "") and (resource["type"] != kind)):
            continue
        withDistance = dict(resource)
        withDistance["distance_mi"] = round(distanceMi(lat, lon, resource["lat"], resource["lon"]), 1)
        results.append(withDistance)
    results.sort(key=lambda resource: resource["distance_mi"])
    return results[0:limit]
