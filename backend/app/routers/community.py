"""
Community endpoints (Role 4): help locations and help alerts.

Profiles, emergency contacts and the neighbor help board live in Firestore and are read
and written by the frontend directly (see firebase/firestore.rules). The backend only does
what the browser can't: send email and SMS.
"""
import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.services import notify, places
from app.services.firebaseAuth import getCurrentUser

router = APIRouter(prefix="/api", tags=["community"])
recentAlerts = dict()   # uid -> list of send times, to stop accidental spam


@router.get("/resources")
def getResources(lat: float = 42.886, lon: float = -78.878, type: str = "", limit: int = 20):
    return places.nearbyResources(lat, lon, type, limit)


class Contact(BaseModel):
    name: str = ""
    email: str = ""
    phone: str = Field("", description="E.164 format, e.g. +17165551234")


class HelpAlert(BaseModel):
    kind: str = Field(description="stuck | no_heat | medical | supplies | check_on_me")
    note: str = ""
    lat: float
    lon: float
    display_name: str = ""
    contacts: list[Contact]


@router.post("/help/notify")
def postHelpNotify(body: HelpAlert, user: dict = Depends(getCurrentUser)):
    """Email/text the signed-in user's emergency contacts. Max 3 alerts per 10 minutes per user."""
    now = time.time()
    history = [sentAt for sentAt in recentAlerts.get(user["uid"], list()) if ((now - sentAt) < 600)]
    if (len(history) >= 3):
        raise HTTPException(status_code=429, detail="You've sent 3 alerts in 10 minutes. If this is an emergency, call 911.")
    if (len(body.contacts) == 0):
        raise HTTPException(status_code=400, detail="Add at least one emergency contact first.")
    recentAlerts[user["uid"]] = history + [now]
    displayName = body.display_name or user["name"] or "A Snowbelt user"
    results = notify.sendHelpAlerts(displayName, body.kind, body.note, body.lat, body.lon,
                                    [contact.model_dump() for contact in body.contacts])
    return dict(results=results)
