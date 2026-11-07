"""
Weather endpoints (Role 2): risk grid, conditions at a point, high-risk towns, NWS alerts.
Response shapes match shared/contracts/*.json; change both together.
"""
from functools import lru_cache

from fastapi import APIRouter, Query

from app.services import nws, places, snowModel

router = APIRouter(prefix="/api", tags=["weather"])


@lru_cache(maxsize=64)
def cachedRiskGrid(mode: str, hour: int) -> dict:
    return snowModel.buildRiskGrid(mode, hour)


@router.get("/risk")
def getRisk(hours_ahead: int = Query(0, ge=0, le=24), mode: str = Query("live", pattern="^(live|replay)$")):
    grid = cachedRiskGrid(mode, hours_ahead)
    return dict(grid, wind=snowModel.getWind(mode, hours_ahead), source="sample")


@router.get("/conditions")
def getConditions(lat: float, lon: float, hours_ahead: int = Query(0, ge=0, le=24), mode: str = Query("live", pattern="^(live|replay)$")):
    result = snowModel.getConditions(mode, lat, lon, hours_ahead)
    result["nearest_town"] = places.nearestTown(lat, lon)["name"]
    result["source"] = "sample"
    return result


@router.get("/areas")
def getAreas(hours_ahead: int = Query(0, ge=0, le=24), mode: str = Query("live", pattern="^(live|replay)$")):
    """Every listed town with its conditions, worst first (the 'Areas with high risk' list)."""
    rows = list()
    for town in places.townList:
        if (town["listed"] == False):
            continue
        conditions = snowModel.getConditions(mode, town["lat"], town["lon"], hours_ahead)
        rows.append(dict(town=town["name"], lat=town["lat"], lon=town["lon"], **conditions))
    rows.sort(key=lambda row: row["risk"], reverse=True)
    return rows


@router.get("/alerts")
def getAlerts():
    """Live NWS alerts for Buffalo; an empty list when there are none or NWS is unreachable."""
    try:
        return nws.fetchActiveAlerts()
    except Exception:
        return list()
