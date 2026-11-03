# Import musical CSV sur Scalingo

Le panneau Fun utilise le parseur CSV existant du navigateur : colonnes `Artist` et `Title` (ordre libre), UTF-8/BOM, cellules entre guillemets, virgules et guillemets échappés. Les limites existantes restent 2 Mo et 2 000 morceaux par fichier, avec un artiste et un titre de 200 caractères maximum. Le navigateur importe par lots de 25 morceaux.

La passerelle ouvre uniquement les opérations suivantes, après sa frontière de droits Fun :

- `POST /api/music/import`
- `POST /api/music/export.csv`
- `POST /api/music/delete-selected`
- `DELETE /api/music/:id` (identifiant strictement positif)

Le serveur conserve authentification, compte actif, mot de passe personnel, autorisation administrateur pour ces opérations, origine et CSRF. L’import est parsé après ces contrôles avec une limite JSON de 64 Kio, suffisante pour 25 titres Unicode complets ; les limites des autres requêtes ne sont pas augmentées. Les routes d’intégration musicale externe restent fermées.

Les morceaux sont enregistrés dans `music_tracks`. La clé normalisée existante ignore accents, casse et espaces multiples. La contrainte UNIQUE et `ON CONFLICT DO NOTHING` évitent les doublons dans un lot et lors de réimportations. Aucun morceau existant n’est écrasé. L’export et la suppression restent limités aux identifiants explicitement sélectionnés. Aucune migration n’est nécessaire.

Tests : `tests/scalingo-music.test.mjs`, `tests/music-import-ui.test.mjs`, `tests/music.test.mjs` et `tests/music-csv.test.mjs`. Le test PostgreSQL exige exclusivement `PORTAIL_MUSIC_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:25434/portailplus_music_test`. Les fixtures ne doivent jamais être exécutées sur Scalingo ou Render.
