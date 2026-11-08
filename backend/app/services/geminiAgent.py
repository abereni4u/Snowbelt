"""
Gemini assistant (Role 1 owns this file; it's the core of the Gemini track entry)
---------------------------------------------------------------------------------
How Gemini "does the real work" here:

  1. The user asks something in plain language ("is it safe to drive to Orchard Park tonight?").
  2. Gemini decides which of our tools to call: conditions at a place, high-risk towns,
     route risk, nearest shelters, live NWS alerts, or drafting a help request.
  3. The google-genai SDK runs those Python functions for us (automatic function calling),
     feeds the results back, and Gemini writes the answer from real numbers.
  4. We return the answer plus the list of tool calls, so the UI can show what Gemini checked.

Gemini never sends a help alert by itself: draftHelpRequest only prepares one, and the user
confirms it in the app. Docs: https://ai.google.dev/gemini-api/docs/function-calling
"""
import logging

from app import settings
from app.services import nws, places, routing, snowModel

logger = logging.getLogger("snowbelt.gemini")

# Tried in order after GEMINI_MODEL when a model is overloaded or times out
FALLBACK_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash"]

SYSTEM_RULES = """You are Snowbelt's assistant for people in Western New York (Erie, Niagara, Orleans, Genesee, Wyoming, Chautauqua, Cattaraugus and Allegany counties) during lake-effect snow.

Use the tools to look up real numbers before you answer anything about snow, roads, risk, alerts or places to go. Never guess a number.
Lake-effect snow is very local: one town can get feet while the next gets nothing, so always name specific towns.
Use inches, inches per hour, miles and minutes. Keep answers under 120 words, in plain text with no markdown.
For driving questions, check the route with getRouteRisk and say plainly if it crosses high-risk snow. Never promise a road is safe.
If someone is stuck, without heat, or needs help, call draftHelpRequest so the app can show them a help request to confirm, and tell them to review and send it in the app.
If someone lists readiness items they still need, check conditions and findResources near them, then suggest concrete ways to get each item before the storm: going out before the snow gets heavy, grocery or pharmacy delivery while roads are open, nearby warming centers, and calling 2-1-1 for assistance programs. Never invent store names, addresses or phone numbers.
If anyone's life may be in danger, tell them to call 911 first. This app does not dispatch emergency services.
If the data source note says the numbers are sample data, mention that once."""


def buildTools(context: dict) -> list:
    """Python functions Gemini may call. The SDK reads each one's name, type hints and
    docstring to describe it to Gemini, so keep the docstrings accurate.

    context holds what the request knows: user location, hour, data mode, and a list
    that collects help drafts and tool calls for the response.
    """
    mode = context["mode"]
    hour = context["hoursAhead"]

    def lookupPlace(name: str) -> dict:
        """Find the latitude and longitude of a town or campus in Western New York, e.g. "Orchard Park", "Jamestown" or "UB North Campus". Use name "me" for the user's own location."""
        if ((name.strip().lower() in ("me", "my location", "here")) and (context["userLat"] is not None)):
            return dict(name="your location", lat=context["userLat"], lon=context["userLon"])
        town = places.findTown(name)
        if (town is None):
            return dict(error="No town called %s in this app's list." % name)
        return dict(name=town["name"], lat=town["lat"], lon=town["lon"])

    def getConditions(lat: float, lon: float, hoursAhead: int = 0) -> dict:
        """Snow at a point: storm total so far (inches), current rate (inches per hour), snow expected in the next 6 hours, and risk level (low, med, high). hoursAhead is 0 (now) to 24."""
        hoursAhead = max(0, min(24, int(hoursAhead)))
        result = snowModel.getConditions(mode, lat, lon, hoursAhead)
        result["nearest_town"] = places.nearestTown(lat, lon)["name"]
        result["hours_ahead"] = hoursAhead
        return result

    def getHighRiskAreas(hoursAhead: int = 0) -> list:
        """Towns at medium or high risk at the given time, worst first. hoursAhead is 0 (now) to 24."""
        hoursAhead = max(0, min(24, int(hoursAhead)))
        rows = list()
        for town in places.townList:
            if (town["listed"] == False):
                continue
            conditions = snowModel.getConditions(mode, town["lat"], town["lon"], hoursAhead)
            if (conditions["level"] != "low"):
                rows.append(dict(town=town["name"], **conditions))
        rows.sort(key=lambda row: row["risk"], reverse=True)
        return rows

    def getRouteRisk(fromLat: float, fromLon: float, toLat: float, toLon: float, hoursAhead: int = 0) -> dict:
        """Driving route between two points with its worst snow risk, minutes, miles, and whether a safer alternative exists."""
        hoursAhead = max(0, min(24, int(hoursAhead)))
        plan = routing.planRoutes([fromLon, fromLat], [toLon, toLat], mode, hoursAhead)
        summarize = lambda route: None if (route is None) else dict(
            minutes=route["minutes"], miles=route["miles"], level=route["level"],
            high_risk_stretches=len(route["red_stretches"]))
        return dict(fastest=summarize(plan["fastest"]), safer=summarize(plan["safer"]), source=plan["source"], note=plan["note"])

    def findResources(lat: float, lon: float, kind: str = "") -> list:
        """Nearest help locations to a point. kind is one of: warming_center, shelter, police, government, or empty for all."""
        return places.nearbyResources(lat, lon, kind, 4)

    def getActiveAlerts() -> list:
        """Active National Weather Service alerts for Western New York (live data)."""
        try:
            return nws.fetchActiveAlerts()
        except Exception as error:
            return [dict(error="NWS alerts unavailable right now: %s" % error)]

    def draftHelpRequest(kind: str, note: str) -> dict:
        """Prepare (not send) a help request the user can review and send to neighbors and emergency contacts. kind is one of: stuck, no_heat, medical, supplies, check_on_me. note is a short description in the user's words."""
        draft = dict(kind=kind, note=note)
        context["helpDrafts"].append(draft)
        return dict(status="drafted", message="The app is showing this to the user to review. Nothing has been sent yet.")

    return [lookupPlace, getConditions, getHighRiskAreas, getRouteRisk, findResources, getActiveAlerts, draftHelpRequest]


