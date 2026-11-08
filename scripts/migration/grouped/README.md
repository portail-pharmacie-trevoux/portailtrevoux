# Migration groupée Communication et Planning — Render → Scalingo

Programme ponctuel lancé depuis Windows PowerShell et Scalingo CLI déjà authentifié.
Les données réelles ne sont ni exportées dans Git ni transmises dans une conversation.
Les deux connexions PostgreSQL utilisent TLS avec validation des certificats.
Scalingo reste accessible uniquement depuis le conteneur temporaire interne : aucun
accès Internet de la base cible, aucun tunnel public, aucune modification réseau.

## Livraison et lancement

Le code est livré par `raw.githubusercontent.com`, avec version Git figée dans la
commande de lancement et empreintes SHA-256 des quatre fichiers exécutés. Le lanceur
Windows télécharge seulement du code dans `%LOCALAPPDATA%\PortailPlus`. Il ne dépend
pas d'un lien `/workspace`, de Python, Node, psql, Git ou d'une archive de données sur
le PC. Node et `pg` sont réutilisés dans le conteneur applicatif Scalingo.

`Start-Migration.ps1` sans option fait exclusivement l'audit. Le mode `-Execute` doit
être autorisé par l'utilisateur avant lancement, puis demande encore la confirmation
exacte `MIGRER MESSAGERIE ET PLANNING` après l'audit automatique sans conflit.

Le seul secret demandé est l'URL **externe** PostgreSQL Render terminant par
`.render.com`, base `portailtrevoux_db`. La saisir uniquement dans l'invite masquée
locale de la CLI, jamais dans ChatGPT. Elle n'est ni un argument de processus, ni un
fichier, ni une variable permanente Scalingo. Elle passe par l'entrée interactive
chiffrée officielle de la CLI et reste en mémoire dans le processus temporaire.
Un rôle SQL dédié en lecture seule est recommandé. Toutes les requêtes source du
programme sont de lecture, dans une transaction `REPEATABLE READ READ ONLY`, avec
`default_transaction_read_only=on`, identité de base et TLS vérifiés.
Le connecteur ChatGPT `query_render_postgres` ne fournit pas cette URL à Codex.
Si aucune URL PostgreSQL externe autorisée n'est disponible, l'exécution directe
reste bloquée : ne pas contourner les protections ni exposer la base Scalingo.

## Sauvegarde et absence d'envois

Le lanceur utilise uniquement `scalingo backups --addon ...`, vérifie un statut
`done` et une date de moins de 36 heures. Il réutilise la sauvegarde existante la
plus récente ; aucune sauvegarde n'est créée ou téléchargée. Si la liste est
inaccessible ou son format ne permet pas cette vérification, l'import est bloqué.
La restauration réelle de cette sauvegarde n'est pas attestée par ces contrôles.

Le conteneur ne lance jamais le serveur, initialize, schema.sql, le moteur des
programmations, les approbations de congés, la publication de planning ou un mailer.
Il exige `SCALINGO_PREVIEW_SAFE_MODE=true` et `SCALINGO_PREVIEW_UI_ENABLED=true`, qui
correspondent au serveur de prévisualisation sans tâches planifiées. Aucun flag de
sécurité n'est changé par le programme. Si les tâches ne sont plus confirmées
inactives, arrêt avant import : leur suspension réclamerait une décision séparée.
Les publications et messages historiques sont des données reprises ; aucun nouvel
avis de migration ou de publication n'est généré.

## Périmètre exact

- Communication : team_messages (pièces jointes comprises), team_message_recipients,
  message_automations, message_automation_runs, message_automation_changes,
  publications et publication_reads.
- Planning : schedule_weeks, schedule_templates, schedule_posts, leave_requests,
  leave_schedule_changes.
- Paramètre métier autorisé : uniquement `schedule_accountant_email`, ajouté si
  absent, refusé si une valeur cible différente existe. Aucune copie globale de settings.
- Lecture de soutien : users, sans mot de passe/MFA/session, et seulement l'identité
  du service/référent de quality_services pour résoudre les audiences `serviceIds`.
  Aucun compte, profil, droit ou service qualité n'est modifié.
- Provenance technique : une seule clé settings dédiée,
  `migration:render:communication-planning:v1`, contenant mappings et empreintes,
  jamais le contenu des messages ou les données d'authentification.
- Si le schéma Communication optionnel manque : les trois tables de programmation
  et les colonnes texte optionnelles manquantes sont annoncées dans l'audit et
  créées dans la même transaction uniquement après autorisation. Aucun schéma des
  autres modules n'est modifié. Toute autre différence de schéma bloque l'import.

