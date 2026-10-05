from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4

out = Path(__file__).resolve().parents[1] / 'assets/fiche-inscription-salarie.pdf'
out.parent.mkdir(exist_ok=True)
c = canvas.Canvas(str(out), pagesize=A4)
c.setTitle('Fiche d’inscription salarié - Pharmacie de Trévoux')
c.setAuthor('Pharmacie de Trévoux')
W, H = A4
purple = HexColor('#5C4278')
y = 0

def text(x, yy, value, size=10, bold=False):
    c.setFont('Helvetica-Bold' if bold else 'Helvetica', size)
    c.setFillColor(HexColor('#29242F'))
    c.drawString(x, yy, value)

def page(number, title, subtitle):
    global y
    c.setFillColor(purple); c.rect(0, H-12, W, 12, fill=1, stroke=0)
    text(42, H-48, 'PHARMACIE DE TRÉVOUX', 11, True)
    text(42, H-80, 'Fiche d’inscription salarié', 21, True)
    text(42, H-106, title, 13, True)
    text(42, H-126, subtitle, 9)
    c.setStrokeColor(HexColor('#D9D1E0')); c.line(42, 47, W-42, 47)
    text(42, 31, 'Document confidentiel - À remettre à la personne chargée du dossier salarié.', 8)
    text(W-81, 31, f'{number} / 4', 8)
    y = H-154

def section(title):
    global y
    c.setFillColor(HexColor('#F0ECF4')); c.rect(42, y-21, W-84, 25, fill=1, stroke=0)
    text(50, y-13, title, 11, True); y -= 43

def field(label, rows=1):
    global y
    text(44, y, label, 9)
    for _ in range(rows):
        y -= 23
        c.setStrokeColor(HexColor('#BDB7C4'));c.setLineWidth(.5);c.line(44,y,W-44,y)
    y -= 19

def note(value):
    global y
    text(44,y,value,9);y-=19

def check(value):
    global y
    c.setStrokeColor(HexColor('#807788'));c.rect(44,y-2,9,9)
    text(62,y,value,9);y-=25

page(1,'1. Identité et coordonnées','À compléter lisiblement. Dates au format JJ/MM/AAAA. Indiquer « sans objet » si nécessaire.')
section('Identité')
field('Nom de naissance :')
field('Nom d’usage (si différent) :')
field('Prénom usuel et tous les autres prénoms :')
field('Date de naissance :                                      Nationalité :')
field('Commune de naissance :')
field('Département de naissance :                          Pays de naissance :')
field('Civilité :                                                    Sexe pour le dossier de paie :')
section('Coordonnées personnelles')
field('Adresse complète, complément, code postal, ville et pays :',2)
field('Téléphone portable :                                  Autre téléphone (facultatif) :')
field('Adresse e-mail personnelle :')
c.showPage()

page(2,'2. Protection sociale et paiement','Renseigner les éléments connus et joindre les justificatifs correspondants.')
section('Sécurité sociale')
field('Numéro de Sécurité sociale (13 chiffres) :')
field('Clé (2 chiffres) :                                         Numéro provisoire, si applicable :')
field('Caisse de rattachement et régime :')
note('Si vous n’avez pas encore de numéro, le signaler à la pharmacie.')
section('Coordonnées bancaires')
field('Titulaire du compte :')
field('Nom de la banque :')
field('IBAN :',2)
field('BIC :')
note('Joindre un RIB lisible correspondant au compte indiqué.')
section('Complémentaire santé / transport')
field('Mutuelle : affiliation souhaitée ou demande de dispense (motif et justificatif) :',2)
field('Ayants droit à affilier, si cette option est prévue (préciser la demande) :')
field('Abonnement de transport domicile-travail : type, période et montant :')
c.showPage()

page(3,'3. Informations professionnelles','Compléter uniquement les rubriques qui concernent votre situation.')
section('Fonction et qualifications')
field('Fonction prévue à la pharmacie :')
field('Diplôme(s), qualification(s), organisme et date(s) d’obtention :',2)
field('Inscription professionnelle : Ordre, numéro RPPS / autre, si applicable :')
section('Formation / autorisation de travail')
field('Apprentissage ou alternance : formation et établissement / CFA :')
field('Dates de formation et rythme d’alternance (joindre le calendrier) :')
field('Si nécessaire : titre de séjour / autorisation de travail, référence et échéance :',2)
section('Suivi professionnel et contact d’urgence')
field('Dernière visite de santé au travail : date et service (si connus) :')
note('Joindre une attestation disponible. Ne pas indiquer de diagnostic médical.')
field('Personne à prévenir (facultatif) : nom et lien avec vous :')
field('Téléphone et autre numéro éventuel :')
c.showPage()

page(4,'4. Justificatifs et validation','Cocher les pièces remises. Les pièces conditionnelles dépendent de votre situation.')
section('Pièces à transmettre avec cette fiche')
check('Pièce d’identité lisible.')
check('RIB correspondant aux coordonnées bancaires renseignées.')
check('Attestation de droits à la Sécurité sociale (si disponible).')
check('Diplômes / qualifications utiles à la fonction exercée.')
check('Justificatif d’inscription professionnelle, si applicable.')
check('Titre de séjour / autorisation de travail, si nécessaire.')
check('Documents de formation / alternance et calendrier, si applicable.')
check('Justificatif d’une demande de dispense de mutuelle, si applicable.')
check('Justificatif d’abonnement de transport, si concerné.')
check('Attestation de suivi de santé au travail disponible, si applicable.')
field('Autres pièces ou informations à compléter :',2)
section('Validation par le salarié')
note('Je confirme l’exactitude des renseignements fournis et signalerai tout changement.')
field('Nom et prénom :')
field('Lieu et date :')
field('Signature :',2)
note('Remettre la fiche et ses justificatifs directement à la personne chargée du dossier.')
note('La pharmacie complète les informations du contrat et les paramètres de paie.')
c.save()
print(out)
