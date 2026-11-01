# Import des rejets tiers payant — Scalingo

Branche exclusive : `chore/scalingo-hds-preparation-2026-10`.
Application cible : `portailplus-hds`. Ne pas déployer sur Render ni fusionner dans main.

## Correction et droits

Le filtre Scalingo bloquait `POST /api/quality/tiers-payant/import` après l’analyse
du classeur dans le navigateur. Cette route exacte est maintenant autorisée par
le point d’entrée Scalingo. Aucune autre route ou permission n’est ouverte.
Le navigateur envoie seulement les agrégats mensuels, pas le fichier Excel.
Le JSON des 69 mois testés tient dans la limite existante de 64 Ko.

Le contrôle global de l’univers Qualité précède toujours le filtre. La route
applicative vérifie ensuite session, changement du mot de passe initial, origine,
CSRF et qualité d’administrateur ou de référent Tiers payant actif. Un référent
doit aussi disposer du droit de modification Qualité exigé par le filtre global ;
ce correctif ne modifie ni les droits universels ni les affectations de référents.

## Conservation et calculs

La logique métier et les requêtes SQL existantes restent inchangées :

- import en une seule transaction et verrou transactionnel sérialisant les imports ;
- mois existant identique en factures, rejets et montant en centimes : ignoré,
  sans toucher sa révision, ses actions correctives ou ses métadonnées ;
- mois existant différent sur l’une de ces valeurs : HTTP 409 et rollback complet,
  y compris les nouveaux mois déjà insérés provisoirement dans le lot ;
- mois dupliqué dans le lot, chiffres invalides ou mois non terminé : refus avant import ;
- taux recalculé à partir de `rejets / factures × 100` à la lecture, jamais repris
  d’un pourcentage fourni par le fichier ou le client ;
- zéro facture : taux indéterminé (`null`), pas de division par zéro ;
- 2 % inclus : tolérable ; au-delà : problématique, sans arrondir le seuil.

Les données sont des agrégats mensuels. Aucun identifiant patient, aucune copie
Render ni aucune transmission externe n’est nécessaire. Les intégrations externes
restent désactivées et les réponses authentifiées conservent les protections existantes.

## Tests locaux

```sh
PORTAIL_TP_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:25433/portailplus_tp_test \
  node --test tests/scalingo-tiers-payant-import.test.mjs tests/quality-tiers-payant.test.mjs
```

7 tests ciblés réussis, avec un jeu synthétique de 69 mois de janvier 2021 à
septembre 2026. Aucun fichier utilisateur ou donnée métier distante n’est utilisé.
Le test PostgreSQL refuse un hôte autre que `127.0.0.1` ou une base autre que
`portailplus_tp_test` ; il recrée ses tables locales de test. Sans cette variable,
ce test est explicitement ignoré. Ne jamais utiliser une URL de base distante.

Vérifications : 68 ajouts et 1 doublon au premier passage, 0 ajout et 69 doublons
au second ; trois conflits tardifs (factures, rejets, montant) annulent les
insertions précédentes ; lignes préexistantes, métadonnées et actions conservées ;
pourcentages source volontairement faux ignorés ; taux recalculés et statuts
corrects à la consultation ; imports simultanés sans doublons ; refus sans
authentification, CSRF, origine attendue, permission de modification et rôle requis.

Suite complète avec le test PostgreSQL tiers payant actif : 245 tests,
239 réussis, 5 échecs préexistants de congés/planning, 1 test PostgreSQL
température optionnel non exécuté. La suite complète n’est pas déclarée verte.

## Déploiement restant

Un redéploiement de `portailplus-hds` est nécessaire pour charger le filtre.
Aucun déploiement ni import distant n’a été exécuté pendant cette intervention.
Ce correctif n’ajoute aucune migration et n’a pas modifié les données Scalingo.

Avant déploiement, vérifier une sauvegarde récente réussie et résoudre les tests
bloquants connus. Vérifier aussi que les migrations des commits précédents déjà
inclus dans la branche sont appliquées, notamment celle des validations de
température si la version distante est antérieure. L’état distant n’a pas été
vérifié ici. Après déploiement, contrôler la santé, les droits et l’aperçu des 69 mois
avant de confirmer l’import, puis consulter les résultats et les compteurs.
