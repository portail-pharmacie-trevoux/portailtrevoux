# Portail+ — Migration PostgreSQL 18 (Render) vers 17 (Scalingo)

Statut : préparation uniquement ; aucun transfert de données exécuté.

## Audit lecture seule de Render (27 octobre 2026)
- PostgreSQL 18.6 ; base ~109 Mo ; 69 tables publiques.
- Aucune extension autre que plpgsql, aucune fonction SQL personnalisée, aucun trigger utilisateur, aucune vue, table partitionnée, table étrangère ou event trigger.
- Cible Scalingo : PostgreSQL 17.11, Business 1G, 20 Go, HDS osc-fr1.
- Les documents et pièces jointes sont dans les colonnes bytea PostgreSQL ; ne pas les omettre de l'export.

## Prérequis impératifs
1. Confirmer auprès de Scalingo la disponibilité éventuelle de PostgreSQL 18 en osc-fr1. Privilégier une cible 18 si possible.
2. Vérifier une sauvegarde Render complète et **restaurable**, séparée du dump de migration ; ne pas confondre sauvegarde planifiée et sauvegarde testée.
3. Vérifier les sauvegardes Scalingo et effectuer un test de restauration dans une cible isolée.
4. Préparer un environnement de test sans données patients identifiables ; respecter HDS/RGPD et habilitations.
5. Maintenir SCALINGO_PREVIEW_SAFE_MODE=true sur la prévisualisation ; ne pas connecter les intégrations de production.

## Procédure proposée (non exécutée)
- Inventorier schéma, types, contraintes, index, séquences, encodage, collations, permissions et dépendances PostgreSQL 18.
- Générer un dump logique cohérent depuis Render avec pg_dump compatible serveur 18 ; **ne jamais utiliser pg_dump 17 contre un serveur 18**.
- Vérifier les instructions SQL et objets incompatibles avec PostgreSQL 17 ; prévoir adaptation contrôlée si nécessaire.
- Restaurer d'abord dans une base 17 jetable isolée ; valider intégrité, volumes, contraintes, séquences, encodage, bytea et tests applicatifs.
- Éviter toute copie de données réelles vers un environnement non autorisé ; sécuriser stockage temporaire et purge des dumps.
- Pour bascule finale : fenêtre de gel des écritures, sauvegarde complète vérifiée, export cohérent, import, validation, bascule DNS et plan de retour arrière ; Render reste en service jusqu'à validation explicite.

## Points ouverts
- Version 18 disponible sur Scalingo ?
- Mode de restauration/accès base cible et compatibilité pg_dump/pg_restore.
- Règles de chiffrement TLS en transit et paramètres applicatifs.
- Réplication/synchronisation des écritures pendant la transition.
- Tests de restauration et stratégie de retour arrière.

Aucune migration ni suppression n'est autorisée par ce document.
