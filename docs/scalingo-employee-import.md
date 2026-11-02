# Lecture des fiches de renseignements — Scalingo

## Diagnostic

Le panneau utilisait `GET /api/collaborateurs/scan/status`, refusé par le filtre.
Les routes de configuration et d’analyse n’étaient pas ouvertes non plus. Le
parseur général de 64 Ko aurait bloqué les fichiers avant le parseur dédié.
Enfin, le point d’entrée Scalingo interdisait tous les appels externes, y compris
le transport de lecture des fiches.

Le code de `main` utilise la lecture multimodale OpenAI (`gpt-4.1` par défaut) :
PDF transmis comme `input_file`, photos JPEG/PNG comme `input_image` haute
résolution. Ce mécanisme, son prompt manuscrit, le schéma de sortie strict et
les avertissements d’incertitude sont conservés. Il n’y a pas de moteur OCR local.

## Ouverture ciblée

Seuls ces chemins/méthodes sont délégués à l’application :

- GET `/api/collaborateurs/scan/status` ;
- POST et DELETE `/api/collaborateurs/scan/config` ;
- POST `/api/collaborateurs/scan`.

Session, compte prêt, rôle administrateur, origine et CSRF restent contrôlés par
l’application réelle. Seul le POST d’analyse évite le parseur de 64 Ko. Le fichier
reste limité à 10 Mo et le JSON/Base64 à 15 Mo, parsé après les contrôles d’accès.
Les autres méthodes, importations et intégrations ne sont pas autorisées.

Un transport distinct est affecté exclusivement à la lecture salarié. Il refuse
tout autre endpoint que `https://api.openai.com/v1/responses`, les redirections,
une demande de stockage ou un schéma de sortie autre que `employee_registration`.
Le transport utilisé par les autres modules reste désactivé. La variable globale
`OPENAI_API_KEY` reste interdite dans la configuration de prévisualisation.

## Confidentialité et configuration

L’administrateur configure sa propre clé dans le panneau, via HTTPS. Elle est
chiffrée avec le secret applicatif dans `settings`, jamais renvoyée par l’API de
statut. Aucune clé n’est copiée depuis Render et aucune clé réelle n’est utilisée
pendant les tests. La clé et les crédits du compte API sont nécessaires pour une
lecture réelle ; une configuration manquante ou refusée produit une erreur
explicative. Déconnecter retire uniquement cette configuration de lecture.

Avant chaque analyse, le formulaire demande l’accord de transmettre le document
à OpenAI ; changer de fichier décoche cet accord. Scalingo exige aussi
`analysisConsent: true` côté serveur avant tout appel externe. `store:false` est
conservé ; cette option ne constitue pas une garantie contractuelle de rétention
du fournisseur. Le nom envoyé pour un PDF est générique (`fiche-salarie.pdf`).
Le portail ne sauvegarde pas le scan ni la réponse brute du fournisseur, et les
réponses HTTP sont sans cache. Les erreurs n’exposent ni clé ni contenu de fiche.

## Révision et création

L’analyse ne modifie pas les collaborateurs. Elle renvoie une proposition, les
champs incertains et les valeurs invalides à corriger. L’original peut être
consulté dans le navigateur via une URL locale temporaire.

La fiche de contrôle réutilise le formulaire existant : correction des valeurs,
case de vérification obligatoire et validation explicite. Les champs existants
absents de l’extraction restent conservés. Une nouvelle fiche reçoit les
restrictions Scalingo avant d’être créée : aucun e-mail de connexion, mot de
passe, rôle administrateur, session ou invitation ne peut être créé par l’analyse.
L’enregistrement final utilise les routes protégées de fiches déjà présentes.
Les informations confidentielles validées sont chiffrées en base.

## Tests et déploiement

Le test PostgreSQL utilise uniquement `127.0.0.1` et `portailplus_scan_test`
(`PORTAIL_SCAN_TEST_DATABASE_URL`) avec un fournisseur simulé. Il vérifie un PDF
de 2 Mo, les photos, les limites de taille, les contrôles administrateur/origine/
CSRF/consentement, la clé chiffrée et persistante, l’absence d’écriture avant
confirmation, la création corrigée Sans accès et les erreurs du fournisseur.
Les fiches initiales restent intactes. Un test Chromium vérifie la configuration,
le consentement, la correction et les champs de connexion désactivés.

Aucun document réel n’est envoyé pendant les essais. La qualité OCR d’une fiche
réelle dépend du document et du service configuré ; elle n’est pas mesurée par
les réponses simulées. Aucune migration de schéma n’est nécessaire. Après contrôle
d’une sauvegarde récente et des tests, déployer exclusivement le SHA de la branche
Scalingo, puis vérifier SHA actif, `/health`, modules publics et refus sans session.
