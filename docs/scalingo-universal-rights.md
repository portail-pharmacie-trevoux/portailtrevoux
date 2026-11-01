# Droits universels — Scalingo uniquement

Branche autorisée : `chore/scalingo-hds-preparation-2026-10`.
Application cible : `portailplus-hds`. Ne pas fusionner dans main ni déployer sur Render.

## Interface et portée

Se connecter avec l’Administrateur TEST, ayant déjà changé son mot de passe.
Dans Collaborateurs > Administration, ouvrir **Administration des droits Scalingo**
(`/staging-universal-rights`). Cette page permet un aperçu, une application groupée
avec confirmation, ou un réglage individuel via `PUT /api/users/:id`.
La fiche personnelle historique reste limitée par le mode prévisualisation ;
utiliser cette page dédiée pour les permissions.

Les 13 consultations sont Agenda, Communication (`Actualités` en base), Fun,
Emplois du temps, Collaborateurs, Laboratoires, Challenges, Formations,
Contacts utiles, Ressources humaines, Procédures, Merchandising
(`Outils d'aide au merchandising`) et Qualité (`Outils d'aide à la démarche qualité`).
Les trois modifications sont Agenda (tâches personnelles), Communication (messages
internes) et Fun (ajout de morceaux). La suppression des morceaux et les
intégrations musicales restent administratives ou désactivées.
Les autres univers ne reçoivent aucun nouveau droit. Aucune permission de
proposition merchandising n’est créée : elle devra être distincte de la modification.

L’application groupée exige exactement 16 comptes employés actifs, exclut les
administrateurs, et ignore toute configuration explicite différente de la matrice
ou tout droit hors du socle attendu. Ces fiches sont signalées avec leurs droits
actuels et conservées. Leurs permissions peuvent être revues individuellement,
avec une confirmation de remplacement. Les affectations de référents ne sont
ni importées ni modifiées. Les règles spécifiques de services devront être
reprises séparément ; aucune intégration Render n’est utilisée.

Une empreinte de l’aperçu bloque une application groupée si l’effectif, l’activité
ou les permissions ont changé. Les modifications et la fermeture des sessions
des employés concernés sont transactionnelles. Les seules colonnes modifiées
sont `rights`, `edit_rights`, `permissions_configured` ; les mots de passe,
identités, rôles, invitations et documents personnels restent intacts.

Le filtre Scalingo vérifie les droits en amont des API, y compris les modules
historiques qui ne distinguaient pas consultation et modification. Les comptes
configurés n’ont plus de modification implicite Laboratoires/Merchandising/Qualité.
La confidentialité RH reste contrôlée par les routes existantes : propriétaire
du document ou administrateur, jamais par la seule consultation de l’univers.
Les intégrations externes et les opérations exclues du mode prévisualisation
restent désactivées. La matrice ne les active pas.

## Prérequis bloquants avant les écritures et le déploiement

1. Depuis Scalingo, vérifier une sauvegarde **réussie**, récente et correspondant
   à la base de `portailplus-hds`. Conserver sa référence dans le journal d’intervention.
   Ne pas considérer une sauvegarde planifiée ou en cours comme réussie.
2. Après ce contrôle effectif, renseigner sur cette application uniquement :
   `SCALINGO_RIGHTS_BACKUP_REFERENCE` (identifiant non secret de la sauvegarde) et
   `SCALINGO_RIGHTS_BACKUP_VERIFIED_AT` (date UTC ISO de ce contrôle).
   La fenêtre autorisée est de 24 heures. Une valeur absente, future ou expirée
   bloque les PUT de droits et l’application groupée avec HTTP 409.
   Cette attestation est un verrou opérateur ; le serveur ne vérifie pas l’API
   de sauvegardes Scalingo et ne crée pas une sauvegarde automatiquement.
3. Vérifier les variables de sûreté existantes : preview safe/UI true,
   DB TLS true, business startup et scheduled jobs désactivés, URL exacte
   `https://portailplus-hds.osc-fr1.scalingo.io`, intégrations externes absentes.
   Aucun secret Render ne doit être recopié.
4. Exécuter les tests de sécurité ; ne pas déployer en présence d’un échec.
   Le démarrage existant comporte une migration additive de `team_messages.title` :
   la sauvegarde doit donc être vérifiée **avant tout redémarrage/déploiement**.
5. Déployer le commit vérifié sur `portailplus-hds` seulement, avec le Procfile
   existant (`scripts/start-scalingo.mjs`). Vérifier les journaux, `/health`, la
   connexion TEST et l’aperçu des 16 comptes avant toute confirmation d’application.
   Ne jamais afficher ni exporter des secrets ou documents personnels dans les journaux.

## Validation locale

Node 24 ; `npx --yes pnpm@11.19.0 install --frozen-lockfile`.
Les tests utilisent des bases simulées et des serveurs HTTP locaux, sans accès Render
ou Scalingo. Ne pas démarrer `server.mjs` avec une URL de base distante pendant les tests.

```sh
node --test tests/scalingo-universal-rights.test.mjs tests/security.test.mjs tests/calendar-tasks.test.mjs tests/news.test.mjs tests/hr-personal.test.mjs
node --test tests/*.test.mjs
```

Lors de la préparation, la suite complète compte 234 tests : 229 réussis,
5 échecs préexistants reproduits sur le commit initial `aa563ff` : quatre dans
`leave-planning.test.mjs` (double SQL ne reconnaissant pas la requête
`SELECT schedule_weeks.*,schedule_weeks.week::text AS week_key ...`) et un dans
`schedule-tools.test.mjs` (HTTP 500 au lieu de 200). Ils empêchent de déclarer
la suite complète verte et doivent être résolus avant le déploiement.

Aucune sauvegarde distante, écriture en base Scalingo, publication d’environnement
ou mise en production n’est validée par ces tests locaux.
