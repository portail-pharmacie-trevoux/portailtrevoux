# Inventaire temporaire Scalingo — proposition avant déploiement

**État : préparé et testé localement uniquement. Déploiement et activation soumis à l'accord explicite du titulaire. Aucun compte réel ni paramètre distant modifié.**

## Fonctionnement proposé

1. Le titulaire autorise le commit et son activation temporaire, exclusivement sur portailplus-hds. Le drapeau `SCALINGO_ACCOUNT_INVENTORY_ENABLED=true` n'est ni configuré ni modifié par cette préparation. Sans cette valeur exacte, page et action renvoient 404 et le script de navigation est vide.
2. Après déploiement autorisé, Administrateur Test ouvre l'accueil, puis **Inventaire temporaire des comptes**. Accès direct : `/staging-account-inventory` sur l'hôte où sa session est ouverte (www ou URL Scalingo historique). Le domaine sans www suit sa redirection existante ; aucune session n'est transférée entre hôtes.
3. Le GET montre uniquement l'explication et un bouton **Afficher l'inventaire**. Aucun inventaire n'est lu automatiquement et le script de navigation ne demande que `/api/me`.
4. Le formulaire POST `/api/staging-account-inventory` exige son CSRF et une origine HTTPS de la liste existante. Il ouvre une connexion de pool, exécute BEGIN READ ONLY, fixe un délai de 5 secondes et vérifie `current_database()='portailplus_7495'` ainsi que TLS actif. Toute autre base ou connexion non TLS est refusée.
5. Il exécute la requête SELECT explicite `inventorySQL`, ne récupérant que ID, prénom, nom, e-mail, rôle, active, booléen de présence d'empreinte, permissions_configured et directory_key. L'empreinte n'est jamais retournée par PostgreSQL : seul `(password_hash IS NOT NULL AND password_hash<>'')` est sélectionné. Aucun SELECT * et aucune lecture de MFA, OAuth ou autres tables métier.
6. La transaction est terminée par ROLLBACK avant d'afficher le résultat, puis la connexion est rendue au pool. Même en cas d'erreur, ROLLBACK et release sont tentés ; le message d'échec est générique. Aucun contenu de ligne, paramètre ou résultat n'est journalisé.
7. La page montre l'inventaire, les doublons potentiels d'e-mail après trim/lower et les identités similaires. Ces comparaisons ne modifient pas les données et ne rapprochent pas automatiquement des personnes.

## Autorisation et protections

- Contrôle serveur réutilisé : `scalingoTestAdminAuth`. Adresse exacte `admin-test@portailplus.invalid`, rôle admin, compte actif, mot de passe déjà personnalisé, session non expirée. Un autre administrateur, y compris Nicolas ou Sarah, n'est pas autorisé par cette proposition. Leur compte n'est pas modifié pour obtenir un accès.
- Session existante dans un cookie HttpOnly ; sa valeur n'est jamais mise dans la page. Le formulaire contient uniquement le CSRF nécessaire, pas le jeton d'authentification. Ni nouveau compte ni nouvelle session créée par l'inventaire.
- POST : origine HTTPS exacte, CSRF, corps borné à 1 Ko pour le formulaire, seul champ csrf, aucun paramètre de recherche ou query string accepté. Aucun SQL, identifiant ou adresse de recherche ne vient de l'utilisateur. Aucune ouverture globale des POST.
- GET : Origin étranger explicite refusé. Navigation externe vers le formulaire tolérée uniquement en mode navigate/document, sans lecture de l'inventaire et sans contourner la session. Requêtes cross-site hors navigation refusées. `Referrer-Policy: same-origin` évite l'Origin null des formulaires ; aucune confiance accordée à Host/X-Forwarded-* pour autoriser une origine.
- Réponses : Cache-Control private/no-store/max-age=0, Pragma no-cache, Expires 0, Vary Cookie/Origin ; X-Robots-Tag et meta robots noindex/nofollow/noarchive/nosnippet ; X-Frame-Options DENY, CSP default-src none, form-action self, base-uri none, frame-ancestors none ; CORP same-origin, nosniff, HSTS. Aucun CORS permissif, stockage local, script dans le résultat ou export de secrets.
- Toutes les valeurs de base sont échappées en HTML. Un sérialiseur fermé écarte toute colonne supplémentaire, même si une couche DB renvoie accidentellement un objet enrichi.
- Le lien est présenté uniquement à Administrateur Test. Le script public ne contient aucun résultat d'inventaire ni identité personnelle Render ; le serveur recontrôle tous les droits indépendamment du lien.

