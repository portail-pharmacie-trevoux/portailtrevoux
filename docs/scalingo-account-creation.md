# Création d'accès personnels sur Scalingo

## Diagnostic et périmètre

Le mode `employeeAccountsReadOnly` désactivait e-mail et mot de passe dans le formulaire, omettait ces champs du POST et limitait le serveur à une fiche sans accès. La route de changement de mot de passe était aussi bloquée par la passerelle, ce qui aurait empêché le changement obligatoire après activation.

La capacité `scalingoAccountCreation` est activée uniquement dans l'entrée Scalingo. Le serveur général garde son comportement par défaut ; Render n'est pas déployé. L'interface exige cette capacité, le rôle administrateur et l'adresse exacte `admin-test@portailplus.invalid`. Le serveur vérifie indépendamment cette identité via `scalingoTestAdminAuth` : compte actif, mot de passe déjà personnalisé et session non expirée. Les autres administrateurs et les salariés ne peuvent pas créer des comptes par cette ouverture.

## Utilisation

1. Actualiser Portail+ (F5), se connecter avec Administrateur Test, ouvrir **Collaborateurs → Ajouter un collaborateur manuellement**.
2. Renseigner prénom et nom, puis l'adresse e-mail et un mot de passe provisoire d'au moins 12 caractères (256 octets maximum). Le champ est masqué et aucun e-mail n'est envoyé.
3. Cocher explicitement **Droits administrateur — accès à tous les modules** pour chacun des deux nouveaux administrateurs. La case est décochée à chaque ouverture. Sans cette case, le compte est un salarié.
4. Enregistrer. La liste affiche **Mot de passe provisoire** tant que le titulaire ne l'a pas changé.
5. Se déconnecter, puis se connecter au nouveau compte sur le même domaine. Le formulaire de changement de mot de passe s'ouvre obligatoirement. Les modules restent refusés jusqu'au remplacement réussi, qui révoque les anciennes sessions et crée une nouvelle session.
6. Après changement, configurer Ente Auth personnellement dans **Commandes → Relier Ente Auth**. Aucun facteur MFA n'est créé, copié ou désactivé par la création du compte.

Sans e-mail et sans mot de passe, la création historique d'une fiche sans accès reste disponible. Un e-mail sans mot de passe (ou l'inverse) est refusé dans ce nouveau parcours. Aucun secret ne doit être transmis dans les journaux, Git ou le chat.

## Données et sécurité

- POST `/api/users` existant, avant le gestionnaire Scalingo des fiches sans accès : liste fermée de champs, rôle validé par le mécanisme existant, session du compte de test, CSRF et liste d'origines HTTPS exacte.
- Les mots de passe sont traités par le scrypt existant avec sel aléatoire ; seule l'empreinte est enregistrée. `must_change=TRUE` est explicite, même si un client forge le formulaire.
- E-mails normalisés en minuscules et doublons vérifiés sans distinction de casse. Identité prénom/nom normalisée par le mécanisme existant (accents, casse, espaces), y compris les fiches sans accès ou inactives. Un conflit est refusé, jamais transformé en modification du compte existant.
- Transaction et verrou `SHARE ROW EXCLUSIVE` sur users pendant la vérification et l'INSERT : deux créations concurrentes ne peuvent pas contourner les contrôles. Aucun UPDATE des comptes existants, aucune session importée, aucune modification de MFA.
- Les 16 fiches réelles définitives et Administrateur Test restent inchangés. Ce correctif ne leur attribue ni mot de passe ni invitation ; leur activation éventuelle demande une opération séparée et autorisée.
- Le PUT de fiche conserve ses restrictions sur e-mail, rôle, mot de passe et statut. La route précise POST `/api/password` délègue au serveur existant : ancien mot de passe obligatoire, CSRF, origine, révocation puis rotation de session. Aucune ouverture globale des POST.

## Vérification technique

Les tests PostgreSQL exigent une URL loopback et une base dédiée `portailplus_account_creation_test`, entièrement fictive. Ils couvrent les refus, doublons et concurrence, création salarié/admin, changement obligatoire, sessions, accès MFA toujours verrouillé, persistance après redémarrage et préservation des lignes de référence. Le test Chromium contrôle les champs, le rôle explicite, le statut provisoire et le rechargement de l'annuaire. Les tests techniques ne créent aucun compte sur Scalingo.
