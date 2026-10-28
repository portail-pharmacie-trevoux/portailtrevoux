# Portail+ — Plan de restauration d'essai PostgreSQL 18 (préparation uniquement)

## Périmètre et garde-fous
- Production Render (main, base portailtrevoux_db) : ne rien modifier.
- Scalingo (branche chore/scalingo-hds-preparation-2026-10) : conserver SCALINGO_PREVIEW_SAFE_MODE=true ; ne pas lancer l'application complète.
- Aucune donnée réelle ne doit être copiée avant validation des conditions contractuelles HDS/RGPD, des habilitations et du transfert.
- Ne jamais stocker d'archive, de secret ou de données de santé dans GitHub, ChatGPT, les journaux ou un stockage non autorisé.

## Sauvegarde source
- Export Render du 28/10/2026, archive .dir.tar.gz de 63,2 Mo, conservée localement sous forme .7z AES-256.
- Le test tar -tzf et le test 7-Zip ont réussi. Cela ne prouve pas une restauration complète.
- SHA-256 calculé par l'opérateur : conserver l'empreinte et le mot de passe séparément, sans les publier.
- Vérifier la disponibilité d'un export plus récent avant bascule : l'export du 28/10 est un instantané, pas une synchronisation continue.

## Préparation sans données
1. Identifier la méthode documentée d'import de sauvegarde Render au format directory tar.gz ; examiner le contenu du tar et les versions pg_restore, sans exposer de données.
2. Choisir une base de restauration strictement distincte de portailplus_7495 ; estimer son coût avant toute création. Éviter de restaurer dans la base applicative actuelle.
3. Confirmer l'environnement HDS contractuel, les rôles et droits d'accès, la gestion des secrets, les logs, les sauvegardes et la politique de rétention.
4. Concevoir un transfert TLS de bout en bout, sans déchiffrement durable sur le poste Windows 11 non chiffré ; interdire les URL publiques et journaux de commandes contenant des secrets.
5. Définir la méthode de restauration avec pg_restore, les extensions, propriétaires et privilèges, et un contrôle des erreurs ; exécuter seulement après autorisation explicite.

## Critères de validation de la restauration
- Restauration terminée sans erreur bloquante ; version PostgreSQL 18 compatible.
- Inventaire des schémas, tables (69 attendues à la dernière mesure), index, contraintes, séquences et extensions.
- Contrôle du nombre de lignes et des volumes par table, en tenant compte de l'instantané source.
- Contrôle de la présence et de la taille des documents bytea, sans divulguer leur contenu.
- Tests de requêtes en lecture seule ; contrôle des droits et du TLS.
- Aucun e-mail, rappel, tâche planifiée, OAuth ou autre effet externe depuis l'environnement d'essai.
- Documenter le résultat, les écarts, la procédure de retour arrière et la purge sécurisée des copies temporaires.

## Bascule ultérieure (hors de portée du présent plan)
- Sauvegarde récente et restauration éprouvée ; fenêtre de maintenance ; gel des écritures ; synchronisation finale ; validation fonctionnelle ; plan de retour arrière.
- Aucune bascule de production sans approbation explicite.