## Expiration et retrait avant migration

**Échéance ferme : 10 novembre 2026 à 22 h, Europe/Paris, soit 21 h UTC.** Elle est codée côté serveur ; aucun paramètre ou variable ne peut la prolonger. À l'échéance, GET et POST renvoient 404 et le script est vide, même si le drapeau reste true. Aucune tâche planifiée ni écriture en base n'est nécessaire.

Désactivation anticipée après utilisation : supprimer le drapeau ou le passer à false, puis redémarrer après autorisation. Aucun réglage distant n'est changé maintenant.

Retrait définitif à planifier **avant la migration du 11 novembre** : supprimer `scripts/scalingo-account-inventory.mjs`, son script UI et ses deux tests ; retirer l'import, l'enregistrement et le wrapper inventoryHomepage de `serve-scalingo-ui-preview.mjs`, puis redéployer après validation. Aucune donnée ni table à purger. Prévoir aussi le retrait séparé de l'ancien diagnostic personnel avant l'ouverture définitive ; ses accès ne sont pas élargis par ce patch.

## Rapprochement Render : données réellement disponibles

Le contexte fourni contient le résumé : 18 comptes actifs Render, 2 administrateurs nommés (Nicolas Marchand et Sarah Dias), 14 salariés disposant d'un accès et 2 sans accès. Il ne contient pas les IDs ni e-mails individuels des 16 collaborateurs. Les fichiers joints disponibles ne fournissent pas cet inventaire individuel.

La page affiche donc une table de correspondance **provisoire** : les deux administrateurs sont seulement comparés aux e-mails/identités déclarés, avec indication que l'ID Render manque ; les autres lignes indiquent que les métadonnées source individuelles ne sont pas fournies. Un e-mail différent ou une identité différente génère une revue, pas une validation. L'ID users est stable dans chaque base seulement ; directory_key peut provenir d'un nom et ne prouve pas une paire source/cible.

Après utilisation autorisée, reprendre les métadonnées des deux côtés et utiliser l'outil hors ligne du commit 6969c89 pour établir les paires d'IDs, vérifier les collisions, comptes non rapprochés et droits effectifs. Ne pas déclarer des correspondances confirmées à partir des totaux ou noms. Aucun transfert d'empreinte n'est implémenté par cette page.

## Comptes protégés

Nicolas : conserver le compte validé et Ente Auth, aucune lecture de son facteur ni modification. Sarah : attendre sa confirmation d'activation, aucune intervention. Administrateur Test : conserver. Les 16 fiches définitives : conserver IDs, identités, e-mails, droits, mots de passe et relations sans mise à jour. Aucun compte ou facteur fictif créé sur Scalingo par les tests ; les résultats courants restent inconnus tant que la page n'est pas déployée et utilisée avec l'accord demandé.

## Vérification locale

Tests de session/rôle/identité, origines et CSRF, garde base/TLS, SQL en lecture seule, métadonnées minimales, absence de fuite de mot de passe/empreinte/MFA/cookie, XSS, expiration, opt-in, cache et indexation. Chromium vérifie la navigation externe et le maintien de l'Origin du formulaire. Les régressions des anciens diagnostics, /trevoux, redirection www, rapprochement et compatibilité des mots de passe sont incluses. Aucun test n'interroge une base réelle et aucun déploiement n'a été exécuté.
