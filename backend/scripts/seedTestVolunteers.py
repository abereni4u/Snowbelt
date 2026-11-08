"""
Test volunteers (Role 4)
------------------------
Adds a few clearly marked test volunteers, with ratings, to Firestore so the volunteer hub has
something to show. Every document has test=True and the hub shows a "Test" chip on them.

Uses the same service account as the backend (FIREBASE_CREDENTIALS in backend/.env).
The admin SDK skips the security rules, which only let people list themselves.

    cd backend && source .venv/bin/activate
    python -m scripts.seedTestVolunteers            # add (or refresh) the test volunteers
    python -m scripts.seedTestVolunteers --remove   # delete every test volunteer and rating
"""
import sys

import firebase_admin
from firebase_admin import credentials, firestore

from app import settings

VOLUNTEERS = [
    dict(id="test-jordan", name="Jordan R.", skills=["4x4 / AWD vehicle", "Groceries & pharmacy runs"], lat=42.83, lon=-78.82, stars=[5, 5, 5, 4, 5]),
    dict(id="test-priya", name="Priya K.", skills=["Snowblower", "Welfare checks"], lat=42.90, lon=-78.76, stars=[5, 4, 5, 5]),
    dict(id="test-marcus", name="Marcus T.", skills=["Generator", "Rides to shelters"], lat=42.85, lon=-78.80, stars=[4, 5, 4]),
    dict(id="test-dana", name="Dana L.", skills=["Shoveling"], lat=42.98, lon=-78.80, stars=[4, 4]),
    dict(id="test-sam", name="Sam W.", skills=["Rides to shelters", "4x4 / AWD vehicle"], lat=42.73, lon=-78.83, stars=[]),
]


def connect():
    if (settings.firebaseCredentialsPath == ""):
        sys.exit("Set FIREBASE_CREDENTIALS in backend/.env first.")
    firebase_admin.initialize_app(credentials.Certificate(settings.firebaseCredentialsPath))
    return firestore.client()


def remove(db):
    count = 0
    for collectionName in ["volunteers", "ratings"]:
        for snapshot in db.collection(collectionName).where("test", "==", True).stream():
            snapshot.reference.delete()
            count += 1
    print("Removed %d test documents." % count)


def seed(db):
    for person in VOLUNTEERS:
        db.collection("volunteers").document(person["id"]).set(dict(
            uid=person["id"], name=person["name"], skills=person["skills"],
            approxLat=person["lat"], approxLon=person["lon"], test=True, updatedAt=firestore.SERVER_TIMESTAMP))
        for index, stars in enumerate(person["stars"]):
            db.collection("ratings").document("%s-%d" % (person["id"], index)).set(dict(
                helperUid=person["id"], helperName=person["name"], raterUid="test-seed", stars=stars, test=True,
                createdAt=firestore.SERVER_TIMESTAMP))
    print("Added %d test volunteers." % len(VOLUNTEERS))


if (__name__ == "__main__"):
    database = connect()
    if ("--remove" in sys.argv):
        remove(database)
    else:
        seed(database)
