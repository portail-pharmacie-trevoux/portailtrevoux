# Documents associés aux promotions — Scalingo

La passerelle de prévisualisation autorise uniquement les opérations suivantes :

- `GET /api/merchandising/promotions/:id/documents`
- `POST /api/merchandising/promotions/:id/documents`
- `GET /api/merchandising/promotions/:id/documents/:document/file`
- `DELETE /api/merchandising/promotions/:id/documents/:document`

Les identifiants doivent être des entiers strictement positifs. Les autres méthodes et chemins restent bloqués. Le contrôle d’univers Scalingo précède la délégation au serveur : lecture pour consulter, modification pour importer ou supprimer. La liste expose `canDelete` selon le droit de modification du merchandising ; le serveur contrôle ce même droit pour chaque suppression. Les contrôles de session active, changement de mot de passe, origine et CSRF sont conservés.

Les fichiers PDF, Word **DOCX**, PNG et JPEG sont limités à **10 Mio** chacun. L’import JSON/Base64 dispose d’un parseur dédié de 15 Mio, exécuté après authentification et CSRF ; seules ces routes contournent les parseurs généraux de 64 Kio (passerelle) et 16 Kio (application). Le validateur vérifie aussi le nom, le Base64 et le format du contenu. La bibliothèque de charte graphique conserve sa limite distincte de 50 Mio.

Le stockage utilise les tables existantes `merchandising_promotions` et `merchandising_promotion_documents` : aucune migration, aucun réimport et aucune modification des promotions existantes ne sont nécessaires. Le document doit appartenir à la promotion demandée pour être téléchargé ou supprimé. Seules les promotions affectées sont consultables et acceptent des imports, selon le fonctionnement existant. La confirmation de suppression du navigateur est inchangée.

Tests : `tests/scalingo-promotion-documents.test.mjs`. Les tests de persistance nécessitent `PORTAIL_PROMOTION_DOCS_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:25434/portailplus_promotion_docs_test`. Ils refusent toute autre base et créent uniquement des fixtures locales ; ne jamais les exécuter sur Scalingo ou Render.
