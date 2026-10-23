# Backup alert email configuration (test environment)

Recipient: pharmaciedetrevoux@gmail.com

The synthetic freshness monitor emits a BACKUP_ALERT JSON line and a nonzero
exit code for missing, stale (>26 hours), or failed checks. A successful check
does not emit an alert.

To deliver email notifications, configure an authorized SMTP relay or email
provider with credentials stored as Render secret environment variables. Do not
put credentials in GitHub. The sender identity must be verified with the
provider. Test delivery using only synthetic events.

Until delivery is tested and a scheduled job exists, log alerts are NOT email
notifications. The existing synthetic web service does not itself schedule a
daily check. Production backups remain disabled pending compliance review.
