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
    'Mois': ['Mois@month', 'Adresse e-mail du comptable@email'],
    'Créneau': ['Collaborateur', 'Jour@date', 'Type:Travail|Formation|École ou CFA|Congé|Arrêt maladie|Récupération|Absence|Repos|Journée mixte', 'Ticket restaurant@checkbox'],
    'Postes': ['Nom du poste', 'Couleur@color', 'Actif@checkbox'],
    'Semaines types': ['Nom du modèle', 'Alternance:Paire|Impaire', 'Collaborateur', 'Jour:Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche', 'Début@time', 'Fin@time'],
    'Congés et absences': ['Collaborateur', 'Motif:Congé|RTT|Récupération|Autre', 'Début@date', 'Fin@date', 'Période:Journée entière|Matin|Après-midi', 'Commentaire@textarea', 'Décision:À examiner|Acceptée|Refusée'],
    'Publication': ['Semaine@week', 'Semaine source@week', 'État:Brouillon|Publié', 'Verrouiller une journée@date']
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
    'Jour': ['Congés et absences', 'Semaines types', 'Postes'],
    'Semaine': ['Congés et absences', 'Semaines types', 'Postes'],
    'Mois': ['Congés et absences', 'Semaines types', 'Postes'],
    'Créneau': ['Congés et absences', 'Semaines types', 'Postes'],
    'Postes': ['Congés et absences', 'Semaines types', 'Postes'],
    'Semaines types': ['Congés et absences', 'Semaines types', 'Postes'],
    'Congés et absences': ['Congés et absences', 'Semaines types', 'Postes'],
    'Publication': ['Congés et absences', 'Semaines types', 'Postes']
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
    if (universe !== 'Emplois du temps' || ['Jour','Semaine','Mois'].includes(name)) navigation.append(button);
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
    if ((columns[universe] && name === Object.keys(sections)[0]) ||
      ['Envoyés', 'Archives', 'Documents personnels', 'Challenges'].includes(name)) {
      panel.append(emptyTable(columns[universe] || ['Intitulé', 'Statut'], 'Aucune donnée à afficher.'));
    }
    content.append(panel);
    panels.push({name, button, panel});
  }
  let leaveMounted=false;
  const periodFields=new Map();
  let selectedPanel;
  function select(active) {
    selectedPanel=active;
    for(const [entry,field] of periodFields)field.hidden=entry!==active;
    if(universe==='Emplois du temps'&&active.name==='Congés et absences'&&!leaveMounted){
      leaveMounted=true;
      void import('/leave-review-bento.js').then(module=>module.mountLeaveReview(active.panel)).catch(()=>{
        leaveMounted=false;active.panel.append(element('p','Les demandes sont momentanément indisponibles.','status-line'));
      });
    }
    for (const entry of panels) {
      entry.panel.hidden = entry !== active;
      entry.button.setAttribute('aria-pressed', String(entry === active));
    }
  }
  for (const entry of panels) entry.button.onclick = () => select(entry);
  select(panels[0]);
  const root = element('div', '', 'module-review');
  if(universe==='Emplois du temps'){
    const leaveRow=element('div','','module-review-nav');
    const requestButton=element('button','Demande de congés','btn primary');requestButton.type='button';
    const call=async(path,method='GET',data,csrf)=>{
      const options=method==='GET'?{}:{method,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(data)};
      const response=await fetch(path,options),result=await response.json();
      if(!response.ok)throw Error(result.error||'Opération indisponible.');
      return result;
    };
    const leaveStatus=element('p','','status-line');leaveStatus.setAttribute('role','status');leaveStatus.hidden=true;
    requestButton.onclick=async()=>{
      requestButton.disabled=true;leaveStatus.hidden=true;
      try{
        const [{openLeaveRequests},session]=await Promise.all([import('/schedule-tools.js'),call('/api/me')]);
        if(!root.isConnected)return;
        await openLeaveRequests({user:session.user,api:(path,method,data)=>call(path,method,data,session.csrf),dialogFactory:title=>{
          const dialog=element('dialog','','schedule-dialog');dialog.setAttribute('aria-label',title);dialog.append(element('h2',title));
          document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});return dialog;
        }});
      }catch(error){leaveStatus.textContent=error.message;leaveStatus.hidden=false;}
      finally{requestButton.disabled=false;}
    };
    leaveRow.append(requestButton,leaveStatus);
    const scopes=element('div','','module-review-nav');scopes.setAttribute('role','group');scopes.setAttribute('aria-label','Planning à afficher');
    for(const [label,value] of [['Mon planning','Mon planning'],['Équipe','Toute l’équipe']]){
      const control=element('button',label,'btn');control.type='button';
      control.onclick=()=>{
        root.dataset.scheduleScope=value==='Mon planning'?'mine':'team';
        for(const item of scopes.children)item.setAttribute('aria-pressed',String(item===control));
      };
      scopes.append(control);
    }
    scopes.firstElementChild.onclick();
    root.append(heading,leaveRow,navigation,scopes,content);
  }else root.append(heading,navigation,content);
  container.replaceChildren(root);
  if (universe === "Outils d'aide au merchandising") {
    void import('/merchandising-review.js').then(({mountMerchandisingReview}) => mountMerchandisingReview(panels, select)).catch(() => {
      panels[0].panel.append(element('p', 'Le plan est momentanément indisponible.', 'status-line'));
    });
  }
  if (universe === 'Emplois du temps') {
    void import('/schedule-review.js').then(({mountScheduleReview}) => {
      mountScheduleReview(panels);
      for(const [name,fieldName] of [['Jour','Date'],['Semaine','Semaine'],['Mois','Mois']]){
        const entry=panels.find(panel=>panel.name===name);
        const label=entry.panel.querySelector('input[data-field="'+fieldName+'"]').closest('label');
        const holder=element('span');holder.style.alignSelf='center';holder.hidden=entry!==selectedPanel;
        const form=label.closest('form');
        holder.append(label);navigation.append(holder);periodFields.set(entry,holder);
        if(!form.childElementCount)form.remove();
      }
    }).catch(() => {
      panels[0].panel.append(element('p', 'La grille est momentanément indisponible.', 'status-line'));
    });
  }
  return true;
}
