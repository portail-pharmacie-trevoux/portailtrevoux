from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/pdf';OUT.mkdir(parents=True,exist_ok=True)
for name,path in [('Body','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'),('Bold','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')]:pdfmetrics.registerFont(TTFont(name,path))
GREEN=HexColor('#087b65');PURPLE=HexColor('#7150b7');INK=HexColor('#183241');MUTED=HexColor('#536977')
styles=getSampleStyleSheet()
styles.add(ParagraphStyle('Text',fontName='Body',fontSize=10.2,leading=15.5,spaceAfter=8,textColor=INK))
styles.add(ParagraphStyle('TitleX',fontName='Bold',fontSize=23,leading=29,textColor=INK,spaceAfter=18))
styles.add(ParagraphStyle('SubX',fontName='Bold',fontSize=12,leading=17,textColor=GREEN,spaceBefore=12,spaceAfter=7))
styles.add(ParagraphStyle('SmallX',fontName='Body',fontSize=8.8,leading=12.5,textColor=MUTED,spaceAfter=7))
styles.add(ParagraphStyle('BulletX',parent=styles['Text'],leftIndent=12,firstLineIndent=-9,spaceAfter=6))
styles.add(ParagraphStyle('CallX',parent=styles['Text'],textColor=GREEN,backColor=HexColor('#eaf5ee'),borderPadding=10,spaceBefore=9,spaceAfter=14))

