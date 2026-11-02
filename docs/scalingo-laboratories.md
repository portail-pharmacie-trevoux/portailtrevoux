# Laboratoires — prévisualisation Scalingo

La passerelle autorise uniquement les routes existantes suivantes (identifiants strictement positifs) :

- `GET`, `POST`, `DELETE /api/laboratories/:id/logo`
- `GET`, `POST /api/laboratories/:id/documents`
- `GET /api/laboratories/:id/documents/:documentId/file`
- `DELETE /api/laboratories/:id/documents/:documentId`
- `POST /api/laboratories/:id/email`

La frontière des droits d’univers s’exécute avant la délégation. Les écritures exigent les droits de modification Laboratoires, une session active, une origine autorisée et un jeton CSRF. Les autres API restent bloquées par défaut.

Les importations échappent uniquement au petit parseur de la passerelle, puis utilisent les parseurs applicatifs après contrôle d’accès : 3 Mio JSON pour un logo PNG/JPEG/WebP limité à 2 Mio, 15 Mio JSON pour un document PDF/DOCX limité à 10 Mio. Le Base64 des logos doit être canonique ; les contenus des formats sont vérifiés selon les validateurs existants. La révision empêche les remplacements concurrents. Seuls les champs du logo et les métadonnées techniques de version/mise à jour sont modifiés ; aucune migration n’est nécessaire. `logoVersion` renouvelle l’URL utilisée dans la tuile et la fiche.

**Messagerie :** ouvrir la route d’envoi ne configure pas Gmail. Le mode de prévisualisation continue de refuser les variables d’intégration Google et les appels de messagerie externes. Aucune configuration ni aucun jeton Render n’est récupéré. Un envoi réel nécessite une connexion Gmail indépendante sur Scalingo et une adaptation explicite de cette restriction. Tant que cette connexion est absente, l’API refuse l’envoi ; aucune réussite d’envoi ne doit être annoncée. Les tests utilisent uniquement un expéditeur simulé et vérifient le destinataire enregistré, la validation, les droits et la déduplication.

Tests : `tests/scalingo-laboratories.test.mjs` et `tests/laboratory-logo-ui.test.mjs`. Pour les tests PostgreSQL, utiliser exclusivement `PORTAIL_LABORATORY_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:25434/portailplus_laboratory_test`. Les tests refusent une autre base et ne doivent jamais être exécutés sur Scalingo ou Render.
