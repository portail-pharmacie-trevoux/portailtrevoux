# Entrée Trévoux — prévisualisation Scalingo

Référence : https://github.com/portail-pharmacie-trevoux/portailtrevoux/issues/2

Le commit `ff0919f2843e4db7534e2cd9d61ff46b79bc9c19` ajoute les URL GET/HEAD
`/trevoux` et `/trevoux/`. Son envoi direct du HTML depuis la passerelle omettait
les en-têtes définis par l'application. L'entrée est désormais déléguée à la page
racine de l'application, avec sa politique CSP, HSTS, no-store et les autres
protections. Le chemin visible dans le navigateur et la query string sont conservés.

Il s'agit d'un alias HTML, pas d'un préfixe général : aucune réécriture d'API ou de
ressource. Les chemins `/app.js`, `/styles.css`, `/api/me`, etc. restent absolus.
`/trevoux/api/me`, `/trevoux/app.js` et les chemins inconnus ne deviennent pas des
pages HTML de connexion. Les POST ne sont pas ouverts par cet alias.

Aucune configuration DNS, URL canonique, tâche planifiée ou règle métier ne change.
Ne pas lancer les migrations d'automatisations ou le serveur normal pour tester
ce routage. Le lanceur doit rester `node scripts/start-scalingo.mjs`, avec mode
sécurisé, UI de prévisualisation et TLS actifs, démarrage métier et tâches
planifiées désactivés, APP_URL sur l'origine Scalingo.

Tests : `node --test tests/scalingo-trevoux-entry.test.mjs`.
Les contrôles de déploiement se font par GET/HEAD publics, sans connexion utilisateur
ni action métier. Contrôler le formulaire, les scripts, styles et logos dans un
navigateur pour les deux variantes d'URL, et comparer les en-têtes à `/`.

Constats du 7 novembre 2026 avant déploiement :
- Le Scalingo actif (`f670be8`) répond 404 aux deux variantes `/trevoux`.
- La vidéo `/media/portail-plus-higgsfield-original.mp4` répond déjà 404 sur `/`.
  Elle est également absente du dépôt local ; cette anomalie préexistante reste
  distincte du routage. Scripts, CSS et logos de connexion sont disponibles.
- Deux échecs de la suite globale ont été reproduits dans un checkout isolé du
  commit d'origine `ff0919f` : `merchandising-promotion-documents.test.mjs`
  (200 au lieu de 403) et `news-reminder-task.test.mjs` (500 au lieu de 201).
  Ils ne sont pas modifiés par ce correctif limité au routage.
