# Portail de la Pharmacie de Trévoux

Première version hébergeable : comptes personnels, administrateur, droits d’accès et intégration de Google Agenda en lecture seule. Les dix univers sont conservés. Les huit espaces autres que Collaborateurs et Agenda sont des espaces vides à compléter ; cette version ne gère pas encore leurs documents, demandes ou contenus.

Le portail n’est pas encore déployé. La configuration Google et les abonnements Render restent à réaliser dans les comptes du propriétaire.

## 1. Ajouter les fichiers sur GitHub

1. Télécharger puis extraire l’archive ZIP fournie.
2. Ouvrir https://github.com/portail-pharmacie-trevoux/portailtrevoux et vérifier que le dépôt est **Private**.
3. Cliquer sur **Add file → Upload files**.
4. Glisser le contenu du dossier extrait : les fichiers `package.json`, `pnpm-lock.yaml`, `server.mjs`, `security.mjs`, `schema.sql`, `README.md`, et les dossiers `public` et `tests`. Ajouter également `.gitignore` et `.env.example` si l’Explorateur les affiche. Aucun de ces fichiers ne contient de véritables secrets.
5. Les fichiers doivent apparaître à la racine du dépôt, et non dans un sous-dossier `portailtrevoux`. Le dossier `public` contient `index.html`, `styles.css` et `app.js`.
6. Choisir **Commit changes**. Si GitHub signale un README déjà présent, remplacer ce README par celui fourni, ou conserver l’ancien : il n’est pas nécessaire au fonctionnement.

Ne pas téléverser l’archive ZIP elle-même, ni `node_modules`, ni un fichier `.env` contenant des valeurs réelles.

## 2. Créer la base de données Render

Cette étape conserve durablement les salariés, droits, sessions et autorisations Google.

1. Sur https://dashboard.render.com/, ouvrir **New → Postgres** dans un nouvel onglet pour conserver la page du Web Service.
2. Nommer la base `portailtrevoux-db`.
3. Choisir une région européenne proposée, par exemple Frankfurt, et noter cette région : le serveur devra utiliser la même région et le même workspace Render.
4. Choisir le plan après avoir vérifié son tarif dans Render. La formule gratuite sert uniquement à un essai : la base gratuite expire après 30 jours. Pour des données durables, choisir une offre appropriée et vérifier ses sauvegardes.
5. Créer la base et attendre qu’elle soit disponible.
6. Dans les connexions de la base, copier **Internal Database URL**. Il s’agit d’une valeur confidentielle : la saisir dans Render, pas dans GitHub ni dans un message.

Sources : https://render.com/docs/postgresql-creating-connecting et https://render.com/docs/free

## 3. Configurer le Web Service

Dans **New → Web Service**, connecter le dépôt `portail-pharmacie-trevoux/portailtrevoux`.

| Champ Render | Valeur |
| --- | --- |
| Name | `portailtrevoux` ou un nom disponible |
| Language / Runtime | `Node` |
| Branch | La branche contenant les fichiers, généralement `main` |
| Region | La même région que la base |
| Root Directory | Laisser vide si les fichiers sont à la racine |
| Build Command | `npx --yes pnpm@11.19.0 install --frozen-lockfile` |
| Start Command | `node server.mjs` |
| Health Check Path | `/health` |

Choisir **une seule instance**. Une instance payante restant active est nécessaire pour que l’actualisation de l’agenda toutes les 15 minutes fonctionne lorsque personne ne consulte le portail. Le serveur gratuit se met en veille après 15 minutes sans requête ; il est utilisable pour essayer les écrans, sans garantie de synchronisation en arrière-plan.

Source : https://render.com/docs/web-services et https://render.com/docs/free

## 4. Ajouter les variables dans Render

Dans **Environment**, ajouter les valeurs ci-dessous avant le premier déploiement.

