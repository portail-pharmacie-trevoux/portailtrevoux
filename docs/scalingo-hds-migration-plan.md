# Préparation de la migration Portail+ vers Scalingo HDS

État : préparation uniquement. Aucun déploiement, transfert de données, changement DNS ou souscription autorisé par ce document.

## Inventaire vérifié (24 octobre 2026)
- Production Render : `portailtrevoux`, branche `main`, Node.js, commande `node server.mjs`, 1 instance 512 Mo, Francfort.
- PostgreSQL Render : `portailtrevoux-db`, version 18, disque alloué 1 Go, base mesurée à environ 104 Mo.
- Dépôt : `portail-pharmacie-trevoux/portailtrevoux`.
- Node >=22 ; pnpm 11.19.0 ; Express 5 ; bibliothèque pg.
- Les fichiers RH, procédures, formations, etc. sont principalement stockés en colonnes bytea PostgreSQL.
- Aucune restauration de sauvegarde vérifiée à ce stade.

## Variables à prévoir sur Scalingo (noms uniquement ; ne jamais copier de secrets dans Git)
- Obligatoires : `DATABASE_URL`, `APP_URL`, `APP_SECRET` (au moins 32 caractères).
- Administrateur : `ADMIN_EMAIL`, `ADMIN_PASSWORD` (utilisé si aucun admin en base).
- Google : `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_ACCOUNT_EMAIL`, `MAIL_SENDER_EMAIL`.
- Services : `YOUTRUST_API_KEY`, `YOUTRUST_ENVIRONMENT`, `OPENAI_API_KEY`, `EMPLOYEE_SCAN_MODEL`, `SERPAPI_KEY`.
- Imports ponctuels : `PROCEDURES_IMPORT_JSON`, `PROCEDURE_FILES_IMPORT_JSON`, `LABORATORIES_IMPORT_JSON`, `LABORATORY_LOGOS_IMPORT_JSON`.
- `PORT` est fourni par l'hébergeur ; `NODE_ENV=production` ; ne pas dépendre de `RENDER_EXTERNAL_URL`.

## Points bloquants identifiés dans server.mjs
1. `initialize()` exécute des imports, migrations, rappels et opérations d'entretien au démarrage.
2. `tick()` est lancé au démarrage puis toutes les 15 minutes : e-mails, rappels, synchronisation Google, entretien.
3. Avec deux instances web, ces opérations peuvent se chevaucher. Prévoir un verrou distribué PostgreSQL ou un worker unique et des garanties d'idempotence.
4. La préproduction ne doit ni envoyer de mails ni appeler les services externes avec des jetons de production. Prévoir un mode d'essai isolé et une base distincte, avec données fictives ou anonymisées.
5. `APP_URL` définit l'origine autorisée et le callback OAuth Google ; enregistrer la nouvelle URL avant la bascule.
6. La clé `APP_SECRET` intervient dans le chiffrement des informations conservées en base. Prévoir un transfert sécurisé de la valeur existante lors de la migration autorisée, sans l'exposer.
7. Vérifier la compatibilité du schéma et de la version PostgreSQL proposée par Scalingo.
8. Vérifier les contraintes de mémoire lors des imports JSON/base64 et les fichiers médias au démarrage.

## Plan d'exécution ultérieur — soumis à autorisation
1. Valider le devis Scalingo, l'éligibilité HDS, les contrats, la facturation et le plan de sauvegarde.
2. Acheter le domaine chez OVH ; conserver Render en production.
3. Préparer les changements sur cette branche, avec tests automatiques et revue avant fusion.
4. Créer l'application et la base HDS Scalingo dans la région contractuellement retenue.
5. Déployer une préproduction isolée, sans automatisations ni notifications réelles.
6. Tester une sauvegarde et une restauration sur environnement isolé.
7. Exporter/restaurer PostgreSQL par canal chiffré, contrôler tables, volumes et fichiers.
8. Tester tous les modules, MFA, droits, intégrations, documents, rappels, charge et sauvegardes.
9. Préparer une fenêtre de bascule : gel des écritures sur Render, export final, import final, validation, puis DNS OVH.
10. Maintenir Render et un plan de retour arrière ; ne l'arrêter qu'après accord explicite.

## Garde-fous
- Ne pas toucher à `main` ni aux ressources Render en production pendant la préparation.
- Ne pas déposer de données de santé, de sauvegardes ou de secrets dans GitHub.
- Ne pas activer de ressource Scalingo payante avant validation commerciale.
- Ne pas considérer une sauvegarde comme opérationnelle avant un test de restauration réussi.

