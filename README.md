# Snowbelt

Lake-effect snow can bury one Buffalo neighborhood while the next one stays clear. Snowbelt shows where the snow is piling up, tells you whether your drive crosses it, and connects you with neighbors and emergency contacts when you're stuck. A Gemini assistant does the heavy lifting: it looks up conditions, checks routes, finds shelters and drafts help requests from plain-language questions.

Built at UB Hacking 2026 for the Gemini track.

> **Deadlines (Sun Nov 8):** Devpost draft due at 12:00, final submission 12:30 PM. We create the Devpost draft by midnight tonight either way, so the "12" can't catch us out.

## What's in the starter

Everything runs today on **sample data**, and every outside service is optional: a missing key falls back to sample data or a dry run instead of crashing.

| Piece | Status now | Next step |
| --- | --- | --- |
| Map with snowfall grid, help pins, Live/Future slider, 2022 replay | Works on a sample storm model | Wire live NWS data, port the prototype look |
| Area conditions + "Areas with high risk" list | Works | Dial gauges from `docs/ui-prototype.html` |
| Gemini assistant with 7 tools | Works once `GEMINI_API_KEY` is set | Tune prompt, add tools, test 10 real questions |
| Routes (fastest vs. safer) | Straight-line mock | Add `ORS_API_KEY` for real roads, draw routes on the map |
| Sign-in, emergency contacts, neighbor help board | Code done, needs a Firebase project | Create the project, publish the rules |
| Email + SMS help alerts | Dry run (logs only) | Gmail app password, Twilio |
| NWS alerts banner | Live (no key needed) | — |

`docs/ui-prototype.html` is the clickable design from the whiteboard sketch. Open it in a browser for the look we're aiming for.

## Run it locally

You need Python 3.11+ and Node 20+.

**Backend** (terminal 1):

```bash
cd backend
python3 -m venv .venv              # Windows: py -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt   # app packages plus pytest
cp .env.example .env               # fill in whatever keys you have
uvicorn app.main:app --reload --reload-dir app   # watch only app/, or .venv changes restart it mid-request
```

Check http://localhost:8000/api/health (shows which services are connected) and http://localhost:8000/docs (try every endpoint).

**Frontend** (terminal 2):

```bash
cd frontend
npm install
cp .env.example .env.local         # Firebase web config goes here
npm run dev
```

Open http://localhost:5173. Vite forwards `/api` calls to the backend.

## Who owns what

Each role owns its own files, so we rarely edit the same file at the same time. Pick owners at kickoff and put your GitHub name in the table. `AGENTS.md` repeats this file list for AI coding tools, so if ownership changes, update both.

| Role | Owner | Owns | First goals |
| --- | --- | --- | --- |
| 1. Gemini assistant (track centerpiece) | | `backend/app/services/geminiAgent.py`, `backend/app/routers/chat.py`, `frontend/src/components/ChatPanel.tsx` | Get a key, confirm tool calls work, write 10 test questions and fix bad answers, add a "compare to past storms" tool |
| 2. Weather data + routes | | `backend/app/services/snowModel.py`, `nws.py`, `routing.py`, `places.py`, `data/towns.json`, `routers/weather.py`, `routers/routing.py` | ORS key and real routes, live NWS snowfall behind `USE_LIVE_NWS`, tune risk thresholds on the replay, deploy backend |
| 3. Frontend + map | | `frontend/src/App.tsx`, `MapView.tsx`, `TimeControl.tsx`, `AreaPanel.tsx`, `RiskList.tsx`, `styles.css` | Prototype look, gauges, draw fastest/safer routes on the map, phone layout, deploy frontend |
| 4. Community + accounts + alerts | | `frontend/src/firebase.ts`, `HelpPanel.tsx`, `firebase/firestore.rules`, `backend/app/services/notify.py`, `firebaseAuth.py`, `backend/app/routers/community.py`, `backend/app/data/resources.json` | Firebase project, email alerts, Twilio, replace sample pins with a verified shelter list |

Everyone: Devpost write-up and demo. AJ cuts the demo video.

## Timeline (Sat Nov 7 to Sun Nov 8)

| When | Checkpoint |
| --- | --- |
| Sat 5:30 PM | Everyone runs both halves locally; keys requested (Gemini, Firebase, ORS, Twilio, Gmail app password) |
| Sat 9:00 PM | Thin slice: Gemini answers a route question with real tool calls; sign-in works; a help request reaches the board |
| Sat 11:30 PM | Devpost draft exists (title, pitch, team, repo link) |
| Sun 3:00 AM | Real routes, live NWS alerts, email alerts sent for real, replay looks right |
| Sun 8:00 AM | Feature freeze. Deploy both halves. Only fixes after this |
| Sun 10:00 AM | Demo video recorded, backup copy saved |
| Sun 12:00 PM | Devpost complete |
| Sun 12:30 PM | Final submission |

