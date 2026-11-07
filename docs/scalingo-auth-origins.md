# Authentification sur les domaines Scalingo

Cause : `server.mjs` refusait chaque écriture dont `Origin` différait de l'origine
unique dérivée d'APP_URL, avant la vérification du mot de passe. Les API du client
restent relatives à `/api/...`; `/trevoux` n'est pas une origine et n'exige pas
un cookie limité à ce chemin.

La prévisualisation configure une liste HTTPS exacte dans
`scripts/scalingo-origins-preview.mjs` :
- `https://portailplus-hds.osc-fr1.scalingo.io`
- `https://portailplus-officine.fr` (origine demandée)
- `https://www.portailplus-officine.fr` (domaine déclaré dans Scalingo)

Aucun joker, suffixe ou origine HTTP n'est accepté. Host et X-Forwarded-Host ne
construisent jamais cette liste. Le serveur normal garde son contrôle strict
APP_URL seul si aucune liste supplémentaire n'est fournie. La passerelle Scalingo
réutilise la même liste pour ses contrôles d'origine secondaires, sans retirer
session, rôle, CSRF, validation de données ou exigence de sauvegarde.

APP_URL, l'origine canonique et le callback OAuth Google restent sur l'URL Scalingo
historique. Aucun paramètre DNS, certificat, clé ou mot de passe existant ne change.
Les cookies restent HttpOnly, Secure, SameSite=Lax, Path=/, sans Domain : chaque
hôte conserve sa propre session. Aucun partage de cookie entre domaines et aucun
CORS permissif n'est ajouté. La déconnexion invalide la session PostgreSQL et
supprime le cookie avec les mêmes attributs.

Lors du diagnostic, l'API Scalingo ne listait que `www.portailplus-officine.fr`
avec SSL actif ; l'apex sans www n'était pas déclaré. Aucun domaine n'est ajouté
par ce correctif. Les accès directs aux deux noms personnalisés sont refusés par
le proxy de l'environnement Codex. Les tests réels côté serveur peuvent utiliser
l'URL historique avec un Origin personnalisé explicite, mais cela ne constitue
pas une validation navigateur/TLS de bout en bout sur ces noms personnalisés.

Tests locaux : `PORTAIL_AUTH_ORIGINS_TEST_DATABASE_URL` doit désigner la base
jetable `portailplus_auth_origins_test` sur 127.0.0.1, puis exécuter
`node --test tests/scalingo-auth-origins.test.mjs`. Ne jamais viser une base métier.

Validation de cette livraison : les connexions, déconnexions, sessions et contrôles
CSRF sont testés avec de vrais hachages de mots de passe et PostgreSQL local.
Les contrôles publics après déploiement utilisent des requêtes de connexion à
corps vide : 400 signifie que l'origine passe le contrôle mais que les paramètres
manquent, pas qu'un utilisateur est connecté. Une origine interdite reste en 403.
Aucun mot de passe du compte Administrateur Test existant n'est modifié.
Une création de comptes de test sur la base partagée nécessite une autorisation
explicite supplémentaire ; elle ne fait pas partie des contrôles publics.
