"""
Snowbelt API
------------
Run from the backend folder:  uvicorn app.main:app --reload
Interactive docs:             http://localhost:8000/docs

Each router file belongs to one role, so people rarely edit the same file:
  routers/chat.py       Role 1  Gemini assistant
  routers/weather.py    Role 2  risk grid, conditions, high-risk towns, NWS alerts
  routers/routing.py    Role 2  fastest and safer routes
  routers/community.py  Role 4  help locations and help alerts
"""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import settings
from app.routers import chat, community, routing, weather

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Snowbelt API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=settings.frontendOrigins, allow_methods=["*"], allow_headers=["*"])

app.include_router(weather.router)
app.include_router(routing.router)
app.include_router(community.router)
app.include_router(chat.router)


@app.get("/api/health")
def getHealth():
    """Shows which outside services are configured, so setup problems are easy to spot."""
    return dict(
        ok=True,
        gemini=(settings.geminiApiKey != ""),
        gemini_model=settings.geminiModel,
        live_nws=settings.useLiveNws,
        routing=(settings.orsApiKey != ""),
        firebase=(settings.firebaseCredentialsPath != ""),
        email=(settings.smtpHost != ""),
        sms=(settings.twilioAccountSid != ""),
    )
