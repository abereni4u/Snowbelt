"""
Settings
--------
Reads configuration from backend/.env (copy .env.example to .env and fill it in).

Every outside service is optional. When a key is missing, that feature falls back to
sample data or a "dry run" that only logs, so the app always starts and the demo never
depends on a key someone forgot to share.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

backendDir = Path(__file__).resolve().parent.parent
load_dotenv(backendDir / ".env")


def readEnv(name: str, defaultValue: str = "") -> str:
    return os.getenv(name, defaultValue).strip()


# Gemini (Role 1). The SDK also reads GEMINI_API_KEY on its own.
geminiApiKey = readEnv("GEMINI_API_KEY")
geminiModel = readEnv("GEMINI_MODEL", "gemini-3.8-flash")

# Weather + routing (Role 2)
useLiveNws = (readEnv("USE_LIVE_NWS", "true").lower() == "true")   # NWS needs no key; set false to use the sample storm
nwsUserAgent = readEnv("NWS_USER_AGENT", "(snowbelt-hackathon, github.com/abereni4u/Snowbelt_UBHacking2026)")
orsApiKey = readEnv("ORS_API_KEY")

# Accounts + notifications (Role 4)
firebaseCredentialsPath = readEnv("FIREBASE_CREDENTIALS")   # path to a service-account JSON file
smtpHost = readEnv("SMTP_HOST")
smtpPort = int(readEnv("SMTP_PORT", "587"))
smtpUser = readEnv("SMTP_USER")
smtpPassword = readEnv("SMTP_PASSWORD")
emailFrom = readEnv("EMAIL_FROM", smtpUser)
twilioAccountSid = readEnv("TWILIO_ACCOUNT_SID")
twilioAuthToken = readEnv("TWILIO_AUTH_TOKEN")
twilioFromNumber = readEnv("TWILIO_FROM_NUMBER")

# Which browser origins may call the API
frontendOrigins = [origin.strip() for origin in readEnv("FRONTEND_ORIGINS", "http://localhost:5173").split(",") if (origin.strip() != "")]
