# PDF vierge d’inscription salarié — Scalingo

Le bouton « Télécharger le PDF vierge » utilise
`GET /api/collaborateurs/registration-form`, avec le nom de téléchargement
`fiche-inscription-salarie.pdf`. Cette route applicative existe déjà et exige
session, compte prêt et rôle administrateur ; elle lit le PDF dans `assets`.

Le filtre Scalingo omettait cette route. Avant correction, un GET retournait
HTTP 403 et un JSON « Fonction désactivée dans la prévisualisation », d’où
l’échec de téléchargement Chrome. Le lien et le fichier étaient corrects.

L’exception est strictement limitée au GET de ce chemin ; elle délègue à la route
réelle et n’ouvre ni le dossier assets, ni d’autres méthodes ou API. Les contrôles
administrateur, le MIME PDF et Content-Disposition sont conservés.

Le PDF est identique octet pour octet à `origin/main`, vérifié en lecture seule :
7 164 octets, 4 pages A4, non chiffré, SHA-256
`861595388186151d50d2c27011829402d55ea5ae03341995840a3c8482fb71a9`.
Aucun fichier PDF n’est généré, réenregistré ou modifié. Le démarrage Scalingo
vérifie cette empreinte avant d’écouter : un déploiement ne devient pas prêt si
le fichier est manquant ou différent. Seuls taille et hash sont journalisés.

Les tests HTTP vérifient les refus sans session, pour un salarié et pour un
administrateur devant changer son mot de passe, puis le téléchargement complet,
les en-têtes et la répétition après actualisation. Les autres méthodes et chemins
restent bloqués. PDF-lib lit les quatre pages et leurs contenus. Poppler a aussi
validé le PDF et extrait son texte. Un test Chromium charge l’annuaire réel avec
une session locale simulée, clique sur le bouton et relit le fichier enregistré
sur disque : octets identiques et quatre pages.

Après déploiement, contrôler le SHA actif, le statut réussi, `/health` et le refus
401 de la route sans session. Le succès du démarrage atteste aussi du contrôle de
l’asset dans le nouveau conteneur. Aucun accès administrateur Scalingo n’est créé
pour les tests ; aucune fiche ou donnée métier n’est modifiée. Render et `main`
ne sont ni modifiés ni déployés.
