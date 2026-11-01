# Import Excel des températures — correctif Scalingo

Branche : `chore/scalingo-hds-preparation-2026-10` exclusivement.
Application : `portailplus-hds`. Aucun changement de main, Render ou de sa base.

## Diagnostic du code

La route applicative est `POST /api/quality/temperatures/import`. Elle attend
un JSON contenant `fileName` et le XLSX encodé en base64 (15 Mo de fichier,
parseur JSON de 22 Mo). Le filtre Scalingo bloquait cette route, ainsi que
`GET /api/quality/temperatures/:sensor`, nécessaire à la consultation détaillée.
Son parseur global de 64 Ko rejetait en outre les fichiers importants avant
d’atteindre le parseur applicatif. Une réponse non JSON est traduite par le
client en « Le service ne répond pas » : elle ne permet pas de conclure à
l’absence d’écriture en base. La version réellement déployée et les journaux
distants n’ont pas été consultés pendant cette intervention.

Le filtre accepte désormais ces seules routes, avec un parseur volumineux
spécifique à l’import. La session Administrateur TEST active, le changement
de mot de passe initial, l’origine et le CSRF sont vérifiés **avant** ce parseur.
Les autres routes conservent la limite de 64 Ko et les restrictions existantes.
Les contrôles applicatifs s’exécutent ensuite normalement. Les erreurs de taille
et de JSON du parseur dédié renvoient un statut et un message JSON explicites.

La logique d’import et le schéma restent inchangés : transaction unique,
verrou transactionnel sérialisant les imports, clé primaire `(sensor_id,recorded_at)`,
doublons identiques ignorés et conflit de valeur refusé sans remplacement.
Les insertions de sondes, relevés et historique sont validées ensemble ; une
erreur avant COMMIT les annule. Les noms, seuils et commentaires existants ne
sont pas écrasés. Une réponse perdue après COMMIT peut cependant correspondre
à un import entièrement enregistré : vérifier l’historique avant de réessayer.
L’interface ne prétend donc plus qu’un import n’a pas été effectué lorsqu’elle
n’a pas pu confirmer son résultat.

## Contrôle obligatoire avant un nouvel essai distant

L’état du premier essai n’a **pas** été vérifié, faute d’accès Scalingo authentifié.
Aucun nouvel import distant n’a été lancé et aucune donnée distante n’a été modifiée.

1. Depuis un accès sécurisé à la base de `portailplus-hds`, exécuter avec psql
   `scripts/audit-scalingo-temperature-import.sql`. Le script exige le nom de
   base attendu et TLS, utilise une transaction REPEATABLE READ READ ONLY et
   ne contient ni suppression ni mise à jour. Ne pas l’exécuter sur Render.
2. Rapprocher l’historique, le nom du fichier et les plages de dates du premier
   essai. Examiner les comptes par sonde, les contraintes et les doublons.
   Ces statistiques seules ne prouvent pas que chaque mesure du fichier est
   présente : comparer avec le fichier source si l’état reste ambigu.
3. Ne supprimer aucune donnée supposée partielle. Si un import correspondant
   est présent, contrôler d’abord s’il est complet. Une réimportation du même
   fichier ignore les mesures identiques ; une valeur contradictoire bloque
   toute la transaction et demande une analyse, sans écraser l’historique.
4. Vérifier une sauvegarde récente **réussie** avant le déploiement/redémarrage
   ou un nouvel import. Le point d’entrée existant comporte une migration de
   `team_messages.title`, même si ce correctif n’ajoute aucune migration.
5. Ne déployer qu’après résolution des échecs de sécurité et du contrôle distant.
   Un redéploiement Scalingo du nouveau commit est nécessaire pour activer le filtre.
   Après déploiement, contrôler la santé et l’authentification, puis seulement
   effectuer un essai autorisé et vérifier son historique et les comptes de relevés.

## Tests réalisés

```sh
PORTAIL_TEMPERATURE_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:25432/portailplus_temperature_test \
  node --test tests/scalingo-temperature-import.test.mjs tests/temperature.test.mjs tests/scalingo-universal-rights.test.mjs
```

PostgreSQL 16 jetable local, sans données réelles. Le test d’intégration refuse
une URL dont l’hôte n’est pas `127.0.0.1` ou la base n’est pas
`portailplus_temperature_test` ; il recrée ses tables de test. Il est explicitement
ignoré si cette variable n’est pas définie. Ne jamais fournir une URL distante.

11 tests ciblés réussis, dont un vrai import de 6 001 mesures avec requête >64 Ko,
une réimportation à zéro ajout, la conservation des métadonnées et commentaires,
un conflit au deuxième lot après 5 000 nouvelles insertions annulées, une erreur
SQL tardive annulée, deux imports concurrents et la consultation détaillée.
Les sessions invalides, comptes non administrateurs, origine/CSRF incorrects,
JSON invalide et dépassements de taille sont refusés.

Suite complète avec le PostgreSQL local : 237 tests exécutés, 232 réussis,
5 échecs déjà connus dans `leave-planning.test.mjs` et `schedule-tools.test.mjs`.
Aucun test n’a contacté les bases de Render ou Scalingo.
