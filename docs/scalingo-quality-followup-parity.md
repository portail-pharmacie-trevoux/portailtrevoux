# Suivi des erreurs : parité main et extension d’historique

Branche de modification exclusive : `chore/scalingo-hds-preparation-2026-10`.
Référence lue : `origin/main` au commit `899b21e4683a90071aac426603fdde4e32f808ff`.
Référence recontrôlée à la reprise : `840b8d1f5c1629f60baae6970c523c4e35e5fc66` ;
aucune modification du suivi des erreurs entre ces deux références.
Aucun contact avec Render, aucune modification de main ou de ses données.

## Règles effectivement reprises

`quality-errors.mjs`, l’interface, les styles de progression, l’alignement des
précisions et l’export sont repris de cette référence. Les règles sont :

- « Opérateur prévenu » seul ne change pas l’état.
- Patient **ou** médecin prévenu : `in_progress` (« Actions en cours »).
- « Erreur corrigée » : `closed`, prioritaire même sans information patient/médecin.
- Sans correction ni information patient/médecin : `declared`.
- Décocher recalcule immédiatement l’état. Seuls les pharmaciens identifiés par
  la profession du compte serveur peuvent décocher, même si le compte est admin.
- Aucun changement manuel de statut : la route historique renvoie HTTP 409.
- Les transitions réelles sont historisées avec auteur serveur et date ;
  répéter une coche sans changement d’état n’ajoute pas de transition.
- La précision sur la correction est limitée à 100 caractères et modifiable
  seulement tant que l’erreur est cochée corrigée, avec contrôle de révision.

La référence main n’historise pas les anciennes précisions. L’extension
`correction_note_history` répond à la demande explicite d’historique : elle
conserve l’ancien texte, le nouveau, l’auteur et la date à chaque enregistrement.
La note courante, les anciennes précisions et les transitions d’état sont affichées
sans HTML utilisateur. Les règles automatiques de main restent inchangées.

Les permissions globales Scalingo sont conservées : consultation Qualité ne
vaut pas modification. Le contrôle de profession de main s’ajoute au droit de
modification pour décocher. Le rôle ou la profession envoyés par le navigateur
ne donnent aucun droit. Authentification, origine, CSRF et révisions sont conservés.
La seule nouvelle route ouverte est PUT `/api/quality/errors/:id/correction-note`.

## Migration

`ensure-scalingo-quality-followup-schema.mjs` prépare le schéma après vérification
de la base Scalingo/TLS et avant l’ouverture HTTP. Transaction, verrou dédié et
délai de verrouillage borné ; les prérequis manquants font échouer proprement la
préparation, sans recréer de table. Aucun import de données Render n’est nécessaire.

Ajouts : `corrected_at/by/name`, `error_corrected`, `correction_note` et
`correction_note_history`. Le calcul initial reprend la migration main : les
erreurs déjà clôturées restent clôturées, puis l’état des autres lignes est
recalculé d’après les coches. Les révisions et historiques ne changent que pour
les états effectivement recalculés. La migration ne supprime aucune erreur et
ne réécrit ni détail, ni action corrective, ni coche d’information. Un second
démarrage sur schéma compatible n’exécute pas de migration répétée.

## Tests

Suite complète : **254 réussis, 0 échec, 0 ignoré**, avec trois bases PostgreSQL
locales jetables et Chromium. Sont couverts : les 16 combinaisons de coches sur
PostgreSQL réel, migrations répétées, anciennes clôtures, conservation des actions
et coches, historique des précisions, droits de profession et d’univers, révisions,
CSRF/origine, rendu du navigateur et non-régression températures/tiers payant.
Les tests provenant de main sont repris sans retirer leurs assertions.

```sh
PORTAIL_FOLLOWUP_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:25434/portailplus_followup_test \
PORTAIL_TP_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:25434/portailplus_tp_test \
PORTAIL_TEMPERATURE_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:25434/portailplus_temperature_test \
node --test tests/*.test.mjs
```

Les URL de tests sont strictement locales, les tables sont recréées uniquement
dans ces bases jetables. Ne jamais fournir une URL Scalingo ou Render aux tests.

## Contrôle distant et déploiement

Vérifier une sauvegarde fraîche réussie avant déploiement. Le contrôle
`scripts/check-scalingo-quality-followup.mjs` n’écrit aucune donnée : ses requêtes
se déroulent en READ ONLY et ses sorties ne contiennent ni identité patient ni
texte des erreurs/notes. En mode `QUALITY_FOLLOWUP_WATCH=true`, il compare avant
et après la migration les comptes, les empreintes des champs protégés et des
notes existantes. Il ne faut pas modifier le registre pendant cette courte fenêtre
si l’on veut une empreinte de conservation strictement comparable.

Après déploiement, le contrôle vérifie le schéma, les statuts calculés et les
routes réelles du code déployé dans un serveur local à l’instance Scalingo avec
l’identité TEST existante injectée en mémoire. Il ne crée pas de session et ne
modifie aucune erreur réelle : la précision reçoit une révision invalide pour
tester HTTP 400, le CSRF invalide HTTP 403 et le statut manuel HTTP 409.

Les résultats sont `QUALITY_FOLLOWUP_PRESERVATION`, `QUALITY_FOLLOWUP_VERIFIED`
ou `QUALITY_FOLLOWUP_CHECK_ERROR`. Vérifier séparément le SHA actif via l’API
Scalingo, la santé publique et les assets de l’interface. Ne pas annoncer les
contrôles métier distants comme réussis avant d’avoir lu leurs résultats.
