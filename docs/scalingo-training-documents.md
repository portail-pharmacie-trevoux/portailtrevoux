# Documents de référence sur Scalingo

Les catégories « Prescriptions et documents comptoir » (`reference`) et
« Documents de formation » (`training`) partagent l’API
`POST /api/training/documents/import` et les droits de l’univers `Formations`.

## Diagnostic et limites

Le filtre Scalingo appliquait `express.json({limit:'64kb'})` avant les contrôles
et le parseur applicatif, puis interdisait l’import. Le fichier est envoyé en JSON
avec du Base64, sans multipart : un fichier de 10 × 1024 × 1024 octets représente
environ 13,34 Mo de JSON. Le parseur applicatif de 15 Mo et le validateur PDF/DOCX
de 10 Mo sont conservés. Seule la route d’import exacte évite le parseur de 64 Ko.
Les contrôles session, compte prêt, droits de modification, origine et CSRF sont
exécutés avant le parseur volumineux. Le dépassement retourne 413 en français.

## Routes autorisées

`scripts/scalingo-training-documents-preview.mjs` délègue à l’application réelle :

- GET de la liste, du fichier et de sa page d’impression ;
- POST de l’import uniquement ;
- PUT du nom d’un document identifié ;
- DELETE d’un document identifié, avec les mêmes droits d’écriture et CSRF.

Aucune autorisation générale PUT/DELETE ou d’un autre univers n’est ajoutée.
La recherche reste locale, par catégorie, nom affiché et nom de fichier, sans
sensibilité à la casse ou aux accents. Le retrait nécessite confirmation.

## Conservation des données et schéma

La suppression n’existait pas dans le module. Elle marque désormais `removed_at`
et `removed_by` et exclut le document de la liste, du téléchargement, de
l’impression et du renommage. Les octets et les autres métadonnées restent en
base. Aucun document existant n’est supprimé ou réimporté par la migration.

Les deux colonnes nullables sont ajoutées de façon idempotente dans `schema.sql`.
Le démarrage restreint Scalingo ne lance pas ce schéma général : il utilise
`ensure-scalingo-training-documents-schema.mjs`, une transaction additive avec
verrou dédié et délai de verrouillage. Elle refuse une table absente/incompatible
plutôt que de recréer les données. Les anciens documents gardent leurs valeurs et
restent visibles, avec ces deux nouveaux champs à NULL. Une sauvegarde récente
réussie doit être vérifiée avant déploiement. Aucun déploiement Render n’est fait.

## Tests

`PORTAIL_TRAINING_TEST_DATABASE_URL` est strictement limité à `127.0.0.1` et à la
base locale `portailplus_training_test`. Les tests HTTP/PostgreSQL vérifient les
deux catégories avec PDF de 2 et 10 Mo et DOCX de 10 Mo, le rejet au-delà de 10 Mo,
la persistance après redémarrage et par une connexion indépendante, les octets des
téléchargements, l’impression, les refus de sécurité et le retrait logique.
La migration est testée deux fois et une fixture existante est conservée intacte.
Les fichiers des tests sont générés localement ; les PDF originaux de l’utilisateur
ne sont pas contenus dans le dépôt.

Un test Chromium couvre l’import dans les deux catégories, la recherche par nom
avec accents et plusieurs termes, le renommage, la confirmation et l’annulation
du retrait, ainsi que l’affichage pour un utilisateur en consultation seule.
Aucun test de mutation ne vise un document réel de Scalingo.

Après déploiement du SHA de la branche Scalingo, vérifier son statut et sa
référence active, `/health`, le module JavaScript et les protections HTTP sans
session. Ces sondes ne créent ni ne retirent de document réel.
