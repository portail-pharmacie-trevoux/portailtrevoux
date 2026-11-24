const modules = {
  Collaborateurs: {
    'Annuaire': ['Nom et prénom', 'Fonction', 'Statut:Actif|Inactif'],
    'Fiche collaborateur': ['Prénom', 'Nom', 'Fonction', 'Adresse e-mail@email', 'Téléphone@tel', 'Date d’arrivée@date', 'Notes@textarea'],
    'Accès et droits': ['Statut du compte:Sans accès|Invitation envoyée|Accès activé', 'Univers', 'Consultation@checkbox', 'Modification@checkbox', 'Administrateur@checkbox']
  },
  Actualités: {
    'Reçus': ['Rechercher@search', 'Affichage:Tous|Non lus|Prioritaires'],
    'Envoyés': ['Rechercher@search'],
    'Archives': ['Rechercher@search'],
    'Nouveau message': ['Titre', 'Destinataires', 'Priorité:Normale|Prioritaire', 'Message@textarea', 'Pièce jointe@file']
  },
  'Emplois du temps': {
    'Jour': ['Date@date'],
    'Semaine': ['Semaine@week'],
    'Mois': ['Mois@month'],
    'Créneau': ['Collaborateur', 'Jour@date', 'Début@time', 'Fin@time', 'Poste', 'Type:Travail|Congé|Arrêt maladie|Récupération|Absence', 'Commentaire@textarea'],
    'Semaines types': ['Semaine:Paire|Impaire', 'Collaborateur', 'Jour:Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi', 'Début@time', 'Fin@time'],
    'Publication': ['Semaine@week', 'État:Brouillon|Publié']
  },
  "Outils d'aide au merchandising": {
    'Plan des zones': ['Mois@month', 'Famille:Têtes de gondole|Intercomptoirs|Bacs soldeurs|Saisonnier|Événement|Déstockage'],
    'Fiche zone': ['Repère', 'Nom', 'Consignes@textarea'],
    'Opération': ['Zone', 'Intitulé', 'Début@date', 'Fin@date', 'Produit', 'Prix@number', 'Stock@number', 'Documents@file']
  },
  Laboratoires: {
    'Annuaire': ['Rechercher@search', 'Initiale'],
    'Fiche laboratoire': ['Nom', 'Catégorie', 'Logo@file', 'Contact', 'Téléphone@tel', 'Adresse e-mail@email', 'Mode de commande:Pharmacie|Groupement', 'Responsable', 'Conditions commerciales@textarea', 'Franco@number', 'Date de validité@date', 'Documents@file']
  },
  "Outils d'aide à la démarche qualité": {
    'Erreurs de délivrance': ['Date@date', 'Type d’erreur', 'Circonstances@textarea', 'Action corrective@textarea', 'Suivi:À traiter|En cours|Clôturé'],
    'Températures': ['Date et heure@datetime-local', 'Équipement', 'Température@number', 'Commentaire@textarea', 'Validation@checkbox'],
    'Tiers payant': ['Date@date', 'Organisme', 'Référence', 'Montant@number', 'Statut:À traiter|En cours|Clôturé', 'Notes@textarea'],
    'Formations': ['Intitulé', 'Collaborateur', 'Date@date', 'Attestation@file']
  },
  Formations: {
    'Bibliothèque': ['Rechercher@search', 'Catégorie'],
    'Fiche document': ['Titre', 'Catégorie', 'Description@textarea', 'PDF ou Word@file']
  },
  'Ressources humaines': {
    'Documents communs': ['Rechercher@search', 'Catégorie'],
    'Documents personnels': ['Collaborateur', 'Catégorie'],
    'Dépôt de document': ['Titre', 'Catégorie', 'Visibilité:Commun|Personnel', 'Collaborateur', 'Document@file'],
    'Attestations': ['Collaborateur', 'Intitulé', 'Date@date', 'Attestation@file']
  },
  "Outils d'aide aux commandes": {
    'Suivi': ['Rechercher@search', 'Statut:Tous|En retard|À commander|En attente de délivrance|Suspendues'],
    'Commande programmée': ['Nom', 'Prénom', 'Traitement', 'Mode', 'Date dernière@date', 'Fréquence en jours@number', 'Date prochaine@date', 'Commentaires@textarea', 'Délivrée@checkbox', 'Date de délivrance@date', 'Initiales']
  },
  'Contacts utiles': {
    'Annuaire': ['Rechercher@search', 'Catégorie'],
    'Fiche contact': ['Nom', 'Catégorie', 'Organisme', 'Téléphone@tel', 'Adresse e-mail@email', 'Adresse@textarea', 'Site web@url', 'Document@file']
  },
  Fun: {
    'Musique': ['Rechercher@search', 'Titre', 'Artiste'],
    'Challenges': ['Intitulé', 'Laboratoire', 'Mois@month', 'Objectif', 'Participants', 'Modalités@textarea', 'Document@file']
  }
};

