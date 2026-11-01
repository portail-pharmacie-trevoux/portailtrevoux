# Validations V/X des épisodes de température — Scalingo

Branche exclusive : `chore/scalingo-hds-preparation-2026-10`.
Application cible : `portailplus-hds`. Ne pas déployer sur Render ni fusionner dans main.

## Fonctionnement

Chaque formulaire de commentaire propose deux boutons radio exclusifs :
**V — Situation maîtrisée** (vert) et **X — Problème identifié** (rouge).
Un nouveau commentaire créé depuis l’interface exige un texte et un choix.
Les anciens commentaires restent présents, sans validation automatique.
L’administrateur peut modifier leur texte et leur validation. Une révision
optimiste refuse les écrasements d’une modification concurrente avec HTTP 409.
L’ancien texte et son statut sont conservés dans la colonne JSON `history`.

La validation courante d’un épisode est celle de son commentaire ajouté ou
modifié le plus récemment (identifiant décroissant en cas d’égalité de date).
Les commentaires historiques restent affichés et ne sont pas supprimés.
Un commentaire courant vide ou sans statut ne permet pas d’obtenir un V.

Le calendrier conserve le **fond rouge** de toute journée avec dépassement :

- **V vert** seulement si tous ses épisodes ont un commentaire courant non vide
  et un statut V ;
- **X rouge** dès qu’un épisode a un commentaire courant non vide et un statut X ;
- aucune coche si la validation est incomplète et aucun épisode n’est X.

Le calcul utilise les épisodes complets conservés, et les jours réels de leurs
mesures hors seuil en Europe/Paris. Il n’est pas tronqué aux limites du mois.
La validation d’un épisode commencé le mois précédent s’applique ainsi aux
jours concernés du mois affiché. Les relevés et seuils ne sont pas modifiés.

Les routes POST `…/:sensor/comments` et PUT `…/:sensor/comments/:id` sont
explicitement autorisées par le filtre Scalingo pour l’Administrateur TEST actif,
après changement du mot de passe initial, avec origine et CSRF corrects.
Les autres restrictions du mode prévisualisation restent appliquées.

## Migration et redéploiement : à effectuer après les contrôles

La migration ajoute seulement `validation` (nullable, limitée à V/X), `revision`,
`updated_at` et `history` à `temperature_comments`. Elle est idempotente et ne
supprime ni ne recrée les commentaires ou relevés. Le schéma normal `schema.sql`
comporte les mêmes ajouts, mais le preview Scalingo contourne son initialisation :
le preview prépare désormais ces quatre colonnes, si elles manquent, avant de
servir les routes. Cette préparation est transactionnelle, bornée par un délai
de verrouillage et refuse de recréer une table absente. Une sauvegarde réussie
doit être vérifiée avant tout déploiement susceptible de déclencher ces ALTER.

1. Résoudre les échecs de tests bloquants et vérifier une sauvegarde Scalingo
   récente **réussie**, de la bonne base. Aucun état de sauvegarde distant n’a
   été vérifié pendant la préparation ; aucune migration distante n’a été exécutée.
2. Après cette vérification effective, renseigner sur `portailplus-hds` les
   attestations existantes `SCALINGO_RIGHTS_BACKUP_REFERENCE` et
   `SCALINGO_RIGHTS_BACKUP_VERIFIED_AT` (date UTC ISO, validité 24 heures).
   Ces variables ne créent pas de sauvegarde et n’en interrogent pas l’API.
3. Depuis un contexte Scalingo sécurisé disposant des fichiers du nouveau commit,
   exécuter `node scripts/migrate-scalingo-temperature-validation.mjs`.
   Le script exige safe mode, URL exacte, TLS vérifié, attestation récente et
   `current_database() = 'portailplus_7495'`. Les ALTER sont transactionnels.
   Ce script reste une possibilité de migration explicite ; le preview applique
   désormais les mêmes ajouts au démarrage lorsqu’ils sont nécessaires.
4. Redéployer uniquement `portailplus-hds` avec le point d’entrée existant.
   Vérifier santé, connexion TEST, lecture des anciens commentaires et affichage
   du calendrier avant toute modification de données métier.

## Validation locale

Tests ciblés :

```sh
PORTAIL_TEMPERATURE_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:25432/portailplus_temperature_test \
  node --test tests/temperature-validation.test.mjs tests/temperature-validation-ui.test.mjs \
  tests/scalingo-temperature-import.test.mjs tests/temperature.test.mjs \
  tests/security.test.mjs tests/scalingo-universal-rights.test.mjs
```

Le PostgreSQL est local et jetable. Le scénario refuse une base distante et recrée
uniquement ses tables de test. Chromium vérifie le véritable module d’interface
avec un jeu de réponses API simulées : exclusivité des radios, édition,
actualisation, V/X visibles et fond rouge conservé. Les tests HTTP PostgreSQL
vérifient séparément la persistance, la migration appliquée deux fois, les anciens
commentaires, l’historique, les conflits de révision, les droits, le CSRF et les
changements de jour/mois. Ils ne créent aucune donnée dans Scalingo ou Render.

Suite complète locale : 240 tests exécutés, 235 réussis, 5 échecs préexistants
dans `leave-planning.test.mjs` et `schedule-tools.test.mjs`. Ces échecs restent
à résoudre avant déploiement ; la suite complète n’est pas déclarée verte.
