# Fiches collaborateurs dans la prévisualisation Scalingo

## Diagnostic

Le filtre limitait `GET /api/users/:id/details` aux cinq anciens e-mails fictifs et
excluait même la fiche Administrateur TEST. L’interface `employee-record.js`
retirait aussi les détails confidentiels, les droits et leur révision du PUT
lorsque le nom d’hôte était celui de Scalingo. Enfin, le seul PUT autorisé à cet
endroit acceptait exclusivement `{rights,editRights}`, pas une fiche complète.

Le fonctionnement de `collaborateurs.mjs` et `employee-details.mjs` a été comparé
à `origin/main` en lecture seule. Les validations de profil et de fiche, le
chiffrement et la protection des révisions sont réutilisés, sans changement de
ces modules ni déploiement Render.

## Ouverture ciblée et protections

`scalingo-employee-records-preview.mjs` est monté avant le filtre général et
l’ancienne interface de droits. Il ouvre uniquement :

- GET d’une fiche existante, pour l’administrateur TEST authentifié, actif et
  ayant changé son mot de passe ; réponse confidentielle sans cache ;
- PUT d’une fiche salariée existante : origine exacte, CSRF, liste fermée des
  champs, validations, transaction et verrou sur l’utilisateur ;
- modification explicite des droits de consultation et de modification, avec la
  validation Scalingo des univers protégés et révocation des sessions du salarié
  si ses permissions changent. Aucune nouvelle session n’est créée.

Les comptes administrateurs sont consultables mais protégés en écriture.
Les colonnes de connexion (`email`, `password_hash`, `must_change`), le rôle, le
statut actif et les traces d’invitation ne sont jamais modifiés par ce PUT.
Une tentative de changement est refusée. Les données de contact confidentielles
peuvent être renseignées dans la fiche chiffrée, sans créer un accès personnel.
Les routes d’invitation et d’activation de l’accès personnel restent bloquées.
La suppression définitive des seuls inactifs, avec contrôle des dépendances et
audit minimal, est décrite dans `scalingo-employee-deletion.md`. La création manuelle et le retrait/rétablissement
des nouvelles fiches sont décrits ci-dessous. Aucun service de messagerie n’est appelé.

Le formulaire utilise les restrictions reçues avec la fiche, et conserve le
comportement habituel hors Scalingo. Il transmet les détails et leur révision,
laisse les contrôles de connexion désactivés et protège la fiche administrateur.
Une sauvegarde de coordonnées sans changement des cases de permissions omet les
droits du PUT : les permissions spécifiques existantes restent intactes. Lors
d’une modification explicite, les droits spécifiques visibles sont conservés
s’ils ne sont pas décochés. Les anciens champs confidentiels non remplacés sont
également conservés côté serveur.

L’API historique avec un corps contenant uniquement les deux listes de droits
reste soumise à ses contrôles et à sa vérification de sauvegarde. L’action
globale avec aperçu, conservation des droits spécifiques et confirmation reste
inchangée. Le nouveau parcours d’édition des fiches ne l’exécute pas.

## Validation et déploiement

Les tests de mutation utilisent exclusivement `127.0.0.1`, dans la base nommée
`portailplus_employee_test` (`PORTAIL_EMPLOYEE_TEST_DATABASE_URL`). Ils vérifient
les 16 fiches salariées et la fiche TEST, les refus de sécurité, le chiffrement,
les révisions périmées, le retour arrière transactionnel, la persistance après
redémarrage et sur une connexion indépendante. Les champs de connexion de tous
les comptes et les autres fiches doivent rester strictement identiques.

Un test Chromium vérifie le formulaire, la sauvegarde des données, les droits par
univers, la conservation d’un droit spécifique, le compte administrateur en
lecture seule et le comportement hors prévisualisation. Les appels de messagerie
doivent rester à zéro. Aucun test ne modifie une fiche réelle sur Scalingo.

Aucune migration de schéma n’est nécessaire. Avant déploiement, vérifier une
sauvegarde Scalingo récente réussie ; déployer exclusivement le SHA de la branche
Scalingo. Contrôler ensuite le SHA actif, `/health`, le JavaScript public et les
refus des routes sans session, sans ouvrir ou modifier les données réelles.


## Ajout manuel sans accès personnel

Le formulaire pouvait s’ouvrir, mais `POST /api/users` n’avait aucune exception
dans la passerelle. L’ajout utilise désormais le même administrateur TEST,
l’origine exacte, le CSRF, les validations de profil et une transaction que les
fiches existantes. Le rôle `employee`, `active=TRUE`, `must_change=TRUE`, l’e-mail
de connexion NULL et le mot de passe NULL sont imposés côté serveur. Une adresse
de contact dans la fiche chiffrée ne crée pas d’identifiant de connexion.
Les tentatives de fournir un rôle administrateur, un mot de passe ou un e-mail
de connexion non vide sont refusées. Aucune invitation ni session n’est créée.

Un identifiant interne `scalingo-manual:<UUID>` utilise la colonne `directory_key`
existante. Il permet de réserver `DELETE /api/users/:id` et
`POST /api/users/:id/restore` aux fiches créées par ce parcours. Les comptes
administrateurs et les 16 fiches importées ne peuvent pas être retirés ou
réactivés par ces routes. Une fiche comportant des identifiants de connexion ou
une trace d’invitation est également refusée. Le retrait conserve la fiche,
la place dans les inactifs et révoque ses sessions ; la réactivation ne change
que son appartenance à l’annuaire actif, sans activer un accès au portail.

La session Scalingo expose `features.employeeAccountsReadOnly` sur `/api/me` et
après connexion. Le formulaire désactive les identifiants facultatifs et ne les
envoie pas. L’annuaire affiche « Sans accès », masque les actions de retrait pour
les comptes importés, désactive les invitations et expose la suppression définitive uniquement dans
les inactifs, avec double confirmation et les contrôles décrits ci-dessus. Le formulaire et les réponses hors prévisualisation restent inchangés.

L’aperçu des droits universels continue de cibler les 16 fiches importées : les
fiches manuelles de test, actives ou retirées, ne faussent pas ce contrôle
d’effectif. Leurs permissions se règlent individuellement dans leur fiche.
Aucune migration n’est nécessaire.

Les nouveaux tests utilisent exclusivement la base locale
`portailplus_manual_test` (`PORTAIL_MANUAL_TEST_DATABASE_URL`) et vérifient le
statut initial, les refus de sécurité et d’élévation de rôle, le stockage chiffré,
la persistance après redémarrage et par une connexion indépendante, le retrait,
la réactivation et l’intégrité des 17 comptes de départ. Un test Chromium charge
l’annuaire complet, soumet le formulaire, vérifie « Sans accès », la confirmation
de retrait, la réactivation puis recharge réellement la page. Aucune fiche
fictive n’est créée sur Scalingo par ces tests.
