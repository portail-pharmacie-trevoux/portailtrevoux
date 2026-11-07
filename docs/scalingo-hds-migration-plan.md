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
