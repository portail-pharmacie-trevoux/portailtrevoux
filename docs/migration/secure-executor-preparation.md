# Étape 2 — Exécuteur transactionnel préparé, exécution réelle verrouillée

## État de cette livraison

`secure-executor.mjs` est distinct de `run.mjs`. L'entrée réelle
`executeSecureGrouped()` refuse inconditionnellement avec
`REAL_EXECUTION_RELEASE_LOCKED`, avant toute connexion ou action de contrôle.
Aucun paramètre, fichier JSON, variable d'environnement ou argument CLI ne l'active.
L'invocation directe du fichier ne fait qu'afficher le refus puis sortir avec le code 1.
`run.mjs`, le lanceur PowerShell et `bootstrap.sh` restent inchangés et limités à l'audit.

L'entrée de test `executeIsolatedFixture()` vérifie les DEUX pools : adresse
127.0.0.1 explicite, TLS avec validation du certificat, absence de connectionString,
cluster_name exactement portailplus-grouped-synthetic. Elle ne permet pas d'activer
l'entrée réelle. Le pool cible doit disposer d'au moins deux connexions.
Aucune URL de base ni aucun secret réel n'est lu depuis l'environnement par l'exécuteur.

## Pièces obligatoires et liaison au lot

La revue sans écriture exige :

- Snapshots source/cible dont les SHA-256 sont recalculées et exactes.
- Sauvegarde vérifiée, référence de restauration et empreinte cible correspondante ;
  sauvegarde terminée et vérifiée depuis moins de 24 heures, jamais dans le futur.
- Audit prêt, sans conflit, depuis moins de 15 minutes, après la sauvegarde, lié
  aux empreintes source, cible, code, décisions et correspondances.
- Identités explicitement vérifiées, avec empreinte des utilisateurs et de leur mapping.
- Revue séparée de la tentative précédente, liée à la cible. NO_COMMIT_RECEIPT seul
  ne constitue jamais une preuve de rollback ni une autorisation de recommencer.
- Les quatre décisions exactes : preserve-both pour les publications,
  preserve-target-archive-source pour lectures et conflits de planning,
  archive-source-unmapped pour les modèles orphelins. L'ID source 14 n'est pas réaffecté.
- Attestation récente (5 minutes maximum) d'arrêt des ordonnanceurs, notifications
  et entrées applicatives, zéro tâche en vol, génération identifiée et
  automaticResume:false.

La revue ne délivre aucune autorisation exécutable. Une autorisation humaine FINALE
séparée doit ensuite nommer le batchDigest exact, le périmètre one-grouped-batch,
une référence distincte des pièces précédentes et une durée maximale de 15 minutes.
Elle doit être postérieure à l'audit et au contrôle d'arrêt. Toute modification d'une
pièce, du code, d'un snapshot ou du mapping impose une nouvelle revue/autorisation.
Les références ne transportent ni URL, ni mot de passe, ni jeton, ni information de compte.

## Transaction et maintien de l'arrêt

Le chemin synthétique exerce le cœur prévu pour une future version explicitement
autorisée :

1. Vérification du code et des justificatifs, puis de l'autorisation distincte.
2. Acquisition des verrous de session existants des tâches et du démarrage
   (20261028,1 et 20261028,2). Un verrou occupé provoque un refus immédiat.
3. Contrôle de l'arrêt par un contrôleur externe et recherche d'un reçu déjà enregistré.
4. Relecture source en transaction READ ONLY et vérification de la cible fraîche.
5. Appel à applyGrouped(), qui conserve ses verrous de tables et sa transaction unique.
   Le nouveau hook beforeWrite répète les contrôles sous ces verrous avant toute écriture.
6. Nouveau contrôle de l'arrêt et de l'expiration de l'autorisation avant COMMIT.
   Le reçu et les données sont enregistrés dans la même transaction PostgreSQL.
7. Retour du reçu seulement après réponse positive au COMMIT, puis contrôle final
   de l'arrêt. Si ce dernier contrôle échoue, le résultat reste un commit confirmé,
   avec pauseAfterCommit:UNKNOWN_REQUIRES_OPERATOR ; aucun rollback fictif n'est annoncé.

