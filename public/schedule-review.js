import {renderScheduleDay} from './schedule-day.js';

const localDate = new Intl.DateTimeFormat('en-CA', {
  timeZone:'Europe/Paris', year:'numeric', month:'2-digit', day:'2-digit'
});
const dayHeading = new Intl.DateTimeFormat('fr-FR', {
  weekday:'short', day:'numeric', month:'short', timeZone:'UTC'
});

function element(tag, text = '', className = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
}

function button(text, click) {
  const node = element('button', text, 'btn small');
  node.type = 'button';
  node.onclick = click;
  return node;
}

function dateAt(value) {
  return new Date(value+'T12:00:00Z');
}

function moveDay(date, offset) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate()+offset);
  return next;
}

function isoWeek(date) {
  const thursday = moveDay(date, 3-((date.getUTCDay()+6)%7));
  const year = thursday.getUTCFullYear();
  const week = Math.ceil(((thursday-dateAt(year+'-01-01'))/86400000+1)/7);
  return year+'-W'+String(week).padStart(2,'0');
}

function weekMonday(value) {
  const [year, week] = value.split('-W');
  const fourth = dateAt(year+'-01-04');
  return moveDay(fourth, (Number(week)-1)*7-(fourth.getUTCDay()+6)%7);
}

function table(headers, empty) {
  const rows = element('table', '', 'schedule-table');
  const headings = rows.createTHead().insertRow();
  for (const label of headers) {
    const th = element('th', label);
    th.scope = 'col';
    headings.append(th);
  }
  const placeholder = rows.createTBody().insertRow().insertCell();
  placeholder.colSpan = headers.length;
  placeholder.textContent = empty;
  return rows;
}

export function mountScheduleReview(panels) {
  const byName = name => panels.find(entry => entry.name === name).panel;
  const find = (panel, name) => panel.querySelector('[data-field="'+name+'"]');
  const today = localDate.format(new Date());
  const views = [
    {name:'Jour', field:'Date', value:today, current:'Aujourd’hui'},
    {name:'Semaine', field:'Semaine', value:isoWeek(dateAt(today)), current:'Cette semaine'},
    {name:'Mois', field:'Mois', value:today.slice(0,7), current:'Ce mois'}
  ];
  for (const view of views) {
    const panel = byName(view.name), picker = find(panel, view.field);
    picker.value = view.value;
    const toolbar = element('div', '', 'module-review-nav');
    const output = element('div', '', 'module-review-table');
    const redraw = () => {
      output.replaceChildren();
      if (!picker.value) return;
      if (view.name === 'Jour') {
        const timeline = element('div');
        output.append(timeline);
        renderScheduleDay({
          container:timeline, data:{entries:[],people:[],posts:[]}, day:picker.value,
          canEdit:false, isAdmin:true, isCurrent:()=>timeline.isConnected
        });
      } else if (view.name === 'Semaine') {
        const monday = weekMonday(picker.value);
        const dates = Array.from({length:7}, (_, i) => dayHeading.format(moveDay(monday,i)));
        output.append(table(['Collaborateur', ...dates, 'Total heures', 'Tickets restaurant'], 'Aucun horaire saisi.'));
      } else {
        output.append(table(['Collaborateur','Heures','Congés','Autres absences','Tickets restaurant'], 'Aucun planning à récapituler pour ce mois.'));
      }
    };
    const advance = offset => {
      if (!picker.value) return;
      if (view.name === 'Mois') {
        const date = dateAt(picker.value+'-01');
        date.setUTCMonth(date.getUTCMonth()+offset);
        picker.value = date.toISOString().slice(0,7);
      } else if (view.name === 'Semaine') {
        picker.value = isoWeek(moveDay(weekMonday(picker.value),7*offset));
      } else {
        picker.value = moveDay(dateAt(picker.value),offset).toISOString().slice(0,10);
      }
      redraw();
    };
    toolbar.append(button('← Précédent',()=>advance(-1)),button(view.current,()=>{
      picker.value = view.value;
      redraw();
    }),button('Suivant →',()=>advance(1)));
    picker.onchange = redraw;
    panel.append(toolbar,output);
    redraw();
  }
  const editor = byName('Créneau');
  find(editor,'Jour').value = today;
  const slots = element('div');
  const add = button('Ajouter un créneau', addSlot);
  function addSlot() {
    if (slots.children.length >= 10) return;
    const row = element('div', '', 'module-review-form schedule-review-slot');
    for (const [label, type] of [['Début','time'],['Fin','time'],['Poste','text'],['Commentaire','text']]) {
      const field = element('label',label,'field');
      const input = element('input');
      input.type = type;
      if (type === 'time') {
        input.min = '07:30';
        input.max = '21:30';
      }
      field.append(input);
      row.append(field);
    }
    row.append(button('Retirer le créneau',()=>{
      row.remove();
      add.disabled = false;
    }));
    slots.append(row);
    add.disabled = slots.children.length >= 10;
  }
  editor.append(element('h4','Créneaux de la journée'),slots,add);
  addSlot();
  find(byName('Publication'),'Semaine').value = views[1].value;
  find(byName('Publication'),'État').value = 'Brouillon';
}
