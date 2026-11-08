"""
Help notifications (Role 4)
---------------------------
Sends a help alert to a user's emergency contacts by email and SMS.

  Email: any SMTP server (a Gmail account with an app password works for a demo).
  SMS:   Twilio. Heads-up from Twilio's trial docs: a trial account can only text up to
         five verified numbers and can only send Twilio's own template messages, so the
         custom alert text below needs an upgraded account.

When a channel's settings are missing, that channel runs as a "dry run": it logs what it
would have sent and reports status "dry_run". The rest of the app works the same.
"""
import logging
import smtplib
from email.message import EmailMessage

from app import settings

logger = logging.getLogger("snowbelt.notify")

KIND_TEXT = dict(
    stuck="is snowed in and can't get out",
    no_heat="has lost heat or power",
    medical="needs medical supplies or help",
    supplies="needs food or supplies",
    check_on_me="asked someone to check on them",
)


def buildAlertText(displayName: str, kind: str, note: str, lat: float, lon: float) -> str:
    if (kind == "safe"):
        lines = ["Snowbelt update: %s marked themselves safe and ready for the storm." % displayName]
        if (note.strip() != ""):
            lines.append("Note: %s" % note.strip())
        return "\n".join(lines)
    what = KIND_TEXT.get(kind, "asked for help")
    lines = list()
    lines.append("Snowbelt help alert: %s %s." % (displayName, what))
    if (note.strip() != ""):
        lines.append("Note: %s" % note.strip())
    lines.append("Location: https://maps.google.com/?q=%.5f,%.5f" % (lat, lon))
    if (len(settings.frontendOrigins) > 0):
        lines.append("Say you're on your way (sign in, then tap \"I can help\"): %s/#community" % settings.frontendOrigins[0])
    lines.append("If this is an emergency, call 911.")
    return "\n".join(lines)


def sendEmail(toAddress: str, subject: str, bodyText: str) -> str:
    if ((settings.smtpHost == "") or (settings.smtpUser == "")):
        logger.info("[dry run] email to %s: %s", toAddress, bodyText)
        return "dry_run"
    message = EmailMessage()
    message["From"] = settings.emailFrom
    message["To"] = toAddress
    message["Subject"] = subject
    message.set_content(bodyText)
    with smtplib.SMTP(settings.smtpHost, settings.smtpPort, timeout=15) as server:
        server.starttls()
        server.login(settings.smtpUser, settings.smtpPassword)
        server.send_message(message)
    return "sent"


def sendSms(toNumber: str, bodyText: str) -> str:
    if ((settings.twilioAccountSid == "") or (settings.twilioFromNumber == "")):
        logger.info("[dry run] sms to %s: %s", toNumber, bodyText)
        return "dry_run"
    from twilio.rest import Client
    client = Client(settings.twilioAccountSid, settings.twilioAuthToken)
    client.messages.create(to=toNumber, from_=settings.twilioFromNumber, body=bodyText)
    return "sent"


def sendHelpAlerts(displayName: str, kind: str, note: str, lat: float, lon: float, contacts: list) -> list:
    """Alert every contact on every channel they have. Returns one result per attempt."""
    bodyText = buildAlertText(displayName, kind, note, lat, lon)
    results = list()
    for contact in contacts:
        email = (contact.get("email") or "").strip()
        phone = (contact.get("phone") or "").strip()
        if (email != ""):
            try:
                subject = ("Snowbelt: %s is safe" % displayName) if (kind == "safe") else ("Snowbelt: %s needs help" % displayName)
                status = sendEmail(email, subject, bodyText)
            except Exception as error:
                logger.warning("email to %s failed: %s", email, error)
                status = "failed"
            results.append(dict(channel="email", to=email, status=status))
        if (phone != ""):
            try:
                status = sendSms(phone, bodyText)
            except Exception as error:
                logger.warning("sms to %s failed: %s", phone, error)
                status = "failed"
            results.append(dict(channel="sms", to=phone, status=status))
    return results
