# Matrice fonctionnelle

L'inventaire CSV joint détaille TOUTES les méthodes/routes déclarées dans les deux
applications. Cette matrice couvre aussi les comportements sans nouvelle route.
« Routage testé » signifie sondage local avec terminal fictif. « Métier partiel » signifie
tests synthétiques ciblés réussis, pas recette de toute l'interface ni preuve de parité.
Toutes les présences, volumes, clés et pièces jointes réelles restent **non vérifiés**.

## Synthèse par univers

| Module | Routes main / Scalingo | État fonctionnel côté Scalingo | Données et fichiers à rapprocher, présence réelle inconnue | Droits, dépendances et notifications | Tests locaux / limites |
|---|---:|---|---|---|---|
| Agenda et Google | 12 / 12 | Routage transmis si opt-in Google ; tâches personnelles et rappels locaux disponibles ; pas de tick automatique | calendar_cache, calendar_tasks, calendar_reminders ; settings calendar_id/name ; aucun jeton Render à copier | Session ; admin pour OAuth/sélection ; CSRF, state, PKCE ; lecture seule Google ; APP_SECRET Scalingo indépendant | OAuth, scopes, chiffrement, rappels testés avec Google simulé ; domaine www et renouvellement à réconcilier |
| Messagerie/Communication | 14 / 10 | Liste, envoi simple, fils, lecture/archivage transmis ; réponses et pièces jointes bloquées ; automations non montées | team_messages, recipients, publications, reads, automations/runs/changes ; bytea et liens parent/thread ; lot groupé en attente d'autorisation | ACL destinataire/auteur ; CSRF ; chargement des listes peut purger les messages expirés ; réception de programmations différente | Messagerie/attachments testés hors filtre ; filtres sondés ; préservation PostgreSQL partielle, voir tests ignorés |
| Collaborateurs et accès | 19 / 20 | Comptes/e-mails/administration ordinaires transmis ; fiches, inactifs, suppression protégée spécifiques ; invitations seulement en aperçu | users et employee_details ; 16 IDs/relations/fonctions à conserver ; état actuel des 14 accès inconnu | Admin serveur, protection des administrateurs, dépendances, révision et sessions ; certains outils restent TEST uniquement | Droits et invitations simulés ; pas de recette des vrais comptes, ni saisie de mot de passe/TOTP |
| Emplois du temps et absences | 30 / 30 | Consultation hebdo, journée et publication transmises ; congés, mensuel, copie, verrous, modèles et ordre du personnel restreints | schedule_weeks/templates/posts, leave_requests/changes, job/schedule_position et JSON ; clés remappées, source 14 non arbitrairement affecté | Publication crée un message INTERNE ; branche cible tous les actifs, main cible les collaborateurs affectés ; aucun e-mail direct | Validation/planning synthétiques ; migration/archives/rollback isolés ; recette réelle semaine du 16 non faite |
| Ressources humaines | 13 / 13 | Import/consultation des documents, signataires, historique et édition limités disponibles ; signature, rafraîchissement et signé bloqués | hr_documents, hr_signature_requests et fichiers ; lien owner_id ; reprise manuelle prévue, statut inconnu | Documents personnels, accès propriétaire/admin ; Youtrust non configuré dans le preview ; aucune enveloppe à renvoyer | Métier RH simulé ; pas de signature externe ni validation de documents réels |
| Démarche qualité | 30 / 29 | Registre erreurs/appels/export/import TP transmis ; services, évaluations, suivi formations et paramètres TP restreints ; import d'attestations absent | quality_services/evaluations/errors/prescriber_calls/tp_months ; températures/comments/imports/sensors ; attestations RH | Référents/propriétaire/admin selon fonction ; write boundary ; import et commentaires température TEST uniquement ; droits non élargis | Erreurs/TP/formations simulés ; schémas isolés ; import TP PostgreSQL ignoré dans la suite locale faute d'URL dédiée |
| Laboratoires | 13 / 14 | Fiches, logos, documents, renommage et conditions disponibles dans le code ; export XLSX bloqué ; email délégué mais fournisseur désactivé | laboratories, documents, logos et condition_history ; dates à préserver ; données manuelles existantes prioritaires | Permissions de l'univers ; révisions ; destinataires mail à vérifier ; MAIL_SENDER_EMAIL interdit au bootstrap | CRUD/conditions/export simulés ; aucune preuve d'envoi opérationnel |
| Contacts utiles | 11 / 12 | CRUD/restauration/import CSV/XLSX et documents transmis ; export XLSX bloqué ; parse-xlsx supplémentaire côté branche | useful_contacts et useful_contact_documents ; binaires et liens ; reprise manuelle/compléments à vérifier | Admin pour modifications/export ; consultation selon univers ; CSRF | Pièces jointes et routes testées ; pas de comparaison réelle des contacts |
| Commandes programmées / Ente Auth | 21 / 21 | Statut/setup/confirm/unlock/touch/lock et lectures transmis ; création/import/modification/confirmations/livraisons/suspensions/suppression/export bloqués | order_planning, quality_services de responsables, ordre des lignes ; reprendre manuellement ; garder MFA propre à Scalingo | Garde MFA serveur AVANT les commandes, codes périssables, session ; papier/recovery/reset/totp-disable/users bloqués ; aucun secret Render à importer | MFA/permissions simulées testées ; scénario PostgreSQL complet identifié mais ignoré dans la suite locale ; compte titulaire historiquement validé, non retesté ici |
| Merchandising | 26 / 26 | Consultation, promotions/affectation et documents de promotions transmis ; zones, validation mensuelle, impact, documents généraux et exports restreints | zones/promotions/events/documents, prix/stocks, noms/overrides/EAN ; statut des schémas préparés manuellement à contrôler | Droits/référents ; recherche Web non raccordée comme main ; rappels de places libres arrêtés ; éviter reprises novembre destructives | Modèles/promotions/documents simulés ; recherche externe et parcours complet non testés |
| Challenges | 10 / 11 | CRUD et suppression admin sûre transmis ; logos, bilans PDF/import/analyse/confirmation/envoi restreints | team_challenges, challenge_reports, digests/reminders ; liens lab/personnes ; reprise manuelle | Consultation/édition, protection suppression ; analyse IA et Gmail pour bilans non activés ; aucun envoi automatique | Validation et dépendances synthétiques ; pas d'analyse ou d'envoi réel |
| Fun | 16 / 16 | Bibliothèque, sélection, suppression et CSV transmis ; administration et synchronisation YouTube/YouTube Music bloquées | music_tracks ; clés normalisées anti-doublons ; reprise manuelle ; paramètres playlists à reconfigurer sans jetons source | Admin pour import/suppression/export ; édition selon droits ; Google scopes Calendar ne remplacent pas ceux de YouTube | Musique/CSV synthétiques ; pas de playlist externe vérifiée |
| Procédures | 7 / 7 | Import de fichiers, téléchargement et administration/restauration transmis ; création directe POST /api/procedures bloquée | procedure_documents, procedure_files ; 55 fichiers historiquement exportés ne prouvent pas leur présence actuelle ; SHA-256 à rapprocher | Permissions procédure/admin ; conserver les deux lignes historiques et le mapping d'IDs de l'import manuel | Fichiers et limites de taille testés antérieurement ; intégrité réelle à confirmer sans réimport aveugle |
| Formations et documents de référence | 6 / 6 | Import, liste, fichiers, impression, édition/suppression transmis ; complément attestations/DPC absent ou incomplet dans Qualité | training_documents, hr_documents et 5 nouveaux champs de formation ; owner_id à conserver | Droits univers, confidentialité personnelle ; pas de nouvelles habilitations automatiques | Documents testés synthétiquement ; les noms de fichiers ne remplacent pas les champs structurés main |
| Portail et autres liens | 7 / 7 | Login, session, santé et médias disponibles ; quick-links et générique univers filtrés ; paie externe bloquée via API | portal_quick_links, assets vidéo/PDF, paramètres autorisés ; liens Groupement/Silae à contrôler | TLS, cookies host-only, origine et CSRF ; `/trevoux` alias ; pas d'authentification externe pendant cet audit | Routage local, vidéo/Range, redirections testés ; aucun DNS/TLS/compte réel contrôlé |
| Calculs / PromoFlash | 3 / 3 | Rubrique volontairement retirée et accès direct refusé ; code/données conservés | Aucun nettoyage ni suppression autorisé | Exception demandée antérieurement, à conserver dans le périmètre accepté de bascule | Refus ciblé testé ; ne pas réouvrir pour améliorer artificiellement le taux de parité |
| Accès testeurs | 4 / 0 | Absents côté branche ; éléments d'interface et tables non portés | portal_testers et portal_tester_sessions ; NE PAS importer leurs secrets/sessions | Fonction distincte des vrais collaborateurs ; maintien hors production équipe à décider explicitement | Non testé fonctionnellement ici ; exception à valider, pas un import automatique |
| Courriels / santé intégrations | 4 / 4 | Routes Gmail/health bloquées ; sender vide et mailFetch refuse ; invitations false | settings mail_tokens/google_tokens/youtube_tokens sensibles : aucun transfert ; conservation du Google Scalingo existant | Admin/OAuth dédié, expéditeur approuvé ; pas d'activation implicite avec scopes Calendar | Invitations et OAuth avec doubles ; état réel inconnu, courriels non opérationnels dans ce profil |

