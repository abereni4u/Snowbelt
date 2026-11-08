# Instructions for AI coding agents

Snowbelt is a hackathon app (UB Hacking 2026, Gemini track) built by four people, each working with an AI agent at the same time. These rules keep the agents from colliding. Final submission is **Sun Nov 8, 12:30 PM**, so prefer small, working changes over big rewrites.

Read `README.md` for what the app does, how to set it up, and the API.

## Commands

```bash
# Backend (from backend/, with .venv active)
uvicorn app.main:app --reload --reload-dir app
pytest                      # needs: pip install -r requirements-dev.txt

# Frontend (from frontend/)
npm run dev
npm run build               # type-checks, then builds
```

Before you say a task is done, run `pytest` in `backend/` and `npm run build` in `frontend/`. Both must pass. CI runs the same two checks on every pull request.

## Stay in your role's files

Ask the person which role they are working on if you don't know. Edit only that role's files:

| Role | Files |
| --- | --- |
| 1. Gemini assistant | `backend/app/services/geminiAgent.py`, `backend/app/routers/chat.py`, `frontend/src/components/ChatPanel.tsx` |
| 2. Weather data + routes | `backend/app/services/snowModel.py`, `nws.py`, `routing.py`, `places.py`, `backend/app/data/towns.json`, `backend/app/routers/weather.py`, `routing.py` |
| 3. Frontend + map | `frontend/src/App.tsx`, `main.tsx`, `styles.css`, `components/MapView.tsx`, `SnowLayer.tsx`, `TimeControl.tsx`, `AreaPanel.tsx`, `RiskList.tsx`, `LocationSearch.tsx`, `ReadinessPanel.tsx`, `RoutePanel.tsx`, `ShelterList.tsx`, `Snowfall.tsx` |
| 4. Community + alerts | `frontend/src/firebase.ts`, `components/HelpPanel.tsx`, `VolunteerHub.tsx`, `firebase/`, `backend/app/services/notify.py`, `firebaseAuth.py`, `backend/app/routers/community.py`, `backend/app/data/resources.json` |

Shared files: `backend/app/main.py`, `backend/app/settings.py`, `backend/requirements*.txt`, `backend/.env.example`, `frontend/package.json`, `frontend/package-lock.json`, `frontend/.env.example`, `frontend/src/api.ts`, `frontend/src/types.ts`, `shared/contracts/`, `README.md`, `AGENTS.md`, `.github/`.

If the task needs a change outside the role's files, or any change to a shared file, stop and tell the person what you would change and why, so they can check with the owner. Make the change only after they say so.

## Rules

1. **API shapes are a contract.** If a response shape changes, update the router, the example in `shared/contracts/`, and `frontend/src/types.ts` in the same change. `backend/tests/test_api.py` fails when a response and its contract file disagree.
2. **Every outside service stays optional.** Gemini, openrouteservice, live NWS, Firebase, email and SMS must keep falling back to sample data or a dry run when their key is missing. Never make the app require a key to start.
3. **Secrets.** Never read, print, or commit `.env` or `.env.local`, and never hard-code a key. New settings go in `settings.py` and the matching `.env.example` with an empty value.
4. **Safety.** Keep the "call 911 first" wording wherever someone asks for help. Gemini must never send an alert by itself; it only drafts one for the person to confirm. Never invent shelters, phone numbers or addresses: every real entry in `resources.json` needs a `source_url`, and anything unverified stays `"sample": true`.
5. **New dependencies.** Ask before adding a package. If the person agrees, update `requirements.txt` or `package.json` and `package-lock.json` in the same change.
6. **Keep the diff small.** Don't reformat, rename or "clean up" code the task doesn't need. Match the existing style: camelCase names in Python and TypeScript, `dict(...)` and `list()` in Python, comments only where the reason isn't obvious.
7. **Git.** Work on a branch named `role<N>/<task>` (for example `role1/past-storms-tool`), pull `main` before starting, and open a small pull request. Never push to `main` directly, force-push, or rewrite shared history. Commits and pull requests are authored by the person only: don't add `Co-Authored-By`, `Generated with`, session-link or any other AI attribution lines.
