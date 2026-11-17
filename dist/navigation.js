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
let heroesPlayerId=null;
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
function editHeroes(person){
  heroesPlayerId=person.id;
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
  event.preventDefault();const person=names.find(person=>person.id===heroesPlayerId);if(!person){heroesDialog.close();return;}
  person.favoriteHeroes=[...selectedHeroes];
  person.favoriteHeroPriorities=Object.fromEntries(selectedHeroes.map(name=>[name,heroPriorities[name]||0]));
  delete person.favoriteCharacter;
  save(`Favorites updated for ${person.name}.`);heroesDialog.close();renderStats();
  document.querySelector('#stats-status').textContent=storageAvailable?`Favorites saved for ${person.name}.`:'Browser storage is unavailable. These favorites will last only until you close this page.';
};
function renderStats(){
  const cards=document.querySelector('#stats-cards');cards.replaceChildren();
  for(const tier of [{id:'all',name:'Total players',tint:'#edf0e6'},...tiers]){
    const count=tier.id==='all'?names.length:names.filter(person=>person.tier===tier.id).length;
    const card=document.createElement('section');card.className='stat-card';card.style.setProperty('--tier-color',tier.tint);
    const title=document.createElement('h2');title.textContent=tier.name;
    const number=document.createElement('strong');number.textContent=count;
    const caption=document.createElement('span');caption.textContent=tier.id==='all'?'On your roster':`${names.length?Math.round(count/names.length*100):0}% of your roster`;
    card.append(title,number,caption);cards.append(card);
  }
  const players=document.querySelector('#player-stats');players.replaceChildren();
  if(!names.length){
    const empty=document.createElement('p');empty.className='queue-empty';empty.textContent='Add players in Skill Levels to track their wins and favorite characters.';players.append(empty);
  }
  for(const person of names){
    const form=document.createElement('section');form.className='player-stat-card';form.style.setProperty('--tier-color',tiers.find(t=>t.id===person.tier).tint);
    const heading=document.createElement('div');heading.className='player-stat-heading';
    const title=document.createElement('h3');title.textContent=person.name;
    const badge=document.createElement('span');badge.className='queue-tier';badge.textContent=tiers.find(t=>t.id===person.tier).name;
    heading.append(title,badge);
    const fields=document.createElement('div');fields.className='player-stat-fields';
    const winsSection=document.createElement('div');winsSection.className='wins-section';
    const winsLabel=document.createElement('span');winsLabel.textContent='Wins';
    const counter=document.createElement('div');counter.className='wins-counter';
    const up=document.createElement('button');up.type='button';up.textContent='↑';up.setAttribute('aria-label',`Add a win for ${person.name}`);
    const number=document.createElement('output');number.setAttribute('aria-label',`Wins for ${person.name}`);
    const down=document.createElement('button');down.type='button';down.textContent='↓';down.setAttribute('aria-label',`Remove a win for ${person.name}`);
    let wins=Number.isSafeInteger(person.wins)&&person.wins>=0?person.wins:0;
    function updateCounter(){number.textContent=wins;down.disabled=wins===0;up.disabled=wins===Number.MAX_SAFE_INTEGER;}
    function changeWins(amount){
      wins=Math.max(0,Math.min(Number.MAX_SAFE_INTEGER,wins+amount));person.wins=wins;updateCounter();
      save(`Wins updated for ${person.name}.`);
      document.querySelector('#stats-status').textContent=storageAvailable?`${person.name}: ${wins} wins. Saved.`:'Browser storage is unavailable. These stats will last only until you close this page.';
    }
    up.onclick=()=>changeWins(1);down.onclick=()=>changeWins(-1);updateCounter();
    counter.append(up,number,down);winsSection.append(winsLabel,counter);
    const characterSection=document.createElement('div');characterSection.className='character-stat';
    const characterLabel=document.createElement('span');characterLabel.textContent='Roster';
    const favorites=favoriteHeroes(person);const list=document.createElement('ul');list.className='favorite-heroes';
    for(const name of favorites){
      const hero=heroCatalog.find(hero=>hero.name.toLowerCase()===name.toLowerCase());
      const rawPriority=person.favoriteHeroPriorities?.[name];
      const priority=rawPriority===1||rawPriority===2?rawPriority:0;
      const item=document.createElement('li');item.className='stats-hero';
      item.title=`${name} — ${priorityLabels[priority]}`;
      const portrait=document.createElement('div');portrait.className='stats-hero-portrait';
      if(hero){const image=document.createElement('img');image.src=hero.image;image.alt=name;image.loading='lazy';portrait.append(image);}
      else {const fallback=document.createElement('span');fallback.className='stats-hero-fallback';fallback.textContent=name;portrait.append(fallback);}
      const marker=document.createElement('span');marker.className='stats-hero-priority';marker.setAttribute('aria-label',`Priority ${priority}: ${priorityLabels[priority]}`);
      for(let level=0;level<priority;level++){
        const triangle=document.createElementNS('http://www.w3.org/2000/svg','svg');triangle.setAttribute('viewBox','0 0 20 16');triangle.setAttribute('aria-hidden','true');
        const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M10 2 L18 14 H2 Z');path.setAttribute('fill','#62ff9e');path.setAttribute('stroke','#000');path.setAttribute('stroke-width','2');path.setAttribute('stroke-linejoin','round');triangle.append(path);marker.append(triangle);
      }
      portrait.append(marker);
      const caption=document.createElement('span');caption.className='stats-hero-caption';caption.textContent=`Prio ${priority}`;
      item.append(portrait,caption);list.append(item);
    }
    if(!favorites.length){const empty=document.createElement('li');empty.className='heroes-empty';empty.textContent='No heroes yet';list.append(empty);}
    const edit=document.createElement('button');edit.type='button';edit.className='edit-heroes';edit.textContent=favorites.length?'Edit roster':'＋ Add heroes';edit.setAttribute('aria-label',`Edit roster for ${person.name}`);edit.onclick=()=>editHeroes(person);
    characterSection.append(characterLabel,list,edit);fields.append(winsSection,characterSection);
    form.append(heading,fields);players.append(form);
  }
}
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
function showPage(){
  const requested=location.hash.slice(1);const page=['skills','stats','queue'].includes(requested)?requested:'skills';
  for(const name of ['skills','stats','queue'])document.querySelector(`#${name}-page`).hidden=name!==page;
  document.querySelectorAll('.bottom-nav a').forEach(link=>{if(link.dataset.page===page)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
  if(page==='stats')renderStats();if(page==='queue')renderQueue();
  document.title=`Roster — ${page==='skills'?'Skill Levels':page==='stats'?'Stats':'Queue'}`;
}
window.addEventListener('hashchange',showPage);showPage();
