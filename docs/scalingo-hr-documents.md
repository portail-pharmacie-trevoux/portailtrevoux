# Documents RH dans la prévisualisation Scalingo

## Cause du blocage

Le formulaire d’import chargeait systématiquement `GET /api/hr/signatories`, y
compris pour un document commun. Le filtre de prévisualisation refusait cette
route ainsi que les écritures RH. Son parseur JSON général de 64 Ko aurait ensuite
bloqué les fichiers, avant le parseur applicatif dédié.

## Ouvertures ciblées

`scripts/scalingo-hr-documents-preview.mjs` transmet uniquement ces routes à
l’application réelle, après la frontière de permissions RH :

- `GET /api/hr/signatories` : administrateurs, collaborateurs actifs uniquement.
- `GET /api/hr/documents` et `GET /api/hr/documents/:id/file` : consultation avec
  les droits RH et le filtrage individuel des documents personnels.
- `POST /api/hr/documents/import` : administrateurs, origine exacte et CSRF.
- `PATCH /api/hr/documents/:id` : renommage administrateur uniquement.
- `DELETE /api/hr/documents/:id` : retrait logique administrateur, avec auteur et
  date ; les octets stockés restent conservés.
- `GET /api/hr/signatures` : historique local en lecture seule, déjà autorisé et
  nécessaire au chargement de la page. Aucun appel externe.

Les autres routes restent refusées, en particulier les envois et relances de
signature, les téléchargements YouTrust et la configuration/déconnexion YouTrust.
La liste des destinataires du formulaire ne se charge qu’en mode personnel.

La limite RH reste distincte : PDF/DOCX de 10 Mo décodés, requête JSON/Base64 de
15 Mo maximum. Seul cet import évite le parseur général de 64 Ko, puis passe les
contrôles de session, de rôle, de droits, d’origine et de CSRF avant le parseur
volumineux de l’application. Le validateur de fichiers n’est pas modifié.

## Confidentialité

La liste filtre les documents personnels par propriétaire ou rôle administrateur.
Le téléchargement et l’aperçu vérifient également ce droit côté serveur : un autre
salarié reçoit 404, sans titre ni contenu personnel. Aucun titre personnel n’est
publié dans le fil d’équipe. Les droits de consultation RH ne permettent aucune
modification par un salarié, même avec un ancien droit de modification explicite.
Le renommage ne permet pas de modifier le propriétaire ou le type d’accès.

## Validation et déploiement

`tests/scalingo-hr-documents.test.mjs` utilise une base strictement locale nommée
`portailplus_hr_test` (`PORTAIL_HR_TEST_DATABASE_URL`) et de vraies sessions/SQL.
Il vérifie l’import de 2 Mo, les refus de sécurité, l’accès commun et personnel,
la persistance après redémarrage et par une connexion indépendante, le retrait,
la conservation des octets et d’une fixture protégée, la limite de 10 Mo et le
blocage des routes de signature. Un faux client lève une erreur à tout appel
YouTrust ; son compteur doit rester à zéro et aucune demande n’est créée.

`tests/hr-documents-ui.test.mjs` utilise Chromium avec une API simulée pour
vérifier le formulaire commun sans récupération de signataires, le chargement
unique des destinataires personnels et la confirmation avant suppression.
Aucun test de mutation ne vise les documents réels Scalingo.

Les tables et colonnes utilisées sont celles du module RH existant ; aucune
migration ou initialisation métier n’est ajoutée. Vérifier une sauvegarde réussie
récente avant déploiement, déployer le SHA de la branche Scalingo exclusivement,
puis contrôler le SHA actif, `/health`, le module JavaScript servi et les réponses
401 des routes RH sans session. Ces sondes ne créent ni document ni signature.
