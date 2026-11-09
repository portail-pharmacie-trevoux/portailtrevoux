# Intégration PostgreSQL isolée : archives et précontrôle

## Exécution reproductible

Prérequis : dépendances Node du dépôt, Docker local (socket Unix) et OpenSSL.
Depuis le dépôt :

```sh
node scripts/migration/grouped/test-isolated-postgres.mjs
```

PostgreSQL 18 est utilisé par défaut. Pour la non-régression PostgreSQL 16 :

```sh
PORTAIL_SYNTHETIC_POSTGRES_IMAGE=postgres:16-bookworm node scripts/migration/grouped/test-isolated-postgres.mjs
```

Le programme crée un conteneur et un réseau Docker dédiés, un port aléatoire lié
uniquement à 127.0.0.1 et un certificat de test éphémère. TLS est vérifié.
La suite vérifie le nom du cluster synthétique avant de créer ses bases ; elle
n'accepte aucune URL de connexion distante. Aucun secret de service n'est nécessaire.
Les noms de bases locaux satisfont les gardes applicatives existantes sans les désactiver.
Le conteneur, son volume anonyme, le réseau et les certificats sont retirés en fin de test.
Un appel direct au fichier d'intégration sans le lanceur marque la suite isolée comme ignorée,
plutôt que de chercher une base externe. Le lanceur complet ne doit ignorer aucun test.

## Couverture

- Source synthétique : 16 collaborateurs et deux administrateurs, identités et adresses
  exclusivement fictives ; cible avec des IDs différents, un compte de test, session
  et configuration MFA synthétiques, fonctions et droits locaux à protéger.
- Précontrôle sans écriture ; sauvegarde absente/non vérifiée/invalide et autorisation
  absente refusées. Les quatre décisions explicites restent obligatoires.
- Sauvegarde logique pg_dump custom restaurée dans une troisième base locale :
  comparaison du snapshot, des comptes complets, sessions, MFA et séquences.
- Conservation intégrale du planning cible du 2026-11-02, publié et verrouillé ;
  archivage du planning source et import d'une autre semaine avec remappage JSON.
- Archivage complet des modèles paire/impaire 1 et 2 qui référencent l'orphelin 14 ;
  aucune activation ni association arbitraire de cet identifiant. Un modèle connu
  est importé normalement. Les empreintes SHA-256 sont contrôlées.
- Correspondances source 3 vers cible 7 et source 15 vers cible 60, auteurs,
  destinataires, réponses, pièces jointes binaires, congés et changements historiques.
- Treize insertions initiales attendues ; seconde exécution : zéro insertion et zéro
  mise à jour, état du registre et séquences identiques.
- Erreur provoquée avant COMMIT : annulation des données, du registre, des DDL et
  des redémarrages de séquences. Une violation SQL CHECK annule également le lot.
- PK, FK, CHECK et index unique des congés en attente vérifiés par de vraies erreurs SQL.
- Séquence à incrément inhabituel refusée avec rollback ; réservations de fils et
  séquences déjà avancées conservées ; prochains identifiants non conflictuels.
- Corruption d'archive refusée par prepareExecution et applyGrouped, y compris quand
  le registre altéré est réellement stocké dans la base de test.
- Reprise différentielle : nouvelles versions archivées sans remplacer les originales.
- Réseau fetch interdit pendant l'import, absence de SQL NOTIFY/pg_notify, compteur
  d'envoi nul ; aucun serveur applicatif, mailer ou ordonnanceur n'est démarré.
- run.mjs reste inchangé : mode audit obligatoire, connexions en lecture seule,
  aucun appel à applyGrouped. prepareExecution retourne executionEnabled:false.

## Défauts corrigés

1. Validation des archives stockées avant tout recalcul : leur corruption ne peut
   plus être masquée par la reconstruction à partir du snapshot source.
2. Archivage versionné et idempotent : une reprise différentielle ne remplace plus
   silencieusement une version source déjà archivée.
3. Empreinte du reçu final calculée avec le registre effectivement enregistré,
   et vérifiée contre le snapshot lu après le COMMIT dans le test.

## Portée et limites

La preuve porte sur PostgreSQL synthétique uniquement. Les justificatifs de sauvegarde
sont des objets de test et ne prouvent pas l'état des sauvegardes Scalingo réelles.
Aucune lecture ou écriture des bases réelles, aucun déploiement, aucune migration réelle.
L'absence d'envoi prouvée ici concerne les fonctions SQL testées, pas l'exécution future
d'automatisations par un serveur applicatif réel après import.
Avant toute exécution réelle : audit frais, sauvegarde réelle vérifiée, décisions et
périmètre final explicitement autorisés, et maîtrise des ordonnanceurs/notifications.
Le lanceur existant reste une version d'audit et ne permet aucune exécution réelle.

## Résultats de validation du 9 novembre 2026

- PostgreSQL 18.6, TLS vérifié : 18 tests Node réussis, zéro échec, zéro ignoré.
- PostgreSQL 16.15, TLS vérifié : 18 tests Node réussis, zéro échec, zéro ignoré.
- Correspondances, PowerShell et canal privé : 10 tests réussis, zéro échec, zéro ignoré.
- Total des deux matrices et des non-régressions : 46 tests réussis.
- Les 18 tests de chaque matrice incluent le test parent des 13 scénarios
  d'intégration et les quatre tests unitaires du précontrôle.
- Les deux contrôles ayant reproduit les défauts (corruption d'archive et empreinte
  du reçu) échouaient avant correction et réussissent après correction.
