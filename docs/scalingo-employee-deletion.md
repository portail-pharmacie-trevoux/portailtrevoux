# Suppression définitive des collaborateurs inactifs — Scalingo

## Parcours et périmètre

La passerelle expose uniquement `DELETE /api/users/:id/permanent` au travers du
contrôle administrateur TEST existant : session active, mot de passe changé,
origine exacte, CSRF et identifiant valide. Le corps doit contenir exactement
l’identifiant confirmé et `confirmationText: "SUPPRIMER"`.

Le bouton rouge est affiché pour chaque salarié inactif dans l’annuaire
administrateur, y compris les fiches importées. Il n’apparaît ni pour les actifs,
ni pour les administrateurs. La fenêtre décrit le caractère irréversible et la
conservation des documents/historiques ; elle demande la saisie exacte du mot.
L’annulation n’envoie aucune requête. Les doubles clics sont bloqués pendant la
confirmation et l’enregistrement. Les refus sont affichés dans l’annuaire.

Le serveur refuse tous les comptes administrateurs, le propre compte de
l’opérateur et l’adresse Administrateur TEST : le dernier administrateur ne peut
donc jamais être supprimé. Le statut inactif est revérifié sous verrou, même si
le navigateur est obsolète ou si la requête est fabriquée manuellement.

Le parcours historique de `collaborateurs.mjs`, qui nettoie des entrées de
planning, n’est jamais appelé par cette route Scalingo. Le comportement hors
prévisualisation et Render reste inchangé.

## Dépendances et conservation

La transaction consulte le catalogue PostgreSQL pour découvrir toutes les clés
étrangères vers `users`, y compris les clés vers un identifiant autre que `id`.
Une référence métier bloque la suppression, même avec `ON DELETE CASCADE` ou
`ON DELETE SET NULL`. Les références entières sans contrainte et les références
JSON structurées sont également contrôlées : plannings courants/publiés et
historiques, semaines types, destinataires RH, participants et résultats de
challenges, y compris certains anciens formats JSON (tableaux et clés numériques).

Seules les sessions du salarié et sa propre fiche administrative chiffrée sont
considérées comme des données privées à effacer avec le compte. Toute autre
référence relationnelle est conservatrice : le serveur retourne 409, indique les
familles de modules concernées et garde la fiche inactive. Aucun document RH,
fichier, historique ou résultat n’est supprimé ou modifié automatiquement.

La transaction sérialise les suppressions, verrouille l’annuaire et les tables
contrôlées pendant la vérification, et limite l’attente de verrou et la durée des
requêtes. Une opération concurrente ou une contrainte empêchant une suppression
sûre entraîne un refus sans mutation. Une erreur tardive annule aussi les
effacements de sessions/détails et l’écriture d’audit.

## Audit et démarrage

Le démarrage restreint Scalingo crée de façon idempotente la seule table
`scalingo_employee_deletion_audit`, après les contrôles d’identité PostgreSQL/TLS.
Elle conserve l’identifiant supprimé, celui de l’opérateur, la date, le type
d’action et la version des vérifications. Elle ne conserve ni nom, e-mail,
téléphone, contenu confidentiel, adresse IP ou copie de la fiche. Il n’y a pas de
clé étrangère sur l’identifiant supprimé. L’audit est écrit atomiquement avec la
suppression ; les refus et répétitions ne créent pas de fausse suppression.

Vérifier une sauvegarde récente réussie avant déploiement. Aucune fiche n’est
supprimée au démarrage ; aucune donnée existante n’est migrée ou réimportée.

## Vérification

`PORTAIL_DELETION_TEST_DATABASE_URL` accepte uniquement `127.0.0.1` et la base
`portailplus_deletion_test`. Les tests exécutent le schéma réel complet et
vérifient les dépendances RH/planning/challenges, les références inconnues
CASCADE/SET NULL, les références JSON, les confirmations, les comptes protégés,
les erreurs concurrentes et le retour arrière après échec tardif. Ils contrôlent
la disparition persistante de la fiche après redémarrage et par une connexion
indépendante, ainsi que le contenu minimal de l’audit.

Le test Chromium utilise l’annuaire complet et une API locale simulée : bouton
sur les inactifs, annulation, mot exact, refus explicatif et actualisation après
succès. Aucun test de suppression ne vise les collaborateurs réels de Scalingo.
Le déploiement est vérifié par son SHA actif, la santé, les modules publics et les
refus sans session ; ces sondes ne suppriment aucune fiche.
