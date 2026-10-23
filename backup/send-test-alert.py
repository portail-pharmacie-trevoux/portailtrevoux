#!/usr/bin/env python3
"""Send an explicitly enabled synthetic alert through Gmail API HTTPS."""
import base64
import json
import os
import urllib.parse
import urllib.request
from email.message import EmailMessage

SENDER = "portailplustrevoux@gmail.com"
RECIPIENT = "pharmaciedetrevoux@gmail.com"

def send_alert(subject, body):
    """Send one synthetic-monitor alert; callers control when it is needed."""
    for name in ("GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"):
        if not os.getenv(name):
            raise RuntimeError(f"Missing required Gmail setting: {name}")
    payload = urllib.parse.urlencode({
        "client_id": os.environ["GMAIL_CLIENT_ID"],
        "client_secret": os.environ["GMAIL_CLIENT_SECRET"],
        "refresh_token": os.environ["GMAIL_REFRESH_TOKEN"],
        "grant_type": "refresh_token",
    }).encode()
    request = urllib.request.Request("https://oauth2.googleapis.com/token", data=payload, method="POST")
    with urllib.request.urlopen(request, timeout=20) as response:
        access_token = json.load(response)["access_token"]
    message = EmailMessage()
    message["From"] = SENDER
    message["To"] = RECIPIENT
    message["Subject"] = subject
    message.set_content(body)
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode().rstrip("=")
    request = urllib.request.Request(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        data=json.dumps({"raw": raw}).encode(),
        headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        result = json.load(response)
    if not result.get("id"):
        raise RuntimeError("Gmail API did not return a message ID")
    print("PASS: synthetic Gmail API alert accepted")

def main():
    if os.getenv("SEND_SYNTHETIC_TEST_EMAIL") != "YES":
        print("DRY RUN: synthetic Gmail alert disabled")
        return
    send_alert("[PORTAIL+] TEST - Alerte sauvegarde fictive", "Ceci est un TEST du système d’alerte Portail+. Aucune donnée réelle.")

if __name__ == "__main__":
    main()