def P(text,style='Text'):return Paragraph(escape(text).replace('\n','<br/>'),styles[style])
def block(title,lines):return (title,lines)
U=[
('Prendre en main Portail+',[
block('Se connecter et créer son accès',[
'Utilisez votre compte personnel. Lors de la première invitation, ouvrez le lien reçu sur votre adresse e-mail et choisissez votre mot de passe. Un lien d’invitation est valable 72 heures ; s’il expire, demandez un nouvel envoi à l’administrateur.',
'Saisissez votre e-mail et votre mot de passe sur la page de connexion. Si un changement de mot de passe est demandé, terminez cette étape avant d’utiliser les univers. Pour modifier votre mot de passe ensuite, utilisez le bouton de votre compte.',
'Sur un ordinateur partagé, déconnectez-vous à la fin de votre utilisation. Ne laissez pas votre session à un collègue et ne partagez pas vos codes de protection des commandes.']),
block('L’accueil et vos espaces',[
'Agenda, Communication et Démarche qualité sont accessibles à toute l’équipe. Les autres accès dépendent des droits attribués à votre compte. Une tuile masquée n’est pas nécessairement un problème technique : contactez l’administrateur si un accès manque.',
'Organiser mes tuiles permet de changer leur ordre et leur visibilité. Ces préférences sont liées à votre compte et au navigateur utilisé. Le bouton de retour ou le logo Portail+ ramène à l’accueil.',
'La tuile Emplois du temps affiche vos créneaux et postes du jour issus du planning publié. La tuile Agenda distingue les événements du jour et vos rappels. Les nouveautés non lues ne figurent plus sur Fun ni sur les trois outils du bas.']),
block('Collaborateurs et informations personnelles',[
'Consultez l’annuaire pour retrouver l’équipe. Les fiches administratives détaillées et la gestion des accès sont réservées aux administrateurs. L’accès mySilae proposé dans votre espace conduit au service externe de bulletins de paie, avec ses propres identifiants.'])]),
('Communication : écrire, lire et répondre',[
block('Envoyer un message',[
'Rédigez un texte de 1 à 500 caractères. Recherchez et cochez un ou plusieurs collaborateurs actifs, ou utilisez Sélectionner toute l’équipe. Vérifiez la sélection avant d’envoyer.',
'Choisissez une priorité Normale ou Important. Vous pouvez joindre un seul PDF, Word (.docx), JPEG ou PNG, de 10 Mo maximum. Retirer la pièce jointe permet de revenir à un message sans fichier.',
'Après Envoyer le message, attendez la confirmation d’envoi. Un échec ne signifie pas que le message a été remis ; lisez le motif affiché.']),
block('Lire et confirmer sa lecture',[
'Les messages reçus sont classés du plus récent au plus ancien. Le filtre Non vus affiche les messages dont vous n’avez pas coché Vu. Cette case constitue une confirmation manuelle de lecture.',
'Une pièce jointe se télécharge depuis son lien. Archiver conserve votre copie personnelle ; un message non archivé disparaît après 30 jours. L’archivage d’un collègue ne conserve pas votre propre copie.',
'Répondre sélectionne directement l’expéditeur actif et ouvre la rédaction avec le contexte du message. Vérifiez le destinataire, écrivez votre réponse et envoyez-la. La réponse apparaît avec le repère Réponse à votre message et, tant qu’il est disponible, un extrait du message d’origine.']),
block('Messages envoyés et notifications du planning',[
'Messages envoyés présente les envois des 30 derniers jours et le suivi des cases Vu par destinataire. Actualiser recharge les informations.',
'Lorsqu’un planning est publié ou republié, toute l’équipe active reçoit une notification normale de Portail+. Consultez le planning via le bouton dédié ; pour les nouvelles notifications, il ouvre la semaine concernée. Cette notification peut être marquée Vu, mais ne peut pas être archivée et expire après 30 jours.'])]),
('Agenda : événements et rappels',[
block('Parcourir l’agenda',[
'L’agenda du portail reprend celui choisi par l’administrateur dans Google Agenda. Utilisez la navigation par date et la recherche par mot-clé pour retrouver un rendez-vous ou une formation.',
'Les événements Google se modifient dans l’agenda source. Ajouter une tâche personnelle crée une tâche visible uniquement par son auteur dans Portail+, sans envoi Google, avec titre, date, détails et icône. Elle figure dans les rappels de l’accueil de J-7 jusqu’au jour prévu. L’auteur peut la modifier ou la supprimer. Le portail les affiche avec leur date, horaires, lieu et description disponibles.',
'Les pictogrammes facilitent le repérage des rendez-vous, formations et mots-clés comme réunion ou l’étage. Ils ne changent pas les données du rendez-vous.']),
block('Me le rappeler',[
'Cochez Me le rappeler sur un événement pour l’ajouter à vos rappels personnels. Une petite cloche signale votre choix.',
'Le rappel apparaît en bas de la tuile Agenda pendant les sept jours précédant l’événement. Les événements du jour et les rappels sont présentés séparément. Décochez si vous ne souhaitez plus le rappel.',
'Ce rappel est un affichage dans le portail ; il ne constitue pas une promesse de notification par SMS, e-mail ou sur votre téléphone.']),
block('Vérifier la fraîcheur des données',[
'La page indique la dernière synchronisation et les erreurs éventuelles. Une actualisation est recherchée lorsque les données ont plus de 15 minutes, à l’ouverture de l’agenda.',
'Si un message indique que l’autorisation doit être renouvelée, les anciens événements peuvent rester visibles. Signalez-le à l’administrateur ; ne considérez pas ce cache comme une synchronisation à jour.'])]),
('Emplois du temps : consulter et demander des congés',[
block('Vues semaine et jour',[
'La vue Semaine indique son numéro ISO et sa période du lundi au dimanche. Elle présente les créneaux, postes, commentaires et les totaux d’heures disponibles.',
'La vue Jour couvre 7 h 30 à 21 h 30. Chaque collaborateur peut avoir jusqu’à dix créneaux dans une journée. Une infobulle permet de lire les détails d’un créneau et son commentaire.',
'Le choix Mon planning / Équipe adapte les personnes affichées. Les collaborateurs sans droit de modification consultent la version publiée. Une modification de brouillon ne devient visible qu’après publication.']),
block('Présences et ticket restaurant',[
'Le graphique de présences planifiées compte les collaborateurs affectés au poste Comptoir par quart d’heure. Il compte les personnes, sans les doubler si plusieurs créneaux les concernent.',
'La rangée Pharmaciens présents compte uniquement les fonctions Pharmacien ou Pharmacienne, en travail et affectées au poste Comptoir. Rouge : aucun ; orange : un ; vert clair : deux ou plus.',
'L’icône assiette avec saucisse représente l’attribution d’un ticket restaurant. Sa case est gérée par l’administrateur, jour par jour. Les flèches de classement et cadenas sont également des commandes d’administration.']),
block('Faire une demande de congés',[
'Cliquez Demander des congés et renseignez les dates et informations demandées dans la fenêtre. Suivez la réponse dans cet espace. Une demande envoyée ne vaut pas une absence déjà autorisée : attendez la décision de l’administrateur.',
'Les créneaux, les absences et les tickets restaurant sont gérés par l’administrateur ; celui-ci peut combiner travail et absence sur une journée. Les réunions comptent dans le temps de travail. Le bouton Recharger la semaine actualise l’affichage sans publier ni copier des données.'])]),
('Documents : procédures, formations et ressources humaines',[
block('Procédures',[
'Recherchez par titre, application ou mot-clé et filtrez la catégorie. Les documents importés se téléchargent depuis le portail ; les liens Google Drive s’ouvrent avec les autorisations du compte Google utilisé.',
'Les manuels Portail+ se trouvent dans Logiciels et matériel. Les droits de modification donnent accès à l’import PDF / Word, à l’ajout de liens et à la gestion des documents.']),
block('Formations & documents imprimables',[
'Choisissez Documents de références ou Documents de formation. La barre de recherche filtre les noms dans la catégorie affichée, sans tenir compte des accents ni des majuscules.',
'Avec les droits de modification, déposez un ou plusieurs PDF / Word (.docx), de 10 Mo maximum par fichier, dans la bonne catégorie, ou choisissez-les depuis votre ordinateur.',
'Chaque ligne propose Renommer, Imprimer et Télécharger. Le renommage dépend des droits de modification. Un PDF s’imprime dans son lecteur ; un fichier Word doit être ouvert dans Word avant impression.']),
block('Ressources humaines et signatures',[
'Les documents communs sont consultables par l’équipe. Les documents personnels sont réservés au salarié concerné et aux administrateurs. Utilisez le choix de catégorie pour accéder à votre espace.',
'Consultez les miniatures et téléchargez le document utile. L’import, la suppression et l’envoi pour signature sont réservés aux administrateurs.',
'Pour une demande de signature, utilisez le lien reçu et suivez le parcours Youtrust. Vérifiez le document et votre identité avant de signer. Les envois réels nécessitent une connexion Youtrust configurée ; un essai de démonstration reste un essai.'])]),
('Laboratoires et challenges',[
block('Répertoire des laboratoires',[
'La recherche retrouve un laboratoire, un commercial ou un responsable. Les fiches sont classées alphabétiquement. Cliquez sur une tuile pour voir les coordonnées, conditions commerciales, franco et documents.',
'La commande est orientée Pharmacie ou Groupement ; lorsqu’elle relève de la pharmacie, un collaborateur responsable est indiqué. Les conditions peuvent être datées par année civile et leur historique consulté.',
'Selon vos droits, vous pouvez compléter une fiche, importer son logo et joindre un catalogue ou des conditions en PDF / Word. Le contact e-mail proposé utilise l’adresse du commercial de la fiche. Vérifiez le destinataire avant l’envoi.']),
block('Lire les challenges du mois',[
'Choisissez le mois civil. La carte indique le laboratoire et son logo, le titre et la réalisation globale à la date du dernier PDF validé. Le bouton + développe les détails.',
'L’objectif global est un minimum : la réalisation peut dépasser 100 %. Les unités vendues par collaborateur alimentent son gain potentiel dès la première unité.',
'Gain potentiel = gain par unité × unités du collaborateur. Il apparaît en rouge avant 100 % de réalisation globale et devient Gain débloqué en vert quand l’objectif est atteint ou dépassé. Un gain par unité paramétré à 0 € produit un gain nul.',
'Les chiffres affichés proviennent d’un bilan importé et validé. Une anomalie, une identité mal reconnue ou une somme incohérente doit être signalée au responsable du challenge.'])]),
('Commandes : protection supplémentaire de l’accès',[
block('Déverrouiller avec Ente Auth',[
'Vous êtes déjà connecté au portail : le parcours courant demande le code temporaire Ente Auth à six chiffres, sans ressaisir votre identifiant. Ente Auth doit avoir été relié une première fois à votre compte personnel.',
'Pour la configuration, choisissez Relier Ente Auth, confirmez votre mot de passe, puis scannez le QR code ou recopiez la clé dans Ente Auth. Entrez le premier code pour terminer l’activation. Ne partagez ni QR code ni clé.']),
block('Utiliser la fiche de 50 codes sans téléphone',[
'La fiche personnelle permet de déverrouiller avec votre mot de passe portail et un code papier à usage unique. Le parcours Autre moyen de secours donne accès aux méthodes disponibles pour votre compte.',
'Créez votre fiche dans Ma fiche de 50 codes / Générer ma fiche PDF, puis téléchargez-la et imprimez-la immédiatement. Elle n’est pas réaffichable. Une nouvelle fiche invalide tous les anciens codes papier.',
'Rangez la fiche dans un endroit protégé. Renouvelez-la avant d’épuiser les codes. Ente Auth peut rester optionnel lorsque votre fiche papier est active.']),
block('Verrouillage et secours',[
'L’espace se verrouille après dix minutes d’inactivité. Utilisez Quitter et enregistrer : les lignes modifiées sont sauvegardées avant le verrouillage. En cas de champ incomplet ou de conflit, l’espace reste ouvert pour correction.',
'Les codes de secours Ente Auth sont eux aussi personnels et à usage unique. En cas de perte de toutes vos méthodes, contactez l’administrateur pour réinitialiser votre accès protégé.'])]),
('Commandes programmées : suivre le cycle',[
block('Créer et retrouver une ligne',[
'Avec les droits de modification, cliquez Ajouter une ligne. Renseignez le nom, le prénom, le traitement, le mode Grossiste / Direct labo / Prep rosiers, les commentaires et la fréquence en jours.',
'Pour démarrer un nouveau cycle, saisissez manuellement la première date de prochaine commande. Enregistrez la ligne avant d’utiliser ses cases de suivi.',
'La recherche porte sur le nom, le prénom et le traitement. Les numéros permanents sont affichés à gauche et se recherchent avec # suivi du numéro. Le classement est alphabétique par défaut. Les filtres En retard, À commander, En attente de délivrance et Suspendues ainsi que le tri par numéro sont regroupés dans Administration et référent du service.']),
block('Commande passée puis délivrée',[
'Une alerte rouge signale une échéance arrivant dans les sept jours. Cochez Commande passée quand la commande a réellement été effectuée : la date et vos initiales sont enregistrées.',
'Cochez Commande délivrée uniquement après délivrance effective. La date et vos initiales sont enregistrées ; la prochaine échéance est recalculée à partir de cette date et de la fréquence.',
'Si la délivrance a été cochée par erreur, décochez-la. Contrôlez ensuite la prochaine échéance affichée. Une fréquence modifiée après création doit être enregistrée avant de poursuivre le suivi.']),
block('Suspendre, importer et exporter',[
'Suspendre interrompt le suivi actif de la ligne, qui reste à sa place alphabétique. Le bouton de reprise la remet dans le suivi actif. La suspension ne supprime pas la fiche.',
'L’import et l’export Excel sont réservés aux administrateurs et au référent du service Commandes programmées. L’import reprend les champs nom, prénom, traitement et commentaires ; vérifiez la correspondance des colonnes et complétez les échéances du cycle.',
'Exporter en Excel télécharge le tableau complet. Enregistrez d’abord vos lignes modifiées. Gardez les exports contenant des informations personnelles dans un emplacement protégé.'])]),
('Merchandising : plan et calendrier mensuel',[
block('Choisir une zone',[
'Le plan comporte les TG (têtes de gondole), IC (intercomptoirs), BS (bacs soldeurs), EV (événement), SA (saison) et DS (déstockage). Cliquez sur un repère ou sur sa fiche récapitulative sous le plan.',
'Le nom du bouton est personnalisable. Son affichage sur le plan et dans le récapitulatif utilise ce nom unique. Le nom personnalisé ne change pas le type technique de la zone.',
'Les consignes TG, BS, SA et EV sont fixes. Les autres zones conservent un commentaire libre. Le calendrier des opérations et produits reste éditable dans tous les cas.']),
block('Associer une offre et un laboratoire à un mois',[
'Dans le calendrier annuel de la fiche, choisissez un laboratoire pour le mois. Autres permet de préciser un laboratoire absent du répertoire. Conservez ou complétez librement le texte des opérations et produits.',
'Enregistrez la fiche avant de quitter le calendrier. Les sélections de laboratoire sont propres à chaque mois : octobre et novembre peuvent concerner des laboratoires différents.',
'Sous le plan, changez le mois avec les flèches ou le sélecteur. Le laboratoire apparaît juste sous le nom de la zone. Vert signifie qu’aucune opération ni produit n’est saisi ; rouge signifie que ce champ est renseigné. Le laboratoire seul ne rend pas la zone occupée.']),
block('Export du mois',[
'Exporter les offres en Excel reprend les offres renseignées du mois sélectionné. Elles sont regroupées par TG, BS, IC, EV, SA et DS, puis classées par nom ou numérotation personnalisée.',
'Le fichier contient le type de mise en avant, l’emplacement, le laboratoire et le texte de l’offre. Vérifiez le mois indiqué avant le téléchargement.'])]),
('Calculs, contacts, Fun et accès externes',[
block('Outils d’aide au calcul : PromoFlash',[
'Saisissez ou scannez un EAN pour rechercher le produit et sa photo. Si la recherche échoue, complétez les informations manuellement.',
'Les prix de marché peuvent être recherchés à partir des offres disponibles ou saisis avec leur site et date de relevé. Ils ne constituent pas une garantie du prix le plus bas de toute l’année.',
'Adaptez les valeurs d’exemple : prix catalogue, remises fond de rayon et promotion, rémunérations supplémentaires, prix de vente, volume de vente et TVA. L’outil affiche les indicateurs de rentabilité et les comparaisons issus de vos saisies. Vérifiez les unités HT / TTC et les hypothèses avant de décider.']),
block('Contacts utiles et Passerelle groupement',[
'Contacts utiles classe les interlocuteurs par périmètre (logiciel, banque, assurance, matériel…). La recherche accepte un nom, un thème ou un numéro. Les liens téléphone, e-mail et site ouvrent les applications ou sites correspondants.',
'Passerelle groupement ouvre Pharmascope. Les droits et identifiants de ce service externe restent indépendants du portail.']),
block('Fun et WhatsApp',[
'Fun regroupe la sélection musicale et les fonctions de playlist disponibles. Les connexions et exports vers les services musicaux dépendent de leur configuration et de leurs autorisations.',
'La tuile Fun affiche aussi la blague du jour. Les informations de fêtes et anniversaires concernent l’équipe ; leur consultation ne donne pas accès aux données RH détaillées.',
'Le bouton WhatsApp utilise le numéro de votre fiche pour proposer l’ouverture de WhatsApp et l’association à votre application. Il ne connecte pas automatiquement un compte : les étapes d’association restent à réaliser dans WhatsApp. Déconnectez vos comptes sur un poste partagé.'])]),
('Dépannage et bonnes pratiques',[
block('Un bouton ne répond pas ou les données semblent anciennes',[
'Attendez la confirmation de l’action ; relevez le texte du message d’erreur. Rechargez ensuite la page si nécessaire. Pour le planning, Recharger la semaine reprend la version enregistrée.',
'Si une ligne a été modifiée par un collègue, rechargez-la avant de reprendre vos changements. N’insistez pas en envoyant plusieurs fois la même opération.',
'Un événement Google absent peut provenir d’une autorisation expirée ou d’un mauvais agenda source. Un planning absent peut simplement ne pas avoir été publié. Vérifiez les dates et le statut affichés.']),
block('Fichier ou accès refusé',[
'Verifiez le format et la limite de taille. Les documents de références / formation acceptent PDF et Word ; Communication accepte aussi les images JPEG / PNG. Une pièce jointe n’est accessible qu’aux personnes autorisées à voir le message.',
'Si une tuile ou une commande de modification manque, contactez l’administrateur : les droits de consultation et de modification sont distincts.',
'En cas de mot de passe perdu, de lien expiré ou de fiche de codes épuisée, contactez l’administrateur. Ne transmettez pas votre mot de passe, une clé Ente Auth ou une fiche de codes dans Communication.']),
block('Avant de quitter le poste',[
'Enregistrez les changements, vérifiez les confirmations, verrouillez les commandes et déconnectez-vous du portail. Signalez une erreur avec la date, l’univers concerné et une capture ne montrant pas de secrets.'])])]

