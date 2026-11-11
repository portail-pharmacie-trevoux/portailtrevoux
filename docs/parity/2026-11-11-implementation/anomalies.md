# État des anomalies de l'audit ec37cc0

Une clôture de code locale ne ferme pas un blocage de bascule. Aucun P0 n'est
annoncé clos opérationnellement sans preuves sur la cible autorisée.

| Identifiant | État du code préparé | État opérationnel / action restante |
|---|---|---|
| P0-01 | Profil sans bootstrap et contrôleur de jobs inactif testés | OUVERT : worker non activé, arrêt/drainage de tous les processus et reprise à faire valider |
| P0-02 | Dépendance Test levée dans le nouveau profil et fonctions température/droits | OUVERT : deux admins réels à valider ; aucun compte supprimé |
| P0-03 | Invitations et mail préparés, consentements/transport verrouillés | OUVERT : configuration et test volontaire autorisé ; pas de campagne réelle |
| P0-04 | Restriction preview remplacée dans profil opt-in ; congés/modèles/publication/MFA exercés en PG | CLOS CODE pour parcours testés ; OUVERT recette complète et activation cible |
| P0-05 | Delta additif séparé, atomique/idempotent testé sur fiches renseignées | OUVERT : schéma réel et compatibilité des données à inventorier, sauvegarde/restauration et DDL à autoriser |
| P0-06 | Aucun transfert ou changement du verrou d'exécution | OUVERT : données, orphelin source14, mapping, volumes, sauvegardes et reçus à valider séparément |
| P0-07 | Origine canonique + callback cohérents, state/PKCE/chiffrement testés | OUVERT : console Google, URI autorisée et essais réels sous autorisation |
| P0-08 | GET news/Agenda sans purge/sync implicite ; maintenance ; pause worker | CLOS CODE pour effets testés ; OUVERT arrêt infrastructure et politique de rétention |
| P1-01/02/03 | Pièces jointes/réponses, publications et message→Agenda raccordés, ACL/persistance/idempotence testées | CLOS CODE local ; SQL/recette cible non exécutés |
| P1-04 | CRUD/rendu/runner unique et échéance commande corrigés ; tick synthétique idempotent | PARTIEL : aucune activation/seed ; inventaire et reprise des échéances requises |
| P1-05 | Destinataires affectés, transaction/révision/idempotence et préservation des non-lus | CLOS CODE local ; anciennes notices conservées, pas de nettoyage automatique |
| P1-06 | Portage attestation, PDF local, confirmation/ACL, métadonnées, UI et dépendance | CLOS CODE pour tests décrits ; rétention des temporaires et recette visuelle à valider |
| P1-07 | Admin personnel et assessment compatible sans réécriture, historique/revision conservés | CLOS CODE local ; import complet en copie / rôles réels à valider |
| P1-08 | Routes merchandising locales et delta additif, Web contrôlé | PARTIEL : régression PG complète stocks/prix/impact et données réellement présentes non vérifiées |
| P1-09 | Challenges locaux accessibles ; clients IA et mail contrôlés | PARTIEL : mocks seuls ; fournisseur et recette PG complète non validés |
| P1-10 | Signatures derrière consentement séparé, client et ACL conservés | PARTIEL : tests simulés, aucun essai réel ni reprise de fichiers |
| P1-11 | Transport/OAuth YouTube séparés et bloqués par défaut | OUVERT opérationnel : aucune connexion ni modification de playlist |
| P1-12 | Documents/exports/quick-links locaux raccordés | CLOS CODE pour tests indiqués ; recette navigateur exhaustive non réalisée |

## Décisions encore nécessaires

1. Autoriser séparément le déploiement, le delta SQL et l'activation du profil après
   inventaire réel/sauvegarde/restauration ; rien de ceci n'est exécuté ici.
2. Valider la conservation de toutes les anciennes notices planning/non-lus. Ne pas
   copier la suppression des anciens messages de main sans décision de rétention.
3. Choisir et enregistrer le callback OAuth sur la même origine que la session
   administrateur (APP_URL). Aucun élargissement du domaine des cookies.
4. Définir les échéances futures des automations reprises, le traitement des retards,
   les fournisseurs autorisés et un vrai contrôleur d'arrêt ; pas de rattrapage aveugle.
5. Confirmer les exceptions PromoFlash/Testeurs/fêtes et l'exigence YouTube/signatures/IA.
6. Autorisations de lots de données toujours distinctes ; `REAL_EXECUTION_RELEASE_LOCKED`
   et `REAL_EXECUTION_ENABLED=false` demeurent inchangés.
