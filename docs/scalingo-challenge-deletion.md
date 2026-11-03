# Suppression de challenges — Scalingo uniquement

Activation par `scalingoChallengeDeletion: true` dans le lanceur de prévisualisation
Scalingo. Le serveur normal conserve la fonction désactivée, sans route DELETE
et sans bouton. Aucun changement de schéma ou de paramètres OAuth requis.

L'administrateur dispose de « Supprimer » à côté de « Modifier ». La confirmation
nomme le challenge et annonce la suppression définitive de ses résultats,
affectations, PDF de bilan et rappels liés. Annuler n'envoie aucune requête.
La confirmation transmet la révision affichée à `DELETE /api/challenges/:id`.
Une révision périmée donne 409, un challenge absent 404. La liste conserve son mois
sélectionné après succès ; les erreurs restent visibles et permettent une reprise.

La passerelle autorise seulement ce DELETE avec identifiant numérique positif.
Le serveur vérifie session, mot de passe définitif, accès Challenges, rôle admin,
CSRF et origine. Un unique DELETE conditionné par id et révision est atomique.
Les participants et résultats résident dans `team_challenges`; `challenge_reports`
et `challenge_monthly_reminders` utilisent leurs FK ON DELETE CASCADE existantes.
Les laboratoires, utilisateurs, autres challenges et leurs résultats sont préservés.
Les messages et récapitulatifs historiques déjà envoyés restent des instantanés ;
aucun e-mail ni service externe n'est appelé par la suppression.

Tests PostgreSQL locaux : définir `PORTAIL_CHALLENGE_DELETE_TEST_DATABASE_URL`
vers la base jetable `portailplus_challenge_delete_test` sur `127.0.0.1`, puis lancer
`node --test tests/scalingo-challenge-deletion*.test.mjs tests/challenges.test.mjs`.
Ne jamais utiliser une base métier : les tables de cette base de test sont recréées.