Les tables Commandes, Merchandising, Challenges, Fun, RH, Procédures et Laboratoires
ne sont ni lues ni écrites. Les bilans de commandes/challenges déjà contenus dans
les messages restent des instantanés historiques : aucun rapprochement de leurs
numéros de lignes avec les futurs imports manuels n'est inventé.

## Précontrôles automatiques

Les 16 correspondances approuvées sont revérifiées avec les identités complètes
uniques, les rôles et les IDs attendus. Une égalité de numéro n'est jamais utilisée
comme rapprochement. Les autres auteurs/destinataires doivent être rapprochés par
identité complète unique, avec vérification des signaux e-mail/clé annuaire quand
ils existent. Le compte Test cible 1 ne peut être une destination source. Tout auteur,
destinataire, acteur ou verrou sans correspondance bloque. Aucun compte absent
(notamment un administrateur non encore activé) n'est créé automatiquement.
Les fonctions, positions planning et statuts différents sont signalés et conservés
côté Scalingo ; la migration ne touche pas aux corrections manuelles des fiches.

Les clés JSON `userId:date`, `userId:weekday`, champs userId/by, tableaux postIds,
leaveRequestId et audiences userIds/serviceIds sont convertis. Les fils supprimés
restant référencés par thread_id reçoivent des IDs réservés sans inventer de message
racine. Les pièces jointes, microsecondes, archives, lectures, statuts de congés,
révisions et l'état NULL de published_revision restent conservés. SQL NULL et
la valeur JSON `null` sont distingués et préservés dans les historiques de congés.

Les conflits bloquent tout le lot avant écriture : semaine existante différente,
poste/modèle homonyme incompatible, programmation de même identifiant différente,
paramètre incompatible, demande pending en double, correspondance ambiguë ou
copie de message déjà présente sans provenance.

**Limite du modèle de lecture** : publication_reads possède un seul last_id par
univers. Quand avancer ce compteur pour restaurer les lectures Render marquerait
comme lues des publications Scalingo encore non lues, les deux états ne sont pas
représentables simultanément. Le programme signale ce conflit et attend une décision
au lieu de changer silencieusement les lectures. Aucune fonctionnalité n'est ajoutée
pour contourner ce modèle.

## Transaction, intégrité et reprise

Une transaction unique cible couvre les douze tables, le seul paramètre autorisé,
la provenance et les éventuels ajouts de schéma déclarés. Des verrous bornés et le
digest de l'audit empêchent une écriture sur une cible modifiée entre-temps. Parents
et réponses sont ordonnés selon leurs dépendances. Aucune suppression ni CASCADE.
Les séquences sont uniquement avancées par `ALTER SEQUENCE RESTART`, transactionnel,
et réservent aussi les IDs de fils dont la racine a été supprimée.

Avant COMMIT : comparaison de chaque ligne écrite, de toutes les lignes cibles
préservées, des volumes, des référents et des pièces jointes (empreintes sur leur
représentation hexadécimale exacte avec toutes les autres colonnes). Les contraintes
FK/check/unique PostgreSQL restent actives. Toute erreur annule données, séquences,
DDL et provenance pour les deux modules ensemble. Après COMMIT : nouvel audit
indépendant, qui doit ne demander aucune insertion/mise à jour restante.

La provenance rend les relances idempotentes. Une évolution seulement sur Render
peut être reprise sur une ligne créée par le programme si la ligne cible est restée
identique à sa version importée. Une évolution indépendante Scalingo est conservée ;
une évolution divergente des deux côtés bloque. Une disparition source n'entraîne
jamais de suppression automatique cible. Un enregistrement préexistant Scalingo
réutilisé n'est jamais écrasé par une évolution ultérieure source.

Cela permet une reprise après gel Render : même programme, nouvel instantané cohérent,
contrôle à trois états et nouvelle autorisation du lot. Le programme n'effectue pas
lui-même le gel Render. Après COMMIT, aucun retour arrière destructif automatique :
le reçu/provenance permet de préparer une correction ciblée après validation.

## Rapport et limites vérifiées

`rapport.txt` local ne contient que volumes, codes de conflits, IDs techniques et
empreintes. Aucun message, horaire, commentaire de congé, pièce jointe, secret ou
empreinte de mot de passe n'est affiché. Les 965 lignes Communication et 77 lignes
Planning fournies par l'utilisateur sont des références du 8 novembre ; les volumes
réels seront relus automatiquement au lancement. Ils ne sont pas déclarés vérifiés
contre les bases réelles par Codex.

Les tests automatisés utilisent deux PostgreSQL isolés avec données synthétiques et
TLS vérifié. Le réseau réel Render→conteneur Scalingo, la saisie interactive Windows
et les conflits réels ne sont pas réputés testés avant le lancement autorisé sur PC.
Un échec après retour COMMIT ne doit jamais être traité comme une absence d'import :
lancer l'audit pour relire la provenance, ne jamais réessayer automatiquement.
