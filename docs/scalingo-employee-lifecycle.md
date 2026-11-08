# Collaborateurs Scalingo : statut, suppression et fonction

## Diagnostic et correctif

Les groupes Actifs/Inactifs et les routes de retrait/réactivation existaient. La prévisualisation refusait ces actions pour les fiches importées et celles ayant un accès. L'interface masquait les boutons correspondants. Les routes de fiches étaient par ailleurs réservées à Administrateur Test.

L'entrée Scalingo active `scalingoEmployeeLifecycle` et emploie la vérification serveur des sessions d'administrateurs actifs, avec mot de passe personnalisé. Les autres diagnostics et outils explicitement limités à Administrateur Test conservent cette restriction. Aucun contrôle d'origine, CSRF, session ou rôle n'est retiré ; les routes exactes existantes restent utilisées, sans ouverture globale des DELETE/POST. Les e-mails, mots de passe, invitations et promotions administrateur restent verrouillés sur les fiches existantes.

Depuis une fiche salariée ou l'annuaire, un administrateur peut désactiver ou réactiver une fiche importée ou manuelle. La désactivation modifie uniquement `active` et révoque les sessions ; la réactivation ne recrée ni compte, mot de passe ou session. Les informations, IDs, clés, droits, documents et historiques sont conservés. Les comptes administrateurs sont protégés.

La suppression définitive requiert une fiche inactive, son ID confirmé et la saisie de SUPPRIMER. Les références FK, les identifiants structurés et les JSON sont contrôlés sous verrous. Les anciennes clés de planning `userId:date` sans champ userId sont également détectées. Les historiques liés bloquent la suppression avec une explication ; aucune suppression métier en cascade. Des règles, triggers de suppression ou RLS non revus provoquent aussi un refus. Une suppression permise efface explicitement la session et les détails propres à cette seule fiche, puis la fiche, avec audit minimal sans identité ni secret.

Le champ complémentaire de fonction est regroupé dans un conteneur réellement masqué quand une fonction standard est sélectionnée. L'option visible est « Autre ». Les fonctions personnalisées existantes restent chargées à l'identique. La dernière précision est conservée dans `employee_details.jobOther`, chiffrée avec le mécanisme existant, même après sélection et enregistrement d'une fonction standard. Aucun remplissage ou changement automatique des 16 fiches n'est réalisé au déploiement.

## Vérification

Les tests ciblés utilisent exclusivement les bases locales PostgreSQL `portailplus_*_test` sur 127.0.0.1:55443 et des adresses fictives. Tests navigateur Chromium : groupes Actifs/Inactifs, annulation, désactivation/réactivation d'une fiche importée, rechargement, champ Autre et conservation de la précision. Tests serveur : administrateurs Test et personnel fictifs, refus anonyme/salarié, origines/CSRF, protection admin, refus de connexion inactive, anciennes sessions révoquées, 16 fonctions de référence conservées, suppression inactive sans dépendance, références planning/congés/RH/challenges conservées, concurrence et refus des règles non revues. Aucun e-mail externe.

Le déploiement utilise exclusivement `chore/scalingo-hds-preparation-2026-10` et `portailplus-hds`. Aucun changement Render/main, DNS, OAuth, MFA ou comptes réels. Les vérifications publiques post-déploiement portent sur la santé, les ressources et les refus d'accès anonymes. La recette authentifiée sur Scalingo doit être distinguée des tests fonctionnels locaux : aucune validation réelle n'est prétendue sans session autorisée effectivement disponible.