def describeContext(context: dict) -> str:
    """Facts Gemini needs on every turn, sent along with the system rules."""
    lines = list()
    if (context["mode"] == "replay"):
        lines.append("Data source: %s. These numbers are sample data." % snowModel.getScenario("replay")["label"])
    elif (snowModel.dataSource("live") == "nws"):
        lines.append("Data source: National Weather Service gridded snowfall forecast, blended between towns. Totals cover the last 12 hours plus the forecast ahead.")
    else:
        lines.append("Data source: sample storm model, because live NWS data is unavailable right now. These numbers are sample data.")
    lines.append("The user is looking at the map %s." % ("now" if (context["hoursAhead"] == 0) else "%d hours ahead" % context["hoursAhead"]))
    if (context["userLat"] is not None):
        town = places.nearestTown(context["userLat"], context["userLon"])
        lines.append("User location: %.4f, %.4f (near %s)." % (context["userLat"], context["userLon"], town["name"]))
    else:
        lines.append("User location: unknown. Ask where they are if it matters.")
    return "\n".join(lines)


def runChat(messages: list, userLat, userLon, hoursAhead: int, mode: str) -> dict:
    """messages: [{role: "user" | "assistant", text}], oldest first, ending with the user."""
    if (settings.geminiApiKey == ""):
        return dict(reply="Gemini isn't connected yet. Add GEMINI_API_KEY to backend/.env and restart the backend.",
                    tool_calls=list(), help_draft=None)

    from google import genai
    from google.genai import types

    context = dict(mode=mode, hoursAhead=hoursAhead, userLat=userLat, userLon=userLon, helpDrafts=list())
    contents = list()
    for message in messages[-12:]:
        role = "model" if (message["role"] == "assistant") else "user"
        contents.append(types.Content(role=role, parts=[types.Part(text=message["text"])]))

    # Fail fast and try the next model when one is overloaded (503), instead of hanging
    client = genai.Client(api_key=settings.geminiApiKey,
                          http_options=types.HttpOptions(timeout=25000, retry_options=types.HttpRetryOptions(attempts=1)))
    models = list(dict.fromkeys([settings.geminiModel] + FALLBACK_MODELS))
    response = None
    for model in models:
        context["helpDrafts"] = list()
        try:
            response = client.models.generate_content(
                model=model,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_RULES + "\n\n" + describeContext(context),
                    tools=buildTools(context),
                    automatic_function_calling=types.AutomaticFunctionCallingConfig(maximum_remote_calls=8),
                ),
            )
            break
        except Exception as error:
            logger.warning("Gemini model %s failed: %s", model, error)
    if (response is None):
        return dict(reply="Gemini is busy right now. Try again in a minute. If anyone's life may be in danger, call 911.",
                    tool_calls=list(), help_draft=None)

    # Pull the tool calls out of the SDK's call history so the UI can show what Gemini checked
    toolCalls = list()
    for content in (response.automatic_function_calling_history or list()):
        for part in (content.parts or list()):
            if (part.function_call is not None):
                toolCalls.append(dict(name=part.function_call.name, args=dict(part.function_call.args or dict())))

    replyText = response.text or "I couldn't put together an answer. Try asking another way."
    helpDraft = context["helpDrafts"][-1] if (len(context["helpDrafts"]) > 0) else None
    return dict(reply=replyText.strip(), tool_calls=toolCalls, help_draft=helpDraft)
