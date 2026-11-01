# Régression température : compatibilité du schéma V/X

Branche : `chore/scalingo-hds-preparation-2026-10`, Scalingo uniquement.

Les routes de lecture des températures sélectionnent `validation`, `revision`
et `updated_at`. L’édition utilise aussi `history`. Ces colonnes ont été ajoutées
au schéma et à une migration explicite lors de l’implémentation V/X, mais le
preview contourne l’initialisation normale de `server.mjs`. Un déploiement seul
ne garantissait donc pas l’application de cette migration.

Le scénario est reproduit sur PostgreSQL local : table de commentaires ancienne,
relevés et commentaire existants, GET mensuel HTTP 500 / SQLSTATE 42703 ;
préparation additive des quatre colonnes, puis même GET HTTP 200 et conservation
exacte des relevés et de tous les champs des commentaires préexistants.

Le preview prépare maintenant ce schéma après ses contrôles de base et TLS,
avant `createApp` et l’écoute HTTP. Une transaction et un verrou dédié protègent
la préparation. Si les colonnes sont présentes, aucun ALTER n’est exécuté. Le
délai d’attente de verrou est borné à cinq secondes et toute erreur provoque un
rollback. Aucune table n’est recréée, aucun import, entretien ou effacement n’est
déclenché. Aucun V automatique n’est attribué aux anciens commentaires.

Validation locale : **249 tests réussis, aucun échec ni test ignoré**, avec
PostgreSQL et Chromium. Les tests couvrent également les courbes, épisodes,
commentaires modifiables, V/X, changements de jour/mois, erreurs de délivrance et
import tiers payant. Les trois nouveaux tests vérifient l’absence de mutation sur
schéma déjà compatible, le rollback sur erreur et le refus de recréer une table.

Avant toute réparation distante : vérifier une sauvegarde réussie récente,
consulter les journaux et le schéma, relever compteurs et empreinte des relevés,
puis comparer ces mêmes indicateurs après réparation. Ne pas supprimer ni
réimporter les données pour corriger une absence de colonnes.

Le domaine de journaux fourni par Scalingo pour cette application est
`logs.shard-0.osc-fr1.scalingo.com`. Il doit être autorisé dans le réseau de
l’environnement de diagnostic. Ne jamais publier l’URL signée des journaux,
les valeurs d’environnement, des sessions ou des contenus patients. Le diagnostic
distant et le déploiement ne doivent être déclarés effectués qu’après lecture
des résultats et contrôle du SHA actif et des routes authentifiées.
