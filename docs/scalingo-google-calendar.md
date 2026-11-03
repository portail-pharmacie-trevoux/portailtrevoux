# Google Calendar — prévisualisation Scalingo uniquement

Déployer la branche `chore/scalingo-hds-preparation-2026-10` avant configuration.
Dans Scalingo, enregistrer ensemble :

- `SCALINGO_ENABLE_GOOGLE_CALENDAR=true`
- `GOOGLE_CLIENT_ID` : client OAuth Web du projet Google Cloud Scalingo.
- `GOOGLE_CLIENT_SECRET` : secret du même client.
- `GOOGLE_ACCOUNT_EMAIL` : adresse exacte du compte Google autorisé/testeur.
- `APP_URL=https://portailplus-hds.osc-fr1.scalingo.io` (sans slash final).

Conserver `APP_SECRET` et `DATABASE_URL` propres à Scalingo : ne pas les remplacer,
ne copier aucun jeton ni paramètre secret depuis Render. Les jetons Calendar sont
chiffrés dans la table `settings`, clé `google_tokens`; l'agenda choisi et son cache
restent dans PostgreSQL Scalingo. Une rotation de `APP_SECRET` nécessite une
migration de toutes les données chiffrées et ne doit pas servir à activer OAuth.

Conserver `SCALINGO_PREVIEW_SAFE_MODE=true`, `SCALINGO_PREVIEW_UI_ENABLED=true`,
`SCALINGO_REQUIRE_DB_TLS=true`; ne pas activer le démarrage métier ni les tâches
planifiées. Calendar reste désactivé sans son indicateur. Une configuration OAuth
partielle ou sans cet indicateur est refusée au démarrage : saisir les quatre
paramètres d'activation en une seule sauvegarde. Après enregistrement, redémarrer
les conteneurs web Scalingo : les processus déjà démarrés conservent leur ancienne
configuration. Le statut administrateur `/api/google/status` doit ensuite indiquer
`configured: true`, `calendarEnabled: true`, `environment: scalingo`. Le journal
`SCALINGO_GOOGLE_CALENDAR_CONFIG` expose seulement deux booléens, aucun secret.

Le client Web Google doit autoriser exactement :
`https://portailplus-hds.osc-fr1.scalingo.io/auth/google/callback`.
Autorisations : `openid`, `email`,
`https://www.googleapis.com/auth/calendar.events.readonly`,
`https://www.googleapis.com/auth/calendar.calendarlist.readonly`.
`calendar.readonly` seul n'est pas le consentement attendu par ce flux.

Depuis une session administrateur Portail+ Scalingo, ouvrir l’univers Agenda puis
« Administration — Agenda », lancer « Connecter Google Agenda », sélectionner le compte indiqué dans
`GOOGLE_ACCOUNT_EMAIL`, accepter les deux autorisations de lecture, puis choisir
l'agenda et synchroniser. Rester dans le même navigateur avec la session ouverte.
Recharger la page et vérifier la connexion, l'agenda sélectionné et ses événements.
Le consentement Google réel nécessite l'intervention du titulaire du compte.

La passerelle délègue seulement les routes Calendar exactes à l'application, qui
conserve ses contrôles administrateur/session/CSRF. Le callback conserve le state
à usage unique, son expiration et PKCE; les callbacks Gmail/YouTube sont refusés.
Gmail, YouTube, les invitations et les tâches planifiées restent désactivés.
La synchronisation lit Google et actualise le cache PostgreSQL; elle peut créer
les publications Agenda internes prévues par l'application pour de nouveaux
événements. Aucune création/modification/suppression d'événement Google n'existe
dans ce flux. Déconnecter supprime l'autorisation locale et révoque son jeton OAuth.
