const base = '/api/review/merchandising/';
const families = {TG:'Têtes de gondole', IC:'Intercomptoirs', BS:'Bacs soldeurs', SA:'Zones saisonnières', EV:'Événement', DS:'Déstockage'};

function make(tag, label, className) {
  const node = document.createElement(tag);
  node.textContent = label;
  node.className = className;
  return node;
}

export async function mountMerchandisingReview(panels, select) {
  const [plan, zone, operation, impact] = panels;
  const field = (entry, name) => entry.panel.querySelector('[data-field="'+name+'"]');
  const month = field(plan, 'Mois');
  const family = field(plan, 'Famille');
  month.value = new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Paris', year:'numeric', month:'2-digit'}).format(new Date());
  family.value = 'Toutes';
  const status = make('p', 'Chargement du plan…', 'status-line');
  status.setAttribute('role', 'status');
  plan.panel.append(status);
  const response = await fetch(base+'zones');
  if (!response.ok) throw Error('Plan indisponible');
  const zones = await response.json();
  const canvas = make('div', '', 'merch-review-plan');
  const scroll = make('div', '', 'module-review-table');
  const image = make('img', '', '');
  image.alt = 'Plan de l’officine';
  image.src = base+'plan';
  image.onerror = () => { status.textContent = 'L’image du plan est indisponible. Les repères restent accessibles dans la liste.'; };
  canvas.append(image);
  scroll.append(canvas);
  const list = make('div', '', 'module-review-nav');
  list.setAttribute('aria-label', 'Liste des zones');
  const exportLink = make('a', 'Télécharger le modèle Excel vide', 'btn');
  const toolbar = make('div', '', 'module-review-nav');
  const changeMonth = delta => {
    if (!month.value) return;
    const date = new Date(month.value+'-01T12:00:00Z');
    date.setUTCMonth(date.getUTCMonth()+delta);
    month.value = date.toISOString().slice(0,7);
    updateMonth();
  };
  for (const [label, delta] of [['← Mois précédent', -1], ['Mois suivant →', 1]]) {
    const button = make('button', label, 'btn');
    button.type = 'button';
    button.onclick = () => changeMonth(delta);
    toolbar.append(button);
  }
  toolbar.append(exportLink);
  plan.panel.append(toolbar, scroll, list);
  const chooseZone = item => {
    const reference = field(zone, 'Repère');
    reference.value = item.code;
    reference.readOnly = true;
    field(zone, 'Nom').value = '';
    field(zone, 'Consignes').value = item.consignes;
    field(operation, 'Zone').value = item.code;
    field(operation, 'Catégorie').value = item.category;
    field(impact, 'Zone').value = item.code;
    select(zone);
    field(zone, 'Nom').focus();
  };
  const controls = zones.map(item => {
    const buttons = ['merch-review-marker','btn'].map(className => {
      const button = make('button', item.code, className);
      button.type = 'button';
      button.title = families[item.category]+' · '+item.code;
      button.setAttribute('aria-label', button.title);
      button.onclick = () => chooseZone(item);
      return button;
    });
    const [marker, entry] = buttons;
    marker.style.left = item.x+'%';
    marker.style.top = item.y+'%';
    canvas.append(marker);
    list.append(entry);
    return {item, buttons};
  });
  function filter() {
    for (const {item, buttons} of controls) {
      const visible = !family.value || family.value === 'Toutes' || item.category === family.value;
      for (const button of buttons) button.hidden = !visible;
    }
  }
  function updateMonth() {
    exportLink.hidden = !month.value;
    exportLink.href = base+'template.xlsx?month='+encodeURIComponent(month.value);
    for (const entry of [operation, impact]) field(entry, 'Mois').value = month.value;
    status.textContent = month.value ? 'Mois '+month.value+' · '+zones.length+' emplacements · aucune affectation chargée.' : 'Choisissez un mois.';
  }
  family.onchange = filter;
  month.onchange = updateMonth;
  updateMonth();
}
