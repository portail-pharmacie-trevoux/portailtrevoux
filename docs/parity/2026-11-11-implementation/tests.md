# Résultats des tests

- Suite locale nettoyée des variables sensibles, réseau limité à loopback :
  `node scripts/audit/test-parity-local.mjs` — **196 tests : 189 réussis, 0 échec, 7 ignorés**.
- Cluster Docker PostgreSQL **18.6**, loopback seulement, TLS et certificat vérifié,
  marqueur synthétique, bases dédiées, destruction du cluster en finally :
  `node scripts/migration/grouped/test-isolated-postgres.mjs --production-parity`
  — **70 tests : 70 réussis, 0 échec, 0 ignoré**.
- Six tests de politique sont communs aux deux commandes : les nombres ci-dessus
  sont ceux de chaque exécution, pas un total de tests uniques.
- Les 7 skips locaux sont listés dans test-results.json : anciennes suites PG
  comptes, suppression, lifecycle, threads, MFA, température XLSX et TP. Certains
  comportements sont couverts par la nouvelle fixture PG, mais cela ne permet pas
  d'affirmer que tous leurs scénarios optionnels ont été exécutés.
- Les 43 tests existants du moteur groupé/préflight/politique restent exécutés dans
  la commande PostgreSQL. L'audit run.mjs et le verrou de l'exécuteur ne sont pas modifiés.
- Extraction PDF locale testée avec un PDF synthétique, données structurées/DPC,
  identité, date, confirmation et protection de doublon ; pas de fournisseur externe.
- Une erreur de livraison volontaire P0001/HTTP500 dans le journal PG est attendue :
  le test vérifie le rollback complet du planning, de la publication et du message.
- Le delta SQL est appliqué deux fois sur base fictive déjà renseignée, avec
  comparaison des utilisateurs, fonctions, clés et semaine manuelle avant/après.
- Contrôles de syntaxe Node et `git diff --check` effectués.

Les essais ne constituent pas un test de charge, un audit des données réelles,
une validation de sauvegarde Scalingo réelle ou une recette navigateur exhaustive.
Aucun compte, planning, document ou service réel n'a été utilisé ou modifié.
