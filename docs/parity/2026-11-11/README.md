# Audit de parité avant bascule du 15 novembre 2026

**Conclusion au 11 novembre : NO-GO pour une ouverture prétendant à la parité complète.**
Des fonctions locales restent bloquées et des différences fonctionnelles existent derrière
certaines routes identiques. Les données réelles et les intégrations ne sont pas vérifiées.
Ce résultat n'autorise aucune action sur les données ni aucun changement de service.

## Références et preuves

- Référence du code main lue sans la modifier : `0a006e2eff2fd8c1259390a9424e4968c56bbf23`.
- Runtime Scalingo audité : `c6dc40db372e047ed638b44979b8e90a4e900491`.
- La version effectivement déployée sur Render/Scalingo n'a pas été interrogée : les
  références Git ne prouvent pas l'identité du code en cours d'exécution.
- [Matrice par module et fonction](matrix.md).
- [251 routes : CSV](route-inventory.csv), [JSON et empreintes des 31 intermédiaires](route-inventory.json).
- [67 différences de fichiers backend/interface : empreintes](code-differences.csv).
- [Comparaison des structures déclarées](schema-differences.json).
- [Anomalies et corrections proposées](anomalies.md).
- [Répétition, bascule, retour arrière et GO/NO-GO](cutover-plan.md).
- [Résultats de la suite locale](test-results.json) ; la synthèse finale est dans tests.md.

## Lecture des résultats

Les 251 lignes sont l'union de 246 routes déclarées sur main et de 241 sur Scalingo.
10 routes main ne sont pas montées côté Scalingo : 6 absentes du code applicable,
4 disponibles dans un module mais non enregistrées avec la configuration du preview.
Scalingo possède aussi 5 routes supplémentaires, notamment suppression sécurisée,
aperçu d'invitation, lecture Excel de contacts et renommage de document laboratoire.

| Résultat du sondage local | Nombre |
|---|---:|
| Déléguées à l'application, fonctionnement métier non prouvé | 137 |
| Restreintes dans la passerelle | 97 |
| Retrait volontaire PromoFlash/calculs | 3 |
| Interceptions de fiches nécessitant validation métier | 2 |
| Probes inconclusives sur doubles de base simplifiés | 2 |
| Absentes du code applicable | 6 |
| Non montées par configuration | 4 |

Le sondage reconstruit l'ordre réel des intermédiaires à partir du fichier de preview,
mais n'importe jamais ce point d'entrée : son démarrage effectuerait des DDL et des
contrôles sur la base. Une fonction terminale remplace les actions métier. La base,
les sessions et les paramètres sont fictifs. Aucun sous-processus métier n'est autorisé.
Un 200 de délégation ne prouve donc ni les droits métier, ni une écriture, ni le téléchargement
réel d'une pièce jointe. Les tests métier complémentaires sont distincts.
Les deux probes inconclusives concernent désactivation/restauration de fiches : leur
base simplifiée ne simule pas une transaction. Ce ne sont pas des erreurs serveur réelles constatées.

Les données portent partout l'état NOT_READ_NOT_VERIFIED : aucun nombre actuel,
compte actif, mot de passe, document, jeton ou historique n'a été lu dans une base réelle.
Les nombres d'inventaires du 8 novembre ne sont pas réutilisés comme état actuel.
Aucune demande de connexion réelle, aucun courriel, aucune notification réelle.

## Structures : ne pas confondre code et base réelle

Dans des bases PostgreSQL 18.6 fictives, la projection structurale de main produit
69 tables, contre 55 pour le schéma de branche complété par les préparations du preview.
15 tables et 9 colonnes main n'y sont pas déclarées ; une table d'audit de suppression
est spécifique à Scalingo. Certains objets peuvent avoir déjà été préparés manuellement
sur la vraie base : **ce comparatif ne prouve pas leur absence en production**.
Les migrations manuelles merchandising et le lot groupé sont des dépendances séparées.

Le schéma main intégral échoue volontairement sur base vide : garde de la migration
merchandising de novembre, erreur P0001. Il contient aussi des reprises et suppressions
métier ciblées. Il ne doit pas servir de bootstrap générique sur Scalingo.
La projection DDL d'audit omet tous les blocs DO et les DML ; elle n'est pas un script de
migration approuvé. Le schéma source projeté est compatible structurellement avec les
12 tables du moteur groupé testé, sans que cela prouve la compatibilité des données réelles.

## Corrections préparées, non activées

`scripts/scalingo-parity-prepared.mjs` prépare 43 exceptions locales exactes regroupées
par planning/congés, commandes, communication, lecture de documents et navigation.
Ce module n'est importé par aucun point d'entrée et ne produit aucun changement actuel.
Son activation de test exige un opt-in, des groupes explicites et la frontière de
permissions existante ; l'application conserve authentification, CSRF, origine et MFA.
Il ne transmet aucune route Gmail, invitation, Youtrust, IA, YouTube, nettoyage temporaire
ou PromoFlash. Le téléchargement Youtrust et les fêtes Nominis sont exclus car externes.

Avant un éventuel raccordement, il faut valider les groupes, positionner le middleware
avant les anciens blocages et traiter le parseur des messages jointifs : le preview
ne doit pas consommer ces corps dans son parseur 64 Ko avant les contrôles de l'application.
`deferPreparedParityBody` fournit uniquement cette exception POST /api/news, pas un
contournement global. Les autres écarts du catalogue nécessitent leurs lots de correction
et tests propres ; ce module ne prétend pas rétablir toute la parité.

`REAL_EXECUTION_RELEASE_LOCKED`, run.mjs, le lanceur PowerShell et le bootstrap
restent inchangés. Aucun code n'a été déployé et aucun service externe n'a été activé.

## Échec métier confirmé et candidat livré

La suite élargie compte 167 réussites, un échec préexistant et trois scénarios ignorés.
Le rappel d'un message vers Agenda échoue sur la référence de branche avant audit,
mais passe sur main. Le [patch candidat](proposals/linked-message-reminder.patch)
passe ses deux tests dans une copie temporaire ; il n'est pas appliqué au runtime.
Le [détail comparatif](feature-regression-proof.json) et tests.md empêchent de confondre
un correctif préparé avec une fonctionnalité déjà rétablie sur Scalingo.

Les méthodes recensées sont celles déclarées explicitement dans Express. Les HEAD et
OPTIONS implicites, variantes de contenu, fichiers statiques et parcours d'interface
ne sont pas assimilés à des API métier supplémentaires validées. Les médias et chemins
Trévoux disposent de tests locaux distincts ; aucune vérification publique n'a été effectuée.