| Nom | Valeur à saisir |
| --- | --- |
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `24` |
| `DATABASE_URL` | L’**Internal Database URL** de votre base |
| `APP_SECRET` | Un secret aléatoire généré par Render, d’au moins 32 caractères |
| `ADMIN_EMAIL` | `pharmacie.trevoux@gmail.com` |
| `ADMIN_PASSWORD` | Un mot de passe provisoire personnel et inédit, au moins 12 caractères |
| `GOOGLE_ACCOUNT_EMAIL` | `pharmacie.trevoux@gmail.com` |

Le bouton de génération de valeur de Render peut servir à créer `APP_SECRET`. Conserver cette valeur dans un gestionnaire de mots de passe : sa modification rend les autorisations Google enregistrées illisibles et nécessite une reconnexion Google.

`APP_URL` est facultatif sur Render : le serveur utilise son adresse HTTPS `RENDER_EXTERNAL_URL`. Si vous ajoutez un nom de domaine personnalisé, définir `APP_URL` à son adresse HTTPS exacte, sans chemin ni barre oblique finale, puis mettre à jour l’adresse de retour Google.

Les variables Google `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` peuvent être ajoutées après la première mise en ligne : le portail démarre sans elles, mais l’agenda reste déconnecté.

Source : https://render.com/docs/configure-environment-variables

## 5. Première mise en ligne

1. Vérifier le coût et les paramètres avant de cliquer sur **Deploy Web Service / Create Web Service**.
2. Attendre le statut **Live**.
3. Ouvrir l’adresse HTTPS affichée par Render.
4. Se connecter avec `ADMIN_EMAIL` et le mot de passe provisoire choisi.
5. Remplacer obligatoirement ce mot de passe par un mot de passe personnel. Le mot de passe provisoire n’est jamais affiché dans le portail.
6. Une fois le nouveau mot de passe enregistré, retirer la variable `ADMIN_PASSWORD` de Render puis redéployer. La base conserve le compte : l’absence de cette variable n’empêche pas les redémarrages tant que le compte existe. Si la base est recréée vide, il faudra remettre un mot de passe provisoire pour initialiser un nouvel administrateur.
7. Créer un salarié de test dans **Collaborateurs**, lui donner seulement l’accès Agenda, puis vérifier dans une autre session de navigateur qu’il ne voit pas les autres univers.

La suppression d’un salarié supprime immédiatement ses sessions. La modification de ses droits ou la réinitialisation de son mot de passe ferme également ses sessions. Un salarié doit changer son mot de passe provisoire à la première connexion. En cas d’oubli, l’administrateur attribue un nouveau mot de passe provisoire depuis Collaborateurs ; l’envoi automatique d’e-mail n’est pas inclus.

## 6. Connecter Google Agenda

1. Ouvrir https://console.cloud.google.com/ avec le compte `pharmacie.trevoux@gmail.com`.
2. Créer un projet `Portail Pharmacie de Trévoux`.
3. Dans **APIs & Services → Library**, activer **Google Calendar API**.
4. Dans **Google Auth Platform**, configurer le nom, les coordonnées de contact et une audience **External**. Ajouter `pharmacie.trevoux@gmail.com` dans les utilisateurs de test.
5. Configurer les autorisations suivantes dans **Data Access** :
   - `openid` ;
   - `https://www.googleapis.com/auth/userinfo.email` (l’application demande `email`) ;
   - `https://www.googleapis.com/auth/calendar.events.readonly` ;
   - `https://www.googleapis.com/auth/calendar.calendarlist.readonly`.
6. Dans **Clients**, créer un client OAuth de type **Web application**.
7. Dans **Authorized redirect URIs**, saisir l’adresse exacte `https://ADRESSE-DU-PORTAIL.onrender.com/auth/google/callback` en remplaçant le domaine par celui réellement fourni par Render. L’écran Agenda du portail indique cette adresse lorsque Google n’est pas encore configuré.
8. Copier l’identifiant client et le secret client dans Render : `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET`. Ne pas les ajouter à GitHub. Enregistrer et redéployer.
9. Dans le portail connecté en administrateur, ouvrir **Agenda → Connecter Google Agenda**.
10. Choisir le compte `pharmacie.trevoux@gmail.com` et autoriser les accès en lecture. Le serveur vérifie que le compte choisi est bien celui de la pharmacie.
11. Dans la liste proposée, choisir **agenda équipe**, puis cliquer **Enregistrer cet agenda**. L’identifiant unique, et non seulement le nom, est mémorisé.

