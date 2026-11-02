# Imports Procédures : limite de 50 Mo sur Scalingo

Le déploiement actif observé avant correction (`2067666`) précédait le correctif
`1d165fb` : l’interface annonçait 10 Mo et le filtre de prévisualisation tentait de
parser les imports avec sa limite générale de 64 Ko. Un PDF de 1 460 Ko dépasse
cette première limite, indépendamment de la validation métier.

L’interface utilise FileReader, puis envoie un objet JSON contenant `fileData`
encodé en Base64. Aucun multipart n’est utilisé. Procédures rejette explicitement
les autres types de requêtes après authentification, droits et CSRF.

- Limite du fichier décodé : 50 × 1024 × 1024 octets, PDF et DOCX uniquement.
- Limite JSON : `ceil(taille maximale / 3) × 4 + 16 Ko` pour le Base64 et les
  métadonnées. Cette limite est finie et propre à cette route.
- L’interface, le validateur et le parseur partagent la même configuration dans
  `public/procedure-upload-limits.js`.
- Les parseurs généraux de 64 Ko (prévisualisation) et 16 Ko (application) ne
  consomment pas cet import. La route réelle vérifie la session, les droits de
  modification et le CSRF avant de parser le gros JSON.
- Un dépassement produit HTTP 413 et un message français mentionnant 50 Mo.
- L’import crée un document ; il ne remplace pas les documents existants. Aucune
  migration ni réimportation des documents existants n’est nécessaire.

## Ressources humaines

RH utilise également JSON/Base64 et le validateur partagé, mais conserve une
politique distincte : 10 Mo décodés et parseur de 15 Mo, import administrateur
uniquement. Le filtre Scalingo ne permet pas actuellement cet import. Une future
extension RH doit adapter son interface, sa route et le filtre séparément, tout
en conservant l’accès aux documents personnels pour leur destinataire et les
administrateurs seulement. Le changement Procédures n’élargit aucun droit RH et
n’active aucun envoi pour signature.

## Vérification

Les tests HTTP passent par le filtre Scalingo et l’application réelle, avec une
base simulée : PDF de 2, 10, 12 et 40 Mo, téléchargement identique, petit DOCX,
refus au-delà de 50 Mo, refus sans session/droits/CSRF, format incorrect et routes
non autorisées bloqués. Les refus conservent le contenu précédemment enregistré.
Les fixtures restent locales ; aucun document de test n’est créé sur Scalingo.

Avant déploiement, vérifier une sauvegarde Scalingo récente réussie. Déployer le
SHA de la branche `chore/scalingo-hds-preparation-2026-10`, puis vérifier via l’API
Scalingo le SHA actif et le contenu des deux modules JavaScript publics.
