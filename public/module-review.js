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
    'Plan des zones': ['Mois@month', 'Famille:Toutes|TG|IC|BS|SA|EV|DS'],
    'Fiche zone': ['Repère', 'Nom', 'Consignes@textarea'],
    'Opération': ['Mois@month', 'Catégorie:TG|IC|BS|SA|EV|DS', 'Zone', 'Intitulé', 'Laboratoire', 'EAN (un par ligne)@textarea', 'Prix avant promotion@number', 'Prix après promotion@number', 'Stock avant promotion@number', 'Documents@file'],
    'Suivi de l’impact': ['Mois@month', 'Zone', 'Début de référence@date', 'Fin de référence@date', 'Début de promotion@date', 'Fin de promotion@date', 'Unités de référence@number', 'Unités en promotion@number', 'Chiffre d’affaires de référence@number', 'Chiffre d’affaires en promotion@number', 'Conclusion:À analyser|Succès|À améliorer|Échec', 'Notes@textarea']
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
    'Musique': ['Rechercher@search', 'Titre', 'Artiste']
  },
  Challenges: {
    'Challenges': ['Intitulé', 'Laboratoire', 'Mois@month', 'Objectif', 'Participants', 'Modalités@textarea', 'Document@file']
  }
};

const administration = {
  Collaborateurs: {
    'Annuaire': ['Fiche collaborateur', 'Accès et droits', 'Importer une liste de collaborateurs'],
    'Fiche collaborateur': ['Accès et droits', 'Modifier la fiche', 'Gérer les documents individuels', 'Désactiver ou réactiver la fiche', 'Supprimer définitivement'],
    'Accès et droits': ['Fiche collaborateur', 'Créer un accès personnel', 'Prévisualiser la demande d’activation', 'Envoyer une invitation', 'Enregistrer les droits']
  },
  Actualités: {
    'Reçus': ['Nouveau message', 'Automatisations de messages', 'Gérer les rappels'],
    'Envoyés': ['Nouveau message', 'Imprimer un fil'],
    'Archives': ['Restaurer un message'],
    'Nouveau message': ['Automatisations de messages', 'Envoyer le message']
  },
  'Emplois du temps': {
    'Jour': ['Créneau', 'Paramétrer les postes', 'Compteur de présence'],
    'Semaine': ['Créneau', 'Semaines types', 'Publication', 'Gérer les absences'],
    'Mois': ['Exporter le récapitulatif en PDF', 'Récapitulatif des tickets restaurant'],
    'Créneau': ['Paramétrer les postes', 'Enregistrer le créneau'],
    'Semaines types': ['Enregistrer le modèle', 'Appliquer une semaine type'],
    'Publication': ['Enregistrer le brouillon', 'Publier le planning']
  },
  "Outils d'aide au merchandising": {
    'Plan des zones': ['Fiche zone', 'Opération', 'Suivi de l’impact'],
    'Fiche zone': ['Enregistrer la zone', 'Paramétrer l’emplacement'],
    'Opération': ['Gérer les documents', 'Gérer les prix et les stocks', 'Valider l’opération', 'Supprimer l’opération'],
    'Suivi de l’impact': ['Enregistrer le suivi']
  },
  Laboratoires: {
    'Annuaire': ['Fiche laboratoire', 'Importer des laboratoires', 'Exporter la liste'],
    'Fiche laboratoire': ['Enregistrer la fiche', 'Gérer le logo et les documents', 'Historique des conditions', 'Supprimer le laboratoire']
  },
  "Outils d'aide à la démarche qualité": {
    'Erreurs de délivrance': ['Paramétrer les types d’erreurs', 'Valider le suivi', 'Consulter les tendances'],
    'Températures': ['Gérer les équipements', 'Importer les relevés', 'Valider les relevés'],
    'Tiers payant': ['Importer un relevé', 'Valider le suivi'],
    'Formations': ['Importer les attestations', 'Vérifier les attestations']
  },
  Formations: {
    'Bibliothèque': ['Fiche document', 'Gérer les catégories'],
    'Fiche document': ['Déposer le fichier', 'Modifier ou retirer le document']
  },
  'Ressources humaines': {
    'Documents communs': ['Dépôt de document', 'Paramètres des signatures Youtrust'],
    'Documents personnels': ['Dépôt de document', 'Renommer le document', 'Envoyer pour signature'],
    'Dépôt de document': ['Importer le document', 'Paramètres des signatures Youtrust'],
    'Attestations': ['Importer les attestations', 'Vérifier les attestations']
  },
  "Outils d'aide aux commandes": {
    'Suivi': ['Commande programmée', 'Trier par numéro', 'Importer depuis Excel', 'Exporter en Excel', 'Configurer Ente Auth ou la fiche de codes'],
    'Commande programmée': ['Enregistrer', 'Suspendre', 'Supprimer la commande']
  },
  'Contacts utiles': {
    'Annuaire': ['Fiche contact', 'Importer une liste de contacts', 'Exporter les contacts'],
    'Fiche contact': ['Enregistrer le contact', 'Gérer les pièces jointes', 'Supprimer le contact']
  },
  Fun: {
    'Musique': ['Importer des morceaux (CSV)', 'Exporter les titres sélectionnés en CSV', 'Configurer YouTube']
  },
  Challenges: {
    'Challenges': ['Créer un challenge', 'Gérer les participants', 'Consulter les résultats', 'Supprimer un challenge']
  }
};

const columns = {
  Collaborateurs: ['Nom', 'Fonction', 'Statut'],
  Actualités: ['Titre', 'Correspondants', 'Date', 'Statut'],
  'Emplois du temps': ['Collaborateur', 'Début', 'Fin', 'Poste'],
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
  control.dataset.field = name;
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
    const admin = element('details', '', 'admin-menu module-review-admin');
    admin.append(element('summary', 'Administration'));
    const actions = element('div', '', 'module-review-admin-actions');
    for (const label of administration[universe][name]) {
      const control = element('button', label, 'btn');
      control.type = 'button';
      if (Object.hasOwn(sections, label)) {
        control.onclick = () => select(panels.find(entry => entry.name === label));
      } else {
        control.disabled = true;
      }
      actions.append(control);
    }
    admin.append(actions);
    panel.append(element('h3', name), admin, form);
    if (universe === 'Emplois du temps' && ['Jour', 'Semaine', 'Mois'].includes(name)) {
      panel.append(scheduleGrid(name));
    } else if ((columns[universe] && name === Object.keys(sections)[0]) ||
      ['Envoyés', 'Archives', 'Documents personnels', 'Challenges'].includes(name)) {
      panel.append(emptyTable(columns[universe] || ['Intitulé', 'Statut'], 'Aucune donnée à afficher.'));
    }
    content.append(panel);
    panels.push({name, button, panel});
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
  if (universe === "Outils d'aide au merchandising") {
    void import('/merchandising-review.js').then(({mountMerchandisingReview}) => mountMerchandisingReview(panels, select)).catch(() => {
      panels[0].panel.append(element('p', 'Le plan est momentanément indisponible.', 'status-line'));
    });
  }
  return true;
}
