# Imports Procédures : limite de 50 Mo sur Scalingo

Le déploiement actif observé avant correction (`2067666`) précédait le correctif
`1d165fb` : l’interface annonçait 10 Mo et le filtre de prévisualisation tentait de
parser les imports avec sa limite générale de 64 Ko. Un PDF de 1 460 Ko dépasse
cette première limite, indépendamment de la validation métier.

L’interface utilise FileReader, puis envoie un objet JSON contenant `fileData`
encodé en Base64. Aucun multipart n’est utilisé. Procédures rejette explicitement
les autres types de requêtes après authentification, droits et CSRF.

- Limite du fichier décodé : 50 × 1024 × 1024 octets, PDF et DOCX uniquement.
- Limite JSON : `ceil(taille maximale / 3) × 4 + 16 Ko` pour le Base64 et les
  métadonnées. Cette limite est finie et propre à cette route.
- L’interface, le validateur et le parseur partagent la même configuration dans
  `public/procedure-upload-limits.js`.
- Les parseurs généraux de 64 Ko (prévisualisation) et 16 Ko (application) ne
  consomment pas cet import. La route réelle vérifie la session, les droits de
  modification et le CSRF avant de parser le gros JSON.
- Un dépassement produit HTTP 413 et un message français mentionnant 50 Mo.
- L’import crée un document ; il ne remplace pas les documents existants. Aucune
  migration ni réimportation des documents existants n’est nécessaire.

## Ressources humaines

RH utilise également JSON/Base64 et le validateur partagé, mais conserve une
politique distincte : 10 Mo décodés et parseur de 15 Mo, import administrateur
uniquement. Le filtre Scalingo ne permet pas actuellement cet import. Une future
extension RH doit adapter son interface, sa route et le filtre séparément, tout
en conservant l’accès aux documents personnels pour leur destinataire et les
administrateurs seulement. Le changement Procédures n’élargit aucun droit RH et
n’active aucun envoi pour signature.

## Vérification

Les tests HTTP passent par le filtre Scalingo et l’application réelle, avec une
base simulée : PDF de 2, 10, 12 et 40 Mo, téléchargement identique, petit DOCX,
refus au-delà de 50 Mo, refus sans session/droits/CSRF, format incorrect et routes
non autorisées bloqués. Les refus conservent le contenu précédemment enregistré.
Les fixtures restent locales ; aucun document de test n’est créé sur Scalingo.

Avant déploiement, vérifier une sauvegarde Scalingo récente réussie. Déployer le
SHA de la branche `chore/scalingo-hds-preparation-2026-10`, puis vérifier via l’API
Scalingo le SHA actif et le contenu des deux modules JavaScript publics.

## Gestion des documents existants dans la prévisualisation

Le filtre autorise seulement `PUT /api/procedures/:id`,
`DELETE /api/procedures/:id` et `POST /api/procedures/:id/restore`, pour des
identifiants numériques positifs, en complément de l’import et du téléchargement.
Les autres PUT/DELETE, la création de liens et la purge restent bloqués.

Le point d’entrée Scalingo active `procedureAdminManagement` : la route réelle
exige session, compte prêt, rôle administrateur, droits Procédures, origine exacte
et CSRF pour ces trois opérations. Le comportement hors prévisualisation reste
inchangé. La modification conserve le lien du fichier importé et ne remplace ni
son nom, ni son type, ni ses octets, même si une requête tente de les fournir.
Le retrait change seulement `active` ; « Annuler » restaure le document.

`tests/scalingo-procedures.test.mjs` vérifie sur PostgreSQL local la persistance
par une connexion indépendante puis après recréation de l’application HTTP,
les refus de sécurité (dont un collaborateur disposant de droits explicites),
le téléchargement, le retrait et la restauration. Une fixture protégée reste
strictement identique. La variable `PORTAIL_PROCEDURES_TEST_DATABASE_URL` accepte
uniquement `127.0.0.1` et la base `portailplus_procedures_test` ; aucun test de
modification ou de suppression ne cible les documents Scalingo. Aucune migration
n’est nécessaire pour cette ouverture de routes.
