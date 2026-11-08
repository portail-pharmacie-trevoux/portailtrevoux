# Procédures Render → Scalingo — préparation, aucune écriture autorisée

## Archive effectivement reçue et vérifiée

- SHA-256 ZIP : `6dfe4d44359976eee044b98bbe20929ceee4f0791e41eb7072f2e6af668c1e8a`.
- 55 documents : IDs 1 à 54 et 303, 7 930 504 octets binaires.
- 55 tailles et SHA-256 conformes au manifeste ; CRC ZIP valide et formats des fichiers vérifiés.
- 51 PDF, 3 DOCX et 1 XLSX ; 54 actifs, procédure 26 inactive ; deux builtin_key non NULL.
- Les noms, catégories, descriptions, mots-clés, URL, statuts et dates sont conservés. Les URL locales pointent sur `/api/procedures/{id}/file` : les IDs source doivent être libres ou correspondre exactement. Aucune réactivation automatique de la procédure 26.

L'archive et les données ne sont pas dans Git. Les rapports de vérification sont privés dans `/workspace/scratch/real-export-verification`. Aucun contenu binaire réel n'a été inséré dans les bases de tests : les tests PostgreSQL utilisent uniquement des PDF synthétiques.

## Diagnostic du code existant

`procedure-file-migration.mjs` remplit individuellement des lignes Drive déjà existantes ; il n'importe pas un ZIP complet atomiquement. `/api/procedures/import` crée une publication, donc ce handler ne sera pas utilisé pour la reprise. Le nouveau lecteur ZIP refuse chemins dangereux, symlinks, doublons, tailles incohérentes, fichiers supplémentaires et empreintes différentes. Il ne décompresse jamais vers un chemin fourni par l'archive et n'exécute aucune instruction de son contenu.

## Script préparé

Dans un exécuteur interne autorisé, avec la liaison PostgreSQL Scalingo déjà injectée :

```sh
# Lecture seule : ne crée ni document, ni table, ni session.
node scripts/migration/run-procedure-import.mjs audit ARCHIVE_PRIVEE.zip
# UNIQUEMENT après autorisation explicite et validation des prérequis.
node scripts/migration/run-procedure-import.mjs apply ARCHIVE_PRIVEE.zip APPROBATION_PRIVEE.json RECU_PRIVE.json
```

`SCALINGO_POSTGRESQL_URL` ou une liaison dédiée `PORTAIL_SCALINGO_PROCEDURE_DATABASE_URL` est utilisée en mémoire, jamais affichée ou passée dans la commande. Base imposée : portailplus_7495 ; TLS vérifié. Le CLI refuse d'écrire sans `approved=true`, référence d'autorisation, SHA exact du ZIP, empreinte de l'état cible audité, référence de backup, preuve de restauration et de sauvegarde durable. Le reçu doit être relu avant commit dans un stockage privé persistant expressément attesté par `PORTAIL_PROCEDURE_RECEIPT_STORE_PERSISTENT=true` ; le disque éphémère d'un one-off ne suffit pas. Ce stockage n'est pas encore attesté pour l'exécution réelle.

Le mode audit vérifie schéma, RLS/règles/triggers, lignes, tailles, SHA-256 des binaires et séquence. Il classe les sources en :

- même ID + métadonnées et binaire identiques : déjà présent, aucune insertion ;
- ID libre, aucune collision : insertion proposée avec ID et métadonnées source ;
- même ID différent, builtin_key occupée ou même binaire à un autre ID : conflit à présenter, jamais écrasement ou déduplication silencieuse.

L'application ouvre une transaction, verrouille la table pour stabiliser les écritures concurrentes, recontrôle l'empreinte cible puis insère seulement les lignes nouvelles. Les 55 métadonnées/tailles/SHA sont revérifiées avant commit. Les dates PostgreSQL conservent les microsecondes. Un conflit ou échec annule tout ; aucun ON CONFLICT qui masquerait un import partiel. Le second passage d'un lot identique ne recrée pas de doublons.

La séquence est vérifiée par rapport à TOUS les IDs cible, pas seulement 303. Si nécessaire, `ALTER SEQUENCE ... RESTART WITH` l'avance sans la diminuer. Cette opération est transactionnelle, contrairement à setval ; le rollback après une panne tardive a été testé. Aucun script d'initialisation ou migration globale de schéma n'est appelé.

## Sauvegarde et retour arrière

L'API officielle confirme PostgreSQL Business 1G en fonctionnement et le backup manuel `6af0cc5299c3cdd1f63217a1`, terminé le 8 novembre à 19:24:02 UTC (20:24 à Paris), 18 653 751 octets. Cette disponibilité ne prouve pas une restauration réelle réussie. La répétition locale vérifie seulement le mécanisme sur données synthétiques.

Avant écriture réelle : inventaire cible, sauvegarde récente vérifiée, restauration dans une cible isolée approuvée, état initial et reçu privé durable. Avant commit, toute erreur fait rollback y compris de la séquence. Après commit, retour arrière uniquement sur autorisation distincte, limité aux IDs réellement insérés et encore identiques au reçu, après contrôle de toute nouvelle dépendance ; ne pas supprimer une ligne changée indépendamment. Pas de restauration globale écrasant les saisies réelles. La séquence ne doit pas être abaissée après des créations indépendantes.

## État et blocage réel

**Import non exécuté. Aucun déploiement déclenché.** Le schéma et les lignes Scalingo actuels ne sont pas inventoriés par cet exécuteur. Aucun diagnostic « sans conflit » ou « 55 documents importés » n'est affirmé.

L'API de gestion et les métadonnées de sauvegardes sont accessibles. Le canal officiel des consoles one-off `one-off-osc-fr1.scalingo.com:5000` est refusé par le proxy réseau de l'environnement Codex (403). Aucun accès PostgreSQL public n'est ouvert ni demandé. Le CLI d'audit exige une liaison interne absente ici et s'arrête actuellement avec `INTERNAL_SCALINGO_DATABASE_BINDING_REQUIRED`.

Prochaine étape : rendre le canal officiel des consoles internes accessible à cet exécuteur, ou fournir le résultat de `procedure-inventory-readonly.sql` depuis une console interne autorisée. La modification éventuelle du réseau concerne seulement l'exécuteur Codex et les services officiels Scalingo, pas l'exposition de PostgreSQL sur Internet. Ne pas contourner le proxy ni envoyer des secrets dans le chat.

Après l'audit, présenter le nombre cible, les trois listes (nouveaux/identiques/conflits), l'état de séquence, les preuves backup/restauration et la méthode de reçu. Attendre alors l'autorisation d'import du titulaire.

## Tests réellement effectués

11 tests réussis, aucun échec ou test ignoré : PostgreSQL TLS isolé, refus des écritures non autorisées, collisions d'ID et builtin_key, doublon de binaire, évolution cible après audit, rollback tardif des binaires et séquence, import exact, idempotence, conservation des lignes et comptes existants, téléchargement authentifié et SHA identique, procédure inactive masquée, zéro publication/message. Les tests existants du mécanisme de fichiers sont aussi inclus. La recette sur Scalingo n'est pas prétendue effectuée.
