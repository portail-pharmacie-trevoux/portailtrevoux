# Accès MFA aux commandes — Scalingo

La prévisualisation délègue uniquement à l'application existante :

- GET `/api/order-mfa/status`.
- POST `/api/order-mfa/setup`, `/confirm`, `/unlock`, `/touch`, `/lock`.
- GET `/api/order-planning` et `/api/order-planning/options`.

Aucun préfixe sensible n'est ouvert globalement. Les exports, écritures de commandes,
réinitialisations d'un autre compte, désactivation TOTP et gestion des secours
restent soumis aux restrictions de prévisualisation existantes (non ouverts ici).

Le serveur vérifie la session et le droit Commandes ; les POST vérifient origine
et CSRF. L'enrôlement personnel exige le mot de passe et un TOTP correct ; remplacer
une clé existante exige en plus un accès déjà déverrouillé. Les clés sont chiffrées
avec APP_SECRET dans PostgreSQL. Les codes Ente Auth (RFC 6238 SHA1, 6 chiffres,
30 secondes) sont vérifiés côté serveur avec une fenêtre de dérive d'un pas et
anti-réutilisation. Les tentatives sont limitées. Aucun facteur ne doit être
réinitialisé ou désactivé pour tester ce correctif.

Le middleware MFA de `server.mjs` reste placé avant toutes les routes de commandes.
Sans validation, il refuse les lectures autorisées par la passerelle. Après dix
minutes d'inactivité, il verrouille à nouveau l'accès. L'expiration du portail
rend également toute requête non authentifiée. `touch` ne déverrouille pas une
session expirée. Les routes MFA et le démarrage Render ne sont pas modifiés.

Test réel PostgreSQL local : définir `PORTAIL_ORDER_MFA_TEST_DATABASE_URL` vers
`portailplus_order_mfa_test` sur `127.0.0.1`, puis lancer
`node --test tests/scalingo-order-mfa.test.mjs tests/order-mfa.test.mjs`.
Cette base de test est jetable : ne jamais utiliser une base métier.
