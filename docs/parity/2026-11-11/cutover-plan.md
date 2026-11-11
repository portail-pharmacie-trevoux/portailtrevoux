# Répétition, bascule et retour arrière

**Plan proposé, non exécuté et ne valant pas autorisation.** Tous les horaires sont
Europe/Paris (CET, UTC+1). Cible : dimanche 15 novembre 2026 ; ouverture lundi 16.
Le titulaire confirme les horaires et signe les GO. Le verrou d'exécution reste fermé
pendant cette préparation. Aucune manipulation Render, DNS, Scalingo ou base n'est effectuée.

## Responsabilités et éléments à consigner

- Titulaire : périmètre, exceptions, droits individuels, gel métier et autorisation finale.
- Administrateur suppléant : contre-vérification des accès, planning et documents.
- Opérateur migration : preuves de sauvegarde/restauration, audit, manifestes, contrôles
  techniques et reçus ; ne voit ni mots de passe ni TOTP des utilisateurs.
- Contrôleur d'arrêt : TOUS les conteneurs web, workers, ordonnanceurs et canaux d'envoi,
  entrées utilisateur, tâches en vol à zéro ; génération et preuve indépendante vérifiables.
- Dossier privé hors Git : références, volumes/digests, chronométrage, statuts et signatures.
  Les données personnelles, exports, jetons et sauvegardes ne sont jamais committés.

## Répétition générale : vendredi 13 novembre, 14 h–16 h 30, à confirmer

Uniquement bases isolées, personnes et fichiers fictifs, fournisseurs simulés.
Reprendre les tailles des inventaires autorisés, puis doubler les volumes ; à défaut
utiliser au moins deux fois les inventaires historiques du 8 novembre, clairement datés.
Les pièces jointes doivent inclure petits/gros fichiers et les plafonds autorisés.
Les tests de quelques secondes livrés ici ne constituent PAS un benchmark du transfert réel.

| Temps relatif / cible | Action simulée | Preuve et seuil d'arrêt |
|---|---|---|
| T+0–10 min | Vérifier commit/empreintes, origine, schéma, deux admins et absence de secrets source | Toute différence de version ou de manifestes bloque |
| T+10–25 | Sauvegarder puis restaurer la cible fictive dans une autre base ; comparer tables/fichiers/séquences | Empreintes identiques ; aucun compte corrigé manuellement perdu |
| T+25–40 | Arrêter ingress/jobs/envois, drainer ; simuler job actif et preuve périmée | Refus tant que le contrôleur ou les mutex ne confirme pas l'arrêt |
| T+40–55 | Audit frais, mapping, orphelin 14, semaine locale et quatre décisions | Zéro conflit non arbitré ; audit <=15 min ; référence restauration présente |
| T+55–75 | Import fictif après autorisation fictive distincte, reçu et contrôles | Aucun mail/notification pendant import ; délai mesuré et logs sans secrets |
| T+75–90 | Rejouer même autorisation puis faire une reprise différentielle fictive | Zéro doublon ; seules lignes prévues changent ; archives immuables |
| T+90–105 | Injecter échec avant COMMIT, puis perdre sa réponse et relire le reçu | Rollback total avant COMMIT ; UNKNOWN si réponse perdue, aucune relance automatique |
| T+105–130 | Recette complète de tous les modules : admin, salarié autorisé, refus d'un autre rôle | Matrice des parcours signée ; 16/9 et 4/3 ; rechargements/persistance/ACL |
| T+130–145 | Exercer retour arrière sur copie, après commit puis après écriture fictive d'un salarié | Pas de perte du journal post-GO ; temps de récupération mesuré |
| T+145–150 | Revue de preuves et décision | Si durée dépasse fenêtre ou restauration non prouvée : NO-GO, nouvelle répétition |

