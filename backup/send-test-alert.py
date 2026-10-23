#!/usr/bin/env python3
"""Send a synthetic Portail+ test alert using Gmail SMTP. No database data."""
import os
import smtplib
import ssl
from email.message import EmailMessage

SENDER = "portailplustrevoux@gmail.com"
RECIPIENT = "pharmaciedetrevoux@gmail.com"

def build_message():
    msg = EmailMessage()
    msg["From"] = SENDER
    msg["To"] = RECIPIENT
    msg["Subject"] = "[PORTAIL+] TEST - Alerte sauvegarde fictive"
    msg.set_content(
        "Ceci est un TEST du système d'alerte de Portail+.\n"
        "Aucune sauvegarde réelle n'est concernée.\n"
        "Ne nécessite aucune action.\n"
    )
    return msg

def main():
    if os.environ.get("SEND_SYNTHETIC_TEST_EMAIL") != "YES":
        print("DRY RUN: no email sent")
        print(build_message()["Subject"])
        return
    username = os.environ["SMTP_USERNAME"]
    password = os.environ["SMTP_APP_PASSWORD"]
    if username != SENDER:
        raise RuntimeError("Unexpected SMTP sender")
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ssl.create_default_context(), timeout=20) as smtp:
        smtp.login(username, password)
        smtp.send_message(build_message())
    print("PASS: synthetic alert email sent")

if __name__ == "__main__":
    main()