Les comptes de routes appartiennent à un module primaire ; certaines fonctions
transversales réutilisent d'autres modules. Le CSV reste la référence exhaustive des API.

## Fonctions partageant une route mais non équivalentes

| Fonction | Main | Branche Scalingo | Conséquence / décision |
|---|---|---|---|
| Publication planning | Calcule les personnes affectées, retire les anciennes notifications concernées, transaction avec verrou | Message à tous les actifs, contrôle draft/published et réponse détaillée, pas le même nettoyage | Décider la règle cible, porter avec tests de non-doublon et de destinataires ; ne jamais tester sur un planning réel ici |
| Rappel d'un message vers Agenda | Vérifie destinataire/expiration, source_message_id et idempotence | Champ et traitement de source_message_id absents | Ne pas présenter la simple création de tâche comme cette fonction complète |
| Programmations de messages | CRUD monté ; initialize prépare les défauts ; tick lance runMessageAutomations | CRUD conditionnel non monté ; moteur présent mais non lancé ; anciens rappels dans le serveur général | Nouvelle orchestration unique à préparer, avec idempotence et absence de rattrapage massif |
| Affichage des messages programmés | COALESCE(automation_text,text) et reminder_kind retournés | Sélectionne text seulement, ignore ces métadonnées | Un import fidèle ne suffit pas à restituer l'affichage/rappels interactifs main |
| Suivi des formations | Champs training_title/date/kind structurés et import d'attestation | Analyse du titre seulement ; import absent | Compteurs DPC/classique et justificatifs peuvent diverger même avec les mêmes fichiers |
| Semaine affichée sous forme d'horloge | public/schedule-week-time.js présent sur main | Absent | Recette ergonomique à prévoir, exception non acquise |
| Appréciation température | Champ assessment sur main | Pas dans la projection de branche ; version validation/history spécifique à Scalingo | Conserver les deux historiques, rapprocher explicitement, ne pas écraser les commentaires |
| Recherche EAN / identité Web | createWebProductSearch raccordé dans createApp main | Module présent mais pas raccordé de façon équivalente | Configuration/limites/caches et autorisation externe nécessaires |
| Réautorisation Google depuis www | Nécessite cohérence origine/callback/cookie | Origine et callback historiques imposés ; cookies host-only sur le domaine utilisé | Nouveau test local reproduit le décalage : ne pas élargir les cookies ou supprimer state/PKCE ; choisir une origine canonique approuvée |