const columns = {
  Collaborateurs: ['Nom', 'Fonction', 'Statut'],
  Actualités: ['Titre', 'Correspondants', 'Date', 'Statut'],
  'Emplois du temps': ['Collaborateur', 'Début', 'Fin', 'Poste'],
  "Outils d'aide au merchandising": ['Repère', 'Zone', 'Mois', 'Disponibilité'],
  Laboratoires: ['Laboratoire', 'Responsable', 'Mode de commande'],
  Formations: ['Document', 'Catégorie', 'Date'],
  'Ressources humaines': ['Document', 'Catégorie', 'Date'],
  "Outils d'aide aux commandes": ['Nom', 'Traitement', 'Prochaine échéance', 'Statut'],
  'Contacts utiles': ['Nom', 'Catégorie', 'Téléphone', 'E-mail']
};

export const reviewUniverses = Object.keys(modules);

function element(tag, text = '', className = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
}

function field(spec) {
  const [label, options] = spec.split(':');
  const [name, type = 'text'] = label.split('@');
  const wrapper = element('label', name, 'field');
  const control = element(options ? 'select' : type === 'textarea' ? 'textarea' : 'input');
  if (options) {
    control.append(new Option('Choisir…', ''), ...options.split('|').map(option => new Option(option, option)));
  } else if (control.tagName === 'INPUT') {
    control.type = type;
    if (type === 'number') control.step = 'any';
  }
  wrapper.append(control);
  return wrapper;
}

function emptyTable(headers, message) {
  const table = element('table');
  const row = table.createTHead().insertRow();
  row.append(...headers.map(label => {
    const heading = element('th', label);
    heading.scope = 'col';
    return heading;
  }));
  const cell = table.createTBody().insertRow().insertCell();
  cell.colSpan = headers.length;
  cell.textContent = message;
  const scroll = element('div', '', 'module-review-table');
  scroll.append(table);
  return scroll;
}

function scheduleGrid(view) {
  const dates = view === 'Jour' ? ['Créneau', 'Affectations'] :
    view === 'Semaine' ? ['Horaire', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'] :
      ['Semaine', 'Heures', 'Absences', 'Tickets restaurant'];
  return emptyTable(dates, 'Aucun horaire saisi.');
}

export function renderModuleReview(container, universe) {
  const sections = modules[universe];
  if (!sections) return false;
  const heading = element('p', 'Revue de l’architecture · Les champs servent à tester la présentation et ne sont pas enregistrés.', 'module-review-note');
  const navigation = element('nav', '', 'module-review-nav');
  navigation.setAttribute('aria-label', 'Rubriques du module');
  const content = element('section', '', 'module-review-panel');
  const panels = [];
  for (const [name, fields] of Object.entries(sections)) {
    const button = element('button', name, 'btn');
    button.type = 'button';
    navigation.append(button);
    const panel = element('div');
    const form = element('form', '', 'module-review-form');
    form.onsubmit = event => event.preventDefault();
    form.append(...fields.map(field));
    panel.append(element('h3', name), form);
    if (universe === 'Emplois du temps' && ['Jour', 'Semaine', 'Mois'].includes(name)) {
      panel.append(scheduleGrid(name));
    } else if (universe === "Outils d'aide au merchandising" && name === 'Plan des zones') {
      const zoneList = element('ul', '', 'module-review-zones');
      zoneList.append(...['TG · Têtes de gondole', 'IC · Intercomptoirs', 'BS · Bacs soldeurs', 'SA · Zones saisonnières', 'EV · Zone événement', 'DS · Déstockage'].map(zone => element('li', zone)));
      panel.append(zoneList, emptyTable(columns[universe], 'Aucune affectation mensuelle.'));
    } else if ((columns[universe] && name === Object.keys(sections)[0]) ||
      ['Envoyés', 'Archives', 'Documents personnels', 'Challenges'].includes(name)) {
      panel.append(emptyTable(columns[universe] || ['Intitulé', 'Statut'], 'Aucune donnée à afficher.'));
    }
    content.append(panel);
    panels.push({button, panel});
  }
  function select(active) {
    for (const entry of panels) {
      entry.panel.hidden = entry !== active;
      entry.button.setAttribute('aria-pressed', String(entry === active));
    }
  }
  for (const entry of panels) entry.button.onclick = () => select(entry);
  select(panels[0]);
  const root = element('div', '', 'module-review');
  root.append(heading, navigation, content);
  container.replaceChildren(root);
  return true;
}