If you're behind at a checkpoint, cut in this order: SMS → live NWS snowfall (keep sample model + live alerts) → safer-route rerouting → the replay. Never cut: the Gemini assistant, the map, the help request flow.

## Keys and accounts

Share keys in the team chat, never in the repo. `.env` and `.env.local` are git-ignored.

| What | Who | Where | Goes in |
| --- | --- | --- | --- |
| Gemini API key | Role 1 | https://aistudio.google.com/apikey | `backend/.env` `GEMINI_API_KEY` |
| Firebase project | Role 4 | https://console.firebase.google.com: turn on Authentication (Google provider) and Firestore, add a Web app | Web config in `frontend/.env.local`; service-account JSON path in `backend/.env` `FIREBASE_CREDENTIALS`; paste `firebase/firestore.rules` into the Rules tab |
| openrouteservice key | Role 2 | https://openrouteservice.org (free) | `backend/.env` `ORS_API_KEY` |
| Email | Role 4 | A Gmail account with an app password | `SMTP_*` and `EMAIL_FROM` in `backend/.env` |
| SMS | Role 4 | https://www.twilio.com (trial) | `TWILIO_*` in `backend/.env` |

Twilio's trial only texts up to five verified numbers and only sends Twilio's own template messages, so our custom alert text needs an upgraded account. For the demo, email plus the in-app board is enough; show SMS only if someone upgrades.

## API

Example requests and responses for every endpoint are in `shared/contracts/`. If you change a response shape, update the example file in the same pull request.

| Endpoint | Owner | What it returns |
| --- | --- | --- |
| `GET /api/risk?hours_ahead=0-24&mode=live\|replay` | 2 | GeoJSON grid of ~3 km cells with snow totals, rate and risk level |
| `GET /api/conditions?lat&lon&hours_ahead&mode` | 2 | Conditions at one point |
| `GET /api/areas?hours_ahead&mode` | 2 | Every town, worst first |
| `GET /api/alerts` | 2 | Live NWS alerts for Buffalo |
| `POST /api/route` | 2 | Fastest and safer routes, each with a risk level |
| `GET /api/resources?lat&lon&type` | 4 | Nearest warming centers, shelters, police and government sites |
| `POST /api/help/notify` | 4 | Emails/texts the signed-in user's emergency contacts |
| `POST /api/chat` | 1 | Gemini's reply, the tools it called, and an optional help-request draft |
| `GET /api/health` | — | Which services are configured |

## How Gemini does the real work

The chat endpoint gives Gemini seven Python functions (`lookupPlace`, `getConditions`, `getHighRiskAreas`, `getRouteRisk`, `findResources`, `getActiveAlerts`, `draftHelpRequest`). For each question, Gemini decides which to call, the google-genai SDK runs them, and Gemini answers from the results. The response lists every tool call, and the chat panel shows them under each answer, which is the clearest thing to show judges.

Gemini never sends an alert by itself. `draftHelpRequest` fills in the help form, and the person confirms and sends it.

## Safety rules for the help feature

- The app says "call 911 first" wherever someone asks for help, and Gemini is told the same. Snowbelt does not contact emergency services.
- Neighbors see a location rounded to about half a mile; only the person's own emergency contacts get the exact spot.
- Alerts are limited to 3 per person per 10 minutes.
- Without `FIREBASE_CREDENTIALS` the backend accepts every request as a dev user. Fine for testing, never for the public demo.

## Working together

- Make a branch per task (`role1/route-tool`, `role3/gauges`), open a pull request into `main`, and merge your own once it runs and CI is green. Keep pull requests small; aim to merge every hour or two.
- `main` must always start. Pull before you start something new, including before each new AI session.
- Don't commit keys. If one slips into a commit, tell the team and rotate it.
- **AI agents:** `AGENTS.md` holds the rules every coding agent should follow (Claude Code reads it through `CLAUDE.md`, Gemini CLI through `GEMINI.md`; Cursor, Codex and Copilot read `AGENTS.md` directly). The main ones: stay in your role's files, ask before touching shared files, keep `shared/contracts/` in sync, never invent shelter data. Read your agent's diff before you merge, since you'll have to explain it to judges.
- **CI** (`.github/workflows/ci.yml`) runs on every pull request: backend tests (`cd backend && pytest`, offline, no keys needed) and the frontend build (`cd frontend && npm run build`). Run both before pushing. The backend tests also fail when a response no longer matches its example in `shared/contracts/`.
- Shared files (`main.py`, `settings.py`, `requirements*.txt`, `package.json`, `api.ts`, `types.ts`, `shared/contracts/`): say in the team chat before changing one. If two people add packages at once, keep both and regenerate `package-lock.json` with `npm install`.

## Data sources

- National Weather Service API (forecasts, alerts): https://www.weather.gov/documentation/services-web-api
- openrouteservice (routing): https://openrouteservice.org
- OpenStreetMap (map tiles): https://www.openstreetmap.org/copyright
- Planned: Open-Meteo historical weather for real replay data, NOHRSC snowfall analysis for checking the model.
