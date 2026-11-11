# Activation future et validations obligatoires — rien exécuté

Le plan chronométré du [15 novembre](../2026-11-11/cutover-plan.md) reste applicable.
Ce document précise seulement le nouveau candidat. Ne pas exécuter ces opérations
sans autorisation distincte ; ne modifier ni main, ni Render.

## Configuration proposée, non appliquée

| Paramètre | Règle |
|---|---|
| SCALINGO_RUNTIME_PROFILE | `production` seulement après validation du candidat |
| SCALINGO_PRODUCTION_RUNTIME_APPROVED | `true` seulement après revue du schéma et recette |
| SCALINGO_REQUIRE_DB_TLS | `true` ; certificat vérifié, aucun rejectUnauthorized=false |
| SCALINGO_POSTGRESQL_URL / DATABASE_URL | URL privée existante, base portailplus_7495 ; jamais dans Git/logs |
| APP_SECRET | Clé propre Scalingo déjà utilisée, conservée ; pas de rotation implicite |
| APP_URL | Origine HTTPS approuvée : www conseillé ; pas de chemin /trevoux dans l'origine |
| SCALINGO_ENABLE_BUSINESS_STARTUP | Ne jamais activer ; refus explicite |
| SCALINGO_ENABLE_SCHEDULED_JOBS | Ne pas activer ; le serveur refuse toujours cette option |
| SCALINGO_MAINTENANCE_MODE | `true` pendant toute reprise approuvée ; health seul reste disponible |
| SCALINGO_ENABLE_GOOGLE_CALENDAR | Conserver la décision existante ; seules lectures Calendar possibles |
| GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_ACCOUNT_EMAIL | Configuration Scalingo existante, ne pas exposer ni recopier de tokens Render |
| SCALINGO_EXTERNAL_SERVICES_APPROVED | Ne pas activer dans cette préparation |
| SCALINGO_ENABLE_MAIL_OAUTH / SCALINGO_ENABLE_MAIL_DELIVERY | Consentements distincts, nécessitent aussi l'approbation des services externes |
| MAIL_SENDER_EMAIL | Sender autorisé après recette volontaire ; ne déclenche rien seul |
| SCALINGO_ENABLE_YOUTUBE / SIGNATURES / AI_ANALYSIS / PRODUCT_WEB | Flags complets `SCALINGO_ENABLE_*`, tous faux/absents par défaut, approbation externe nécessaire |

`APP_URL` fixe le callback `${APP_URL}/auth/google/callback`. La console Google doit
l'autoriser **avant** essai OAuth ; démarrer la connexion sur ce même host. Pas de
Domain cookie partagé ajouté, ni confiance aux en-têtes forwarded pour déduire une origine.
Le domaine historique conserve la connexion locale ; un départ OAuth depuis un
host non canonique explique où ouvrir la session canonique au lieu d'envoyer un
state inutilisable à un autre host.

Le contrôleur `scalingo-production-jobs.mjs` n'a **aucun service/cron/intervalle**.
Son existence ne constitue pas une activation. Un futur worker devra disposer
également d'un contrôleur d'arrêt indépendant fiable, d'une approbation, d'un
inventaire des échéances et d'une recette d'arrêt/reprise. Le mutex ne remplace
pas le drainage de tous les autres producteurs et conteneurs.

## Ordre et points d'arrêt

1. Lire en autorisation séparée le schéma réel, contraintes/index/doublons et volumes.
   Vérifier sauvegarde disponible, référence et restauration isolée. Deux admins
   personnels et MFA validés, sans modifier leur configuration.
2. Répéter sur copie anonymisée/synthétique le delta additif préparé et la recette
   complète, dont merchandising/challenges, imports température/TP et navigateur
   16/9 + 4/3. Mesurer mémoire des workers PDF et capacité des conteneurs.
3. Approuver explicitement le DDL puis, séparément, le déploiement du candidat.
   Ne pas rejouer schema.sql ou initialize(). Un conflit d'index ou de schéma bloque
   et annule la transaction ; pas de suppression de lignes pour forcer le passage.
4. Autoriser et vérifier le profil, health, connexion/déconnexion, cookies, CSRF,
   refus salariés non autorisés et Ente Auth. Aucun test métier sur vraies données
   sans accord spécifique ; privilégier copie isolée.
5. Les lots de reprise restent verrouillés ; les 16 fiches, fonctions/IDs/clés,
   droits, admins et secrets Ente Auth ne sont pas écrasés. Aucun nouveau seed.
6. Après reçu, contrôles d'intégrité et autorisations distinctes seulement : essais
   Google lecture, mail volontaire, signatures/YouTube/IA si requis. Contrôler les
   destinataires et les doublons avant toute reprise d'automations.
7. GO seulement après clôture documentée des P0 et P1 non dérogés ; les tests locaux
   de ce commit ne valent ni preuve de migration ni autorisation de bascule.

## Retour arrière proposé

- Identifier avant intervention le SHA/app-image précédent et conserver la
  configuration précédente. Le preview reste sélectionnable avec ses deux flags.
- Le delta est additif : ne pas retirer ses colonnes/tables lors d'un retour de code.
  Ne pas lancer de down migration destructrice. Revenir au code précédent n'efface
  ni les nouvelles données ni les messages ; arrêter les écritures si incompatibilité.
- Conserver maintenance et pause des producteurs/envois pendant l'analyse. Aucune
  réactivation de notification implicite, y compris en cas de rollback applicatif.
- Toute restauration de données réelles nécessite un plan ciblé approuvé tenant
  compte des nouvelles écritures intervenues depuis la sauvegarde. Aucun retour
  vers Render en écriture automatique, aucune modification DNS prévue ici.
