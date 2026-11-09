# Audit de suivi du rapprochement et des décisions

Cette livraison est exclusivement une préparation d'audit, sans déploiement applicatif,
sans correction des comptes, sans migration réelle et sans envoi de notification.

## Sarah / source 15

Le résultat communiqué par le titulaire indique une identité concordante avec la cible 60,
mais des écarts d'e-mail et de rôle. Le rapport privé fournit désormais les deux valeurs
exactes et une proposition champ par champ, ainsi qu'un contrôle de conflit d'e-mail.
Aucune valeur réelle cible non reçue n'est inventée dans le code ou le compte rendu.
L'e-mail Render précédemment confirmé est factures.phdt@gmail.com et son rôle admin ;
le prochain audit relit leurs valeurs actuelles plutôt que de les imposer comme constantes.

Toute correction exige une validation distincte de l'identité, de l'e-mail et du rôle.
Le rapprochement du source 15 ne devient utilisable que si l'identité complète unique,
l'e-mail et le rôle concordent. Aucun mot de passe, jeton ou secret MFA n'est lu.
Les IDs, directory_key, fonctions, relations et paramètres d'accès restent inchangés.
Le source 14 reste explicitement bloqué, y compris en cas de simple homonymie future.

## Fin de protocole PowerShell

Les versions précédentes refusaient tout code CLI autre que 0 ou 2. Une traduction
par le CLI du code distant 2 (audit terminé avec conflits) en code 1 pouvait donc
produire « Audit incomplet » malgré la présence des événements de résultat.
Sans le rapport technique complet, cette cause demeure à confirmer pour la tentative réelle.
Désormais les codes 0, 1 et 2 sont acceptés uniquement avec canal confirmé, rapport privé
déchiffré, événements audit et audit_only cohérents (zéro écriture, exécution verrouillée,
nombre de conflits identique), contrôle previous_attempt cohérent et aucun événement blocked.
Un résultat réellement incomplet reste refusé avec la liste exacte des éléments manquants.
Cela ne signifie jamais que la migration est autorisée ou que les conflits sont résolus.

## Décisions déjà validées

Le commutateur -ValidatedMergeDecisions active seulement, pour simulation :
- publicationConflicts = preserve-both ;
- readHistory = preserve-target-archive-source.

Sans ce commutateur les blocages conservateurs restent actifs. Un fichier -DecisionsPath
peut être fourni à la place, jamais simultanément. L'audit compare les nombres et catégories
avant/après décisions. Les publications locales ne sont pas écrasées et les lectures
locales ne sont pas avancées ; les lectures source sont destinées à être archivées
fidèlement, et pourraient apparaître non lues dans l'interface actuelle.
Le nombre réel de conflits restants doit provenir du prochain audit des bases réelles.

## Tentative précédente

Le lanceur relit le reçu dans une transaction READ ONLY avant la simulation et le
rapporte également dans le résultat. NO_COMMIT_RECEIPT signifie uniquement absence
de reçu atomique ; ce n'est pas une preuve de rollback. executionAllowed reste faux.
Aucun mécanisme de reprise automatique ou d'exécution réelle n'est ajouté.
