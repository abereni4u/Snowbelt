"""
Smoke tests: every endpoint answers, and its response has the same fields as its example
in shared/contracts/. If a test here fails after you change a response, update the
contract file (and frontend/src/types.ts) in the same pull request.

GET /api/alerts is not tested because it calls the live NWS API.
"""
import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
contractsDir = Path(__file__).resolve().parents[2] / "shared" / "contracts"
ubNorth = dict(lat=43.001, lon=-78.789)


def loadExample(fileName: str):
    return json.loads((contractsDir / fileName).read_text())["example"]


def firstItem(value):
    if isinstance(value, list):
        assert (len(value) > 0), "expected a non-empty list"
        return value[0]
    return value


def assertSameFields(actual, expected, label: str):
    actualKeys = set(firstItem(actual).keys())
    expectedKeys = set(firstItem(expected).keys())
    assert (actualKeys == expectedKeys), (
        "%s: response and shared/contracts disagree. Missing from response: %s. Not in contract: %s."
        % (label, sorted(expectedKeys - actualKeys), sorted(actualKeys - expectedKeys)))


def getOk(path: str, **params):
    response = client.get(path, params=params)
    assert (response.status_code == 200), response.text
    return response.json()


def postOk(path: str, body: dict):
    response = client.post(path, json=body)
    assert (response.status_code == 200), response.text
    return response.json()


def test_health():
    assert (getOk("/api/health")["ok"] is True)


def test_risk():
    actual = getOk("/api/risk", hours_ahead=0, mode="live")
    expected = loadExample("risk.json")
    assertSameFields(actual, expected, "risk")
    assertSameFields(actual["features"], expected["features"], "risk feature")
    assertSameFields(actual["features"][0]["properties"], expected["features"][0]["properties"], "risk cell properties")


def test_risk_replay():
    assert (len(getOk("/api/risk", hours_ahead=6, mode="replay")["features"]) > 0)


def test_conditions():
    assertSameFields(getOk("/api/conditions", hours_ahead=0, mode="live", **ubNorth), loadExample("conditions.json"), "conditions")


def test_areas():
    assertSameFields(getOk("/api/areas", hours_ahead=0, mode="live"), loadExample("areas.json"), "areas")


def test_resources():
    assertSameFields(getOk("/api/resources", limit=5, **ubNorth), loadExample("resources.json"), "resources")


def test_route():
    example = loadExample("route.json")
    actual = postOk("/api/route", example["request"])
    assertSameFields(actual, example["response"], "route")
    assertSameFields(actual["fastest"], example["response"]["fastest"], "route.fastest")


def test_chat_without_key():
    example = loadExample("chat.json")
    actual = postOk("/api/chat", example["request"])
    assertSameFields(actual, example["response"], "chat")
    assert ("GEMINI_API_KEY" in actual["reply"])


def test_help_notify_dry_run():
    example = loadExample("help-notify.json")
    actual = postOk("/api/help/notify", example["request"])
    assertSameFields(actual, example["response"], "help/notify")
    assertSameFields(actual["results"], example["response"]["results"], "help/notify result")
