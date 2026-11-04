# Retrait de la rubrique calcul — Scalingo uniquement

Le lanceur de prévisualisation fournit à `createApp` une copie du HTML d'accueil
sans le bouton de l'univers interne `Outils de calculs rapides`. Le HTML original,
PromoFlash et ses données restent conservés. Le serveur normal ne reçoit pas cette
copie et garde son comportement existant.

La grille Scalingo porte une classe dédiée : ses deux raccourcis compacts restants
occupent chacun une moitié de la dernière ligne, sans modifier le CSS des autres
pages/environnements. Les préférences locales anciennes sont filtrées par les
tuiles réellement présentes, y compris lors de « Tout afficher · ordre initial ».
L'ouverture de cette rubrique depuis une ancienne navigation est ignorée.

La passerelle Scalingo refuse explicitement le module `/promoflash.js`, la famille
`/api/promoflash`, l'accès générique à cet univers et le chemin `/promoflash`.
Les autres chemins continuent vers les contrôles existants. Les fichiers, droits
des comptes et données en PostgreSQL ne sont pas modifiés ; aucune migration.

Tests : `node --test tests/scalingo-retired-calculations*.test.mjs`.
Chromium vérifie les formats 1024×768 et 1920×1080, pour administrateur et salarié,
les anciennes préférences, l'absence de trou et l'ouverture des autres modules.
