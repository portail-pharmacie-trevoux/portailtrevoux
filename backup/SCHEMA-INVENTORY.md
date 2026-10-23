# Portail+ — inventory of production database structure (metadata only)

Date: 2026-10-24. Source: read-only Render PostgreSQL system catalog query; no application row contents read or exported.

## Explicitly excluded: order module
- public.order_planning
- public.order_mfa
- public.order_mfa_audit
- public.order_reminder_emails
- public.order_weekly_reminders

**Current backup implementation** uses pg_dump --exclude-table-data for these five tables. This excludes rows but retains their schema. If full module exclusion is required, consider excluding their definitions too, after assessing foreign keys and restore integrity.

## Order-specific fields inside shared tables
- public.sessions.order_mfa_at
- public.sessions.order_mfa_generation
- public.team_messages.order_digest

These fields are **NOT** excluded by the current pg_dump invocation. PostgreSQL pg_dump cannot selectively exclude columns with --exclude-table-data. A safe, tested export design is required that removes order-specific fields while retaining permitted shared-table data, or excludes entire tables with explicit functional approval. Do not assume a simple column filter is supported.

## Ambiguous / requires application mapping
- public.laboratories.order_mode: appears to be a supplier ordering channel; it may belong to the *Laboratoires* module, which is explicitly included. Do not exclude based on the word 'order' alone.
- public.team_messages.text, attachment_content and other JSON/text fields may contain order information even when order_digest is removed.
- public.settings.value, public.publications, public.employee_details.payload, and other generic text/JSON/blob fields: ownership and content cannot be proved by metadata-only inspection. Do not read production rows without separate, narrowly scoped approval.
- public.sessions contains authentication/session information; consider omitting session rows entirely from backups for security, but assess the effect on restore and explicit scope.

## Gate
The exclusion audit is **incomplete**. Do not enable real-data backup, merge to main, or deploy to production. Next: inspect application source and schema migrations, build a synthetic regression test that injects order data into both dedicated and shared columns, and confirm restored exports contain none of the excluded content. Complete HDS/GDPR assessment independently.