A=[
('Démarrage et organisation des droits',[
block('Rôle de l’administrateur',[
'Le compte administrateur gère les collaborateurs, les accès et les paramètres. Donner des droits administrateur à un salarié lui confère les mêmes accès et capacités de modification : réservez ce rôle aux personnes désignées.',
'Les droits Consulter / accéder et Modifier le contenu sont distincts. Cocher Modifier active aussi Consulter ; retirer Consulter retire la modification. Certaines opérations RH et de gestion des comptes restent réservées aux administrateurs.',
'Avant de donner l’accès, vérifiez que le collaborateur est actif, que son e-mail de connexion est correct et que les univers nécessaires sont autorisés.']),
block('Recette de la version 1.1',[
'Verifiez avec un compte salarié les tuiles visibles, l’accès aux documents personnels, le planning publié et la protection des commandes. Testez aussi l’impression et les écrans 4/3 utilisés à la pharmacie.',
'Conservez la cohérence des rubriques : Procédures pour les consignes, Formations & documents imprimables pour les références / supports et Ressources humaines pour les documents communs ou personnels.']),
block('Utilisation des deux manuels',[
'Le manuel utilisateur décrit les parcours courants et les outils accessibles selon les droits. Le présent guide décrit les contrôles d’administration et les configurations externes. Les fonctionnalités dépendantes de Google, Youtrust ou d’un service de recherche exigent que ces connexions soient actives.'])]),
('Collaborateurs : création et cycle des accès',[
block('Ajouter une personne',[
'Ajoutez un collaborateur manuellement, à partir d’une fiche de renseignements ou par import d’une liste. Vérifiez nom, prénom, téléphone, date de naissance utile et fonction avant l’enregistrement.',
'Les états Sans accès, Invitation envoyée et Accès activé permettent de distinguer un salarié inscrit dans l’annuaire d’un utilisateur réellement connecté au portail.',
'Le menu de fonction propose Pharmacien (cienne), Préparateur(trice) et Autres précisez. Cette information sert notamment au compteur des pharmaciens présents dans le planning.']),
block('Invitation et messagerie Gmail',[
'Renseignez une adresse e-mail de connexion, puis utilisez Envoyer demande de connexion sur la ligne du salarié. Le lien de bienvenue permet de créer son mot de passe et reste valable 72 heures.',
'Avant le premier envoi, autorisez le compte Gmail de la pharmacie dans Messagerie des invitations. L’expéditeur prévu est pharmacie.trevoux@gmail.com. Vérifiez le résultat d’envoi et les courriers indésirables du destinataire.',
'Une invitation expirée exige un nouvel envoi. Les paramètres de messagerie et les connexions Google ne donnent pas automatiquement à un salarié les droits d’administration.']),
block('Départ et suppression',[
'Déplacez un salarié sortant dans les inactifs pour retirer son accès. La suppression définitive proposée dans cette partie est une opération différente et irréversible dans l’interface : vérifiez la personne et les données à conserver avant confirmation.',
'Verifiez également les demandes de signatures, affectations et méthodes de protection personnelles lors du départ d’un collaborateur.'])]),
('Fiche salarié et lecture d’une fiche manuscrite',[
block('Compléter la fiche administrative',[
'La fiche regroupe identité, coordonnées, contrat, durée du travail, rémunération, coordonnées bancaires, protection sociale et suivi administratif. Ne renseignez que les champs utiles.',
'Les champs supprimés de la version 1.1 ne sont plus proposés : autre téléphone personnel, e-mail personnel, abonnement transport, diplôme en saisie libre, formation / autorisation de travail et dernière visite de santé.',
'La fonction reste un choix contrôlé, avec précision pour Autres. Les droits des univers et l’option Donner des droits administrateur sont en bas de fiche.']),
block('Générer une fiche de renseignements',[
'Téléchargez le PDF vierge depuis Collaborateurs et remettez-le au salarié pour un remplissage lisible. Le PDF reprend la fiche simplifiée, les pièces à transmettre et la validation du salarié.',
'Le document est destiné à un retour contrôlé à la personne chargée du dossier ; évitez une diffusion générale dans Communication.']),
block('Importer une fiche remplie',[
'La lecture accepte un PDF ou une photo JPEG / PNG de 10 Mo maximum. Le service de lecture OpenAI doit être configuré ; une clé serveur peut gérer cette connexion.',
'Après lecture, vérifiez le nom, les dates, NIR, IBAN, numéros et champs signalés incertains sur le document original. Une valeur reconnue n’est pas une validation administrative.',
'Confirmez la vérification avant l’enregistrement. Les champs absents du scan ne doivent pas être interprétés comme une information certaine ou une autorisation de supprimer les anciennes données.'])]),
('Google Agenda et connexions Gmail',[
block('Connecter le bon compte',[
'Dans Agenda > Paramètres de l’agenda, connectez ou renouvelez l’autorisation Google avec pharmacie.trevoux@gmail.com. Autorisez à la fois la lecture de la liste des agendas et celle des événements.',
'Choisissez l’agenda à afficher et utilisez Enregistrer cet agenda, puis Actualiser maintenant. Le compte Google et l’e-mail de connexion au portail sont deux notions indépendantes.',
'La synchronisation reprend les événements des 30 jours précédents aux 180 jours suivants. L’affichage indique la dernière synchronisation ; une nouvelle lecture est recherchée quand le cache dépasse 15 minutes.']),
block('Renouveler une autorisation expirée',[
'Si L’autorisation Google doit être renouvelée apparaît, cliquez Renouveler l’autorisation Google. Sur l’écran Google, acceptez les deux permissions agenda. Revenez au portail puis actualisez.',
'Le message Autorisez la lecture des agendas et des événements signifie qu’au moins une permission requise n’a pas été reçue. Recommencez le consentement en vérifiant les cases.',
'Les anciens événements peuvent rester affichés pendant l’erreur. Ne les considérez pas comme des informations à jour. Déconnecter Google retire le cache et n’est pas nécessaire pour un simple renouvellement.']),
block('Envois depuis Gmail',[
'La connexion Gmail des invitations est distincte de celle de Google Agenda. Autorisez l’envoi depuis le compte de la pharmacie avant les invitations ou les actions e-mail utilisant cette messagerie.',
'Pour un envoi en échec, vérifiez connexion, autorisation, adresse destinataire et résultat affiché. N’envoyez pas de clé API ou de jeton de connexion dans un message aux collaborateurs.'])]),
('Planning : construire la semaine',[
block('Configurer et saisir les créneaux',[
'Administration regroupe les semaines types, les demandes de congés, le paramétrage des postes, la copie et la publication. Paramétrez les postes avec leurs couleurs ; utilisez Comptoir pour les créneaux devant alimenter les compteurs.',
'Dans une journée, saisissez jusqu’à dix créneaux entre 7 h 30 et 21 h 30. Chaque créneau a son poste et son commentaire facultatif, limité à 500 caractères. Les horaires ne doivent pas se chevaucher.',
'Le clic droit permet d’ajouter un créneau ou de changer son poste. Les flèches près du nom déplacent le collaborateur dans l’ordre du planning ; cet ordre est partagé et ne remplace pas le classement de l’annuaire.']),
block('Semaines types et copie',[
'Créez une semaine type indépendamment des semaines datées, par exemple Paire ou Impaire. Renseignez ses créneaux, postes et commentaires, puis appliquez-la au brouillon de la semaine voulue.',
'Copier une semaine regroupe le choix de la semaine source et le bouton de copie. Vérifiez la semaine source et la destination. Si la destination contient un brouillon, l’interface demande une confirmation.',
'L’application d’un modèle remplace le brouillon de toute l’équipe. Les tickets restaurant sont à renseigner sur la semaine datée ; les heures se calculent à partir des créneaux. Le total hebdomadaire figure aussi dans la semaine type. La version publiée précédente reste visible jusqu’à la nouvelle publication.']),
block('Contrôler avant publication',[
'Verifiez les horaires, pauses, postes, jours particuliers et commentaires. Un commentaire saisi sera visible aux personnes ayant accès au planning : ne l’utilisez pas pour un dossier RH confidentiel.',
'Recharger la semaine actualise les données enregistrées sans copie ni publication.'])]),
('Planning : publication, cadenas et présence',[
block('Publier une semaine complète',[
'Publier le planning de l’équipe publie la semaine sélectionnée du lundi au dimanche pour toute l’équipe. Même depuis la vue Jour, la publication porte sur les sept jours de cette semaine.',
'La date et l’heure de dernière publication sont affichées près du bouton. Après une modification, utilisez Republier pour rendre le nouveau brouillon visible à l’équipe.',
'Une publication effective crée automatiquement un message normal de Portail+ dans Communication pour tous les collaborateurs actifs. Il invite à consulter la semaine publiée, propose un lien, ne peut pas être archivé et expire après 30 jours. Une même version déjà publiée ne génère pas un deuxième message.']),
block('Valider une journée',[
'Dans la vue Semaine, le cadenas près du jour verrouille ou déverrouille les modifications de cette journée. Un cadenas n’est pas un bouton de publication.',
'Dévalidez avant de corriger une journée verrouillée. Les opérations de copie ou de modèle peuvent être refusées lorsqu’une journée de la destination est validée.']),
block('Lire les compteurs',[
'Le graphique de présence compte uniquement le poste Comptoir. Les carrés pharmaciens imposent deux conditions : fonction Pharmacien / Pharmacienne et poste Comptoir, sur un créneau de travail.',
'Rouge = 0 pharmacien ; orange = 1 ; vert clair = 2 ou plus. Vérifiez les fiches collaborateurs et le poste attribué si un compteur paraît incorrect. Les jours CFA, formations, absences et repos ne sont pas des créneaux de travail pour ce compteur.'])]),
('Congés, absences, heures et récapitulatif mensuel',[
block('Suivre les demandes',[
'Le salarié peut envoyer une demande de congés depuis le bouton dédié. Administration > Demandes de congés de l’équipe permet de la traiter. Vérifiez les dates et la couverture de l’équipe avant la décision.',
'Lorsqu’une absence doit figurer au planning, utilisez le motif approprié : congés, arrêt maladie, récupération ou absence injustifiée. Le motif École CFA est disponible ; l’ancien motif générique Absence n’est plus proposé pour une nouvelle saisie.']),
block('Heures réalisées et tickets restaurant',[
'Les totaux prévus proviennent des créneaux. Les heures sont calculées à partir des créneaux de travail, formation, école CFA et réunion ; les absences sont comptées séparément. Il n’y a plus de champ manuel de durée réellement effectuée.',
'La case avec assiette et saucisse attribue un ticket restaurant pour le jour. Dans la vue quotidienne, elle est à côté des flèches. Dans la vue Semaine, elle reste propre à chaque journée.',
'Verifiez les journées et les totaux avant transmission. Ne confondez pas horaires prévus, heures réalisées et journées dont la durée n’a pas été renseignée.']),
block('Vue Mois et cabinet comptable',[
'La vue Mois récapitule heures calculées, durées d’absence connues, absences anciennes sans durée et tickets. Elle utilise les données des brouillons : des corrections non publiées peuvent donc y figurer.',
'Enregistrez l’e-mail du cabinet comptable, puis exportez le PDF. L’enregistrement de l’adresse ne réalise pas un envoi automatique : joignez le PDF à votre e-mail au cabinet.',
'Choisissez le bon mois, contrôlez les cases manquantes et archivez la version réellement transmise selon l’organisation de la pharmacie.'])]),
('Communication : règles et usage',[
block('Messages internes',[
'Toute l’équipe accède à Communication et peut envoyer un texte court aux collaborateurs actifs. Une pièce jointe PDF, Word, JPEG ou PNG de 10 Mo maximum peut l’accompagner.',
'La priorité Important est un repère visuel, pas une preuve de lecture. Le suivi repose sur les cases Vu cochées par les destinataires.',
'Messages envoyés permet de revoir les envois des 30 derniers jours. Répondre crée un nouveau message adressé à l’expéditeur actif.']),
block('Conservation et notifications',[
'L’archive est personnelle à chaque destinataire. Les messages non archivés disparaissent après 30 jours. Les pièces jointes suivent la disponibilité et les droits du message.',
'Les notifications automatiques de publication de planning sont normales et non archivables. Le lien Consulter le planning ouvre la semaine concernée lorsqu’elle est associée au message.',
'Verifiez les destinataires avant l’envoi d’un document. Utilisez les documents personnels RH pour une pièce propre à un salarié plutôt qu’un message à toute l’équipe.'])]),
('Procédures, formations et ressources humaines',[
block('Procédures et manuels',[
'Classez les consignes par application, donnez un titre explicite et ajoutez des mots-clés utiles. L’import accepte PDF et Word ; un lien Google Drive est consultable avec les autorisations Google du lecteur.',
'Les manuels version 1.1 se trouvent dans Logiciels et matériel, sous Manuel de l’utilisateur Portail+ et Manuel de l’administrateur Portail+.',
'Les personnes disposant du droit de modification peuvent importer, modifier et retirer les procédures. Un retrait peut être annulé depuis l’action proposée.']),
block('Formations & documents imprimables',[
'Les deux catégories sont Documents de références et Documents de formation. L’import par dépôt peut contenir plusieurs fichiers PDF / Word, chacun limité à 10 Mo.',
'La recherche filtre le nom dans la catégorie sélectionnée. Les actions de ligne sont Renommer, Imprimer et Télécharger. Les PDF ont un parcours lecteur / impression ; les Word nécessitent Word.',
'Gardez un document de référence dans la catégorie correspondante pour éviter des copies contradictoires dans plusieurs rubriques.']),
block('RH : import et visibilité',[
'Importer un PDF par bouton ou dépôt ouvre la saisie du nom et du type d’accès. Choisissez Document commun ou Document personnel et, pour ce dernier, le salarié concerné.',
'Les miniatures aident à reconnaître le document. Renommez de façon explicite. La suppression et l’envoi pour signature sont réservés à l’administration ; vérifiez toujours la portée de diffusion.'])]),
('Youtrust : préparer et suivre les signatures',[
block('Configurer le fournisseur',[
'Dans Ressources humaines, ouvrez Connexion Youtrust. Renseignez la clé API et choisissez l’environnement Démonstration / sandbox ou l’environnement d’envoi réel disponible.',
'Une connexion vérifiée est nécessaire avant l’envoi. Une demande préparée en démonstration n’est pas une demande réelle ; vérifiez l’environnement affiché avant utilisation avec l’équipe.']),
block('Envoyer un document',[
'Depuis le document, choisissez Envoyer pour signature et sélectionnez les collaborateurs actifs concernés. Vérifiez leurs e-mails et le PDF avant confirmation.',
'Suivez les statuts affichés, par exemple Préparée, À signer, Consulté, Signé, Refusé, Expirée ou Envoi à vérifier. Un e-mail remis ne prouve pas que le document est signé.',
'Actualisez le suivi et récupérez les pièces signées lorsque le parcours du fournisseur les propose. Ne considérez pas une erreur ou un état incertain comme un envoi réussi.']),
block('Contrôles pratiques',[
'Conservez la version du document réellement envoyée et identifiez les salariés restant à signer. Le portail facilite le suivi ; le niveau de signature, le contrat et les conditions du fournisseur sont à vérifier avec Youtrust.',
'Ne publiez pas une clé API dans un document ni dans Communication. Les accès aux documents personnels doivent rester limités à leur titulaire et à l’administration.'])]),
('Laboratoires : maintenir le répertoire',[
block('Créer une fiche exploitable',[
'Renseignez le nom du laboratoire, le mode de commande Pharmacie / Groupement et le responsable interne lorsque la commande passe par la pharmacie.',
'Complétez conditions commerciales, franco, coordonnées du commercial et du laboratoire. Vérifiez spécialement l’e-mail utilisé pour les envois et le service commandes.',
'Un logo peut être importé sur la fiche. Ajoutez les catalogues et conditions en PDF / Word pour faciliter le travail de l’équipe.']),
block('Historique des conditions',[
'Renseignez l’année civile de validité. L’historique permet de retrouver les conditions des années précédentes. Ne présentez pas des conditions anciennes comme une offre en cours.',
'Utilisez la recherche pour limiter les doublons de laboratoires. Les noms du répertoire alimentent aussi le menu de laboratoire dans le merchandising. Les affectations mensuelles conservent le nom choisi pour ce mois.']),
block('Actions et documents',[
'Les actions d’ajout sont regroupées en haut à droite, la recherche à gauche. Dans la fiche, vérifiez le document sélectionné avant suppression ou envoi.',
'Un e-mail au commercial doit utiliser une adresse valide de la fiche. Les envois qui passent par la messagerie pharmacie nécessitent son autorisation Gmail.'])]),
('Challenges : paramétrage et analyse des bilans',[
block('Créer le challenge mensuel',[
'Choisissez le mois, le laboratoire, l’intitulé, les modalités, le type Unités vendues ou Chiffre d’affaires réalisé et l’objectif global minimal. Cochez les collaborateurs concernés.',
'Le gain est paramétré par unité vendue et non comme une somme fixe par salarié. La version 1.1 ne comporte pas d’objectif individuel à atteindre pour chaque collaborateur.',
'Verifiez le taux de gain : s’il est de 0 €, les gains restent à 0 €. Les modalités textuelles d’un bonus particulier ne créent pas automatiquement une règle de calcul supplémentaire.']),
block('Importer et valider le PDF de ventes',[
'Importez le bilan et contrôlez la lecture avant validation. Pour le modèle de bilan opérateurs étudié, utilisez les lignes récapitulatives en gras de chaque opérateur, sans additionner à nouveau le détail des produits.',
'Le total global est celui du bas de tableau. Pour un challenge en unités, la somme des quantités des participants doit correspondre au total global. Une incohérence bloque la confirmation.',
'Un collaborateur réellement absent du bilan complet a une quantité de 0. Une identité ambiguë ou un chiffre illisible exige une correction humaine ; ne forcez pas la somme pour atteindre le total.',
'Les imports sont un cumul du mois et remplacent le bilan validé précédent. Vérifiez la date de réalisation globale affichée sur la carte.']),
block('Gains et envoi au laboratoire',[
'Le potentiel se cumule dès la première unité ; il devient débloqué à partir de 100 % de l’objectif global. La réalisation peut dépasser 100 %. Un challenge en chiffre d’affaires doit aussi fournir les unités nécessaires au gain.',
'Le document importé peut être envoyé au laboratoire via l’e-mail de la fiche, depuis la messagerie Gmail autorisée de la pharmacie. Vérifiez le destinataire et le résultat d’envoi.'])]),
('Commandes : protection et méthodes de secours',[
block('Un deuxième contrôle personnel',[
'L’accès au portail précède le déverrouillage des commandes. Ente Auth fournit un code temporaire ; la fiche de 50 codes permet un accès sans téléphone avec mot de passe personnel et code papier.',
'Ente Auth est configuré par compte, via son QR code personnel. L’e-mail utilisé pour un compte Ente ne transforme pas les secrets des collaborateurs en une clé commune à partager.',
'Les codes de secours et les fiches ne sont affichés qu’au moment de leur génération. Chaque code est utilisable une seule fois. Le renouvellement invalide les anciens codes.']),
block('Réinitialiser un collaborateur',[
'Utilisez la commande d’administration prévue dans l’espace protégé. Vérifiez la personne concernée : une réinitialisation doit être suivie d’une nouvelle configuration de sa méthode.',
'Verifiez que le salarié a enregistré sa fiche dans un lieu protégé et qu’il connaît la procédure de renouvellement avant épuisement. Une fiche de codes ne doit pas rester à côté du poste.',
'L’espace se verrouille après dix minutes d’inactivité. Testez le verrouillage manuel et le comportement après changement de compte sur un poste partagé.']),
block('Limites à garder en tête',[
'La protection d’accès réduit l’exposition aux consultations non autorisées ; elle ne remplace pas une décision sur l’hébergement et la gestion des données sensibles.',
'Le projet de migration HDS est distinct des fonctions de la version 1.1. Avant de migrer, inventoriez les données, documents, secrets de chiffrement et connexions à conserver.'])]),
('Commandes : administration du tableau',[
block('Saisie et suivi',[
'Les champs sont nom, prénom, traitement, fréquence en jours, prochaine échéance, mode de commande et commentaires. La première échéance peut être saisie manuellement pour démarrer le cycle.',
'Les cases Commande passée et Commande délivrée enregistrent date et initiales. La prochaine commande dépend de la date de délivrance et de la fréquence, pas de la seule date de commande.',
'Verifiez les recalculs lors d’une modification de fréquence ou d’une délivrance décochée. Enregistrez d’abord les données avant les cases de suivi.']),
block('Suspension et import Excel',[
'Une ligne suspendue est exclue du suivi actif mais conserve sa place alphabétique. Chaque ligne a un numéro permanent à gauche. Le tri par nom reste le réglage par défaut.',
'Dans Administration et référent du service, les administrateurs et le référent Commandes programmées retrouvent les filtres, le tri par numéro et l’import/export Excel. L’import reprend nom, prénom, traitement et commentaires ; vérifiez les colonnes et initialisez les échéances.',
'La recherche et les filtres aident à isoler les retards, commandes à passer, attentes de délivrance et suspensions. Un filtre d’affichage ne doit pas être confondu avec la suppression d’une ligne.']),
block('Export et confidentialité',[
'L’export Excel reprend le tableau complet. Les lignes modifiées doivent être enregistrées avant l’export.',
'Verifiez l’emplacement de stockage du fichier et ses destinataires. Les informations concernant un traitement ou une personne ne doivent pas être diffusées dans un répertoire partagé sans contrôle.'])]),
('Merchandising : règles, laboratoires et export',[
block('Zones et consignes',[
'TG, IC, BS, EV, SA et DS ont un nom de repère personnalisable et un calendrier mensuel. Renommer une zone ne change pas son type de mise en avant dans le classement.',
'TG : monoproduit ou au maximum monogamme ; prix promo ou opération promo obligatoire ; offre découverte pour une nouveauté ; EE grand format.',
'BS : petits produits facilement accessibles au fond du bac ; prix inférieurs à 10 € ; produits colorés ; promotion par 2 ou 3 bienvenue. Exemples : Hydratis, compotes, brumisateurs, fleurs de douche, brosses à dents enfants, gels douche été.',
'SA : produits de para et/ou compléments alimentaires ; traitement par thème, maximum trois thèmes sur la longueur complète. Exemples : solaires, moustiques, allergies, rhume, acné.',
'EV : produits de para de marques ou gammes différentes ayant un point commun avec un événement du moment ; coffrets de Noël, mini modèles de voyage, octobre rose. Prévoir des outils d’animation autour de la descente.']),
block('Répartition mensuelle',[
'Les consignes des TG, BS, SA et EV sont fixes. Les autres zones conservent leur commentaire libre. Le texte opérations / produits reste libre pour chaque mois.',
'Choisissez le laboratoire du mois dans la liste issue du répertoire, ou Autres avec sa précision. Le laboratoire s’affiche sous la zone dans le récapitulatif du mois sélectionné.',
'Vert / rouge indique uniquement si le texte opérations / produits est vide ou renseigné. Un laboratoire choisi sans offre ne suffit pas à rendre la zone occupée.']),
block('Exporter les offres',[
'Choisissez le mois sous le plan, puis Exporter les offres en Excel. Le fichier classe les offres par type et numérotation / nom personnalisé et reprend le laboratoire associé.',
'Verifiez le mois et l’enregistrement des fiches avant de partager l’export.'])]),
('Calculs, Contacts utiles, Fun et services externes',[
block('PromoFlash',[
'L’outil utilise les saisies de catalogue, remises, prix de vente, volumes, TVA et rémunérations supplémentaires pour estimer la rentabilité promotionnelle. Les valeurs d’exemple doivent être remplacées.',
'La recherche produit s’appuie sur Open Beauty Facts / Open Food Facts ; les offres de prix dépendent du service de recherche configuré. Une absence de résultat n’empêche pas la saisie manuelle.',
'Verifiez la cohérence HT / TTC, les sources, la date du relevé et les hypothèses. Les résultats ne garantissent ni un volume réel de vente ni le prix le plus bas de toute l’année.']),
block('Répertoire et musique',[
'Contacts utiles permet d’ajouter, modifier, supprimer ou restaurer un contact et d’importer une liste. Gardez des périmètres cohérents et des coordonnées vérifiées.',
'Fun accueille la musique de l’équipe et les fonctions de playlist disponibles. Les connexions YouTube et autres parcours externes doivent être autorisés et testés avec le compte prévu.',
'Les tuiles Contacts, Fun et outils n’affichent pas de badge nouveautés non lues. Les préférences d’ordre des tuiles restent individuelles.']),
block('Accès externes',[
'Pharmascope et mySilae conservent leurs propres comptes et disponibilités. WhatsApp nécessite une association explicite à l’application ; l’ouverture depuis le portail n’est pas une connexion automatique.',
'Verifiez la déconnexion des services externes sur un poste partagé et ne confondez pas leurs mots de passe avec celui du portail.'])]),
('Exploitation et contrôles de la version 1.1',[
block('Routine de contrôle',[
'Après une publication : vérifier la semaine, sa date de publication et la notification dans Communication. Après un import : relire le contenu, la catégorie, la portée d’accès et le résultat enregistré.',
'Chaque semaine : contrôler les comptes actifs, les droits, les demandes en attente, la fraîcheur Google Agenda et les connexions nécessaires aux envois.',
'Chaque mois : vérifier les heures réalisées et tickets avant export comptable, les bilans de challenges et la répartition merchandising.']),
block('Sauvegarde et mises à jour',[
'Le code et les données sont distincts. Une copie du dépôt ne sauvegarde pas à elle seule les collaborateurs, plannings, messages, documents et autres informations de la base.',
'Organisez la sauvegarde de la base et un test de restauration. Conservez de façon protégée les secrets nécessaires au déchiffrement ; une base chiffrée restaurée sans la clé correspondante peut être inutilisable.',
'Verifiez un déploiement après une modification et relevez la version réellement utilisée. Les manuels décrivent la version 1.1, mise en place le 12/10/2026, avec les évolutions disponibles au 18/10/2026 ; les évolutions ultérieures devront être documentées.']),
block('Incident',[
'Notez l’univers, l’utilisateur, la date, le message d’erreur et l’action effectuée. Évitez les répétitions d’envoi lorsque le résultat est incertain.',
'Une erreur d’accès peut provenir des droits ; une erreur de version exige de recharger ; une erreur Google peut exiger un renouvellement d’autorisation ; une clé de fournisseur peut devoir être vérifiée.',
'Verifiez l’impact sur les données avant toute suppression, réinitialisation ou migration. Ces opérations ne doivent pas servir de premier réflexe pour un simple problème d’affichage.'])])]

