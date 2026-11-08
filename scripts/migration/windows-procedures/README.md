# Import privé des 55 procédures — Windows / Scalingo CLI

Ce paquet contient les documents réels : conserver dans un dossier privé du PC,
non partagé publiquement, jamais dans GitHub. Aucun secret de connexion n'est inclus.
Ne pas utiliser `Start-Transcript`, ni publier le paquet ou ses fichiers JSON.

Prérequis : Scalingo CLI déjà connecté et autorisé sur `portailplus-hds` ;
Windows PowerShell 5.1 ou PowerShell 7. Aucun PostgreSQL, Python ou Node local requis.
Le conteneur applicatif existant doit fournir Node, son module `pg`, `bash`, `tar`
et la liaison interne `SCALINGO_POSTGRESQL_URL`. Les connexions TLS sont vérifiées.
Si un prérequis manque, arrêter et communiquer uniquement le code d'erreur.
Aucune ouverture Internet de PostgreSQL, aucun déploiement, aucun accès Render.

## 1. Audit : aucune écriture de données

Extraire tout le ZIP dans un dossier privé. Ouvrir PowerShell dans ce dossier :

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Invoke-Procedures.ps1 -Mode audit
```

`Bypass` est limité à ce nouveau processus ; il ne modifie pas la politique Windows.
Le script vérifie les SHA-256 du paquet avant transfert par Scalingo CLI.
Il exécute `scalingo --region osc-fr1 --app portailplus-hds run --silent --file ...`.
L'upload est privé dans un conteneur temporaire et supprimé à la fin du processus.
Le payload et le programme utilisent `/tmp`, jamais le serveur Web.
Le résultat est conservé localement dans `audit.json` :

- `documents: 55`, `binaryBytes: 7930504`, `targetCount: 2` ;
- `conflicts: []`, 55 entrées `mapping` et 55 IDs à insérer ;
- les lignes 1 et 2 doivent être inactives, avec fichiers présents.

Avec uniquement les IDs 1 et 2 existants, les IDs attribués seront 3 à 57,
selon l'ordre des IDs Render (303 devient 57). Cela ne suppose aucune identité
entre les IDs source et cible. Ne pas modifier `audit.json` et ne pas refaire
l'audit après import : ce fichier conserve les empreintes des deux lignes initiales.
En cas de conflit, NE PAS lancer `apply`. Faire examiner le résultat sans données binaires.
Un conflit de `builtin_key`, une même pièce avec des métadonnées différentes,
ou un rapprochement ambigu bloque plutôt que modifier un document existant.

## 2. Import : seulement après validation explicite de l'audit

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Invoke-Procedures.ps1 -Mode apply
```

Le script demande la référence/date précise de la sauvegarde récente terminée,
puis la confirmation exacte `IMPORTER 55 PROCEDURES`. Sans elle, aucune transaction
d'écriture n'est lancée. La dispense du test de restauration est explicitement
consignée (`restoreRiskAccepted: true`, `restoreVerified: false`) ; elle ne prétend
pas qu'une restauration réelle a été testée.

Sous verrou de table et dans UNE transaction : nouvel audit, vérification du digest
initial, INSERT uniquement aux IDs libres, 55 contrôles de SHA-256/tailles et de
toutes les métadonnées, vérification de chaque ligne initiale inchangée, ajustement
transactionnel de séquence par `ALTER SEQUENCE RESTART` (jamais `setval`), COMMIT.
Une erreur avant COMMIT annule toutes les insertions et l'ajustement de séquence.
Le verrou est bref ; si la table est occupée, l'opération échoue sans forcer.

Seuls `id` et le lien interne `/api/procedures/{id}/file` sont adaptés à la cible.
Les `source_url`, dates à la microseconde, valeurs nulles, titres, noms, catégories,
descriptions, mots-clés, `builtin_key`, types et statuts sont conservés.
La procédure Render 26 reste inactive : 54 actives importées et une inactive.
Les lignes Scalingo 1 et 2 restent intégralement inchangées.
Aucun compte, droit, autre module, publication ou message n'est modifié.

`transaction_verified_not_yet_committed` ne signifie PAS que l'import est terminé.
Seul `event: committed` confirme le retour de COMMIT ; le reçu est `apply.json`.
En cas de coupure ou résultat incertain, ne pas relancer l'import automatiquement :
exécuter l'étape 3. Un second import du même contenu ne crée pas de doublon ;
le wrapper bloque volontairement un second apply sur un audit déjà importé.

## 3. Contrôle indépendant après COMMIT

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Invoke-Procedures.ps1 -Mode verify
```

Cette étape est en lecture seule. Résultat attendu : `event: verified`,
`verifiedHashes: 55`, `targetCount: 57`, `present` contenant 55 IDs,
`insert: []`, `conflicts: []`, `preservedTestIds: [1,2]`.
Elle compare aussi les empreintes de TOUTES les métadonnées et contenus des
lignes 1/2 avec `audit.json`, conservé depuis l'étape 1.
Conserver `audit.json`, `apply.json`, `verify.json` et la sauvegarde privée.

Puis dans Portail+ avec un administrateur autorisé : ouvrir et télécharger des
PDF, DOCX et XLSX représentatifs, vérifier catégories/recherche et recharger la
page. La procédure inactive n'est pas censée apparaître dans la liste active.
Les contrôles réels d'interface restent à effectuer après import, pas à annoncer
comme réussis depuis Codex.

## Annulation et retour arrière

Avant COMMIT, ROLLBACK est automatique et testé sur une base synthétique isolée,
y compris après erreur au milieu des INSERT et après modification de séquence.
Après COMMIT, aucune suppression automatique n'est prévue. Le reçu liste les
IDs insérés ; toute restauration ciblée doit être autorisée séparément après
vérification des nouvelles dépendances. Ne pas restaurer globalement la base ni
supprimer les lignes 1/2. Le conteneur temporaire n'est pas un stockage de sauvegarde.
