# Parité Scalingo : correctifs préparés le 11 novembre 2026

Référence d'audit conservée : `ec37cc041960baa7738b7411462aa3e4445c94a9`.
Branche exclusive : `chore/scalingo-hds-preparation-2026-10`.

**PAS DE GO. Aucun déploiement, activation de service, import ou accès à une base réelle.**
Les rapports du dossier `../2026-11-11/` restent les preuves historiques du preview,
pas une description du nouveau profil préparé ici.

## Changements de fonctionnement

- Nouveau point d'entrée `scripts/serve-scalingo-production.mjs`, sélectionné
  exclusivement après opt-in explicite. Aucun `initialize()`, schéma SQL, seed,
  import d'annuaire, purge ou timer exécuté au démarrage. Une configuration
  incomplète arrête le lancement ; plus de repli implicite vers le bootstrap métier.
- Prérequis SQL en transaction READ ONLY : TLS, base attendue, colonnes et index,
  administrateur personnel actif ayant terminé son changement de mot de passe.
  La seule exception de nom de base utilisée par les tests exige une adresse
  loopback et le marqueur du cluster PostgreSQL jetable.
- Routes locales complètes du serveur, avec authentification, readiness, ACL,
  origine et CSRF existants ; frontière supplémentaire des univers conservée.
  L'import personnel d'attestation garde son ACL propriétaire/admin côté serveur,
  sans exiger des droits généraux d'édition Qualité. Aucun droit individuel attribué.
- Fonctions métier indépendantes d'Administrateur Test. Les outils temporaires
  d'inventaire/nettoyage ne sont pas montés dans le nouveau profil. Aucun compte supprimé.
- Publication du planning sous verrou de ligne et transaction : contrôle de
  révision et de la persistance, destinataires actifs dont le planning visible
  change, aucune seconde notification pour la même publication. Les anciens
  messages et leurs non-lus sont conservés : aucune purge des notices précédentes.
- Communication : corps des pièces jointes analysé après authentification par le
  parseur métier, réponses et fichiers soumis aux ACL ; contenu des automations
  rendu ; rappel système → tâche personnelle idempotente, sans écraser une tâche modifiée.
- Plus de purge pendant GET news ; GET Agenda lit le cache sans synchronisation
  implicite. Le mode maintenance refuse les opérations hors health.
- Attestations : extraction PDF locale bornée, confirmation humaine obligatoire,
  propriétaire, empreinte, anti-doublon et métadonnées structurées. Dépendance
  `pdfjs-dist` verrouillée ; Node >=22.13 requis. Aucun document envoyé à une IA pour ce parcours.
- Température : lecture conservatoire des évaluations explicites Render `ok/problem`
  comme V/X si aucune validation Scalingo n'existe. La validation locale prévaut ;
  aucune réécriture de l'ancien champ ; révisions et historique restent conservés.
- OAuth : connexion commencée sur le host canonique uniquement ; callback construit
  à partir d'APP_URL, cookies host-only, state à usage unique et PKCE conservés.
  Transport Calendar limité aux API GET et endpoints OAuth ; mutations Calendar refusées.
- Orchestrateur manuel préparé, jamais démarré par le serveur : approbation, pause
  contrôlée et mutex, moteur d'automations unique. Pas d'anciens runners en parallèle,
  pas de seed des programmations ni réactivation automatique. L'échéance propre du
  rappel commande est conservée dans le registre d'envoi.

## Livrables et limites

- [Matrice actualisée](matrix.md) : disponibilité locale, preuves et réserves par module.
- [Anomalies](anomalies.md) : clôtures de code et blocages opérationnels distincts.
- [Activation et retour arrière proposés](activation-and-validation.md) : non exécutés.
- `test-results.json` et `postgres-test-results.json` : résultats précis des suites.
- `scripts/sql/scalingo-production-parity.sql` : delta additif transactionnel préparé,
  testé deux fois sur cible synthétique déjà renseignée. **Aucune application réelle autorisée.**

La suite PostgreSQL vérifie des parcours API réels sur données fictives, mais n'est
ni une recette navigateur exhaustive, ni un inventaire des données réellement déployées,
ni une mesure de capacité des deux conteneurs de 512 Mo. Les mocks de fournisseurs
ne prouvent pas l'état de leurs comptes et autorisations réels.
