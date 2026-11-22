# Gel PostgreSQL temporaire pour Portail+

**Faisabilité conditionnelle.** Le test isolé démontre les mécanismes PostgreSQL, pas les droits disponibles sur l’addon HDS. Aucun rôle, ACL, processus ou service réel n’a été modifié. Le gel PostgreSQL complète la maintenance et l’arrêt des producteurs de notifications.

## 1. Inventaire et attribution

Après accord d’accès en lecture seule, appliquer [l’inventaire SQL](../../scripts/sql/scalingo-postgres-freeze-inventory.sql) via une connexion libpq approuvée avec `sslmode=verify-full`, CA et cible confirmées. Il restitue les rôles et leurs privilèges, les appartenances transitives, les propriétaires, les routines SECURITY DEFINER, les sessions et les transactions préparées, sans lire les requêtes ni les secrets. L’inventaire des souscriptions peut être non vérifiable avec le rôle d’observation.

Sous PowerShell 7, avec le tunnel local ouvert sur 10000 et la CA approuvée déjà configurée dans libpq (par exemple via `PGSSLROOTCERT`) :

```powershell
psql -X -W -v ON_ERROR_STOP=1 -U (Read-Host 'Rôle PostgreSQL Scalingo autorisé') -d "host=portailplus-7495.postgresql.c.osc-fr1.scalingo-dbs.com hostaddr=127.0.0.1 port=10000 dbname=portailplus_7495 sslmode=verify-full connect_timeout=5 options='-c default_transaction_read_only=on'" -f .\scripts\sql\scalingo-postgres-freeze-inventory.sql
```

Le mot de passe est demandé par psql. Le résultat est privé. La première section donne les capacités du compte utilisé et les appartenances directes avec option d'administration. Elle ne prouve pas que chaque rôle ou backend peut être suspendu. Un rôle disposant de privilèges d'administration peut exécuter cet inventaire, mais cette commande impose une transaction en lecture seule.

Faire rattacher chaque rôle à son producteur par le responsable de l’application, du Scheduler, des intégrations et de la base. Les sessions observées sont une photographie, et un rôle silencieux peut se connecter plus tard. Recenser aussi les autres bases du cluster, les clients via pooler, les rôles et propriétaires privilégiés, les tâches one-off, la réplication et les connexions partagées. Un rôle ou une session non attribuée, ou un manque de visibilité permettant de masquer des transactions, bloque le gel.

## 2. Gel proposé et points d’arrêt

1. Avant approbation, consigner les droits effectifs et leur origine, les attributs LOGIN, les appartenances, les ACL de base, schémas, tables, colonnes, séquences et routines, les accès réseau et l’état des producteurs. Préparer la restauration de ces valeurs exactes. Ne pas utiliser une sauvegarde de données avec `--no-owner --no-privileges` comme preuve de sauvegarde des ACL.
2. Réserver un compte d’exécution distinct, non partagé. Accorder seulement les droits requis et vérifiés. Le code actuel avance certaines séquences avec `ALTER SEQUENCE … RESTART`, ce qui suppose une autorité de propriétaire ou équivalente. Les seuls droits SELECT et INSERT ne couvrent donc pas l’exécuteur actuel. Si ce droit ne peut pas être délégué de manière circonscrite, adapter et tester la stratégie de séquences ou réserver cette action à l’administrateur habilité. Ne pas donner des droits d’administration généraux au compte de migration.
3. Arrêter ou suspendre l’entrée applicative, les notifications et tous les producteurs connus. Ensuite, préférer un filtre réseau ou une barrière de connexion appliquée par l’administrateur de la plateforme, qui n’admet que le compte de migration et les observateurs nécessaires. Si une barrière de rôles est retenue, bloquer les logins écrivains et leurs chemins de reconnexion avant de drainer les sessions. `NOLOGIN` s’applique à tout le cluster et doit être exclu pour un rôle partagé hors périmètre. Une restriction de CONNECT doit couvrir `PUBLIC` et les droits directs ou hérités, et ne ferme pas les sessions établies.
4. Sous contrôle administrateur, attendre le drainage, puis terminer les seules sessions applicatives résiduelles si cela est autorisé. Vérifier la disparition de leurs backends et l’absence de transactions préparées ou de réplication entrante active. Tester le refus de reconnexion avec des identités représentatives sur une cible isolée. En réel, utiliser une vérification d’accès approuvée et sans DML. Une session déjà ouverte peut conserver `SET ROLE`, et un propriétaire ou un compte privilégié n’est pas neutralisé par une simple révocation d’INSERT.
5. Examiner les voies restantes : `SET ROLE`, rôles hérités, propriétaires, grants PUBLIC, ACL de colonnes et de séquences, routines SECURITY DEFINER, background workers et accès d’administration. L’écriture par un administrateur hors périmètre doit être empêchée par la plateforme ou soumise à un contrôle opérateur explicite et vérifiable pendant la fenêtre. Les tests de refus représentatifs et les observations indépendantes doivent concorder avant toute attestation.