QUALITY_USER=[
('Démarche qualité : erreurs de délivrance et appels',[
block('Accéder aux six rubriques',[
'La version 1.1, mise en place le 12/10/2026, ajoute la tuile Outils d’aide à la démarche qualité. Elle est accessible à toute l’équipe connectée. Les actions disponibles dépendent du rôle et, pour certains services, du référent désigné.',
'Les six entrées sont : Recueil des erreurs de délivrance ; Appels aux prescripteurs ; Suivi des relevés de température ; Référents services ; Suivi des rejets tiers payant ; Suivi des entretiens officinaux. Cette dernière entrée affiche Contenu à venir : aucune saisie d’entretien n’est encore proposée.']),
block('Déclarer et retrouver une erreur',[
'Cliquez Déclarer une erreur. Indiquez la date d’identification, le type, le détail, le responsable, la date de l’erreur et les actions correctives. Le déclarant est automatiquement le collaborateur connecté ; il ne se choisit pas dans la fiche.',
'Les types proposés sont : produit, dosage, posologie ou quantité, forme galénique, destinataire, défaut de vérification d’interaction, défaut d’information et de conseil. Sélectionnez une gravité de 1 à 4, de l’orange au rouge vif.',
'La liste présente les erreurs les plus récemment identifiées en premier. La recherche retrouve dates, collaborateurs, détails et actions. Classer par permet le tri par date d’identification, date de l’erreur, responsable ou gravité, dans les deux sens.',
'Exporter le listing complet en Excel reprend toutes les erreurs, même si la recherche masque certaines lignes. Seuls les administrateurs peuvent modifier ou supprimer une déclaration déjà enregistrée.']),
block('Tracer les personnes prévenues et l’appel',[
'Tout collaborateur peut cocher ou décocher Opérateur prévenu, Patient prévenu et Médecin prévenu. La date, l’heure et l’opérateur de la validation sont affichés. Cochez uniquement après l’information effective.',
'Une fois Médecin prévenu coché, Déclarer l’appel au prescripteur ouvre une fiche liée à l’erreur. Contrôlez le motif et la suite donnée préremplis, puis renseignez le prescripteur et la date. Cocher Médecin prévenu ne crée pas à lui seul une déclaration d’appel.',
'La page Appels aux prescripteurs permet aussi de déclarer directement un appel : date, nom du prescripteur, motif et réponse ou suite donnée. Anonymisez le patient dans le motif avec les deux premières lettres du nom de famille et une lettre du prénom. Les appels enregistrés se retrouvent dans cette page, du plus récent au plus ancien.'])]),
('Démarche qualité : températures et tiers payant',[
block('Lire les relevés des quatre sondes',[
'Ouvrez Suivi des relevés de température puis choisissez le mois. Les cartes des sondes résument les valeurs, la conformité et les épisodes hors seuil ; le calendrier permet de repérer les journées à examiner.',
'Cliquez sur la sonde ou une journée pour consulter la courbe et les épisodes détaillés : début, fin, minimum, maximum et durée estimée. Les seuils de la sonde sont affichés. Une interruption de mesures n’est pas assimilée à une période conforme.',
'Pour chaque épisode hors seuil, saisissez un Commentaire / actions correctives, puis ajoutez-le. Précisez les vérifications et les actions réalisées. Le commentaire est daté et attribué à son auteur.']),
block('Compléter l’historique par Excel',[
'Les relevés sont importés depuis un export Excel .xlsx Medifroid, par choix du fichier ou dépôt, dans la limite de 15 Mo. Le portail ne se connecte pas automatiquement au compte data.medifroid.com.',
'En début de mois, exportez le mois précédent et importez-le dans le portail. Les nouveaux relevés s’ajoutent aux précédents ; les doublons identiques sont ignorés. Contrôlez les nombres ajoutés et ignorés ainsi que les dernières dates disponibles.',
'Les données et commentaires sont conservés sur une période glissante maximale de trois ans. Un rappel important dans Communication vise le référent Chaîne du froid en début de mois.']),
block('Consulter le suivi des rejets tiers payant',[
'La vue annuelle indique, mois par mois, le nombre de factures, le nombre de rejets, le taux, le montant des rejets et l’appréciation. Taux = rejets / factures × 100. Un taux inférieur ou égal à 2 % est tolérable ; au-delà, il est problématique.',
'Le taux annuel est calculé sur les totaux des mois renseignés, et non par moyenne des taux mensuels. Une case vide signifie qu’aucun résultat n’est renseigné : elle ne vaut pas zéro rejet.',
'Toute l’équipe peut consulter. La saisie et l’import Excel sont réservés aux administrateurs et au référent Tiers payant. Celui-ci reçoit un rappel important en début de mois pour le mois précédent.'])]),
('Démarche qualité : référents et évaluations annuelles',[
block('Consulter une fiche de service',[
'Référents services présente les fiches avec le nom du service, son icône éventuelle, le collaborateur référent et ses missions. Les fiches sont consultables par toute l’équipe.',
'La création, la modification et la suppression des fiches sont réservées aux administrateurs. Signalez au responsable une mission ou une affectation à corriger.']),
block('Comprendre l’évaluation annuelle',[
'Réaliser l’évaluation annuelle ouvre, pour l’administrateur, une fenêtre avec une barre de 0 à 100 % par ligne de mission. Chaque mission doit donc être saisie sur sa propre ligne dans la fiche du service.',
'L’enregistrement conserve l’année, la date et les pourcentages. Les missions évaluées sont conservées avec leurs libellés pour cette année ; une modification ultérieure de la fiche ne réécrit pas l’ancien bilan.',
'L’équipe peut consulter l’évaluation enregistrée et les années précédentes. Seul l’administrateur peut enregistrer ou modifier celle de l’année en cours. Les anciennes validations sans pourcentages restent datées, avec la mention qu’aucun détail n’est disponible.']),
block('Lire les rappels des services',[
'Les rappels arrivent dans Communication et se confirment par la case Vu. Ils sont adressés au collaborateur actif indiqué dans la fiche du service concerné, pas à toute l’équipe.',
'Les rappels Chaîne du froid et Tiers payant sont mensuels. Le référent Merchandising est rappelé le 20 pour valider les zones promotionnelles. Le référent Commandes programmées reçoit un récapitulatif unique le mardi : retards, échéances sous sept jours, commandes non délivrées et lignes à compléter.',
'Le récapitulatif commandes utilise des numéros de ligne permanents, sans identité ni traitement du patient. Le bouton d’accès ouvre l’espace protégé, avec son contrôle supplémentaire.'])])]
QUALITY_ADMIN=[
('Version 1.1 : organiser la démarche qualité',[
block('Périmètre et accès',[
'La version 1.1 datée du 12/10/2026 ajoute Outils d’aide à la démarche qualité. Cette édition du 18/10/2026 décrit les fonctions effectivement disponibles, y compris les évolutions récentes des évaluations et des rappels.',
'Toute l’équipe accède aux six rubriques. Recueil des erreurs de délivrance, Appels aux prescripteurs, Températures, Référents services et Rejets tiers payant sont fonctionnels. Suivi des entretiens officinaux est un accès réservé pour un paramétrage ultérieur : il affiche Contenu à venir.',
'Ne confondez pas l’accès à la tuile avec une autorisation de gestion universelle : les restrictions administrateur et référent sont contrôlées par module.']),
block('Répartition des responsabilités',[
'Erreurs : l’équipe peut déclarer, rechercher, classer, exporter et renseigner les cases de notification. La modification et la suppression d’une déclaration sont réservées aux administrateurs.',
'Appels : les collaborateurs peuvent enregistrer et consulter les déclarations, directement ou depuis une erreur. La saisie reste distincte de la case Médecin prévenu.',
'Températures : l’équipe consulte, importe les relevés et commente les épisodes hors seuil. Le changement du nom d’une sonde et de ses seuils est réservé aux administrateurs.',
'Référents services : l’équipe consulte ; l’administrateur crée, modifie, supprime les fiches et réalise les évaluations annuelles. Tiers payant : l’équipe consulte ; le référent du service et les administrateurs saisissent ou importent.'])]),
('Qualité : superviser erreurs et appels aux prescripteurs',[
block('Recueil des erreurs de délivrance',[
'Une ligne contient la date d’identification, le déclarant automatique, le type, le détail, le responsable, la date de l’erreur, les actions et la gravité de 1 à 4. La date de l’erreur ne doit pas être postérieure à son identification et aucune de ces dates ne doit être future.',
'Les sept types couvrent produit, dosage, posologie ou quantité, forme galénique, destinataire, vérification d’interaction, information et conseil. Le détail libre précise le contexte ; les actions correctives décrivent ce qui a réellement été fait.',
'Les cases Opérateur prévenu, Patient prévenu et Médecin prévenu sont accessibles à l’équipe. Leur validation indique date, heure et auteur. Le degré de gravité est choisi lors de la saisie, puis corrigible par un administrateur.']),
block('Recherche, export et correction',[
'Par défaut, les dernières identifications sont affichées en premier. Utilisez la recherche et les tris par date d’identification, date de l’erreur, responsable ou gravité. Inversez le sens au besoin.',
'L’export Excel contient le listing complet avec les notifications, dates et opérateurs. Le filtre courant ne réduit pas l’export. Vérifiez les destinataires de ce fichier interne.',
'Modifier et Supprimer sont des actions administrateur. Rechargez en cas de conflit de version plutôt que d’écraser une intervention récente. Une suppression doit être confirmée et n’offre pas de restauration dans cette page.']),
block('Relier et conserver un appel',[
'Après la validation Médecin prévenu, le bouton Déclarer l’appel au prescripteur ouvre un formulaire avec le contexte de l’erreur. Le collaborateur complète le prescripteur, contrôle la date, le motif et la suite donnée, puis enregistre.',
'La déclaration apparaît dans Appels aux prescripteurs et garde le repère de l’erreur lorsqu’elle est liée. Cette page propose également la saisie directe d’un appel.',
'La consigne du champ Motif demande d’anonymiser le patient avec deux premières lettres du nom de famille et une lettre du prénom. Vérifiez que les textes libres n’ajoutent pas son identité complète. Le portail ne transforme pas automatiquement les textes saisis.'])]),
('Qualité : chaîne du froid et résultats tiers payant',[
block('Importer les relevés sans perdre l’historique',[
'Les quatre sondes sont suivies à partir des exports Excel Medifroid .xlsx, choisis ou déposés dans le portail, de 15 Mo maximum. Aucune collecte automatique depuis le site Medifroid n’est configurée.',
'Choisissez l’export du mois précédent. L’import ajoute les nouvelles mesures, ignore les doublons identiques et affiche le bilan. Contrôlez les sondes concernées, les dates de début et de fin et les ajouts ; les dates trop anciennes sortent de la fenêtre de conservation.',
'Les horaires sont interprétés en Europe/Paris. Les imports récents restent consultables dans Derniers imports. La conservation glissante de trois ans s’applique aux mesures et commentaires ; le nettoyage retire également les anciens historiques d’import concernés.']),
block('Seuils et non-conformités',[
'Configurez les noms des sondes et les seuils avec un compte administrateur. Les valeurs initiales de suivi du froid sont 2 à 8 °C ; contrôlez toujours les seuils affichés pour la sonde avant d’interpréter un bilan.',
'La courbe et le calendrier mettent en évidence les épisodes hors seuil. La durée est estimée entre mesures espacées de quinze minutes maximum. Une interruption plus longue coupe la courbe et n’est comptée ni conforme ni hors seuil.',
'Chaque collaborateur peut commenter un épisode : analyse, vérifications, actions correctives. Le commentaire conserve date et opérateur. L’import et le commentaire ne dispensent pas de vérifier la situation réelle du réfrigérateur.']),
block('Saisir le mois de tiers payant',[
'Le référent Tiers payant et les administrateurs utilisent Saisir le mois précédent ou la saisie du mois dans la vue annuelle. Renseignez factures, rejets et montant ; seuls les mois terminés sont acceptés.',
'L’import Excel propose un contrôle des mois avant confirmation. Un mois déjà présent avec des valeurs identiques est ignoré. En cas de valeurs différentes, l’import est refusé sans ajout partiel : corrigez le mois depuis le tableau.',
'Le taux est rejets / factures × 100 : jusqu’à 2 % inclus, tolérable ; au-dessus, problématique. Sans factures, le taux n’est pas calculable. Le total annuel utilise les volumes cumulés des mois renseignés.'])]),
('Qualité : fiches de service, évaluations et rappels',[
block('Affecter le référent et illustrer la fiche',[
'Créez ou modifiez la fiche avec un collaborateur choisi dans la liste, le nom du service et les missions. Saisissez une mission par ligne pour obtenir une barre d’objectif distincte dans l’évaluation.',
'Une recherche d’icône sur Internet ouvre les résultats dans un nouvel onglet ; enregistrez l’image choisie, puis importez-la sur la fiche. PNG, JPEG et WebP sont acceptés, dans la limite de 2 Mo. Vous pouvez remplacer ou retirer l’icône.',
'Seuls les administrateurs créent, modifient et suppriment ces fiches. La suppression retire aussi leur historique d’évaluations : vérifiez avant confirmation.']),
block('Évaluer chaque mission de l’année',[
'Cliquez Réaliser l’évaluation annuelle. La fenêtre reprend chaque ligne non vide des missions, avec un curseur de 0 à 100 % et sa valeur numérique. Ajustez chaque objectif, puis Enregistrer l’évaluation.',
'Une évaluation existante se rouvre avec Consulter / modifier l’évaluation annuelle. Seule l’année en cours est modifiable. La date du dernier enregistrement est affichée ; les années précédentes restent consultables.',
'Les pourcentages et libellés sont enregistrés ensemble. Si les missions changent, vérifiez les valeurs reprises et celles initialisées à zéro avant d’enregistrer le bilan de l’année en cours. Un ancien simple visa annuel sans détail est conservé comme tel.']),
block('Rappels automatiques et contrôle pratique',[
'Les fiches de service pilotent les destinataires actifs : Chaîne du froid et Tiers payant reçoivent un rappel important en début de mois pour le mois écoulé. Le premier cycle prévu est novembre 2026.',
'Le service Merchandising reçoit un rappel important le 20 de chaque mois pour valider les dispositions promotionnelles. Le service Commandes programmées, y compris Commandes programmées et traitements chers, reçoit un seul bilan le mardi, à partir du 20/10/2026.',
'Le bilan commandes regroupe les lignes sans échéance, les commandes passées mais non délivrées, les retards, les commandes à prévoir dans les sept jours et les informations essentielles manquantes. Les lignes suspendues sont exclues ; un numéro permanent permet de retrouver la ligne sans exposer les identités ni les traitements dans Communication.',
'Les envois sont dédoublonnés par période et destinataire. Si l’hébergement met le portail en veille, la vérification reprend à son réveil et peut retarder le rappel. Maintenez les affectations à jour et vérifiez les messages reçus ; une fiche sans référent actif ne reçoit pas de rappel.'])])]
for sections in (U,A):
 for title,blocks in sections:
  if title.startswith('Merchandising :'):
   blocks.append(block('Charte graphique et affiches promotionnelles',[
    'Choisissez Charte graphique et affiches promotionnelles dans le merchandising. Déposez les fichiers ou cliquez Importer des documents ; la sélection multiple est possible.',
    'PDF, Word (.docx), PNG et JPEG sont acceptés, jusqu’à 10 Mo par fichier. Contrôlez le bilan de chaque import.',
    'Renommer change le nom affiché ; Télécharger récupère le fichier d’origine. Les droits sont ceux de l’univers Merchandising.'
   ]))

