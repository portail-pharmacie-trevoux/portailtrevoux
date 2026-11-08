# Navigation commune Portail+ — Scalingo

La barre `portal-navigation.js` réutilise le bouton global `#back` et propose un seul composant pour tous les univers. Le premier onglet violet « Retour aux univers » appelle l'accueil des tuiles, même depuis Procédures. Le second, présent seulement dans une sous-page, appelle le menu principal de l'univers plutôt que l'historique du navigateur. Procédures est rattaché à Démarche qualité. Aucun rôle, droit, API, authentification, schéma ou donnée métier ne change.

## Couverture

Collaborateurs/fiches, Agenda, Messagerie, Démarche qualité et ses sous-modules/Procédures, Ressources humaines et formulaires documentaires, Laboratoires/fiches, Emplois du temps/modèles/récapitulatif mensuel, Merchandising/organisation/impact/documents/étiquettes, Commandes, Challenges, Documents de référence, Contacts utiles, Fun et Passerelle groupement partagent la même barre. Les filtres et listes restant sur la page principale n'ajoutent pas de bouton vers cette même page.

Les anciens boutons de retour de page sont masqués, leurs callbacks métier ne sont pas réécrits. Les formulaires et sous-pages existants sont reconnus par leurs repères ; toute nouvelle page peut déclarer `data-portal-subpage` sur son conteneur. Un ancien bouton de page peut déclarer `data-portal-back` pour être remplacé par le second onglet commun. Le récapitulatif planning et le panneau merchandising emploient cette convention.

Les deux onglets ont une hauteur minimale de 44 px, la même typographie, une flèche de dimensions fixes et un espacement commun. Ils sont placés avant le panneau de contenu et les menus Admin, avec retour à la ligne si nécessaire. Aucun déplacement des champs métier.

## Exceptions conservées

- Outils de calculs rapides reste volontairement retiré et bloqué sur Scalingo. Le composant connaît son libellé de retour, sans réactiver la rubrique ou PromoFlash.
- Les dialogues modaux conservent Fermer/Annuler et leurs protections ; la navigation derrière une modale n'est pas un moyen de contourner la confirmation. Les étapes du paramétrage/vérification/récupération Ente Auth conservent leurs retours locaux de sécurité.
- Les fichiers PDF/Word, impressions et liens externes ouverts séparément conservent leur visualiseur ou navigateur ; aucune modification du document ou de son serveur. Le contexte Portail+ d'origine conserve la barre commune.
- Les pages autonomes de connexion, invitation et diagnostics temporaires ne sont pas des univers authentifiés ; elles conservent leurs propres contrôles et seront traitées dans leurs lots dédiés.

## Protection des saisies et tests

Les onglets sont des boutons DOM ordinaires « Retour… », compatibles avec le mécanisme existant `portal-ux.js`. Les clics sont interceptés en capture par sa protection avant l'exécution du retour. Aucune remise à zéro ou acceptation automatique de l'avertissement. Les opérations d'enregistrement en cours conservent leurs gardes.

Tests Chromium sur données synthétiques en 1920×1080 et 1024×768 : quinze univers principaux et l'ascendance Procédures, destinations directes, sous-pages imbriquées, déduplication, vrais champs de la fiche, refus puis acceptation de la sortie avec modifications, préservation des dialogues/MFA, dimensions, couleur et absence de chevauchement avec Admin. Les tests du menu Admin et des champs Fonction sont rejoués. Les protections de suppression/statut sont vérifiées sur PostgreSQL local isolé ; aucun compte réel créé ou modifié.

## Déploiement et retour arrière

Branche unique `chore/scalingo-hds-preparation-2026-10`, application unique `portailplus-hds`. Les deux commits d'ergonomie n'ajoutent aucune migration et n'exécutent aucun transfert de données. Les fonctions corrigées manuellement, IDs, relations et comptes administrateurs restent inchangés.

En cas de régression, redéployer le dernier commit précédemment opérationnel `7458c31a70db9b3c0b6208aa7e39284d33e5cf91` sur la même application, sans restauration PostgreSQL. Ce retour de code doit être annoncé et validé selon l'incident ; aucune restauration globale ou suppression de saisies. Vérifications publiques post-déploiement seulement, sans création de fixture sur Scalingo. Le retrait d'Administrateur Test demeure un plan séparé sans autorisation d'exécution.
