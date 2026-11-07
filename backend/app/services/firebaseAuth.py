"""
Firebase sign-in check (Role 4)
-------------------------------
The frontend signs people in with Firebase Auth and sends the ID token as
"Authorization: Bearer <token>". This checks that token with firebase-admin.

Without FIREBASE_CREDENTIALS (a service-account JSON path) the backend runs in dev mode:
every request is treated as user "dev-user" so the team can test before Firebase is set up.
Never demo the help alerts publicly in dev mode.
"""
import logging

from fastapi import HTTPException, Request

from app import settings

logger = logging.getLogger("snowbelt.auth")
firebaseApp = None

if (settings.firebaseCredentialsPath != ""):
    import firebase_admin
    from firebase_admin import credentials
    firebaseApp = firebase_admin.initialize_app(credentials.Certificate(settings.firebaseCredentialsPath))


def getCurrentUser(request: Request) -> dict:
    """FastAPI dependency: returns {uid, name, email} or raises 401."""
    if (firebaseApp is None):
        logger.warning("FIREBASE_CREDENTIALS not set: accepting request as dev-user")
        return dict(uid="dev-user", name="Dev User", email="")
    header = request.headers.get("Authorization", "")
    if (header.startswith("Bearer ") == False):
        raise HTTPException(status_code=401, detail="Sign in first.")
    from firebase_admin import auth
    try:
        decoded = auth.verify_id_token(header.removeprefix("Bearer "))
    except Exception:
        raise HTTPException(status_code=401, detail="Your sign-in expired. Sign in again.")
    return dict(uid=decoded["uid"], name=decoded.get("name", ""), email=decoded.get("email", ""))