Le contrôleur externe n'a qu'une méthode verifyPaused. L'exécuteur ne contient ni
resume, ni restauration automatique de configuration. Libérer les mutex PostgreSQL
n'active aucun ordonnanceur ou service. Les workers, entrées et canaux d'envoi doivent
rester arrêtés indépendamment de ces mutex, y compris après la fin du processus.
La fermeture de connexion libère les mutex en cas de crash, pas cet arrêt externe.

## Reçu durable et issue incertaine

Le reçu est stocké dans settings sous une clé dédiée dérivée de la référence finale.
Il contient les empreintes du lot et du registre, les références de sauvegarde et de
restauration, des compteurs et une empreinte d'intégrité ; aucun contenu personnel.
Il devient visible atomiquement avec le COMMIT et ne peut pas apparaître seul après rollback.
La même autorisation renvoie son reçu sans réimporter. Son réemploi pour un autre lot
est refusé. Un reçu corrompu est bloquant et n'est jamais remplacé silencieusement.

applyGrouped distingue maintenant ROLLED_BACK et UNKNOWN. Toute erreur pendant
l'échange COMMIT reste UNKNOWN, même si une commande ROLLBACK suivante répond : le
serveur a pu avoir déjà validé. Aucune relance automatique n'est permise.
readExecutionReceipt effectue une inspection READ ONLY ; l'absence de reçu indique
rollbackProven:false. Un reçu valide confirme le commit, mais n'autorise aucune nouvelle écriture.
Aucun message d'erreur brut ou identifiant de connexion n'est journalisé par l'exécuteur.

## Tests reproductibles

```sh
node scripts/migration/grouped/test-isolated-postgres.mjs
```

Le lanceur crée ses propres bases et données fictives, vérifie TLS et détruit ses
ressources. PostgreSQL 16 peut être choisi avec PORTAIL_SYNTHETIC_POSTGRES_IMAGE.
Les non-régressions initiales restent incluses : archives, conservation du 2 novembre,
contraintes, sauvegarde/restauration fictive, séquences, idempotence et rollback.
Les ajouts couvrent chaque refus, verrou occupé, perte de l'arrêt avant/après COMMIT,
reçu atomique, corruption, réemploi d'autorisation et perte simulée de réponse COMMIT.
Les envois fetch sont interdits dans les tests et aucun SQL NOTIFY n'est émis.

## Blocages volontaires avant toute exécution réelle

Cette livraison ne vérifie PAS les sauvegardes Scalingo, l'arrêt de ses conteneurs
ou un accord humain réel : aucune base réelle et aucun service de production n'a été utilisé.
Les objets de preuve des tests sont des attestations FICTIVES ; une SHA-256 vérifie
leur cohérence, pas leur provenance ni leur véracité opérationnelle.
Un adaptateur opérateur authentifié devra vérifier les pièces réelles et l'arrêt de
TOUS les conteneurs, workers, files d'envoi et chemins de notification, puis fournir
le contrôle externe indépendant. Aucun adaptateur réel ni changement de configuration
n'est fourni ou activé ici. Une variable d'environnement locale ne suffirait pas.

Les données source transférées sont le snapshot approuvé et revérifié avant import ;
l'exécuteur ne bloque pas les écritures Render et ne prétend pas récupérer une
modification ultérieure. Une reprise différentielle finale exige un nouveau lot validé.

L'autorisation humaine explicite, les pièces réelles, la validation de cet adaptateur
et une revue distincte de levée du verrou seront nécessaires avant une version réelle.
Aucun déploiement, aucune écriture réelle et aucune reprise automatique des notifications.

## Validation du 11 novembre 2026

- PostgreSQL 18.6 synthétique sous TLS : 43 tests Node réussis, 0 échec, 0 ignoré.
- PostgreSQL 16.15 synthétique sous TLS : 43 tests Node réussis, 0 échec, 0 ignoré.
- Correspondances, PowerShell et canal privé : 10 réussis, 0 échec, 0 ignoré.
- Total : 96 exécutions de tests réussies (les matrices partagent des cas et incluent
  les tests parents Node ; il ne s'agit pas de 96 scénarios uniques).
- Les non-régressions initiales de l'étape 1 restent incluses.
- Contrôle SHA-256 du code, du registre et des reçus, et contrôle d'absence de
  modification de run.mjs, Start-Migration.ps1 et bootstrap.sh.
- Aucun système réel, aucune sauvegarde réelle ni donnée personnelle utilisé dans ces tests.
