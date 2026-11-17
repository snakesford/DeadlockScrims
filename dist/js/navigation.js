const queueKey='roster-queue-v1';
let queue=[];
try { const stored=JSON.parse(localStorage.getItem(queueKey)||'[]'); if(Array.isArray(stored))queue=[...new Set(stored.filter(id=>typeof id==='string'))]; } catch { document.querySelector('#queue-status').textContent='Saved queue could not be loaded.'; }
function saveQueue(message){
  try { localStorage.setItem(queueKey,JSON.stringify(queue)); document.querySelector('#queue-status').textContent=message; }
  catch { document.querySelector('#queue-status').textContent='Queue changes could not be saved in this browser.'; }
  renderQueue();
}
function favoriteHeroes(person){
  const values=Array.isArray(person.favoriteHeroes)?person.favoriteHeroes:[person.favoriteCharacter];
  const seen=new Set();
  return values.filter(value=>typeof value==='string').map(value=>value.trim()).filter(value=>{const key=value.toLowerCase();if(!value||seen.has(key))return false;seen.add(key);return true;}).slice(0,3);
}
const heroesDialog=document.querySelector('#heroes-dialog');
let selectedHeroes=[];
let heroPriorities={};
let previewHero=null;
function previewSelectionHero(hero){
  previewHero=hero;
  document.querySelector("#hero-render").src=hero.render;
  document.querySelector("#hero-preview-name").textContent=hero.name;
  updatePreviewPriority();
}
function updatePreviewPriority(){
  if(!previewHero)return;
  document.querySelector("#hero-preview-priority").textContent=selectedHeroes.includes(previewHero.name)?priorityLabels[heroPriorities[previewHero.name]||0].toUpperCase():"AVAILABLE";
}
const priorityLabels=["Favorite","Medium priority","High priority"];
function updateHeroSelection(){
  updatePreviewPriority();
  document.querySelectorAll('.hero-choice').forEach(button=>{
    const selected=selectedHeroes.includes(button.dataset.hero);
    button.setAttribute('aria-pressed',String(selected));
    const priority=heroPriorities[button.dataset.hero]||0;
    button.dataset.priority=priority;
    button.setAttribute('aria-label',`${button.dataset.hero}${selected?', '+priorityLabels[priority]:''}`);
    button.title=selected?`${priorityLabels[priority]}. Right-click or press Arrow Up to cycle priority: 0, 1, 2, then 0.`:button.dataset.hero;
    button.disabled=!selected&&selectedHeroes.length>=3;
  });
  document.querySelector('#heroes-selection-status').textContent=`${selectedHeroes.length} of 3 selected`;
  const selected=document.querySelector('#heroes-selected');selected.replaceChildren();
  for(const name of selectedHeroes){
    const remove=document.createElement('button');remove.type='button';remove.textContent=name+(heroPriorities[name]===2?' · High':heroPriorities[name]===1?' · Medium':'')+' ×';remove.setAttribute('aria-label',`Remove ${name} from favorites`);
    remove.onclick=()=>{selectedHeroes=selectedHeroes.filter(hero=>hero!==name);delete heroPriorities[name];updateHeroSelection();};selected.append(remove);
  }
}
let heroesSaveCallback=null;
function editHeroes(person,onSave=null){
  heroesSaveCallback=onSave;
  selectedHeroes=favoriteHeroes(person).map(name=>heroCatalog.find(hero=>hero.name.toLowerCase()===name.toLowerCase())?.name||name);
  heroPriorities=Object.fromEntries(selectedHeroes.map(name=>[name,Math.max(0,Math.min(2,Number(person.favoriteHeroPriorities?.[name])||0))]));
  const grid=document.querySelector('#heroes-grid');grid.replaceChildren();
  for(const hero of heroCatalog){
    const button=document.createElement('button');button.type='button';button.className='hero-choice';button.dataset.hero=hero.name;button.setAttribute('aria-label',hero.name);
    const image=document.createElement('img');image.src=hero.image;image.alt='';image.loading='lazy';image.width=120;image.height=120;
    const label=document.createElement('span');label.textContent=hero.name;
    button.onmouseenter=()=>previewSelectionHero(hero);button.onfocus=()=>previewSelectionHero(hero);
    button.append(image,label);button.onclick=()=>{
      previewSelectionHero(hero);
      if(selectedHeroes.includes(hero.name)){selectedHeroes=selectedHeroes.filter(name=>name!==hero.name);delete heroPriorities[hero.name];}
      else if(selectedHeroes.length<3)selectedHeroes.push(hero.name);
      updateHeroSelection();
    };
    function raisePriority(event){
      event.preventDefault();
      if(!selectedHeroes.includes(hero.name))return;
      heroPriorities[hero.name]=((heroPriorities[hero.name]||0)+1)%3;
      updateHeroSelection();
      document.querySelector('#heroes-selection-status').textContent=`${selectedHeroes.length} of 3 selected. ${hero.name}: ${priorityLabels[heroPriorities[hero.name]]}.`;
    }
    button.oncontextmenu=raisePriority;
    button.onkeydown=event=>{if(event.key==='ArrowUp')raisePriority(event);};
    grid.append(button);
  }
  previewSelectionHero(heroCatalog.find(hero=>hero.name===selectedHeroes[0])||heroCatalog.find(hero=>hero.name==='Billy')||heroCatalog[0]);
  updateHeroSelection();heroesDialog.showModal();
}
document.querySelector('#heroes-close').onclick=()=>heroesDialog.close();
document.querySelector('#heroes-cancel').onclick=()=>heroesDialog.close();
document.querySelector('#heroes-form').onsubmit=event=>{
  event.preventDefault();
  if(heroesSaveCallback){heroesSaveCallback([...selectedHeroes],Object.fromEntries(selectedHeroes.map(name=>[name,heroPriorities[name]||0])));heroesDialog.close();return;}
  heroesDialog.close();
};
function renderQueue(){
  queue=queue.filter(id=>names.some(person=>person.id===id));
  const select=document.querySelector('#queue-player');select.replaceChildren();
  const available=names.filter(person=>!queue.includes(person.id));
  const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent=available.length?'Choose a player…':names.length?'All players are queued':'Add names in Skill Levels first';select.append(placeholder);
  for(const person of available){const option=document.createElement('option');option.value=person.id;option.textContent=person.name;select.append(option);}
  select.disabled=!available.length;document.querySelector('#queue-add').disabled=!available.length;
  document.querySelector('#queue-count').textContent=`${queue.length} player${queue.length===1?'':'s'}`;
  const list=document.querySelector('#queue-list');list.replaceChildren();
  if(!queue.length){const empty=document.createElement('li');empty.className='queue-empty';empty.textContent='The queue is empty. Add a player to get started.';list.append(empty);}
  queue.forEach((id,index)=>{
    const person=names.find(person=>person.id===id);const row=document.createElement('li');row.className='queue-row';
    const position=document.createElement('span');position.className='queue-position';position.textContent=String(index+1).padStart(2,'0');
    const label=document.createElement('span');label.className='queue-name';label.textContent=person.name;
    const badge=document.createElement('span');badge.className='queue-tier';badge.textContent=tiers.find(t=>t.id===person.tier).name;
    const remove=document.createElement('button');remove.type='button';remove.className='queue-remove';remove.textContent='Remove';remove.setAttribute('aria-label',`Remove ${person.name} from queue`);remove.onclick=()=>{queue=queue.filter(item=>item!==id);saveQueue(`${person.name} removed from queue.`);};
    row.append(position,label,badge,remove);list.append(row);
  });
}
document.querySelector('#queue-form').onsubmit=event=>{event.preventDefault();const id=document.querySelector('#queue-player').value;if(names.some(person=>person.id===id)&&!queue.includes(id)){queue.push(id);saveQueue('Player added to queue.');}};
let skillPageAvailable=false;
window.addEventListener('roster:sync',event=>{
  const available=!!event.detail?.joined;
  if(available===skillPageAvailable)return;
  skillPageAvailable=available;
  showPage();
});
function showPage(){
  const requested=location.hash.slice(1);let page=['skills','queue','match','account'].includes(requested)?requested:'match';
  document.querySelector('[data-page="skills"]').hidden=!skillPageAvailable;
  if(page==='skills'&&!skillPageAvailable){page='match';const url=new URL(location.href);url.hash='match';history.replaceState(null,'',url);}
  for(const name of ['skills','queue','match','account'])document.querySelector(`#${name}-page`).hidden=name!==page;
  document.querySelectorAll('.bottom-nav a').forEach(link=>{if(link.dataset.page===page)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
  if(page==='queue')renderQueue();if(page==='account')renderAccount();
  document.title=`Roster — ${page==='skills'?'Skill Levels':page==='match'?'Match':page==='account'?'Account':'Queue'}`;
}
window.addEventListener('hashchange',showPage);showPage();