Les autorisations Google demandées permettent techniquement de lire plusieurs agendas accessibles au compte. Le portail n’affiche que l’agenda sélectionné, uniquement aux salariés autorisés. Aucun droit de création ou modification d’événement n’est demandé.

En mode Google **Testing**, l’autorisation de renouvellement expire normalement au bout de 7 jours pour ces permissions. Avant une utilisation durable, examiner les exigences Google applicables et passer en production selon les règles de Google. Une simple mise en production ne remplace pas une éventuelle validation demandée. Ne pas contourner un blocage de sécurité Google.

Sources : https://developers.google.com/identity/protocols/oauth2/web-server et https://developers.google.com/identity/protocols/oauth2

## 7. Mise à jour régulière et utilisation

- À chaque démarrage du serveur, puis toutes les 15 minutes tant qu’il reste actif, le serveur récupère les événements.
- À l’ouverture de l’Agenda, il tente une actualisation si la dernière copie date de plus de 15 minutes. La page ouverte actualise aussi son affichage toutes les 15 minutes.
- L’administrateur peut lancer **Actualiser maintenant**.
- La copie couvre les 30 jours précédents et les 180 jours suivants ; l’écran montre les événements en cours et à venir. Une récupération complète de cette période permet de répercuter les modifications et suppressions.
- L’affichage utilise le fuseau Europe/Paris. Les descriptions Google sont affichées comme du texte, sans exécuter leur HTML.
- En cas de problème, la dernière copie est conservée et l’écran avertit qu’elle peut ne pas être à jour. Une perte d’autorisation demande de reconnecter Google.
- **Déconnecter Google** retire les autorisations et les événements du portail, et tente de révoquer l’autorisation auprès de Google. Vérifier également les connexions tierces dans le compte Google si nécessaire.

## Vérifications réalisées et limites

Vérifications locales : syntaxe ; hachage des mots de passe ; chiffrement des autorisations ; demandes protégées contre les origines tierces et les requêtes sans jeton de session ; premier changement de mot de passe ; accès administrateur ; droits Agenda ; invalidation immédiate des sessions ; suppression des comptes ; connexion et création de salarié dans un navigateur ; affichage mobile sans débordement. Les requêtes SQL ont été testées sur un émulateur PostgreSQL, pas sur une base Render réelle.

Le parcours Google a été vérifié avec des réponses simulées (protection state/PKCE, rejet de la réutilisation de l’autorisation, enregistrement chiffré, sélection d’agenda et mise à jour des événements). Il reste à tester réellement sur Render et avec le compte Google de la pharmacie avant d’ouvrir aux salariés. Il ne s’agit pas d’un audit de sécurité indépendant.

Le code gère un seul administrateur initial et un seul agenda partagé. Pas de second facteur, d’audit des actions, d’envoi d’e-mail ou de gestion de fichiers dans les autres univers dans cette version. Les secrets sont conservés dans Render ; les autorisations Google sont chiffrées dans la base ; les mots de passe sont hachés avec scrypt ; les sessions expirent au bout de huit heures.

Le serveur doit rester sur une seule instance pour cette première version. Les sauvegardes et restaurations dépendent du plan PostgreSQL choisi et doivent être configurées et vérifiées dans Render avant l’utilisation quotidienne.

## Vérifications pour un développeur

Node.js 24. Installer avec `npx --yes pnpm@11.19.0 install --frozen-lockfile`, puis `node --test tests/security.test.mjs`. Lancer avec `node server.mjs` après configuration des variables. Pour un essai local, utiliser `APP_URL=http://localhost:3000`, un serveur PostgreSQL local et `NODE_ENV=development`. Les cookies de production utilisent HTTPS, HttpOnly et SameSite=Lax ; les écritures demandent une origine exacte et, après connexion, un jeton CSRF.
