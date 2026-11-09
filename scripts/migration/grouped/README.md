# Communication + Planning : audit corrigé, version du 9 novembre 2026

**Cette version est strictement en lecture seule.** Le lanceur n'a plus de paramètre
Execute et le programme distant refuse tout mode autre que audit. Les deux pools
PostgreSQL imposent `default_transaction_read_only=on` et chaque instantané utilise
`REPEATABLE READ READ ONLY`. Aucun serveur, initialize, schema.sql, moteur de
programmation ou mailer n'est lancé. Aucun changement de flag de sécurité.

Les tables et relations du lot initial restent identiques. Les autres modules,
les comptes, les droits et l'authentification ne sont pas modifiés.

## Livraison Windows et saisie sécurisée

Le lanceur est livré via une URL GitHub au commit figé, dont le téléchargement est
vérifié avant communication de la commande. Il télécharge seulement les six fichiers
techniques du programme, vérifiés par SHA-256. Aucun export métier dans GitHub.
Windows PowerShell 5.1 et Scalingo CLI déjà authentifié suffisent sur le PC.
Aucun lien /workspace, archive métier à reconstruire, Python/Node/psql local requis.
Node et pg restent ceux du conteneur temporaire interne Scalingo.

L'URL externe Render est désormais saisie **localement avec Read-Host -AsSecureString**.
Elle n'est plus collée dans une console distante via le pipeline Tee-Object : cette
ancienne combinaison pouvait mal transmettre une saisie depuis PowerShell Windows.
Le client attend `PORTAIL_SECRET_READY_V2`, émis seulement après désactivation de
l'écho du terminal distant. Il transmet ensuite une ligne cadrée et encodée via
l'entrée standard du processus CLI. L'encodage n'est pas le chiffrement : la liaison
est celle, chiffrée, de la CLI Scalingo officielle. Aucune URL secrète dans un argument,
un fichier, une variable permanente d'application ou un journal. Pas de commande
shell construite avec l'URL. Les espaces et guillemets enveloppants du presse-papiers
sont traités ; les caractères de contrôle sont refusés. Les mots de passe URL-encodés
restent intacts. Les sorties inconnues et stderr bruts ne sont pas journalisés.

Le mécanisme attend une URL PostgreSQL EXTERNE Render en `.render.com` pour
`portailtrevoux_db`. Ne jamais la copier dans ChatGPT. PostgreSQL Scalingo reste
inaccessible publiquement ; la cible est jointe en TLS depuis son conteneur interne.

## Résultat de la tentative précédente

Le premier contrôle SQL cible recherche la provenance atomique du lot :

- `NO_COMMIT_RECEIPT` : aucune validation de ce programme n'est attestée. Cela ne
  prouve pas qu'un ROLLBACK a eu lieu ; le statut reste non confirmé.
- `COMMIT_RECORDED_ROWS_VERIFIED` : provenance trouvée et lignes suivies identiques.
- `COMMIT_RECORDED_WITH_LATER_DIFFERENCES` : provenance trouvée, mais des lignes ont
  changé ou disparu depuis (par exemple lecture ou expiration applicative).

La provenance initiale est enregistrée dans la même transaction que les données.
Un audit d323137 dont ready=false n'appelait pas la transaction d'import ; il ne
constitue toutefois pas un journal exhaustif d'éventuelles autres tentatives.
Dans tous les cas cette livraison reste en audit, sans possibilité de reprise
implicite d'une écriture. Elle ne crée, ne télécharge et ne renouvelle aucune
sauvegarde. La sauvegarde récente sera revérifiée avant une future écriture autorisée.

## Collaborateurs et références orphelines

Les 16 correspondances approuvées sont toujours contrôlées sur les identités complètes
uniques et rôles. Les autres références utilisent des identités complètes avec
vérification des e-mails/clés complets disponibles. Le Test cible 1 est toujours exclu.

L'audit regroupe toutes les références de chaque ID non rapproché (et contrôle
explicitement les IDs source 14/15), même si une ligne comporte plusieurs IDs inconnus.
Il distingue compte source existant actif/inactif et compte source absent. Il expose
les tables concernées, le rôle/statut et les candidats cible. L'identité complète est
réservée au rapport privé local. Aucun rapprochement arbitraire, aucun compte créé.
Si une référence JSON est orpheline d'un compte supprimé, l'identité historique doit
être établie par une preuve fiable avant une décision de reprise. Pas de substitution
vers une autre personne, pas de suppression silencieuse des cellules.

## Publications : analyse des conflits de clé source

L'ancienne version réutilisait l'ID cible d'une publication de même source_key puis
exigeait l'égalité de toute la ligne, ce qui bloquait notamment une date différente.

La nouvelle règle distingue :

