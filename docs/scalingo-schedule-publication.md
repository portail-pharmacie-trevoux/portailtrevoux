# Publication des emplois du temps sur Scalingo

Exception ciblée : `POST /api/schedule/:week/publish`, avec une date au format `20xx-MM-JJ`. La passerelle délègue après la frontière des droits d’univers. Le serveur existant vérifie la session active, le mot de passe personnel, les droits de modification du planning (administrateurs), l’origine, le CSRF, le lundi réel et la révision entière du brouillon. Aucune autre écriture n’est ouverte.

Le comportement applicatif reste inchangé : une seule instruction PostgreSQL copie `draft` vers `published`, enregistre `published_revision` et `published_at`, crée une publication et un message interne « Portail + » indiquant les dates de la semaine et invitant à consulter le planning. Comme dans l’application existante, ce message est distribué à tous les collaborateurs actifs du planning d’équipe, indépendamment de la présence d’un créneau individuel cette semaine. Les comptes inactifs sont exclus. Les appels de messagerie externes et les tâches planifiées restent désactivés dans la prévisualisation.

La condition sur la révision publiée empêche un second message lors d’une nouvelle tentative ou de requêtes concurrentes. Une ancienne révision reçoit 409. Une panne de distribution annule la publication, le message et ses destinataires dans la même transaction SQL. Le GET du planning renvoie ensuite `unpublishedChanges: false` après publication réussie ; l’interface recharge les données et actualise le statut et la date.

Tests : `tests/scalingo-schedule-publication.test.mjs` (PostgreSQL/HTTP) et `tests/schedule-publication-ui.test.mjs` (interface complète Chromium), en complément des tests planning existants. PostgreSQL exige exclusivement `PORTAIL_PUBLICATION_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:25434/portailplus_publication_test`. Les comptes, semaines, messages et pannes simulées restent dans cette base jetable. Aucun planning réel n’est publié pendant les tests. Aucune migration n’est nécessaire.

## Anciens plannings avec révision publiée vide

La comparaison `published_revision <> revision` renvoie NULL lorsque la révision publiée est NULL. Avec une date déjà présente, cela pouvait ignorer la publication puis répondre à tort `alreadyPublished`. La publication utilise désormais `IS DISTINCT FROM`, et republie aussi un contenu publié absent ou différent du brouillon. Le contrôle de révision concurrente reste obligatoire.

Une réponse de réussite contient `publishedRevision` et `publishedAt`. Une réponse `alreadyPublished` n’est possible qu’après vérification de la révision publiée, de la date et de l’égalité JSONB des versions. La copie, la publication et le message restent atomiques et sans doublon lors des retries.

Contrôle opérationnel **en lecture seule** : `node scripts/check-scalingo-schedule-publication.mjs`, avec éventuellement `SCHEDULE_CHECK_WEEK=2026-11-02`. Il exige l’application Scalingo de préparation et TLS ; il imprime uniquement versions, dates, nombre d’entrées et compteurs du message lié à l’instant de publication. `SCHEDULE_PUBLICATION_VERIFIED` confirme un état persisté cohérent et un message associé ; `SCHEDULE_PUBLICATION_NOT_READY` indique que les conditions ne sont pas encore réunies. Aucun planning n’est publié par ce script.