Un compte Scalingo capable d’accorder des droits aux tables ne dispose pas nécessairement des droits pour altérer tous les rôles, fermer tous les backends, modifier la politique réseau ni contrôler les comptes gérés. Ne rien conclure sur les droits réels à partir des exemples de documentation. `pg_signal_backend` ne permet pas d’interrompre un backend superutilisateur. En mode autonome, n’accepter que les barrières que les administrateurs HDS internes peuvent imposer et vérifier eux-mêmes. Si le propriétaire, les rôles partagés, le pooler ou des comptes privilégiés ne peuvent pas être couverts, conserver le verrou. Le blocage est alors l’impossibilité de couvrir ces chemins d’écriture avec les droits disponibles.

## 3. Scheduler et processus ponctuels

La mise à zéro des conteneurs persistants ne suspend pas le Scheduler ni les conteneurs ponctuels. La documentation Scalingo indique que la désactivation des tâches provenant de `cron.json` requiert sa modification ou suppression et une nouvelle livraison. Si la livraison active n’a aucune tâche, confirmer ce constat via le plan de contrôle. Empêcher aussi la création de nouveaux one-offs pendant la fenêtre et inventorier ceux déjà lancés. `one-off-stop` demande un arrêt asynchrone. Confirmer ensuite la disparition du conteneur et le drainage de sa connexion. Les ordonnanceurs hors Scalingo et les notifications doivent être neutralisés séparément.

## 4. Attestation et reprise

Le vérificateur peut recouper l’inventaire Scalingo avec les sondes des deux conteneurs, mais il attend de `readLease` une preuve indépendante de la barrière PostgreSQL. Rattacher au même lot et à la même génération les références d’approbation, la politique d’accès effectivement appliquée, les sessions résiduelles observées, l’état des tâches et notifications et le résultat des vérifications de droits. La preuve de gel doit rester vérifiable avant les écritures, avant COMMIT et après la lecture de vérification. Une attestation uniquement déclarative ou fondée sur le résultat d’une requête ponctuelle ne suffit pas. La barrière reste en vigueur jusqu’à sa libération humaine, même si une attestation de fraîcheur expire.

Après résultat de COMMIT et intégrité vérifiés, ou rollback confirmé, restaurer les seules ACL et attributs modifiés à partir de l’état de référence. Comparer les privilèges effectifs après restauration, indépendamment de l’ordre de sérialisation des ACL. Rouvrir ensuite les producteurs sur décision explicite et tracer les heures, acteurs, références et contrôles. Si l’état du commit ou le gel devient incertain, maintenir la barrière et diagnostiquer en lecture seule.

## 5. Recette isolée

```bash
PORTAIL_SYNTHETIC_POSTGRES_IMAGE=postgres:18.6-bookworm node scripts/migration/grouped/test-isolated-postgres.mjs --freeze-only
```

La recette couvre l’inventaire, les privilèges hérités et PUBLIC, le propriétaire, une session déjà ouverte après NOLOGIN, sa terminaison, les droits restreints du compte de migration et la restauration effective des ACL. Elle montre aussi qu’un administrateur privilégié reste capable d’écrire. L’addon HDS, ses privilèges et le raccordement au mécanisme réel de gel restent à vérifier. `REAL_EXECUTION_ENABLED=false` est inchangé.
