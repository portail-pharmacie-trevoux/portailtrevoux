# Résultats et portée des tests

## Suite fonctionnelle ciblée, environnement sans identifiants

Commande reproductible depuis le dépôt :

```sh
node scripts/audit/test-parity-local.mjs
```

Le programme n'hérite pas des URL de bases, clés de services ou jetons de l'environnement.
Un preload refuse tout fetch/HTTP(S) hors localhost ; les fournisseurs sont simulés.
Les fichiers choisis et les compteurs sont enregistrés dans test-results.json.

- 171 tests Node comptés : **167 réussis, 1 échoué, 3 ignorés**.
- L'échec est `Reminder to personal agenda: recipient isolation, expiry and idempotence with no overwrite`.
- Le scénario attend 201 et reçoit 500 dans son double de base : calendar-tasks.mjs
  ne gère pas sourceMessageId. Il ne s'agit pas d'une erreur observée sur le site réel.
- Les 3 ignorés nécessitent une base de fixture explicitement dédiée : fil Messagerie,
  cycle PostgreSQL MFA complet et import TP PostgreSQL. Ils ne sont pas déclarés validés.
- Ne pas supprimer le test en échec ou ajouter un skip pour afficher artificiellement du vert.

La partie nouvelle de cette suite inclut : exhaustivité de l'inventaire des routes,
reproduction de restrictions de la gateway réellement composée, option Google désactivée,
absence de raccordement des correctifs, liste positive de méthodes/identifiants,
préservation auth/origine/CSRF/MFA, et extraction DDL sans exécuter les migrations métier.
Le test de cohérence OAuth confirme le callback historique et les cookies host-only ;
il signale une recette canonique nécessaire, pas un flux réel réussi sur www.

## Régression préexistante et patch candidat

feature-regression-proof.json consigne les exécutions sur copies temporaires :

| Référence du code | Réussis | Échoués |
|---|---:|---:|
| Branche c6dc40d, avant cet audit | 1 | 1 |
| Main 0a006e2 | 2 | 0 |
| Copie de c6 avec le patch candidat | 2 | 0 |

Le fichier proposals/linked-message-reminder.patch reprend la logique main et propose
une colonne/index additifs. Il n'est appliqué ni aux fichiers runtime de la branche,
ni à une base réelle. La validation sur copie porte sur les tests métier simulés ; la
migration SQL et le scénario complet restent à tester séparément avant application autorisée.
Ce correctif nécessite une revue de compatibilité du schéma existant, pas son rejeu intégral.

## PostgreSQL isolé et verrou d'exécution

Avec une copie locale du code main archivée à la référence indiquée :

```sh
PORTAIL_PARITY_MAIN_CHECKOUT=/chemin/vers/copie-main \
PORTAIL_PARITY_SCHEMA_OUTPUT=docs/parity/2026-11-11 \
node scripts/migration/grouped/test-isolated-postgres.mjs --parity
```

- **48 tests réussis, zéro échec, zéro ignoré**, PostgreSQL 18.6 synthétique, TLS vérifié.
- Les 43 tests de l'exécuteur et des transactions antérieurs restent verts.
- Les 5 tests supplémentaires vérifient : garde métier de schema.sql main sur base vide,
  projections structurales sous TLS sans collaborateurs, écarts formation/calendrier,
  et prise en compte des DDL additifs du preview (un test parent compris).
- Compatibilité structurelle des 12 tables source du lot groupé : confirmée sur la
  projection vide. Aucun transfert fonctionnel réel n'est testé par cette affirmation.
- Le constat d'échec du bootstrap main est testé comme un blocage ATTENDU, non comme
  une exécution réussie de ce bootstrap. Tous les DML/DO sont exclus de la projection.

## Ce qui n'est pas prouvé

Aucune version réellement déployée, aucun DNS/TLS réel, aucun inventaire de base réelle,
aucune disponibilité de compte réel, aucun fichier utilisateur, aucune session réelle,
aucune intégration Google/Gmail/Youtrust/IA/YouTube ni aucun débit de migration en production.
La suite globale du dépôt et la recette navigateur de tous les univers ne sont pas
présentées comme réussies. Les 251 probes sont des preuves de routage, pas 251 tests métier.
Les deux sondes inconclusives de cycle de vie ne prouvent pas un défaut de production.

Tous les essais ont lieu hors application réelle. Aucun déploiement ni migration réelle.
REAL_EXECUTION_RELEASE_LOCKED n'a pas été levé ; run.mjs, le lanceur PowerShell et
bootstrap.sh restent byte-for-byte inchangés.