Chaque ligne consigne début, fin, durée mesurée, volume, version et résultat. Les
objectifs ci-dessus sont des budgets à confirmer, pas des durées garanties.
La recette des services externes utilise un faux serveur OAuth/mail/signature/IA.
Les essais réels éventuels constituent une autorisation séparée, sur volontaire,
avec destinataires explicitement limités ; aucune campagne réelle ne fait partie de cette répétition.

## Préparation samedi 14 novembre

- Finir les P0 et P1 sans dérogation ; figer la référence candidate et refaire cet audit
  si main ou la branche changent. La version Render réellement déployée doit être identifiée.
- Obtenir inventaires frais des données et copies manuelles ; ne pas réimporter à l'aveugle
  les modules déjà saisis. Vérifier fichiers et propriétaires avec des contrôles autorisés.
- Deux admins personnels indépendants et leurs MFA valides. Conserver l'admin Test tant
  que ses dépendances de startup/permissions ne sont pas supprimées du code validé.
  Sa désactivation/suppression reste soumise à une autorisation distincte.
- Plan individuel d'accès : 16 fiches conservées, comptes à activer sur ces fiches,
  droits comparés sans élargissement automatique ; aucune copie de secrets Ente Auth.
- Valider la politique d'archives et de lectures : conserver le non-lu local, ne pas
  considérer les modèles archivés orphelins comme des modèles opérationnels.
- Valider séparément la fenêtre de reprise des automations, leurs fuseaux et prochaines
  échéances. Aucun rattrapage automatique de tout l'historique après ouverture.

## Dimanche 15 novembre : fenêtre proposée 18 h–20 h 30

| Heure proposée | Étape soumise à autorisation | Condition |
|---|---|---|
| 17 h 30 | Revue GO préparatoire | Version figée, P0/P1 clos ou exceptions acceptées, répétition et sauvegarde/restauration prouvées |
| 18 h 00 | Gel métier contrôlé et arrêt des envois | Confirmation du titulaire, pas de modification Render par cet audit ; si gel source non établi, ne pas prétendre à une reprise définitive |
| 18 h 00–18 h 20 | Sauvegarde cible après gel et référence de restauration | Réutiliser une sauvegarde récente uniquement si son état correspond exactement à la cible gelée et sa restauration est prouvée |
| 18 h 20–18 h 35 | Export différentiel source en lecture seule, audit et validation des empreintes | Après dernier changement source ; source/cible/code/mapping identiques aux preuves |
| 18 h 35–18 h 40 | Autorisation humaine finale, distincte et limitée au lot | Quatre décisions ; pas de déblocage automatique de REAL_EXECUTION_RELEASE_LOCKED ; revue d'activation distincte préalable indispensable |
| 18 h 40–19 h 10 | Lot groupé communication/planning, si et seulement si autorisé | Une transaction ; données locales conservées ; arrêt vérifié avant écritures et COMMIT |
| 19 h 10–19 h 30 | Contrôles sans déclencher purge/sync/envois | Reçu COMMIT, comptes/relations/volumes/binaires/séquences/archives ; traiter UNKNOWN par lecture seule du reçu |
| 19 h 30–20 h 00 | Recette métier finale autorisée et statuts des reprises manuelles | Semaine du 16, congés, messages, documents et droits ; ne publier/tester sur données réelles qu'avec accord |
| 20 h 00 | GO/NO-GO final signé | Si un P0, conflit, perte, reçu incertain ou parcours critique manque : NO-GO |
| 20 h 00–20 h 30 | Autorisations séparées d'ouverture et de reprise graduelle des services | Pas de réactivation par le script ; surveiller une échéance et les compteurs d'envoi, unicité des messages |

Arrêt impératif si le temps restant est inférieur au temps de retour arrière mesuré
plus 30 minutes de marge. Ne jamais forcer un contrôle pour tenir le calendrier.
Aucune action DNS n'est requise ou autorisée par ce document. Un éventuel changement
de configuration, de code déployé ou de service sera une décision distincte.

