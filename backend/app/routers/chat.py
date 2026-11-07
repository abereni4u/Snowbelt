"""Chat endpoint (Role 1): the Gemini assistant."""
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services import geminiAgent

router = APIRouter(prefix="/api", tags=["chat"])


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    text: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1)
    lat: Optional[float] = None
    lon: Optional[float] = None
    hours_ahead: int = Field(0, ge=0, le=24)
    mode: str = "live"


@router.post("/chat")
def postChat(body: ChatRequest):
    if (body.messages[-1].role != "user"):
        raise HTTPException(status_code=400, detail="The last message must be from the user.")
    try:
        return geminiAgent.runChat([message.model_dump() for message in body.messages],
                                   body.lat, body.lon, body.hours_ahead, body.mode)
    except Exception as error:
        raise HTTPException(status_code=502, detail="Gemini request failed: %s" % error)
