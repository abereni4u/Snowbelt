"""
Routing (Role 2)
----------------
Gets driving routes from openrouteservice (free key: https://openrouteservice.org) and
scores them against the snow model.

  fastest = ORS's normal route
  safer   = ORS route told to avoid high-risk grid cells (avoid_polygons), when that works

Without ORS_API_KEY the route is a straight line between the two points, marked as a mock,
so the frontend and Gemini can still be built against the same response shape.
"""
import math

import httpx

from app import settings
from app.services import snowModel
from app.services.places import distanceMi

ORS_URL = "https://api.openrouteservice.org/v2/directions/driving-car/geojson"


def scoreLine(coordinates: list, mode: str, hour: float) -> dict:
    """Worst risk along a route and the stretches that pass through high-risk snow.

    coordinates are [lon, lat] pairs (GeoJSON order). Long routes are sampled every few points.
    """
    step = max(1, len(coordinates) // 80)
    worstLevel = "low"
    worstScore = 0.0
    redStretches = list()
    currentStretch = list()
    order = dict(low=0, med=1, high=2)
    for index in range(0, len(coordinates), step):
        lon, lat = coordinates[index][0], coordinates[index][1]
        conditions = snowModel.getConditions(mode, lat, lon, hour)
        if (conditions["risk"] > worstScore):
            worstScore = conditions["risk"]
        if (order[conditions["level"]] > order[worstLevel]):
            worstLevel = conditions["level"]
        if (conditions["level"] == "high"):
            currentStretch.append([lon, lat])
        elif (len(currentStretch) > 0):
            redStretches.append(currentStretch)
            currentStretch = list()
    if (len(currentStretch) > 0):
        redStretches.append(currentStretch)
    return dict(level=worstLevel, worst_risk=worstScore, red_stretches=redStretches)


def buildAvoidPolygons(mode: str, hour: float, fromPoint: list, toPoint: list) -> dict:
    """MultiPolygon of high-risk cells, leaving out cells within ~2 miles of either end."""
    grid = snowModel.buildRiskGrid(mode, hour)
    polygons = list()
    for feature in grid["features"]:
        if (feature["properties"]["level"] != "high"):
            continue
        ring = feature["geometry"]["coordinates"][0]
        centerLon = (ring[0][0] + ring[2][0]) / 2
        centerLat = (ring[0][1] + ring[2][1]) / 2
        nearStart = (distanceMi(centerLat, centerLon, fromPoint[1], fromPoint[0]) < 2)
        nearEnd = (distanceMi(centerLat, centerLon, toPoint[1], toPoint[0]) < 2)
        if ((nearStart == False) and (nearEnd == False)):
            polygons.append([ring])
    return dict(type="MultiPolygon", coordinates=polygons)


def requestOrsRoute(fromPoint: list, toPoint: list, avoidPolygons: dict = None) -> dict:
    body = dict(coordinates=[fromPoint, toPoint])
    if ((avoidPolygons is not None) and (len(avoidPolygons["coordinates"]) > 0)):
        body["options"] = dict(avoid_polygons=avoidPolygons)
    headers = {"Authorization": settings.orsApiKey, "Content-Type": "application/json"}
    with httpx.Client(timeout=15.0) as client:
        response = client.post(ORS_URL, json=body, headers=headers)
        response.raise_for_status()
        feature = response.json()["features"][0]
    summary = feature["properties"].get("summary", dict())
    return dict(
        geometry=feature["geometry"],
        minutes=round(summary.get("duration", 0) / 60),
        miles=round(summary.get("distance", 0) / 1609.34, 1),
    )


def mockRoute(fromPoint: list, toPoint: list) -> dict:
    """Straight line with 20 points, about 30 mph average in snow."""
    coordinates = list()
    for index in range(0, 21):
        t = index / 20
        coordinates.append([fromPoint[0] + (toPoint[0] - fromPoint[0]) * t, fromPoint[1] + (toPoint[1] - fromPoint[1]) * t])
    miles = distanceMi(fromPoint[1], fromPoint[0], toPoint[1], toPoint[0])
    return dict(geometry=dict(type="LineString", coordinates=coordinates), minutes=math.ceil(miles / 30 * 60), miles=round(miles, 1))


def mockDetour(fromPoint: list, toPoint: list, mode: str, hour: float):
    """Two straight legs through a waypoint off to one side, picking the side with the least
    high-risk snow. Returns None when no detour does better than the direct line."""
    midLon = (fromPoint[0] + toPoint[0]) / 2
    midLat = (fromPoint[1] + toPoint[1]) / 2
    # Perpendicular to the trip, scaled to its length
    perpLon, perpLat = -(toPoint[1] - fromPoint[1]), (toPoint[0] - fromPoint[0])
    best = None
    for scale in (0.35, -0.35, 0.6, -0.6):
        waypoint = [midLon + perpLon * scale, midLat + perpLat * scale]
        first = mockRoute(fromPoint, waypoint)
        second = mockRoute(waypoint, toPoint)
        route = dict(geometry=dict(type="LineString", coordinates=first["geometry"]["coordinates"] + second["geometry"]["coordinates"][1:]),
                     minutes=first["minutes"] + second["minutes"], miles=round(first["miles"] + second["miles"], 1))
        route.update(scoreLine(route["geometry"]["coordinates"], mode, hour))
        if ((best is None) or (route["worst_risk"] < best["worst_risk"])):
            best = route
    return best


def planMockRoutes(fromPoint: list, toPoint: list, mode: str, hour: float, note: str) -> dict:
    fastest = mockRoute(fromPoint, toPoint)
    fastest.update(scoreLine(fastest["geometry"]["coordinates"], mode, hour))
    safer = None
    if (fastest["level"] != "low"):
        detour = mockDetour(fromPoint, toPoint, mode, hour)
        if ((detour is not None) and (detour["worst_risk"] < fastest["worst_risk"] - 0.05)):
            safer = detour
    return dict(fastest=fastest, safer=safer, source="mock", note=note)


def planRoutes(fromPoint: list, toPoint: list, mode: str, hour: float) -> dict:
    """Returns {fastest, safer, source, note}; each route carries its own risk score."""
    if (settings.orsApiKey == ""):
        return planMockRoutes(fromPoint, toPoint, mode, hour, "Straight-line estimate. Add ORS_API_KEY to backend/.env for real roads.")
    try:
        fastest = requestOrsRoute(fromPoint, toPoint)
    except httpx.HTTPError:
        return planMockRoutes(fromPoint, toPoint, mode, hour, "Road routing is unavailable right now, so these are straight-line estimates.")
    fastest.update(scoreLine(fastest["geometry"]["coordinates"], mode, hour))
    safer = None
    note = ""
    if (fastest["level"] != "low"):
        try:
            safer = requestOrsRoute(fromPoint, toPoint, buildAvoidPolygons(mode, hour, fromPoint, toPoint))
            safer.update(scoreLine(safer["geometry"]["coordinates"], mode, hour))
            # Only offer it when it really avoids more of the snow
            fewerRed = (len(safer["red_stretches"]) < len(fastest["red_stretches"]))
            if ((fewerRed == False) and (safer["worst_risk"] > fastest["worst_risk"] - 0.05)):
                safer = None
        except httpx.HTTPError:
            note = "Could not find a route around the high-risk area."
    return dict(fastest=fastest, safer=safer, source="openrouteservice", note=note)
