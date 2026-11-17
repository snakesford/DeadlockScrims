import {changePlayer, newPlayer, joinMatch} from './match-model.mjs';
const $ = id => document.getElementById(id);
const message = text => { $('match-status').textContent = text; };
let sdk, db, uid, matchId, current, connected = false, busy = false, unsubscribe;
const requestedId = new URL(location.href).searchParams.get('match');
const validId = id => /^[A-Za-z0-9_-]{20,64}$/.test(id || '');
function controls() {
  $('match-create').disabled = !uid || !connected || busy;
  $('match-join').disabled = !uid || !connected || busy || !validId(requestedId);
}
async function action(work) {
  if (busy) return;
  if (!connected) { message('You are offline. Reconnect before changing your match.'); return; }
  busy = true; controls(); renderMatch();
  try { await work(); message('Match saved.'); }
  catch (error) { message(error.message || 'Unable to save this change.'); }
  finally { busy = false; controls(); renderMatch(); }
}
function playerName() {
  const name = $('match-name').value.trim();
  if (!name || name.length > 60) throw new Error('Enter a name (1–60 characters).');
  return name;
}
function watch(id) {
  unsubscribe?.(); matchId = id;
  const link = new URL(location.href); link.searchParams.set('match', id); link.hash = 'match';
  history.replaceState(null, '', link); showPage();
  $('match-link').value = link.href;
  $('match-share').hidden = false;
  unsubscribe = sdk.onValue(sdk.ref(db, `matches/${id}`), snapshot => {
    current = snapshot.val(); renderMatch();
    if (!current) message('This match does not exist.');
  }, error => { current = null; renderMatch(); message(`Unable to load match: ${error.message}`); });
}
async function updatePlayer(target, patch) {
  await action(async () => {
    // Transactions retry against the newest complete match, including hero claims.
    let conflict;
    const result = await sdk.runTransaction(sdk.ref(db, `matches/${matchId}`), value => {
      if (!value) return value; // Firebase may initially supply an empty local cache.
      try { return changePlayer(value, uid, target, patch); }
      catch (error) { conflict = error; return undefined; }
    }, {applyLocally: false});
    if (conflict) throw conflict;
    if (!result.committed || !result.snapshot.exists()) throw new Error('Match changed. Please try again.');
  });
}
function renderMatch() {
  const list = $('match-players'); list.replaceChildren();
  $('match-details').textContent = current ? `Match ${matchId} · ${current.allowDuplicates ? 'Duplicate heroes allowed' : 'Unique heroes only'}${current.owner === uid ? ' · You are the administrator' : ''}` : '';
  for (const [id, player] of Object.entries(current?.players || {})) {
    const card = document.createElement('section'); card.className = 'player-stat-card';
    const heading = document.createElement('h3'); heading.textContent = player.name + (id === uid ? ' (you)' : ''); card.append(heading);
    const editable = connected && !busy && (id === uid || current.owner === uid);
    const name = document.createElement('input'); name.value = player.name; name.maxLength = 60; name.disabled = !editable;
    name.setAttribute('aria-label', `Name for ${player.name}`);
    name.onchange = () => { if (name.value.trim()) updatePlayer(id, {name: name.value.trim()}); else renderMatch(); }; card.append(name);
    function select(label, values, value, field) {
      const wrapper = document.createElement('label'); wrapper.textContent = label;
      const input = document.createElement('select'); input.disabled = !editable;
      for (const [key, text] of values) {
        const option = new Option(text, key);
        if (field === 'hero' && key && !current.allowDuplicates && current.claims?.[key] && current.claims[key] !== id) option.disabled = true;
        input.add(option);
      }
      input.value = value; input.onchange = () => updatePlayer(id, {[field]: input.value}); wrapper.append(input); card.append(wrapper);
    }
    select('Match hero', [['', 'Choose a hero…'], ...heroCatalog.map(h => [h.name, h.name])], player.hero, 'hero');
    select('Team', [['unassigned', 'Unassigned'], ['amber', 'Amber'], ['sapphire', 'Sapphire']], player.team, 'team');
    const ready = document.createElement('button'); ready.textContent = player.ready ? '✓ Ready' : 'Not ready'; ready.disabled = !editable;
    ready.setAttribute('aria-pressed', String(player.ready)); ready.onclick = () => updatePlayer(id, {ready: !player.ready}); card.append(ready); list.append(card);
  }
}
$('match-create').onclick = () => action(async () => {
  const name = playerName();
  const reference = sdk.push(sdk.ref(db, 'matches'));
  await sdk.set(reference, {owner: uid, slots: {'0': uid}, allowDuplicates: $('match-duplicates').checked, players: {[uid]: newPlayer(name)}});
  watch(reference.key);
});
$('match-join').onclick = () => action(async () => {
  const name = playerName();
  let conflict;
  const result = await sdk.runTransaction(sdk.ref(db, `matches/${requestedId}`), value => {
    try { return joinMatch(value, uid, name); }
    catch (error) { conflict = error; return undefined; }
  }, {applyLocally: false});
  if (conflict) throw conflict;
  if (!result.committed || !result.snapshot.exists()) throw new Error('Unable to join match: match does not exist.');
  watch(requestedId);
});
$('match-copy').onclick = async () => {
  try { await navigator.clipboard.writeText($('match-link').value); message('Match link copied.'); }
  catch { $('match-link').select(); message('Select and copy the match link.'); }
};
async function initialize() {
  controls();
  if (requestedId) { location.hash = 'match'; showPage(); }
  if (!window.FIREBASE_CONFIG) { message('Multiplayer setup required: add your Firebase web configuration to firebase-config.js.'); return; }
  try {
    const base = 'https://www.gstatic.com/firebasejs/12.6.0/';
    const [app, authSDK, database] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-database.js')]);
    sdk = database;
    const instance = app.initializeApp(window.FIREBASE_CONFIG);
    const auth = authSDK.getAuth(instance); db = sdk.getDatabase(instance);
    await authSDK.setPersistence(auth, authSDK.browserLocalPersistence);
    await auth.authStateReady();
    const user = auth.currentUser || (await authSDK.signInAnonymously(auth)).user;
    uid = user.uid;
    sdk.onValue(sdk.ref(db, '.info/connected'), snapshot => {
      connected = snapshot.val() === true; controls(); renderMatch();
      message(connected ? 'Connected. Create a match or join with your shared link.' : 'Offline — showing last received match. Changes are disabled until reconnection.');
    });
    if (validId(requestedId)) watch(requestedId);
    else if (requestedId) message('Invalid match link. Create a new match.');
  } catch (error) { message(`Multiplayer could not start: ${error.message}`); }
}
initialize();
