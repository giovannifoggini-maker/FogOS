'use strict';
const STORAGE_KEY = 'fogos.workspace.v1';
const defaults = {
  tasks: [
    { id: 't1', title: 'Dare una forma alle idee di oggi', due: 'Oggi', priority: 'high', done: false, created: Date.now() - 5000 },
    { id: 't2', title: 'Rivedere i prossimi passi del progetto', due: 'Questa settimana', priority: 'normal', done: false, created: Date.now() - 4000 },
    { id: 't3', title: 'Mettere in ordine la raccolta di link', due: 'Senza scadenza', priority: 'low', done: true, created: Date.now() - 3000 }
  ],
  notes: [
    { id: 'n1', title: 'Piccole idee, grandi cose', body: 'Non serve fare tutto in una volta.\n\n• Tieni i progetti semplici da riprendere.\n• Salva le idee appena arrivano.\n• Lascia spazio per sperimentare.', color: 'lime', updated: Date.now() - 80000 },
    { id: 'n2', title: 'In questo periodo', body: 'Concentrarsi su un progetto alla volta e creare piccoli passi concreti. Una buona interfaccia deve essere chiara prima ancora di essere bella.', color: 'violet', updated: Date.now() - 240000 },
    { id: 'n3', title: 'Da approfondire', body: '• Offline-first\n• Accessibilità da mobile\n• Scorciatoie da tastiera\n• Backup semplice e leggibile', color: 'blue', updated: Date.now() - 450000 }
  ],
  apps: [
    { id: 'a1', name: 'FogSignal', description: 'Morse e analisi dei segnali', url: '', icon: '✳', color: '#b8f36c', bg: 'rgba(184,243,108,.1)', builtin: true },
    { id: 'a2', name: 'SKYTRACE', description: 'Radar e traffico aereo', url: '', icon: '⌁', color: '#79c9f4', bg: 'rgba(121,201,244,.1)', builtin: true },
    { id: 'a3', name: 'Fogpacks', description: 'Il tuo spazio Minecraft', url: '', icon: '▦', color: '#d1a8ff', bg: 'rgba(209,168,255,.1)', builtin: true },
    { id: 'a4', name: 'PixelForge', description: 'Sprite e animazioni', url: '', icon: '▧', color: '#ffb97e', bg: 'rgba(255,185,126,.1)', builtin: true },
    { id: 'a5', name: 'DriftLab', description: 'Garage e arcade', url: '', icon: '↗', color: '#ff8c9d', bg: 'rgba(255,140,157,.1)', builtin: true },
    { id: 'a6', name: 'Vault', description: 'Archivio personale', url: '', icon: '◇', color: '#8fa4ff', bg: 'rgba(143,164,255,.1)', builtin: true }
  ],
  links: [],
  accent: '#b8f36c',
  timerMinutes: 25
};
const clone = value => JSON.parse(JSON.stringify(value));
let state = loadState();
let taskFilter = 'all';
let editingTaskId = null;
let editingNoteId = null;
let editingAppId = null;
let pendingConfirm = null;
let focusTimer = null;
let timerRemaining = state.timerMinutes * 60;
let timerRunning = false;
let timerEndAt = 0;
let activeView = 'dashboard';
let installPromptEvent = null;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPromptEvent = event; });
const $ = id => document.getElementById(id);

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(defaults);
    const parsed = JSON.parse(raw);
    return {
      ...clone(defaults), ...parsed,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : clone(defaults.tasks),
      notes: Array.isArray(parsed.notes) ? parsed.notes : clone(defaults.notes),
      apps: Array.isArray(parsed.apps) ? parsed.apps : clone(defaults.apps),
      links: Array.isArray(parsed.links) ? parsed.links : []
    };
  } catch (error) { console.warn('FogOS local data could not be read:', error); return clone(defaults); }
}
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); $('local-state').textContent = 'Modifiche salvate'; }
  catch (error) { console.warn('FogOS could not save to local storage:', error); toast('Memoria locale piena: esporta un backup.', true); }
}
function uid(prefix='x') { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`; }
function escapeHtml(value='') { return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
function safeExternalUrl(raw) {
  try { const u = new URL(raw); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; }
}
function toast(message, error=false) {
  const el = document.createElement('div'); el.className = `toast${error ? ' error' : ''}`; el.textContent = message;
  $('toast-stack').append(el); window.setTimeout(() => el.remove(), 3200);
}
function fmtDate(ts) {
  const date = new Date(ts || Date.now());
  return date.toLocaleDateString('it-IT', { day:'2-digit', month:'short' });
}
function fmtRelative(ts) {
  const delta = Date.now() - Number(ts || Date.now());
  if (delta < 60000) return 'Adesso';
  if (delta < 3600000) return `${Math.floor(delta / 60000)} min fa`;
  if (delta < 86400000) return `${Math.floor(delta / 3600000)} h fa`;
  return fmtDate(ts);
}
function updateClock() {
  const now = new Date();
  $('current-time').textContent = now.toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' });
  $('current-date').textContent = now.toLocaleDateString('it-IT', { weekday:'short', day:'2-digit', month:'short' });
  const hour = now.getHours();
  $('today-description').textContent = hour < 12 ? 'Una nuova giornata, un passo alla volta.' : hour < 18 ? 'Prenditi un momento per mettere in ordine le idee.' : 'Chiudi le distrazioni. Lascia spazio alle idee.';
}
function taskRow(task, extraClass='') {
  const title = escapeHtml(task.title);
  const priority = task.priority || 'normal';
  return `<div class="task-row${task.done ? ' done' : ''} ${extraClass}" data-task-row="${escapeHtml(task.id)}">
    <button class="task-check${task.done ? ' checked' : ''}" data-toggle-task="${escapeHtml(task.id)}" aria-label="${task.done ? 'Segna come da fare' : 'Completa attività'}">${task.done ? '✓' : ''}</button>
    <div class="task-body"><span class="task-title">${title}</span><span class="task-meta"><i class="priority-dot ${priority}"></i>${priority === 'high' ? 'Priorità alta' : priority === 'low' ? 'Priorità bassa' : 'Priorità normale'} <span>·</span> ${escapeHtml(task.due || 'Senza scadenza')}</span></div>
    <span class="task-due">${task.done ? 'Completata' : escapeHtml(task.due || 'Quando vuoi')}</span>
    <button class="task-menu" data-delete-task="${escapeHtml(task.id)}" aria-label="Elimina attività" title="Elimina">⋯</button>
  </div>`;
}
function renderTasks() {
  const pending = state.tasks.filter(t => !t.done), done = state.tasks.filter(t => t.done);
  $('stat-pending').textContent = pending.length;
  $('stat-done').textContent = `${done.length} completate`;
  $('task-progress-line').style.width = `${state.tasks.length ? Math.round(done.length / state.tasks.length * 100) : 0}%`;
  $('nav-task-count').textContent = pending.length;
  $('tasks-page-pending').textContent = pending.length;
  $('tasks-page-done').textContent = done.length;
  $('tasks-page-total').textContent = state.tasks.length;
  $('filter-all-count').textContent = state.tasks.length;
  $('filter-pending-count').textContent = pending.length;
  $('filter-done-count').textContent = done.length;
  const recent = [...state.tasks].sort((a,b) => Number(a.done)-Number(b.done) || (b.created||0)-(a.created||0)).slice(0,4);
  $('dashboard-task-list').innerHTML = recent.length ? recent.map(t => taskRow(t)).join('') : `<div class="empty-tasks"><span>✦</span>Un po' di spazio libero.<br>Aggiungi la prima attività.</div>`;
  const filtered = state.tasks.filter(t => taskFilter === 'all' || (taskFilter === 'pending' && !t.done) || (taskFilter === 'done' && t.done)).sort((a,b)=>Number(a.done)-Number(b.done)||(b.created||0)-(a.created||0));
  $('full-task-list').innerHTML = filtered.map(t => taskRow(t)).join('');
  $('task-empty-hint').hidden = filtered.length > 0;
  document.querySelectorAll('[data-task-filter]').forEach(btn => btn.classList.toggle('active', btn.dataset.taskFilter === taskFilter));
}
function appCard(app) {
  const color = /^#[0-9a-f]{6}$/i.test(app.color || '') ? app.color : '#b8f36c';
  const bg = /^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(?:0|0?\.\d+|1)\s*\)$/.test(app.bg || '') ? app.bg : 'rgba(184,243,108,.1)';
  return `<div class="app-card" role="link" tabindex="0" data-app-id="${escapeHtml(app.id)}" data-open-app="${escapeHtml(app.id)}" style="--app-color:${escapeHtml(color)};--app-bg:${escapeHtml(bg)}" aria-label="Apri ${escapeHtml(app.name)}">
    <span class="app-card-icon">${escapeHtml(app.icon || '✦')}</span><span class="app-card-copy"><strong>${escapeHtml(app.name)}</strong><small>${escapeHtml(app.description || 'Collegamento rapido')}</small></span><span class="app-open">↗</span>
    <button type="button" class="app-card-menu" data-edit-app="${escapeHtml(app.id)}" aria-label="Modifica ${escapeHtml(app.name)}" title="Modifica collegamento">⋯</button>
  </div>`;
}
function renderApps() {
  $('stat-apps').textContent = state.apps.length;
  const query = ($('app-filter')?.value || '').trim().toLowerCase();
  const shown = state.apps.filter(a => `${a.name} ${a.description}`.toLowerCase().includes(query));
  $('full-app-grid').innerHTML = shown.map(appCard).join('');
  $('dashboard-app-grid').innerHTML = state.apps.slice(0,6).map(appCard).join('');
}
function noteCard(note) {
  const colors = { lime:'#b8f36c', violet:'#ac9bff', blue:'#83bdf8', orange:'#e7b77f' };
  return `<article class="note-card" style="--note-color:${colors[note.color] || colors.lime}"><div class="note-card-top"><span class="note-card-tag">✦ ${escapeHtml(note.color || 'IDEA').toUpperCase()}</span><div class="note-card-actions"><button class="micro-action" data-edit-note="${escapeHtml(note.id)}" aria-label="Modifica nota">↗</button><button class="micro-action" data-delete-note="${escapeHtml(note.id)}" aria-label="Elimina nota">×</button></div></div><h3>${escapeHtml(note.title || 'Nota senza titolo')}</h3><p>${escapeHtml(note.body || '')}</p><time>Aggiornata ${fmtRelative(note.updated)}</time></article>`;
}
function renderNotes() {
  $('stat-notes').textContent = state.notes.length;
  const query = ($('note-search')?.value || '').trim().toLowerCase();
  const shown = [...state.notes].filter(n => `${n.title} ${n.body}`.toLowerCase().includes(query)).sort((a,b)=>(b.updated||0)-(a.updated||0));
  $('notes-grid').innerHTML = shown.map(noteCard).join('');
  $('notes-empty-hint').hidden = shown.length > 0;
}
function renderLinks() {
  const query = ($('link-filter')?.value || '').trim().toLowerCase();
  const shown = state.links.filter(link => `${link.title} ${link.url} ${link.category}`.toLowerCase().includes(query));
  $('library-grid').innerHTML = shown.map(link => `<article class="library-card"><span class="library-symbol">↗</span><div class="library-main"><strong>${escapeHtml(link.title)}</strong><small>${escapeHtml(link.category)} · ${escapeHtml(link.url)}</small></div><a class="library-go" href="${escapeHtml(safeExternalUrl(link.url))}" target="_blank" rel="noopener noreferrer" aria-label="Apri link">↗</a><button class="micro-action" data-delete-link="${escapeHtml(link.id)}" aria-label="Elimina link">×</button></article>`).join('');
  $('library-empty-hint').hidden = shown.length > 0;
}
function renderAll() { renderTasks(); renderApps(); renderNotes(); renderLinks(); applyAccent(state.accent, false); }
function applyAccent(color, persist=true) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) color = '#b8f36c';
  const num = color.slice(1); const r = parseInt(num.slice(0,2),16), g = parseInt(num.slice(2,4),16), b = parseInt(num.slice(4,6),16);
  document.documentElement.style.setProperty('--accent', color);
  document.documentElement.style.setProperty('--accent-rgb', `${r},${g},${b}`);
  document.querySelectorAll('.accent-choice').forEach(btn => btn.classList.toggle('selected', btn.dataset.accent.toLowerCase() === color.toLowerCase()));
  if (persist) { state.accent = color; saveState(); }
}
function setView(name) {
  if (!document.querySelector(`[data-view-panel="${name}"]`)) return;
  activeView = name;
  document.querySelectorAll('[data-view-panel]').forEach(panel => panel.classList.toggle('is-active', panel.dataset.viewPanel === name));
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => btn.classList.toggle('active', btn.dataset.view === name));
  const labels = {dashboard:'Dashboard',apps:'Le mie app',tasks:'Attività',notes:'Note',library:'Raccolta',settings:'Impostazioni'};
  $('crumb-current').textContent = labels[name] || 'Dashboard';
  $('sidebar').classList.remove('mobile-open'); $('mobile-scrim').classList.remove('show');
  window.scrollTo({top:0, behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
  if (name === 'tasks') renderTasks(); if (name === 'apps') renderApps(); if (name === 'notes') renderNotes(); if (name === 'library') renderLinks();
}
function openDialog(id) { const dialog = $(id); if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open',''); }
function closeDialog(id) { const d=$(id); if (d.open && d.close) d.close(); else d.removeAttribute('open'); }
function newTask() { editingTaskId = null; $('task-modal-title').textContent = 'Nuova attività'; $('task-title').value = ''; $('task-due').value = 'Oggi'; $('task-priority').value = 'normal'; openDialog('task-modal'); window.setTimeout(()=>$('task-title').focus(),40); }
function saveTaskFromForm(event) {
  event.preventDefault(); const title = $('task-title').value.trim(); if (!title) return;
  if (editingTaskId) { const task = state.tasks.find(t=>t.id===editingTaskId); if (task) Object.assign(task,{title,due:$('task-due').value,priority:$('task-priority').value}); }
  else state.tasks.unshift({id:uid('task'),title,due:$('task-due').value,priority:$('task-priority').value,done:false,created:Date.now()});
  saveState(); renderTasks(); closeDialog('task-modal'); toast(editingTaskId ? 'Attività aggiornata.' : 'Attività aggiunta.'); editingTaskId=null;
}
function toggleTask(id) { const task=state.tasks.find(t=>t.id===id); if (!task) return; task.done=!task.done; saveState(); renderTasks(); }
function requestDeleteTask(id) { const task=state.tasks.find(t=>t.id===id); if (!task) return; askConfirm('Eliminare attività?', `“${task.title}” verrà rimossa dalla tua lista.`,()=>{state.tasks=state.tasks.filter(t=>t.id!==id);saveState();renderTasks();toast('Attività eliminata.');}); }
function newNote() { editingNoteId=null; $('note-modal-title').textContent='Nuova nota'; $('note-title').value=''; $('note-body').value=''; openDialog('note-modal'); window.setTimeout(()=>$('note-title').focus(),40); }
function saveNoteFromForm(event) { event.preventDefault(); const title=$('note-title').value.trim() || 'Nota senza titolo', body=$('note-body').value.trim();
  if (editingNoteId) { const note=state.notes.find(n=>n.id===editingNoteId); if (note) Object.assign(note,{title,body,updated:Date.now()}); }
  else state.notes.unshift({id:uid('note'),title,body,color:['lime','violet','blue','orange'][state.notes.length%4],updated:Date.now()});
  saveState(); renderNotes(); closeDialog('note-modal'); toast(editingNoteId?'Nota aggiornata.':'Nota salvata su questo dispositivo.'); editingNoteId=null;
}
function editNote(id) { const note=state.notes.find(n=>n.id===id); if(!note)return; editingNoteId=id; $('note-modal-title').textContent='Modifica nota'; $('note-title').value=note.title; $('note-body').value=note.body; openDialog('note-modal'); }
function requestDeleteNote(id) { const note=state.notes.find(n=>n.id===id); if(!note)return; askConfirm('Eliminare la nota?',`“${note.title}” verrà rimossa da questo dispositivo.`,()=>{state.notes=state.notes.filter(n=>n.id!==id);saveState();renderNotes();toast('Nota eliminata.');}); }
function openAppEditor(id=null) { editingAppId=id; const app=id?state.apps.find(a=>a.id===id):null; $('app-modal-title').textContent=app?'Modifica collegamento':'Aggiungi un collegamento'; $('app-name').value=app?.name||''; $('app-description').value=app?.description||''; $('app-url').value=app?.url||''; $('app-icon').value=app?.icon||'✦'; openDialog('app-modal'); window.setTimeout(()=>$('app-name').focus(),40); }
function saveAppFromForm(event) { event.preventDefault(); const name=$('app-name').value.trim(), description=$('app-description').value.trim(), url=safeExternalUrl($('app-url').value.trim());
  if(!name||!url){toast('Inserisci un nome e un indirizzo HTTP o HTTPS valido.',true);return;}
  if(editingAppId){const app=state.apps.find(a=>a.id===editingAppId);if(app)Object.assign(app,{name,description,url,icon:$('app-icon').value});}
  else state.apps.push({id:uid('app'),name,description,url,icon:$('app-icon').value,color:'#b8f36c',bg:'rgba(184,243,108,.1)',builtin:false});
  saveState();renderApps();closeDialog('app-modal');toast('Collegamento salvato.');editingAppId=null;
}
function openLinkEditor() { $('link-title').value=''; $('link-url').value=''; $('link-category').value='Preferiti'; openDialog('link-modal'); window.setTimeout(()=>$('link-title').focus(),40); }
function saveLinkFromForm(event) { event.preventDefault(); const title=$('link-title').value.trim(),url=safeExternalUrl($('link-url').value.trim()); if(!title||!url){toast('Inserisci un titolo e un indirizzo HTTP o HTTPS valido.',true);return;}
 state.links.unshift({id:uid('link'),title,url,category:$('link-category').value,created:Date.now()});saveState();renderLinks();closeDialog('link-modal');toast('Link salvato nella raccolta.'); }
function requestDeleteLink(id) { const link=state.links.find(l=>l.id===id);if(!link)return;askConfirm('Rimuovere il collegamento?',`“${link.title}” verrà rimosso dalla raccolta.`,()=>{state.links=state.links.filter(l=>l.id!==id);saveState();renderLinks();toast('Link rimosso.');}); }
function askConfirm(title,message,callback) { $('confirm-title').textContent=title;$('confirm-message').textContent=message;pendingConfirm=callback;openDialog('confirm-modal'); }
function confirmAction(event) { event.preventDefault(); const fn=pendingConfirm; pendingConfirm=null;closeDialog('confirm-modal');if(fn)fn(); }
function updateTimerUI() {
  const remaining=Math.max(0,timerRemaining); const min=String(Math.floor(remaining/60)).padStart(2,'0'), sec=String(remaining%60).padStart(2,'0'); $('timer-display').textContent=`${min}:${sec}`;
  $('timer-progress').style.strokeDashoffset=String(484*(1-remaining/(state.timerMinutes*60)));
  $('timer-toggle').innerHTML=timerRunning?'Pausa focus <span>Ⅱ</span>':'Inizia focus <span>▶</span>';
  $('focus-state').textContent=timerRunning?'IN CORSO':(remaining < state.timerMinutes*60 ? 'IN PAUSA':'PRONTO'); $('timer-caption').textContent=timerRunning?'RESTIAMO CONCENTRATI':'MINUTI DI FOCUS';
}
function toggleTimer() {
  if (timerRunning) { timerRemaining=Math.max(0,Math.ceil((timerEndAt-Date.now())/1000));timerRunning=false;clearInterval(focusTimer);focusTimer=null;updateTimerUI();return; }
  if(timerRemaining<=0)timerRemaining=state.timerMinutes*60; timerRunning=true;timerEndAt=Date.now()+timerRemaining*1000;clearInterval(focusTimer);
  focusTimer=window.setInterval(()=>{timerRemaining=Math.max(0,Math.ceil((timerEndAt-Date.now())/1000));if(timerRemaining<=0){timerRunning=false;clearInterval(focusTimer);focusTimer=null;toast('Sessione focus completata. Ottimo lavoro!');}updateTimerUI();},250);updateTimerUI();
}
function resetTimer(){timerRunning=false;clearInterval(focusTimer);focusTimer=null;timerRemaining=state.timerMinutes*60;updateTimerUI();}
function exportData(){const payload={app:'FogOS',version:'1.0.0',exportedAt:new Date().toISOString(),data:state};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`fogos-backup-${new Date().toISOString().slice(0,10)}.json`;document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);toast('Backup esportato.');}
function importData(event){const file=event.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const parsed=JSON.parse(String(reader.result));const incoming=parsed.data||parsed;if(!Array.isArray(incoming.tasks)||!Array.isArray(incoming.notes)||!Array.isArray(incoming.apps)||!Array.isArray(incoming.links))throw new Error('Formato backup non valido');askConfirm('Importare il backup?', 'Le attività, le note, le app e i link attuali verranno sostituiti dai dati contenuti nel file.',()=>{state={...clone(defaults),...incoming};saveState();renderAll();toast('Backup importato.');});}catch(err){toast('Il file non sembra un backup FogOS valido.',true);}event.target.value='';};reader.readAsText(file);}
function resetWorkspace(){askConfirm('Reimpostare FogOS?', 'Le attività, le note e i link personali verranno cancellati. Le app iniziali verranno mantenute.',()=>{state=clone(defaults);state.tasks=[];state.notes=[];state.links=[];saveState();renderAll();resetTimer();toast('Workspace reimpostato.');});}
function searchGlobal(query){const q=query.trim().toLowerCase();if(!q)return;const task=state.tasks.find(t=>t.title.toLowerCase().includes(q));const note=state.notes.find(n=>(n.title+' '+n.body).toLowerCase().includes(q));const app=state.apps.find(a=>(a.name+' '+a.description).toLowerCase().includes(q));const link=state.links.find(l=>(l.title+' '+l.url).toLowerCase().includes(q));if(task){setView('tasks');toast(`Attività trovata: ${task.title}`);}else if(note){setView('notes');$('note-search').value=query;renderNotes();toast(`Nota trovata: ${note.title}`);}else if(app){setView('apps');$('app-filter').value=query;renderApps();toast(`App trovata: ${app.name}`);}else if(link){setView('library');$('link-filter').value=query;renderLinks();toast(`Link trovato: ${link.title}`);}else{toast('Nessun risultato trovato.');}}
function handleClick(event){
 const viewButton=event.target.closest('[data-view]');if(viewButton){setView(viewButton.dataset.view);return;}
 const toggle=event.target.closest('[data-toggle-task]');if(toggle){toggleTask(toggle.dataset.toggleTask);return;}
 const delTask=event.target.closest('[data-delete-task]');if(delTask){requestDeleteTask(delTask.dataset.deleteTask);return;}
 const editNoteBtn=event.target.closest('[data-edit-note]');if(editNoteBtn){editNote(editNoteBtn.dataset.editNote);return;}
 const delNote=event.target.closest('[data-delete-note]');if(delNote){requestDeleteNote(delNote.dataset.deleteNote);return;}
 const editApp=event.target.closest('[data-edit-app]');if(editApp){event.preventDefault();event.stopPropagation();openAppEditor(editApp.dataset.editApp);return;}
 const openApp=event.target.closest('[data-open-app]');if(openApp && !event.target.closest('[data-edit-app]')){const app=state.apps.find(a=>a.id===openApp.dataset.openApp);if(!app)return;const url=safeExternalUrl(app.url);if(url){window.open(url,'_blank','noopener,noreferrer');}else{openAppEditor(app.id);toast('Imposta il link di questa app per aprirla.');}return;}
 const delLink=event.target.closest('[data-delete-link]');if(delLink){requestDeleteLink(delLink.dataset.deleteLink);return;}
 const accent=event.target.closest('[data-accent]');if(accent){applyAccent(accent.dataset.accent);return;}
}
function setupEvents(){
 document.addEventListener('click',handleClick);
 $('mobile-menu').addEventListener('click',()=>{$('sidebar').classList.toggle('mobile-open');$('mobile-scrim').classList.toggle('show');});$('mobile-scrim').addEventListener('click',()=>{$('sidebar').classList.remove('mobile-open');$('mobile-scrim').classList.remove('show');});
 $('hero-new-task').addEventListener('click',newTask);$('quick-add-task').addEventListener('click',newTask);$('task-page-add').addEventListener('click',newTask);$('task-modal').addEventListener('close',()=>{editingTaskId=null;});$('task-form').addEventListener('submit',saveTaskFromForm);
 $('new-note').addEventListener('click',newNote);$('note-form').addEventListener('submit',saveNoteFromForm);$('add-app').addEventListener('click',()=>openAppEditor());$('add-app-secondary').addEventListener('click',()=>openAppEditor());$('app-form').addEventListener('submit',saveAppFromForm);$('add-link').addEventListener('click',openLinkEditor);$('link-form').addEventListener('submit',saveLinkFromForm);$('confirm-action').addEventListener('click',confirmAction);
 document.querySelectorAll('[data-task-filter]').forEach(btn=>btn.addEventListener('click',()=>{taskFilter=btn.dataset.taskFilter;renderTasks();}));
 $('app-filter').addEventListener('input',renderApps);$('note-search').addEventListener('input',renderNotes);$('link-filter').addEventListener('input',renderLinks);
 $('timer-toggle').addEventListener('click',toggleTimer);$('timer-reset').addEventListener('click',resetTimer);$('focus-shortcut').addEventListener('click',()=>{setView('dashboard');document.querySelector('.focus-panel')?.scrollIntoView({behavior:'smooth',block:'center'});});
 $('export-data').addEventListener('click',exportData);$('import-data').addEventListener('change',importData);$('reset-data').addEventListener('click',resetWorkspace);
 const searchBox=document.querySelector('.search-box'),searchInput=$('global-search');searchBox.addEventListener('click',()=>{if(window.matchMedia('(max-width: 600px)').matches&&!searchBox.classList.contains('expanded')){searchBox.classList.add('expanded');searchInput.focus();}});searchInput.addEventListener('focus',()=>searchBox.classList.add('expanded'));searchInput.addEventListener('blur',()=>{if(!searchInput.value)searchBox.classList.remove('expanded');});searchInput.addEventListener('keydown',e=>{if(e.key==='Enter'){searchGlobal(searchInput.value);searchInput.blur();}});
 document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();searchInput.focus();searchBox.classList.add('expanded');}if(e.key==='Escape'){$('sidebar').classList.remove('mobile-open');$('mobile-scrim').classList.remove('show');}if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-open-app]')){e.preventDefault();e.target.click();}});
}
function initPWA(){if('serviceWorker'in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(err=>console.warn('Service worker registration failed',err)));}const installBtn=$('install-pwa');if(installBtn){installBtn.addEventListener('click',async()=>{if(!installPromptEvent){toast('Per installare: usa il menu Condividi del browser e scegli “Aggiungi alla schermata Home”.');return;}installPromptEvent.prompt();const choice=await installPromptEvent.userChoice;installPromptEvent=null;toast(choice?.outcome==='accepted'?'FogOS installato.':'Installazione non completata.');});}window.addEventListener('appinstalled',()=>toast('FogOS è stato installato.'));}
function viewFromHash(){const candidate=(location.hash||'').replace(/^#/, '');if(['dashboard','apps','tasks','notes','library','settings'].includes(candidate))setView(candidate);}
function init(){updateClock();window.setInterval(updateClock,15000);setupEvents();renderAll();updateTimerUI();initPWA();viewFromHash();window.addEventListener('hashchange',viewFromHash);}
document.addEventListener('DOMContentLoaded',init);