1. Même source_key, univers et titre ; date différente : réutiliser la ligne cible
   **intégralement inchangée**. Lors d'une future transaction approuvée, conserver
   l'enregistrement source original exact dans la provenance `publicationSources`.
2. Même source_key mais contenu différent : signaler les champs différents et
   `PUBLICATION_FORK_DECISION_REQUIRED`. La proposition est de conserver les deux :
   la cible reste intacte, la source reçoit un ID libre et une clé technique
   `migration:render:publication:<sourceId>:<empreinte>`. La source_key originale et
   toutes les métadonnées originales restent dans la provenance. Pas de remplacement.

La règle 2 n'est simulée sans blocage qu'avec la décision explicite
`publicationConflicts: preserve-both`. Elle ne change aucune donnée dans cette
livraison d'audit. Le mapping et la provenance évitent la duplication lors des
relances ; les changements indépendants Scalingo restent prioritaires.
Le rapport liste chaque conflit (y compris les six IDs signalés si encore présents),
les champs divergents et la solution proposée. Aucune prétention de connaître les
valeurs actuelles réelles sans lecture du nouvel audit.

## Lectures : décision indispensable quand le compteur ne suffit pas

Les états seen/seen_at/archived des messages sont distincts de publication_reads.
Leur migration garde les états individuels et ne rejoue aucun envoi.
publication_reads ne stocke qu'un last_id par personne et univers. Deux historiques
intercalés ou contradictoires ne peuvent pas toujours être représentés par ce seul
compteur. Les blocages historiques restent donc actifs par défaut.

Proposition sans perte silencieuse : décision `readHistory:
preserve-target-archive-source`. La simulation conserve chaque compteur Scalingo
exactement ; elle ne marque aucune publication cible supplémentaire comme lue.
Pour une personne sans compteur cible, la valeur conservatrice est zéro. Les états
Render exacts par publication ET l'état cible au moment de la décision sont conservés
dans une archive de provenance immuable, identifiée par empreinte (`readArchives`).
Aucun historique n'est jeté et aucun état lu Render n'est faussement revendiqué comme
fusionné dans l'interface : certaines publications déjà lues sur Render pourraient
apparaître non lues sur Scalingo. Ce compromis exige un accord explicite.

Si une restitution fidèle des deux historiques directement dans l'interface est
exigée, il faut un modèle de lecture par publication et adapter les routes de
consultation/marquage. Ce serait un changement séparé à approuver : il n'est pas
introduit ni déployé ici. Le modèle actuel n'est pas assoupli pour forcer le passage.

## Décisions et rapports

Un fichier de décisions LOCAL facultatif peut simuler les deux politiques :

```json
{
  "publicationConflicts": "preserve-both",
  "readHistory": "preserve-target-archive-source"
}
```

Le paramètre DecisionsPath accepte ce fichier pour un audit uniquement. Sans fichier,
aucune décision n'est supposée. Toute future fonction d'import devra recevoir une
approbation du lot et l'empreinte exacte des décisions ; un changement de politique
invalide l'autorisation. Aucun mapping utilisateur inconnu n'est accepté dans ce fichier.

Le rapport terminal présente les volumes, catégories/nombre de conflits, décisions
nécessaires et état de la tentative précédente. `rapport.txt` et `audit.json` contiennent
les informations techniques sans noms ni contenus métier. Les noms et le comparatif
détaillé des publications sont envoyés chiffrés (RSA-OAEP + AES-CBC authentifié par
HMAC-SHA256), puis déchiffrés uniquement par la clé privée éphémère du PC dans
`audit-prive.json`. La clé privée n'est jamais envoyée ni enregistrée. Le dossier Windows
est limité par ACL à l'utilisateur courant. Ces fichiers privés ne doivent pas être
publiés dans GitHub. Les journaux Scalingo ne reçoivent pas ces identités en clair.

## Vérifications et limites

Les tests se font sur deux PostgreSQL isolés avec TLS et données synthétiques :
relations, rollback incluant séquences/DDL, idempotence, publication conservée/forkée,
archivage fidèle des lectures, refus des décisions implicites, diagnostic de commit.
Le protocole stdin est testé avec un pseudo-terminal et vérification réelle du bit
ECHO avant transfert. Les primitives PowerShell/.NET déchiffrent un rapport Node et
refusent un HMAC altéré ; le parseur PowerShell contrôle aussi le lanceur.

Le poste Windows réel, les dernières identités Render/Scalingo, les six comparatifs
réels et le nombre actuel de conflits restent à lire par la commande sécurisée sur
le PC autorisé. Les accès SQL du PC ne sont pas automatiquement ceux de Codex.
Aucune migration réelle, modification Render/main, notification ou mise à jour
applicative n'est exécutée par cette préparation.
