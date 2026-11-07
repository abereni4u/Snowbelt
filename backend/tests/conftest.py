"""
Tests always run offline on sample data, even if your backend/.env has real keys.

The keys are blanked here, before the app is imported. load_dotenv() never overrides a
variable that is already set, so no test can call Gemini, send an email or text, or
sign in to Firebase.
"""
import os

for name in ["GEMINI_API_KEY", "ORS_API_KEY", "FIREBASE_CREDENTIALS", "SMTP_HOST", "SMTP_USER",
             "SMTP_PASSWORD", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"]:
    os.environ[name] = ""
os.environ["USE_LIVE_NWS"] = "false"