## Décision du 7 novembre 2026 — reprise manuelle après publication
Décision du titulaire : ne pas importer automatiquement depuis Render les données métier suivantes :
- **Challenges** : challenges et données associées ; ressaisie manuelle après publication Scalingo.
- **Merchandising / Organisation de l'espace de vente** : affectations, zones et contenus de ce sous-module ; ressaisie manuelle après publication.
- **Outils d'aide aux commandes** : commandes et données métier associées ; reprise manuelle après publication, **uniquement après validation HDS/RGPD et autorisation de traiter les données patients**.
- **Fun** : contenus et paramétrages métier ; reprise manuelle après publication.

La décision concerne les **données**, et non le retrait des modules, des schémas, des fonctionnalités ou des contrôles de sécurité. Les autres modules restent dans le périmètre de migration, sous réserve de validation de leur inventaire.

### Mesures impératives avant exécution
1. Inventorier précisément les tables, fichiers, dépendances et éventuelles clés étrangères de ces quatre modules ; ne pas exclure des tables partagées ni des comptes ou habilitations nécessaires aux autres fonctionnalités.
2. Adapter les scripts de transfert pour exclure uniquement les enregistrements métier ciblés ; vérifier sur données fictives et documenter les exclusions. **Aucun script de migration n'est modifié par cette seule décision documentaire.**
3. Ne pas supprimer les données existantes de Render. Ne pas effacer des données déjà présentes sur Scalingo sans audit et approbation.
4. Conserver **à l'identique de Render** le module Commandes, les contrôles d'accès, les logs requis et le MFA TOTP Ente Auth. Une reprise manuelle des commandes ne dispense pas de tester la compatibilité APP_SECRET, la gestion des secrets MFA et la continuité des accès si les comptes existants sont conservés.
5. Aucun transfert de données réelles sur staging sans validation contractuelle et réglementaire HDS/RGPD. Ne pas autoriser la saisie de données patients en production Scalingo avant validation de la conformité de l'environnement (app, PostgreSQL, sauvegardes, sous-traitants, droits, journaux, conservation, chiffrement).
6. Prévoir une recette de chaque module vide, puis une vérification après ressaisie manuelle ; maintenir un suivi des éléments saisis et un rapprochement avec Render.
7. La décision Go/No-Go du 11 novembre reste conditionnée aux contrôles HDS/RGPD, à la synchronisation du code, aux tests, à la restauration, aux fichiers et au plan de retour arrière. Cette simplification ne constitue pas une autorisation de bascule.

## Décision du 7 novembre 2026 — pilotage de la migration
À la demande du titulaire, l'audit RGPD/HDS est retiré de la liste des travaux à conduire par l'assistant dans ce chantier : le titulaire indique disposer des informations nécessaires. **Cette décision n'est ni une attestation de conformité ni une preuve de signature contractuelle.** Les garde-fous existants sur le transfert des données réelles, les autorisations, les secrets et les droits restent inchangés.

Ordre de reprise des opérations techniques :
1. Comparer et synchroniser les changements utiles entre `main` et la branche Scalingo, sans modifier `main` ni Render.
2. Identifier les tables et dépendances, puis adapter et tester les exclusions d'import automatique des quatre ensembles de données repris manuellement (Challenges, Merchandising / Organisation de l'espace de vente, Commandes, Fun).
3. Terminer la configuration des droits collaborateurs et les tests Ente Auth, sans changer la procédure MFA.
4. Tester les migrations autorisées des autres données et documents, la restauration et le retour arrière.
5. Préparer domaine, DNS, OAuth et décision Go/No-Go.

## Reprise de la synchronisation GitHub — 7 novembre 2026
- Comparaison effective `main...chore/scalingo-hds-preparation-2026-10` : branches divergentes, **134 commits d'avance / 61 de retard** au moment du contrôle. Les commits de retard doivent être analysés par contenu : ne pas fusionner aveuglément.
- Fichiers métier sensibles dans le différentiel : `server.mjs`, `security.mjs`, `schema.sql`, `schedule.mjs`, `collaborateurs.mjs`, `challenges.mjs`, `merchandising.mjs`, `public/app.js`, ainsi que les scripts de prévisualisation et les documents de préparation. Revue fonctionnelle et de sécurité obligatoire avant reprise de changements.
- Le document `docs/scalingo-universal-rights.md` indique une interface dédiée de gestion des droits des 16 collaborateurs avec verrou de sauvegarde vérifiée et tests préalables : ne pas écraser cette adaptation en synchronisant.
- `docs/scalingo-order-mfa.md` documente la passerelle MFA ciblée et le chiffrement des secrets avec APP_SECRET ; conserver strictement les contrôles et la continuité de la procédure Ente Auth.
- `docs/scalingo-music.md` documente un import CSV Fun existant ; il peut faciliter la reprise manuelle après mise en service.
- **Aucune fusion ni synchronisation effective du code métier n'a encore été exécutée dans cette étape de revue.** Ne pas présenter ce contrôle documentaire comme une synchronisation achevée.
- Suite : analyser les 61 commits manquants et les conflits par fichier, reprendre seulement les changements nécessaires sur cette branche, lancer les tests, puis adapter les exclusions de données des quatre modules avant toute migration autorisée.

