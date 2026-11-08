# Snowbelt

Lake-effect snow can bury one Buffalo neighborhood while the next one stays clear. Snowbelt shows where the snow is piling up across Western New York, tells you whether your drive crosses it, and connects you with neighbors and emergency contacts when you're stuck. A Gemini assistant does the heavy lifting: it looks up conditions, checks routes, finds shelters and drafts help requests from plain-language questions.

Built at UB Hacking 2026 for the Gemini track.

> **Deadlines (Sun Nov 8):** Devpost draft due at 12:00, final submission 12:30 PM. We create the Devpost draft by midnight tonight either way, so the "12" can't catch us out.

## What works now

Snowbelt runs on **live data** wherever a key is set, and every outside service stays optional: a missing key or a failed call falls back to sample data or a dry run instead of crashing. `GET /api/health` shows which services are connected.

| Piece | Status now | Next step |
| --- | --- | --- |
| Snowfall map: NWS forecast sampled at every town and blended, drawn as outlined 1-3", 3-6", ... bands; hover any spot for exact inches and in/hr | Live by default (`USE_LIVE_NWS=true`). Falls back to the sample storm if NWS is down. The Dec 2022 replay stays available | — |
| Live/Future slider (past 12 hours to 24 hours ahead) and the 2022 replay | Works | — |
| Location search (town or county drives the whole page) | Works | — |
| Area conditions + "Areas with high risk" list (first 6, "Show all") | Works | Dial gauges from `docs/ui-prototype.html` |
| Gemini assistant with 7 tools | Works once `GEMINI_API_KEY` is set. If a model is overloaded (503), it tries a backup model, then says "Gemini is busy" | Test 10 real questions |
| Route panel: fastest vs. safer, drawn on the map | Real roads from openrouteservice. Straight-line estimates without a key or when the call fails | — |
| Map pins: hover or tap for type, distance in km, status, address, phone, website and listed capacity | Works | — |
| Shelters & community centers | Buffalo City Mission (Code Blue) shelters, Buffalo City Hall and 8 Erie County police departments are verified with sources. The rest are still marked Sample | Verify the remaining warming centers |
| Sign-in with Google, profiles, emergency contacts | Works (Firebase project `snowbelt-2adb2`) | — |
| Storm readiness checklist | Saved to the profile. All Have: "Tell my contacts I'm safe". Items marked Need have three options: **request from my circle** (emails/texts your emergency contacts the list), **request from the volunteer hub** (one supplies request on the neighbor board), or **ask Gemini** which shelters could help and how safe the drive is | — |
| Ask for help + neighbor board | Priority order, "I can help" with an ETA, live "on the way" status, 10-minute escalation to the nearest shelter and 2-1-1, rate the helper afterwards | — |
| Volunteer hub | Sign up with skills; ratings come only from people helped; report a volunteer. Volunteers whose skills fit your readiness list come first. No ID check yet, so nothing says "verified" | — |
| Email + SMS alerts | Email sends once `SMTP_*` is set. SMS is a dry run | Twilio (optional) |
| NWS alerts banner and storm warning ping | Live for all eight WNY counties (no key needed) | — |
| Sticky header with section links | Works on desktop and phones | — |

## Next steps

Pull `main` before you start, then work on a `role<N>/<task>` branch as usual.

**If the assistant hangs:** set `GEMINI_MODEL=gemini-3.6-flash` in `backend/.env` and restart the backend. `gemini-3.5-flash` also works.

**Role 1: Gemini assistant**
- [x] When Gemini returns 503 or times out, fall back to another model, then reply "Gemini is busy" instead of hanging.
- [ ] Mark a few checklist items as Need and press "Ask Gemini how to get these". Make sure the answer names real nearby resources and mentions 2-1-1, and never invents stores or phone numbers.
- [ ] Write 10 test questions (drive, shelter, stuck, "wait or go now?") and fix bad answers.
- [ ] Optional: a "compare to past storms" tool (2014 Snowvember, Dec 2022 blizzard).

**Role 2: Weather data + routes**
- [x] Live NWS snowfall, on by default, with the sample storm as the fallback.
- [x] Real routes from openrouteservice, with the straight-line mock when the call fails.
- [ ] Tune risk thresholds on the Dec 2022 replay so East Buffalo, Cheektowaga and Lackawanna light up the way they did.
- [x] Deploy the backend (see Deploying below).

**Role 3: Frontend + map**
- [x] Sticky header nav, two-column desktop layout, phone layout.
- [x] Snowfall bands with outlines and a hover readout; pin hover cards.
- [ ] Optional: a "regions to avoid" map layer from the high-risk cells, a radar-style close-up around the searched place with mile rings.
- [x] Deploy the frontend (see Deploying below).

**Role 4: Community + alerts**
- [x] Verified Buffalo City Mission shelters and Erie County police departments (address, phone, website, `source_url`).
- [ ] Replace the remaining sample warming centers and shelters with verified ones. Each needs a `source_url` and drops `"sample": true`. Listings with "24/7" hours show a green "Open" badge.
- [x] ETA on claims, priority order, escalation, ratings, volunteer hub, readiness saved to the profile, "I'm safe" updates, volunteer requests from the readiness list.
- [ ] Make sure the latest `firebase/firestore.rules` is published (Firebase console > Firestore > Rules). Without it the volunteer hub and ratings get "permission denied".
- [ ] Optional: Twilio for SMS.

