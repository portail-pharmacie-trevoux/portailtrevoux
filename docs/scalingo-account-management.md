# Collaborateurs Scalingo : comptes et invitations préparées

Branche autorisée : chore/scalingo-hds-preparation-2026-10.
Application cible : portailplus-hds. Aucun compte réel n'est créé/modifié par ce correctif.
Aucune migration de schéma ou de données. Render/main inchangés.

## Diagnostic comparatif

Le code Render possède déjà la création/modification d'e-mail, l'attribution explicite
du rôle admin dans la fiche et les invitations avec choix de mot de passe. La
prévisualisation Scalingo ajoutait des limitations indépendantes :

- création d'accès limitée à Administrateur Test, pas aux administrateurs personnels ;
- e-mail/mot de passe désactivés dans l'interface, compte déclaré accountReadOnly ;
- PUT /api/users/:id réservé aux coordonnées et droits spécifiques, rôle/e-mail bloqués ;
- invitation désactivée dans la table et route non autorisée par la passerelle.

## Correctif ciblé, actif uniquement sur Scalingo après déploiement

Un opt-in `scalingoAccountManagement` réutilise les handlers existants de l'application.
La passerelle ne délègue que POST /api/users, PUT /api/users/:id et les routes précises
d'invitation/prévisualisation/acceptation. Authentification, compte actif avec mot de
passe personnel, rôle admin, origine HTTPS autorisée et CSRF restent vérifiés côté
serveur. Les autres POST/PUT restent soumis à leurs restrictions habituelles.

Les administrateurs personnels peuvent créer un accès, sauvegarder l'e-mail de
connexion ou promouvoir explicitement un collaborateur existant. Un e-mail et un
compte actif sont obligatoires pour le rôle admin. Le mot de passe provisoire est
facultatif ; s'il est choisi, il est haché et le changement est obligatoire à la
première connexion. Sans mot de passe, le compte attend son activation.

Doublons d'e-mail et d'identité contrôlés sous verrou transactionnel, y compris lors
de créations concurrentes. Les IDs, directory_key, dates et relations existantes
ne sont pas recréés. Les fonctions non renseignées/vides lors d'une modification ne
remplacent pas une fonction déjà enregistrée. Les détails privés sont fusionnés sans
supprimer des valeurs historiques inconnues. Les modifications d'accès révoquent
les sessions concernées ; un changement e-mail/mot de passe invalide les invitations
inutilisées. Aucun secret ni dispositif MFA n'est copié ou modifié. Les comptes
administrateurs existants conservent la protection de leurs données d'authentification.
Les désactivations/réactivations passent toujours par les actions dédiées.

Les droits individuels peuvent être enregistrés par un administrateur personnel,
sans attribuer ces pouvoirs à un salarié possédant seulement des droits de contenu.
Les nouveaux comptes admin ont tous les droits ; les comptes ordinaires ne peuvent
pas s'attribuer les droits de gestion des collaborateurs ou RH.

## Invitations : envoi réel fermé par défaut

L'application Scalingo passe **invitationSendingEnabled:false** explicitement. Le
serveur est également fermé par défaut dès que l'opt-in de gestion des comptes est
actif. Un appel direct de POST /api/users/:id/invitation retourne 409 avec le code
INVITATIONS_NOT_AUTHORIZED avant toute écriture ou appel du mailer.

L'annuaire affiche « Prévisualiser la demande d'activation ». La prévisualisation
administrateur POST /api/users/:id/invitation-preview vérifie le destinataire et son
éligibilité, mais ne crée ni jeton, ni lien, ni e-mail. Un compte déjà activé ou inactif
est signalé. Le mot de passe provisoire reste une alternative d'accès indépendante
avec changement obligatoire.

Après autorisation distincte, il restera à valider la connexion de la messagerie
Gmail dédiée et ses droits d'envoi, puis activer le canal de livraison prévu. Les
routes OAuth Gmail et le fournisseur d'envoi actuellement bloqués dans la
prévisualisation ne sont pas ouverts par ce correctif. Les autorisations et jetons
Google Calendar en lecture seule ne sont pas touchés. Aucun test réel d'e-mail n'est
annoncé comme réussi : l'envoi complet a été testé seulement avec un mailer fictif
et des comptes synthétiques sur une base isolée.

## Vérification en lecture seule d'un compte source 15

Le diagnostic de rapprochement existant indique aussi `accountCorrespondence` :
identité complète unique, e-mail et rôle comparés avec le nouveau compte, jamais
par égalité des IDs. Il retourne l'ID cible et son statut actif quand la relation est
vérifiée ; une adresse différente ou une identité ambiguë exige une revue. Il ne
lit ni mot de passe, ni jeton de session, ni secret Ente Auth.

Ce contrôle est un contrôle de correspondance, pas une preuve de connexion ou de
configuration MFA. Les accès SQL du PC ne sont pas ceux de Codex : le résultat réel
doit être lu par le lanceur d'audit sécurisé sur le PC autorisé. Les identités restent
dans son rapport privé local, jamais dans le dépôt ou les journaux Scalingo en clair.

## Validation et publication

Tests avec utilisateurs entièrement synthétiques sur PostgreSQL local isolé :
création admin/salarié, e-mail/modification, droits, doublons/concurrence, protections
serveur, chiffrement des détails, fonctions/IDs/relations préservés, changement de
mot de passe, sessions révoquées et contrôle MFA toujours obligatoire aux commandes.
Invitation testée jusqu'au choix du mot de passe, à l'expiration/usage unique et à
l'absence de doublon, uniquement via un mailer simulé. Chromium vérifie les champs
activés pour l'administrateur personnel et la prévisualisation sans envoi.

La préparation et le commit ne déploient pas automatiquement l'application ; le
statut réel du déploiement sera indiqué séparément. Aucun envoi réel ne doit être
activé sans autorisation explicite. Après déploiement du code, la recette réelle
se limite à une consultation non destructive : aucun des 16 comptes, ni les deux
administrateurs personnels, ne sert de donnée de test.
