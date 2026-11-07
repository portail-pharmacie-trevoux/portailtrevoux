# Animation de connexion originale — ressource locale

Fichier attendu : `portail-plus-higgsfield-original.mp4`.

Source déjà référencée et validée par Portail+ :
https://d8j0ntlcm91z4.cloudfront.net/user_3KFMr3Wn8Gf22pd0CGclp0y9Pv4/hf_20261018_162755_96a41375-49bd-4fd7-bfac-18a3b63a610b.mp4

Télécharger ce fichier sans montage, réencodage, compression ou remplacement,
puis le placer ici sous le nom exact ci-dessus. Ne pas créer de vidéo factice ou
vide pour satisfaire les contrôles. Ne pas utiliser Git LFS sans prise en charge
explicite dans le déploiement Scalingo : l'archive doit contenir les octets MP4,
pas un pointeur LFS.

Le fichier fourni par l’utilisateur est intégré sans modification (10 741 272 octets).
SHA-256 : `1acbca496ac7b4bb8e6576881078e70046dab85924647096fd9887264cc79486`.
L’empreinte du fichier reçu et celle de la copie locale sont identiques.
Le lanceur de prévisualisation vérifie sa présence et son empreinte avant de
lancer le serveur, sans téléchargement CloudFront ni appel métier.

Avant validation et déploiement :
1. Exécuter `node scripts/scalingo-login-video-asset.mjs` et conserver le SHA-256.
2. Ajouter le fichier au commit de la branche Scalingo pour l'inclure dans l'archive.
3. Exécuter les tests vidéo et vérifier la lecture réelle en 16/9 et 4/3.
4. Demander la validation du déploiement : aucun déploiement automatique.

L'URL reste `/media/portail-plus-higgsfield-original.mp4`, sur `/` et `/trevoux`.
Express sert le MP4 local avec son type MIME et les requêtes partielles Range.
La mise en page et les attributs autoplay/muted/loop/playsinline restent inchangés.

Vérifications locales effectuées avec ce fichier :
- HTTP 200 et `video/mp4` ; requêtes Range en HTTP 206.
- SHA-256 identique au fichier joint avant copie et dans la ressource servie.
- Lecture automatique, muette et en boucle sur `/`, `/trevoux` et `/trevoux/`.
- Affichage sans recadrage en 1024×768 (4/3) et 1920×1080 (16/9).
- Aucun appel CloudFront, aucune connexion utilisateur et aucune requête POST.
- Origine canonique, HTML, CSS et API inchangés par ce correctif.

Les tests de lecture sont dans `tests/scalingo-login-video-ui.test.mjs`; les tests
d’intégrité, de démarrage et HTTP dans `tests/scalingo-login-video.test.mjs`.