**Everyone**
- [ ] Pick one name, Snowbelt or Cold Path, before the video and Devpost.
- [ ] Rehearse the demo: replay Dec 2022 → search "East Buffalo" → hover the snow bands and a shelter pin → fill the checklist → request the missing items from your circle or the volunteer hub, or ask Gemini about shelters → safer route to a shelter → a volunteer claims the request with an ETA → rate them → ranked risk list → `/docs` as the open API.
- [ ] Run `pytest` and `npm run build` before every push.

### Test volunteers

To give the volunteer hub something to show, add five clearly marked test volunteers with ratings (each shows a "Test" chip). This uses the backend's `FIREBASE_CREDENTIALS`:

```bash
cd backend && source .venv/bin/activate
python -m scripts.seedTestVolunteers            # add or refresh them
python -m scripts.seedTestVolunteers --remove   # delete them before the public demo
```

### Deploying

- **Frontend:** GitHub Pages at https://abereni4u.github.io/Snowbelt_UBHacking2026/. `.github/workflows/deploy-pages.yml` builds and publishes it on every push to `main`.
- **Backend:** Render's free plan, from `render.yaml`. It sleeps after 15 minutes idle; the next visit wakes it in about a minute, and the page says so while it waits.
- **Email/SMS:** left off on purpose in the hosted version, so public visitors only get dry-run alerts.

One-time setup:

1. GitHub repo > Settings > Pages > Source: **GitHub Actions**.
2. https://render.com > New > Blueprint > pick this repo. Enter `GEMINI_API_KEY` and `ORS_API_KEY` when asked. Then, in the `snowbelt-api` service > Environment > Secret Files, add `firebase-service-account.json` with the service-account JSON. Note the service URL.
3. GitHub repo > Settings > Secrets and variables > Actions > **Variables**: `VITE_API_BASE` (the Render URL) and the four `VITE_FIREBASE_*` values from `frontend/.env.local`. With the GitHub CLI: `gh variable set -f frontend/.env.local`, then `gh variable set VITE_API_BASE --body <render-url>`.
4. Firebase console > Authentication > Settings > Authorized domains: add `abereni4u.github.io`.
5. GitHub repo > Actions > Deploy frontend > Run workflow.

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
| 3. Frontend + map | | `frontend/src/App.tsx`, `MapView.tsx`, `SnowLayer.tsx`, `TimeControl.tsx`, `AreaPanel.tsx`, `RiskList.tsx`, `LocationSearch.tsx`, `ReadinessPanel.tsx`, `RoutePanel.tsx`, `ShelterList.tsx`, `Snowfall.tsx`, `styles.css` | Prototype look, gauges, phone layout, deploy frontend |
| 4. Community + accounts + alerts | | `frontend/src/firebase.ts`, `HelpPanel.tsx`, `VolunteerHub.tsx`, `firebase/firestore.rules`, `backend/app/services/notify.py`, `firebaseAuth.py`, `backend/app/routers/community.py`, `backend/app/data/resources.json` | Firebase project, email alerts, Twilio, replace sample pins with a verified shelter list |

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
| Firebase project (done: `snowbelt-2adb2`) | Role 4 | https://console.firebase.google.com: Authentication (Google provider) and Firestore are on; ask AJ for the web config and service account | Web config in `frontend/.env.local`; service-account JSON path in `backend/.env` `FIREBASE_CREDENTIALS`; paste `firebase/firestore.rules` into the Rules tab |
| openrouteservice key | Role 2 | https://openrouteservice.org (free) | `backend/.env` `ORS_API_KEY` |
| Email | Role 4 | A Gmail account with an app password | `SMTP_*` and `EMAIL_FROM` in `backend/.env` |
| SMS | Role 4 | https://www.twilio.com (trial) | `TWILIO_*` in `backend/.env` |

Twilio's trial only texts up to five verified numbers and only sends Twilio's own template messages, so our custom alert text needs an upgraded account. For the demo, email plus the in-app board is enough; show SMS only if someone upgrades.

## API

Example requests and responses for every endpoint are in `shared/contracts/`. If you change a response shape, update the example file in the same pull request.

| Endpoint | Owner | What it returns |
| --- | --- | --- |
| `GET /api/risk?hours_ahead=0-24&mode=live\|replay` | 2 | Snow totals and rates on a ~3 km grid over Western New York, as number arrays (the map draws them as one smooth layer) |
| `GET /api/conditions?lat&lon&hours_ahead&mode` | 2 | Conditions at one point |
| `GET /api/areas?hours_ahead&mode` | 2 | Every town, worst first |
| `GET /api/alerts` | 2 | Live NWS alerts for all eight Western New York counties |
| `POST /api/route` | 2 | Fastest and safer routes, each with a risk level |
| `GET /api/resources?lat&lon&type` | 4 | Nearest warming centers, shelters, police and government sites, with address, phone, website and capacity when known |
| `POST /api/help/notify` | 4 | Emails/texts the signed-in user's emergency contacts (a help request, or "I'm safe") |
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
- OpenStreetMap (map tiles, Buffalo City Hall): https://www.openstreetmap.org/copyright
- Code Blue shelters: https://www4.erie.gov/exec/press/wny-coalition-homeless-announces-code-blue-25-26-season and https://www.buffalocitymission.org/contact
- Erie County police contacts: https://www3.erie.gov/dhses/local-police-and-fire-contacts-erie-county-ny
- Every verified listing in `backend/app/data/resources.json` has its own `source_url`.
- Planned: Open-Meteo historical weather for real replay data, NOHRSC snowfall analysis for checking the model.
