# Rapprochement et transfert final — préparation du 8 novembre 2026

## État et livrables

Le principe de conservation des mots de passe est validé par le titulaire. La méthode d'exécution et les changements par compte ne sont pas encore validés. Aucun accès Render n'est configuré dans Cloud ; les sorties PostgreSQL Scalingo directes sont bloquées par le réseau et aucune session administrateur n'est utilisée ici. Par conséquent : IDs source/cible, e-mails actuels, doublons réels et comptes non rapprochés restent **non vérifiés**, pas « absents » ni « zéro doublon ».

Le tableau préparatoire de 16 lignes est fourni hors Git : `/workspace/scratch/portailplus-rapprochement-16-a-verifier.csv`. Les noms proviennent uniquement de la liste attendue du contrat d'import déjà versionné, pas d'une nouvelle lecture des bases. Les colonnes IDs et e-mails sont volontairement vides. Ce tableau n'est ni une preuve d'identité ni un manifeste d'exécution.

- `account-inventory-readonly.sql` : métadonnées minimales sous transaction PostgreSQL READ ONLY et inventaire structurel des FK users. Aucun résultat exécuté sur une base réelle à cette étape, aucune empreinte renvoyée.
- `scripts/reconcile-collaborator-accounts.mjs` : fonction pure hors ligne, sans connexion de base ni exécution de transfert. Entrées limitées aux métadonnées ; les champs de secrets sont refusés.
- `collaborator-rights-differences.md` : écarts de helpers et de passerelle, module par module, avec corrections proposées.
- `render-scalingo-auth-continuity.md` : paramètres de hachage, préconditions de migration et recette sans communiquer le mot de passe.

## Rapprochement à compléter via accès autorisé

1. Obtenir deux inventaires contemporains par canal confidentiel et authentifié, avec accès Render en lecture seule. Ne pas utiliser le démarrage applicatif pour lire les bases, car il déclenche des migrations. Ne pas copier de sauvegarde complète pour extraire seulement les comptes.
2. Vérifier le périmètre exact des 16 IDs Scalingo attendus. Les IDs numériques sont stables au sein de chaque base mais ne sont pas comparables comme preuve d'identité entre les deux bases. `directory_key` issu d'un nom normalisé n'est pas une référence Render stable certifiée.
3. Comparer les e-mails exacts, leurs collisions après trim/lower et leurs propriétaires dans **tous les comptes**, y compris les administrateurs hors périmètre. Une égalité d'e-mail unique propose une correspondance ; elle n'autorise aucune écriture. Une variation de casse/espace, un conflit de rôle/identité ou un accès source non activé est soumis à revue.
4. Si l'e-mail cible est vide, les noms ne suffisent pas : faire confirmer une paire explicite ID Render → ID Scalingo avec une référence de revue. Aucun ID n'est inventé ou déduit de l'ordre d'import. Chaque source et chaque cible ne peuvent apparaître qu'une fois ; les autres administrateurs restent exclus.
5. Produire le tableau réel : repère, ID Scalingo, e-mail Scalingo exact, ID Render, e-mail Render exact, statut, raison, validations d'identité et de droits. Établir séparément les totaux vérifiés de doublons, conflits et non-rapprochés. Arrêter le lot tant que des lignes sont non résolues ; ne pas réimporter les 16 users.
6. Les inventaires et tableaux réels ne vont ni dans Git ni dans les journaux. Les conserver dans un espace chiffré, à accès limité et durée de conservation définie, puis les supprimer après recette et obligations de retour arrière.

## Aperçu à présenter avant toute écriture réelle

Présenter les 16 correspondances, les colonnes proposées par compte et les exceptions. E-mail stocké source conservé strictement à l'identique ; empreinte source transférée sans recalcul ni exposition ; rôle, active et must_change préservés selon l'état validé. Les comptes déjà configurés indépendamment sur Scalingo constituent un conflit à arbitrer, jamais un motif d'écrasement automatique. Aucun compte réel créé, aucune fiche définitive supprimée, aucune séquence ni PK changée.

Pour les permissions, présenter une matrice par action et les corrections explicites tirées de `collaborator-rights-differences.md`. La validation du principe de migration ne vaut pas validation de ces nouveaux grants. Ne pas transformer les salariés en administrateurs et ne pas ouvrir globalement la passerelle.

## Transfert sécurisé à préparer pour l'exécution finale approuvée

- Vérifier versions réellement déployées, TLS, schémas, sauvegarde destination et restauration testée ; convenir d'une fenêtre cohérente sans modifications concurrentes des comptes concernés. Render n'est jamais écrit par le processus.
- Exécuter un processus dédié avec source transaction READ ONLY, destination limitée aux IDs approuvés et transport chiffré. Les secrets de connexion proviennent d'une liaison sécurisée d'environnement, jamais d'un argument de commande ou du chat. Désactiver toute trace SQL/paramètres, HAR, dump et journalisation des objets users.
- Lire uniquement les empreintes du lot approuvé en mémoire pendant le transfert, pas lors du rapprochement ordinaire. Ne pas écrire de fichier CSV/JSON contenant les empreintes, ne pas les copier dans Git ou un rapport. Ne pas utiliser un mot de passe provisoire et ne pas changer APP_SECRET.
- Revérifier les champs source et destination et l'unicité e-mail après verrouillage ; si un état a divergé depuis l'aperçu approuvé, annuler. Mettre à jour seulement les champs du lot approuvé et les sessions Scalingo correspondantes si nécessaire ; conserver les PK Scalingo et les liens existants. Tous les imports de tables associés doivent employer la correspondance IDs ; contrôler aussi les liens JSON/chiffrés non déclarés en FK.
- Exécuter dans une transaction destination et contrôler chaque cardinalité. La répétition du traitement doit constater l'état déjà conforme sans créer de lignes ni réinitialiser de mot de passe. Un échec annule le lot. Préparer un retour arrière ciblé et chiffré, sans exposer les anciennes empreintes dans un rapport ou journal.
- Rapporter uniquement les compteurs de correspondances et résultats, sans empreinte ni secret ; les comparaisons d'empreintes se font en mémoire et produisent un booléen, jamais la valeur. Ne transférer aucune session Render, OAuth, invitation, clé ou donnée Ente Auth.

Aucun script d'application aux données réelles n'est fourni/exécuté avant validation de cet aperçu. L'outil de rapprochement retourne toujours `eligibleForDataWrite=false`.

## Test réel préparé

Après transfert autorisé et contrôles techniques : choisir un collaborateur volontaire et autorisé ; lui faire ouvrir lui-même `https://www.portailplus-officine.fr/trevoux` et saisir son mot de passe Render dans sa session privée. Codex ne saisit ni ne reçoit ce mot de passe et ne collecte aucun corps réseau, cookie ou capture sensible.

Confirmer : connexion avec l'adresse habituelle, aucune réinitialisation pour un accès source déjà activé, persistance après F5, modules attendus et refus des modules non autorisés, puis déconnexion et refus d'accès protégé. Les tests d'écriture éventuels utilisent seulement des données fictives isolées et ne déclenchent ni notification ni action métier réelle. Ente Auth est une recette indépendante ; aucun transfert de facteur n'est autorisé ici.

## Conditions de reprise

L'accès Render en lecture seule et une lecture autorisée des métadonnées Scalingo sont les prérequis manquants pour remplir réellement le tableau. Leur absence ne remet pas en cause la compatibilité scrypt démontrée, mais empêche de certifier la continuité individuelle, les doublons réels et les habilitations de chaque salarié.
