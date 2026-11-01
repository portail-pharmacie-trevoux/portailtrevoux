# Suivi des erreurs de délivrance — ouverture du filtre Scalingo

Branche exclusive : `chore/scalingo-hds-preparation-2026-10`.
Application cible : `portailplus-hds`. Aucun changement à main, Render ou ses données.

## Correction

Le formulaire utilisait déjà les routes applicatives, mais le filtre de
`scripts/serve-scalingo-ui-preview.mjs` autorisait uniquement la liste des erreurs.
Une liste explicite, chargée seulement par le point d’entrée Scalingo, autorise :

| Méthode | Route | Opération |
| --- | --- | --- |
| GET, POST | `/api/quality/errors` | Liste et déclaration |
| GET | `/api/quality/errors/export.xlsx` | Export interne du registre |
| PUT, DELETE | `/api/quality/errors/:id` | Modification et suppression administrateur |
| PUT | `/api/quality/errors/:id/status` | État de traitement et historique |
| PUT | `/api/quality/errors/:id/notification` | Enregistrement du suivi opérateur/patient/médecin prévenu |
| GET, POST | `/api/quality/prescriber-calls` | Registre et déclaration d’un appel, notamment lié à une erreur |
| PUT | `/api/quality/prescriber-calls/:id` | Résultat, échéance et réalisation du suivi |

Les identifiants sont des entiers positifs et aucune autre sous-route ou méthode
n’est ouverte. Le contrôle `scalingoUniverseBoundary` précède cette liste ; les
routes applicatives continuent ensuite de vérifier session, changement de mot
de passe initial, origine, CSRF, validations et révisions.

L’ouverture ne donne aucun droit supplémentaire : un compte Qualité en consultation
seule ne peut toujours pas déclarer ou suivre une erreur. Avec la permission de
modification Qualité, la déclaration et les coches de notification restent possibles.
Modifier/supprimer une erreur ou changer son état reste réservé aux administrateurs.
Le suivi d’un appel reste réservé à son auteur ou à un administrateur. Une
déclaration d’appel liée à une erreur exige que le médecin soit indiqué prévenu.

Les coches « prévenu » et le registre d’appels n’envoient aucun message et ne
déclenchent aucun appel. Les intégrations externes demeurent désactivées. L’export
est une réponse authentifiée au navigateur, pas un transfert automatique externe.
Les réponses conservent `Cache-Control: no-store`. Aucun accès anonyme, import
de données patients ou copie depuis Render n’a été ajouté. Les cas employés pour
les tests sont synthétiques et ne contiennent aucune identité patient.

## Tests et activation

```sh
node --test tests/scalingo-quality-errors.test.mjs tests/quality-errors.test.mjs tests/quality-progress.test.mjs
node --test tests/*.test.mjs
```

13 tests ciblés réussis, y compris un parcours HTTP à travers le filtre et
`createApp`, avec base simulée : déclarant imposé par le serveur, permissions,
origine, CSRF, session expirée, mot de passe initial, révisions, historique d’état,
export authentifié, appels liés et conservation d’un enregistrement préexistant.
La logique applicative et les requêtes SQL ne sont pas modifiées par ce correctif.

Suite complète : 242 tests, 236 réussis, 5 échecs préexistants dans
`leave-planning.test.mjs` et `schedule-tools.test.mjs`, 1 test PostgreSQL optionnel
non exécuté faute de variable de base de test locale. Ne pas déclarer la suite verte.

Un redéploiement Scalingo est nécessaire pour activer le filtre ; aucun n’a été
lancé. Aucune donnée métier distante n’a été lue ou modifiée. Avant déploiement :

1. Résoudre les échecs bloquants et vérifier une sauvegarde récente réussie de
   `portailplus-hds` ; son état n’a pas été vérifié pendant cette intervention.
2. Contrôler le schéma distant en lecture seule. Les tables et colonnes sont déjà
   définies dans `schema.sql`, notamment `quality_errors.status/status_history`,
   les colonnes de notification et les colonnes de suivi/révision de
   `quality_prescriber_calls`. Leur présence sur Scalingo n’a pas été vérifiée.
   Ne pas exécuter aveuglément l’initialisation complète : elle comporte d’autres
   migrations et opérations de démarrage.
3. Ce correctif n’ajoute aucune migration. Si la version déployée précède les
   travaux V/X des températures, suivre aussi leur procédure de migration avant
   de démarrer une version contenant ces changements.
4. Déployer exclusivement sur `portailplus-hds`, puis vérifier santé, connexion
   et consultation du registre. Effectuer tout essai métier uniquement avec les
   autorisations et données anonymisées appropriées, puis contrôler le résultat.
