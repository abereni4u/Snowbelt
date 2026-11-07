"""Route endpoint (Role 2): fastest and safer routes, each scored against the snow model."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services import routing

router = APIRouter(prefix="/api", tags=["routing"])


class RouteRequest(BaseModel):
    origin: list[float] = Field(alias="from", description="[lon, lat]")
    to: list[float] = Field(description="[lon, lat]")
    hours_ahead: int = Field(0, ge=0, le=24)
    mode: str = "live"


@router.post("/route")
def postRoute(body: RouteRequest):
    try:
        return routing.planRoutes(body.origin, body.to, body.mode, body.hours_ahead)
    except Exception as error:
        raise HTTPException(status_code=502, detail="Routing service failed: %s" % error)