U[1:1]=QUALITY_USER
A[1:1]=QUALITY_ADMIN


def footer(canvas,doc):
 canvas.saveState();w,h=A4
 canvas.setFillColor(GREEN);canvas.rect(0,h-8,w,8,fill=1,stroke=0)
 canvas.setFont('Bold',9);canvas.setFillColor(INK);canvas.drawString(42,h-31,'PORTAIL +')
 canvas.setFont('Body',8);canvas.setFillColor(MUTED);canvas.drawRightString(w-42,h-31,doc.manual_kind+' | Version 1.1')
 canvas.setStrokeColor(HexColor('#dce5eb'));canvas.line(42,40,w-42,40)
 canvas.setFont('Body',7.5);canvas.drawString(42,26,'© ApoShift · Pharmacie de Trévoux · Édition du 18 octobre 2026')
 canvas.drawRightString(w-42,26,str(doc.page));canvas.restoreState()

def build(name,kind,sections):
 path=OUT/name
 doc=SimpleDocTemplate(str(path),pagesize=A4,rightMargin=42,leftMargin=42,topMargin=54,bottomMargin=54,title='Portail+ - '+kind+' - Version 1.1',author='ApoShift',pageCompression=1)
 doc.manual_kind=kind;story=[]
 story += [Spacer(1,23),P('Tous vos univers, dans un même espace','SubX'),P('PORTAIL +','TitleX'),P(kind,'TitleX'),P('Version 1.1 · Pharmacie de Trévoux','SubX'),P('Guide pratique des fonctions disponibles et des parcours à suivre. Les droits de votre compte et les connexions externes déterminent les actions proposées.','Text'),Spacer(1,12),PageBreak(),P('Sommaire','TitleX')]
 data=[]
 for i,(title,_) in enumerate(sections,2):data.append([Paragraph('<a href="#chap'+str(i)+'">'+escape(title)+'</a>',styles['SmallX']),P('Voir','SmallX')])
 table=Table(data,colWidths=[455,40]);table.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('ALIGN',(1,0),(1,-1),'RIGHT'),('BOTTOMPADDING',(0,0),(-1,-1),3),('TOPPADDING',(0,0),(-1,-1),3),('LINEBELOW',(0,0),(-1,-1),.3,HexColor('#e2e9ed'))]));story.append(table)
 story.append(Spacer(1,12));story.append(P('Document d’aide à l’utilisation. Les informations sensibles, clés, mots de passe et codes personnels ne figurent pas dans ce manuel.','SmallX'))
 for i,(title,blocks) in enumerate(sections,2):
  story.append(PageBreak());story.append(Paragraph('<a name="chap'+str(i)+'"/>'+escape(title),styles['TitleX']))
  for subtitle,lines in blocks:
   story.append(P(subtitle,'SubX'))
   for line in lines:story.append(P('- '+line,'BulletX'))
 doc.build(story,onFirstPage=footer,onLaterPages=footer)
 print(path)

build('Manuel-utilisateur-PortailPlus-v1.1.pdf','Manuel de l’utilisateur',U)
build('Manuel-administrateur-PortailPlus-v1.1.pdf','Manuel de l’administrateur',A)
