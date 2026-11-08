# Domaine sans www vers www — Scalingo uniquement

Le middleware `scalingo-www-redirect.mjs`, monté en premier dans la passerelle Scalingo, redirige exclusivement le Host exact `portailplus-officine.fr` (ports par défaut 80/443 acceptés) en **308** vers `https://www.portailplus-officine.fr`, chemin brut et paramètres conservés. Aucun Host ou en-tête proxy ne détermine la destination. Le middleware ne lit ni n'écrit PostgreSQL et ne crée aucun cookie.

`www` et l'adresse historique Scalingo ne sont pas redirigés. Le drapeau canonique global Scalingo reste inchangé pour ne pas rediriger les intégrations historiques. `APP_URL`, le callback OAuth, la liste d'origines, TLS, CSRF, les sessions et les cookies ne sont pas modifiés. Les cookies sont Secure, HttpOnly, SameSite=Lax, Path=/, sans Domain : les utilisateurs se connectent sur www ; une session ouverte sur l'apex ou l'adresse historique n'est pas transférée vers www.

## Configuration distante vérifiée / préparée le 8 novembre 2026

- `www.portailplus-officine.fr` déjà enregistré ; Scalingo annonce son certificat automatique valide jusqu'au 5 février 2027.
- `portailplus-officine.fr` ajouté à la même application avec Let's Encrypt automatique, sans changement de DNS. Émission TLS encore à confirmer.
- Aucun changement OVH, aucune redirection OVH, aucun changement Render.

## DNS : validation obligatoire avant modification

L'environnement Cloud ne permet actuellement ni de résoudre les DNS publics ni de joindre les deux domaines. La zone OVH et les réponses publiques ne sont donc pas certifiées par ce contrôle. Un brouillon de configuration Cloud ajoute uniquement les deux domaines, `cloudflare-dns.com` et `dns.google`, en conservant les accès précédents ; ce brouillon doit être examiné, enregistré et publié avant de pouvoir reprendre les tests réels.

Une fois ces accès disponibles : interroger NS, A, AAAA, CNAME et CAA des deux noms via au moins deux résolveurs et les serveurs faisant autorité. Conserver les MX/TXT et les autres services. Présenter les valeurs exactes à créer/remplacer, puis attendre l'accord avant toute écriture DNS. Ne pas proposer un CNAME à la racine d'une zone comportant SOA/NS/MX ; ne pas inventer une adresse IP de routeur Scalingo. Si la zone utilise un service de redirection OVH, vérifier sa destination et sa prise en charge HTTPS avant de le remplacer.

## Recette à terminer sur les vrais domaines

HTTPS vérifié sans désactiver la validation TLS sur chacun des deux noms ; apex `/trevoux?test=1` → 308 avec Location exacte `https://www.portailplus-officine.fr/trevoux?test=1` ; www renvoie la page de connexion sans boucle. Vérifier ensuite, dans une session autorisée, connexion administrateur, accès protégés, navigation et déconnexion sur www. Aucun test ne doit réutiliser des sessions ou des secrets Render.

Tant que DNS, certificat apex et parcours authentifié n'ont pas été observés réellement, ne pas annoncer une correction de bout en bout réussie.