## Décision complémentaire du 7 novembre 2026 — deux administrateurs Render
- Ajouter au périmètre de migration les **deux comptes administrateurs existants sur Render**, avec leurs identités, e-mails, rôles et autorisations existantes. Ne pas confondre ces comptes avec l'Administrateur TEST de Scalingo ; éviter les doublons par correspondance contrôlée d'identifiants et d'e-mails.
- **Ne pas inventer les identités des deux comptes** : vérifier leurs fiches réelles dans la source autorisée avant préparation de l'import. Préserver les liens d'identité, historiques et références des modules conservés.
- Les mots de passe ne doivent jamais être copiés en clair. Évaluer si les empreintes de mot de passe et les sessions sont compatibles avec Scalingo ; sinon organiser une réinitialisation sécurisée individuelle, sans envoyer de secrets par courriel non protégé.
- Préserver les paramètres MFA existants, y compris Ente Auth pour les commandes, lorsqu'ils doivent rester utilisables. Vérifier la compatibilité de APP_SECRET et des données chiffrées dans un environnement autorisé ; ne pas exposer ni consigner le secret.
- Les deux comptes administrateurs sont **hors de la matrice de droits groupée des 16 employés** décrite dans `docs/scalingo-universal-rights.md`. Ne pas leur appliquer les droits limités des employés.
- Préparer une recette : connexion de chacun des deux administrateurs, autorisations effectives, accès aux modules et Ente Auth ; comptes test et production distincts. Aucune donnée réelle transférée vers staging sans autorisation et aucune modification de Render ou main.
- **État : exigence ajoutée au plan, migration des comptes non exécutée.**

## Confirmation des accès — 7 novembre 2026
Le titulaire confirme que les deux administrateurs Render doivent conserver **exactement leurs droits existants**, notamment l'accès aux Commandes avec Ente Auth. Les adresses e-mail de connexion des 16 collaborateurs et des deux administrateurs doivent rester identiques. L'objectif est de conserver également les mots de passe existants et de **ne pas renvoyer d'invitation** aux comptes déjà activés.

**Vérification du code sur la branche Scalingo :** `security.mjs` implémente `hashPassword`/`verifyPassword` avec scrypt (sel et empreinte stockés sous forme `salt:hex`) ; `schema.sql` comporte `users.password_hash` ; `collaborateurs.mjs` conserve ce champ. La migration de l'empreinte inchangée permet normalement de conserver le mot de passe, sans le connaître ni le déchiffrer, si les données et le code sont compatibles. **Cela reste à confirmer par un test réel de connexion autorisé après import.**

Consignes de migration :
- Identifier précisément les deux administrateurs réels sur Render ; préserver e-mails, `password_hash`, `role=admin`, droits et attributs d'activation pertinents, sans écraser l'Administrateur TEST ni créer de doublons.
- Pour les 16 collaborateurs, comparer les identifiants et e-mails de la source et de la cible, préserver `password_hash`, rôle, statut et droits. Les comptes sans accès activé restent soumis à leur processus normal d'activation ; ne pas générer d'invitations en masse.
- Préserver les facteurs Ente Auth et secrets chiffrés associés ; `APP_SECRET` est utilisé pour le chiffrement applicatif et nécessite une stratégie de continuité sécurisée. Ne jamais écrire des empreintes, secrets, mots de passe ou données réelles dans le dépôt ou les journaux.
- Tester après import avec des comptes autorisés : connexion e-mail + ancien mot de passe, droits effectifs, MFA Commandes, refus des accès non autorisés. Ne pas affirmer que les mots de passe sont conservés avant ces tests.
- Aucun transfert réel, aucune modification de Render ou de main dans cette mise à jour documentaire.
