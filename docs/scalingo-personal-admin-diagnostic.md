# Diagnostic temporaire du compte personnel — Scalingo uniquement

Depuis une session Administrateur Test, accueil → « Diagnostic temporaire du compte administrateur » → « Vérifier le compte ».
Accès direct : `/staging-personal-admin-diagnostic` (également depuis le domaine personnalisé). Aucun résultat n'est calculé avant l'action explicite.

Seul `admin-test@portailplus.invalid`, actif, administrateur, session non expirée et mot de passe déjà personnalisé peut accéder à la page et à son résultat. Le POST exige une origine HTTPS explicitement autorisée et le CSRF de cette session. Aucun paramètre de recherche n'est accepté. La recherche porte exclusivement sur l'adresse exacte demandée, en transaction PostgreSQL `BEGIN READ ONLY` terminée par `ROLLBACK`. Seuls trois booléens sont sélectionnés et rendus ; aucune donnée de mot de passe ou MFA n'est lue. Aucune journalisation du résultat, aucune création/modification de compte, aucune connexion à Render.

La page et le résultat interdisent la mise en cache et l'intégration en iframe. Le script de navigation public ne contient aucun résultat ; le contrôle d'accès est indépendant côté serveur.

## Retrait

Désactivation automatique le **10 novembre 2026 à 23:59:59 UTC**, sans possibilité de prolongation par requête. Avant cette échéance, définir `SCALINGO_PERSONAL_ADMIN_DIAGNOSTIC_DISABLED=true` dans Scalingo puis redémarrer : page et POST renvoient 404, le script de navigation devient vide. Aucun paramètre n'est changé automatiquement par ce correctif.

Après utilisation, retirer les deux fichiers `scripts/scalingo-personal-admin-diagnostic*`, leur test, le présent document, l'import et l'enregistrement dans `serve-scalingo-ui-preview.mjs`, puis remplacer `diagnosticHomepage(scalingoHomepage())` par `scalingoHomepage()`. Ce retrait ne nécessite aucune migration ni suppression de données.

## Suite selon le résultat

- Existant, actif et administrateur : conserver le compte ; le titulaire vérifie son mot de passe dans sa propre session. Ces trois indicateurs ne prouvent pas qu'un mot de passe personnel est configuré.
- Absent : préparer un import limité après vérification en lecture seule de l'identité et du rôle dans Render, puis obtenir l'accord avant toute écriture Scalingo. Ne jamais copier le TOTP, les codes de secours ni les sessions.
- Présent mais inactif ou non administrateur : présenter l'ajustement minimal avant toute modification ; ne pas écraser les autres informations.

Après connexion personnelle, ouvrir **Commandes**, choisir la configuration **Ente Auth**, saisir son mot de passe personnel et valider le code de l'entrée créée dans Ente Auth. Le secret est créé sur Scalingo et chiffré avec sa propre `APP_SECRET`. Ne pas partager QR, secret ou codes de secours dans le chat. Les contrôles MFA serveur restent obligatoires.
