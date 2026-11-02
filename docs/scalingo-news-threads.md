# Consultation des fils de discussion sur Scalingo

La passerelle autorise `GET /api/news/threads/:thread` pour un identifiant entier strictement positif. Elle délègue au serveur existant, sans ouvrir les écritures, sous-routes ou pièces jointes. Les fonctions d’envoi, de réponse, d’archivage et de lecture ne sont pas modifiées.

`news.mjs` conserve l’authentification, le contrôle du mot de passe provisoire et l’autorisation Actualités. La requête SQL filtre **chaque message** : l’utilisateur doit être auteur ou destinataire et respecter les règles existantes d’expiration et d’archivage. Être participant à une partie d’un fil ne donne pas accès aux messages privés des autres participants. Les administrateurs n’obtiennent pas de dérogation à cette confidentialité. Un fil sans message accessible répond 404.

Les 200 derniers messages accessibles sont renvoyés du plus ancien au plus récent, départagés par identifiant en cas de date identique ; `truncated` signale une limite atteinte. Les auteurs historiques, dates et indicateurs existants sont conservés. Le GET ne modifie pas les messages ni les coches de lecture ou d’archivage. Aucune migration n’est nécessaire.

Validation : `tests/scalingo-news-threads.test.mjs`, `tests/news-threads-ui.test.mjs` et tests Messagerie existants. Le test PostgreSQL exige exclusivement `PORTAIL_THREADS_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:25434/portailplus_threads_test` et refuse les bases distantes. Les fixtures restent locales, sans lecture ni modification de discussions réelles.