## Lundi 16 novembre : ouverture proposée 8 h 30

8 h : contrôle de santé/TLS/domaines par opérations autorisées, deux admins personnels,
état des jobs, absence d'envoi massif, semaine courante et accès individuels.
8 h 30 : accompagnement d'un premier collaborateur volontaire, puis ouverture validée
par le titulaire. Ses secrets sont saisis uniquement par lui, jamais communiqués à Codex.
Contrôles à +15 min, +1 h et avant première échéance automatique : erreurs 401/403/5xx,
latence, connexions DB, binaires, rappels, destinataires et file d'envoi.

## Retour arrière : distinguer code et données

1. **Avant COMMIT** : erreur provoque ROLLBACK intégral. Garder les services arrêtés,
   conserver l'audit et corriger sur copie. Aucune relance automatique.
2. **Réponse COMMIT perdue** : état UNKNOWN. Inspecter le reçu en lecture seule.
   NO_COMMIT_RECEIPT n'est pas une preuve de rollback. Attendre/diagnostiquer, jamais
   relancer en supposant que rien n'a été écrit.
3. **Après COMMIT, avant écritures de l'équipe** : code précédent validé éventuellement
   redéployé seulement après accord ; cela n'annule PAS les données. Si une restauration
   est nécessaire, comparer d'abord les changements depuis la sauvegarde et restaurer
   dans une base isolée ; restauration réelle ciblée sous validation explicite.
4. **Après ouverture et nouvelles écritures** : geler les deux périmètres concernés par
   une procédure approuvée, sauvegarder/journaliser les nouvelles écritures et pièces
   jointes. Aucune restauration globale qui les effacerait, aucun retour aveugle sur Render.
   Préparer une réconciliation contrôlée, préserver IDs, rôles et MFA.
5. Retour d'accès vers Render uniquement après décision du titulaire, contrôle des
   écritures post-bascule et plan de réconciliation ; pas de DNS ni de changement Render
   automatique. Ne pas faire fonctionner deux systèmes émetteurs en parallèle.
6. Ni retour de code, ni restauration, ni fin du processus ne réactive les notifications.

## Critères GO / NO-GO signables

| Domaine | GO uniquement si | NO-GO si |
|---|---|---|
| Périmètre | Fonctions main présentes et recettes signées, exceptions nominativement acceptées | « Route 200 » utilisé comme preuve de fonction complète ou exception tacite |
| Code | Références déployées connues, audit frais, tests sans échec critique | Écart de version, test rappel rouge, protections supprimées |
| Données | Inventaires frais, 16 correspondances/relations, archives et binaires vérifiés ; semaine du 16 utilisable | Volumes inconnus, source 14 réaffecté arbitrairement, donnée manuelle écrasée |
| Accès | Comptes attendus activés sur leurs fiches, droits habituels, deux admins personnels, MFA/expiration/refus vérifiés | Invitations encore bloquées sans alternative validée ; élargissement global de droits |
| Sécurité | TLS/canonique/OAuth/cookies cohérents ; origine/CSRF/state/PKCE et MFA conservés ; diagnostics temporaires traités | OAuth inter-domaines non testé, dépendance cachée à Administrateur Test |
| Réversibilité | Sauvegarde et restauration isolée prouvées, retour arrière chronométré et marges suffisantes | Simple référence non vérifiée ou restauration qui détruirait des écritures récentes |
| Services | Arrêt externe prouvé pendant import ; reprise graduelle autorisée ; unicité et rétention validées | Workers/envois non maîtrisés, double orchestration ou rattrapage massif |
| Autorisation | Accord final distinct, lot/digests/échéance exacts, revue de levée de verrou approuvée | Verrou levé par cet audit, fichier d'accord générique ou relance automatique après UNKNOWN |

**Décision actuelle : NO-GO pour la parité complète.** Aucun transfert, déploiement,
arrêt/redémarrage de service ni levée du verrou n'est effectué par cet audit.
