const accountKey='roster-account-v1';
let account={name:'',favoriteHeroes:[],favoriteHeroPriorities:{}};
let accountStorageAvailable=true;
try {
  const stored=JSON.parse(localStorage.getItem(accountKey)||'null');
  if(stored && typeof stored==='object') {
    account.name=typeof stored.name==='string'?stored.name.trim().slice(0,60):'';
    account.favoriteHeroes=Array.isArray(stored.favoriteHeroes)?[...new Set(stored.favoriteHeroes)].filter(name=>heroCatalog.some(hero=>hero.name===name)).slice(0,3):[];
    account.favoriteHeroPriorities=Object.fromEntries(account.favoriteHeroes.map(name=>[name,[0,1,2].includes(stored.favoriteHeroPriorities?.[name])?stored.favoriteHeroPriorities[name]:0]));
  }
} catch {accountStorageAvailable=false;}
function saveAccount(message){
  try {localStorage.setItem(accountKey,JSON.stringify(account));accountStorageAvailable=true;}
  catch {accountStorageAvailable=false;}
  document.querySelector('#account-status').textContent=accountStorageAvailable?message:'Your profile could not be saved on this device. Changes will last until you close this page.';
}
function renderAccount(){
  document.querySelector('#account-name').value=account.name;
  const list=document.querySelector('#account-heroes');list.replaceChildren();
  for(const name of account.favoriteHeroes){
    const hero=heroCatalog.find(hero=>hero.name===name);
    const card=document.createElement('figure');
    const image=document.createElement('img');image.src=hero.image;image.alt=name;
    const caption=document.createElement('figcaption');caption.textContent=name;
    const priority=document.createElement('span');priority.textContent=['Favorite','Medium priority','High priority'][account.favoriteHeroPriorities[name]||0];
    card.append(image,caption,priority);list.append(card);
  }
  if(!account.favoriteHeroes.length){const empty=document.createElement('p');empty.className='match-help';empty.textContent='No heroes selected yet.';list.append(empty);}
  document.querySelector('#account-select-heroes').textContent=account.favoriteHeroes.length?'Edit heroes':'Select heroes';
  if(!accountStorageAvailable)document.querySelector('#account-status').textContent='Profile storage is unavailable on this device.';
}
document.querySelector('#account-form').onsubmit=event=>{
  event.preventDefault();
  const input=document.querySelector('#account-name');const name=input.value.trim();
  if(!name || name.length>60){input.setCustomValidity('Enter a player name (1–60 characters).');input.reportValidity();return;}
  account.name=name;input.value=name;
  document.querySelector('#match-name').value=name;
  saveAccount('Player name saved.');
  window.dispatchEvent(new CustomEvent('account:name-changed',{detail:{name}}));
};
document.querySelector('#account-name').oninput=event=>event.target.setCustomValidity('');
document.querySelector('#account-select-heroes').onclick=()=>editHeroes(account,(heroes,priorities)=>{
  account.favoriteHeroes=heroes;account.favoriteHeroPriorities=priorities;
  saveAccount('Heroes saved.');renderAccount();
});
if(account.name)document.querySelector('#match-name').value=account.name;
