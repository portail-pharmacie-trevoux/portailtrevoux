# Anomalies et lots de correction

P0 : empêche le GO complet. P1 : fonction attendue indisponible ou comportement différent,
à corriger ou à déroger explicitement avant GO. P2 : amélioration/exception non essentielle.
« À confirmer » ne signifie ni absent ni prêt : il manque une preuve autorisée.

| ID | Gravité | Preuve / cause | Correction préparée ou proposée | Condition de clôture |
|---|---|---|---|---|
| P0-01 | P0 | Le preview refuse SCALINGO_ENABLE_SCHEDULED_JOBS=true et MAIL_SENDER_EMAIL ; aucun tick lancé par ce point d'entrée | Profil de production à revue séparée, sans imports/seed/purges au démarrage ; ne pas simplement changer start ou désactiver les garde-fous | Même orchestration que main, arrêt externe prouvé pendant import, activation ultérieure explicite et test d'unicité |
| P0-02 | P0 | Le bootstrap exige Administrateur Test actif ; température et droits groupés dépendent encore de ce compte | Remplacer les dépendances TEST par des contrôles d'administrateurs personnels autorisés dans un lot dédié, sans toucher aux comptes maintenant | Deux administrateurs réels opérationnels, MFA et secours validés ; retrait du compte test seulement après autorisation distincte et contrôle des dépendances |
| P0-03 | P0 | Invitations false ; mailFetch refuse ; Gmail/callback mail bloqués ; accès et permissions actuels des 16 fiches inconnus | Procédure d'activation réutilisant les fiches existantes ; sender/OAuth propre à Scalingo à approuver, test sur volontaire après accord | Chacun des comptes devant accéder se connecte ; 2 fiches sans accès conservées si décision maintenue ; aucun doublon ni secret MFA transféré |
| P0-04 | P0 | Congés réservés à une ancienne demande fictive ; modèles réservés à semaine test/2 novembre ; commandes en lecture seule | 28 exceptions planning/commandes préparées dans le module inactif, sans ouvrir POST/DELETE globalement | Recette isolée complète avec admin et salarié, contrôles serveur et MFA conservés, raccordement autorisé puis recette métier |
| P0-05 | P0 | Schémas déclarés divergents ; schéma main intégral échoue sur base vide et contient des reprises/suppressions métier | Deltas additifs par module après inventaire réel autorisé ; aucun rejeu de schema.sql/initialize complet | Inventaire SQL frais, compatibilité de chaque colonne/contrainte, sauvegarde et restauration isolée, aucune donnée manuelle écrasée |
| P0-06 | P0 | Données, fichiers, volumes et orphelins actuels non lus ; lot groupé toujours verrouillé | Audit frais des 12 tables et inventaires des reprises manuelles ; source 14 conservé sans rapprochement arbitraire | Toute donnée obligatoire pour le 16 disponible et contrôlée ; reçus/empreintes, mapping et restaurabilité approuvés |
| P0-07 | P0 conditionnel | Callback OAuth historique imposé, cookies host-only sur www ; test local démontre le décalage d'origine | Choisir l'origine canonique/callback et configuration Cloud cohérents ; pas de cookie élargi, aucun retrait de state/PKCE/CSRF | L'administrateur se connecte et renouvelle OAuth depuis le domaine canonique dans une recette autorisée ; historique toujours sécurisé |
| P0-08 | P0 | GET /api/news appelle purgeNews ; GET /api/calendar peut synchroniser et écrire le cache même sans tick | Interdire ces consultations pendant import et contrôle des volumes ; définir la politique de rétention et les bornes de reprise des jobs | Ingress arrêté, compteurs validés avant toute lecture à effet de bord, aucun message ancien purgé silencieusement pendant les contrôles |
| P1-01 | P1 | Réponses et pièces jointes refusées sur POST /api/news ; GET attachment bloqué ; parseur de gate 64 Ko | Groupe communication et déférence du corps POST news préparés mais non raccordés | PDF/DOCX/image autorisés, propriétaires/destinataires, tailles, CSRF et expiration testés ; zéro droit ajouté |
| P1-02 | P1 | GET publications/:name et POST read bloqués, malgré le compteur tuile rétabli | Exceptions exactes communication préparées | Consultation/marquage corrects, aucun non-lu local transformé en lu par migration |
| P1-03 | P1 | Test Reminder to personal agenda échoue : 500 au lieu de 201 dans le double SQL ; sourceMessageId non traité | Patch candidat calendar-tasks + colonne/index, validé seulement dans une copie temporaire | Appliquer après revue et autorisation du schéma ; 2 tests passent sur candidat/main et 1 échoue sur c6 ; ACL/expiration/idempotence obligatoires |
| P1-04 | P1 | Automations CRUD non monté ; moteur présent mais serveur Scalingo utilise anciens rappels ; automation_text/reminder_kind ignorés à la lecture | Porter le raccordement main, le rendu des messages et la politique de reprise, derrière activation explicite | Aucun double envoi ancien/nouveau, mêmes destinataires, runs/changes conservés et prochaine échéance visible |
| P1-05 | P1 | Publication planning : main ne notifie que les personnes affectées et gère les anciennes notices ; branche notifie tous les actifs | Fusion métier ciblée conservant le correctif de persistance Scalingo, après choix de la règle cible | Publication/rechargement, destinataires et idempotence concordants sur données fictives ; pas d'essai réel sans accord |
| P1-06 | P1 | Deux API d'attestations, leurs modules/JS et pdfjs-dist absents ; suivi formations limité aux titres | Porter le lot main complet (validation locale PDF, limites, champs, confidentialité, nettoyage temporaires) ; ne pas juste ouvrir une route inexistante | PDF/image/DPC/classique/propriétaire/admin, doublons et données structurées testés ; package/runtime compatibles |
| P1-07 | P1 | Import/commentaire température TEST uniquement ; assessment main et validation/history branche différents | Politique admin/référent autorisée et rapprochement conservatoire des deux modèles ; pas de réinitialisation | Titulaire réel peut importer/commenter ; auteur/révision/historique conservés ; test changement de mois |
| P1-08 | P1 | Zones/validation/export/documents/impact merchandising partiellement filtrés ; recherche Web non raccordée ; migration novembre dans main | Revue des deltas existants v12, données manuelles prioritaires, ouvertures ciblées ; Web séparé | Résultats/stocks/prix/documents/historique vérifiés ; aucun rejeu destructif de novembre/décembre |
| P1-09 | P1 | Challenges : logos et bilans non routés ; analyse IA et envoi Gmail non configurés | Lectures locales préparées ; analyse/confirmation/envoi dans un lot séparé avec fournisseurs explicitement approuvés | Un PDF fictif analysé/confirmé, mock mail sans envoi réel, droits et anti-double-envoi prouvés |
| P1-10 | P1 | Signatures RH/Youtrust bloquées et client vide ; téléchargement signé externe | Profil d'intégration séparé ; récupérer les fichiers et statuts sans recréer d'enveloppes | Accès personnel/admin, statut, fichiers et absence de renvoi d'invitations vérifiés ; autorisation de service explicite |
| P1-11 | P1 | YouTube/YouTube Music fermé ; scopes Calendar insuffisants et volontairement séparés | Procédure OAuth/playlist distincte et approuvée, jamais réutiliser les jetons Render | Bibliothèque et playlist attendues sans création parasite, mêmes clés anti-doublon |
| P1-12 | P1 | Exports contacts/laboratoires/merchandising et quick-links/formations bloqués | Groupes documents/navigation locaux préparés | Fichiers ouvrables et ACL conservées ; pas d'ouverture d'un fournisseur externe par une route dite de lecture |
| P2-01 | P2 / dérogation | 4 routes testeurs et leur interface absentes | Définir si cette fonction fait partie de l'ouverture équipe ; aucune copie de ses sessions/mots de passe | Exception écrite ou portage isolé ; ne pas confondre testeurs et les 16 salariés |
| P2-02 | P2 / écart voulu | PromoFlash retiré sur demande, code/données conservés | Aucun correctif de réouverture | Exception au périmètre de parité confirmée, accès direct toujours refusé |
| P2-03 | P2 | Horloge hebdomadaire main absente ; ergonomie spécifique Scalingo différente | Revue 16/9 et 4/3, accessibilité, formulaires non enregistrés | Dérogation ou restitution sans casser navigation et menus Admin |
| P2-04 | P2 | Fêtes Nominis non routées ; lien paie Silae renvoie un lien externe | Autoriser séparément les lectures externes voulues ; le lien paie local peut être rétabli sans intégrer de secrets | Fonction disponible ou exception explicite ; aucune connexion externe déclenchée par l'audit |

## Ordre recommandé des lots

1. Profil production sans seed/import, comptes administrateurs personnels, droits,
   origines et callback ; garder les protections normales et les verrous de migration.
2. Planning/congés et commandes/MFA, messagerie/pièces jointes/publications.
3. Correctif message-vers-Agenda, suivi des formations et deltas structuraux associés.
4. Automations/rendu/rétention et courriels : arrêt et contrôle d'unicité d'abord,
   activation seulement après validation finale, aucune reprise en masse implicite.
5. Données fonctionnelles sous autorisation de lot ; reprises manuelles séparées.
6. Merchandising, Qualité, signatures, Challenges, Fun et services externes : lot par
   fournisseur, fichiers, rôles et preuve fonctionnelle, pas un déblocage global de gateway.

Le correctif préparé ne remplace pas ces lots. Rien n'est déployé ni activé ici.
Le patch sourceMessageId est livré comme fichier de proposition, pas appliqué à la
branche runtime. Aucun échec préexistant n'a été masqué en supprimant son test.