## Données : vérifications à préparer sans rien transférer ici

1. Inventaire frais par table et fichiers, sur les deux environnements avec autorisation
   de lecture distincte ; compteurs seuls, aucune empreinte de mot de passe/secret.
2. Rapprochement des IDs, clés JSON et pièces jointes, empreintes SHA-256 des binaires,
   orphelins et versions ; les 16 fiches/fonctions Scalingo restent prioritaires.
3. Le lot groupé ne couvre QUE communication/planning et les paramètres explicitement
   autorisés. Les reprises manuelles Commandes, Merchandising, Challenges, Fun, RH et
   Procédures restent séparées. Aucun « copier toute settings » ni copie d'OAuth/MFA.
4. Planning source du 2 novembre archivé si conflit, planning cible conservé ; modèles
   avec l'ID source 14 archivés sans activation. L'archivage conservatoire n'est pas
   l'équivalent de deux modèles actifs utilisables : validation métier nécessaire.
5. Dernière correspondance déclarée 15 vers 60 avec écarts d'e-mail/rôle : relecture
   fraîche et décision humaine, pas de modification automatique des administrateurs.
6. Avant ouverture : semaine du 16 publiée et relue par le responsable autorisé,
   destinataires corrects, documents ouvrables et accès individuels démontrés.

## Paramètres et marqueurs des tâches automatiques

Les preuves d'idempotence ne se limitent pas aux messages : inventorier séparément
order_weekly_reminders, order_reminder_emails, challenge_monthly_reminders,
challenge_monthly_digests, quality_monthly_reminders, temperature_reminders et
merchandising_free_reminders, ainsi que message_automation_runs/changes.
Ces tables complémentaires ne sont PAS toutes incluses dans le lot groupé.
Ne pas décider implicitement de les réinitialiser ou de les transférer avec Commandes
ou les autres reprises manuelles. Une absence de marqueur peut provoquer un nouvel envoi.

Les clés settings de calendrier, limites/rétention et *_reminder_start doivent être
comparées par liste positive. Le lot groupé actuel n'importe que schedule_accountant_email.
Le calendrier d'activation et les occurrences sont des décisions métier : pas de remise à
zéro des prochaines échéances ni de lancement simultané de l'ancien et du nouveau moteur.
Les clés mail_tokens/google_tokens/youtube_tokens, les clés API, les sessions et les
secrets MFA sont exclus de toute copie globale. Les paramètres déjà validés sur Scalingo
restent prioritaires ; leurs valeurs ne sont pas présentes dans ce dossier d'audit.
