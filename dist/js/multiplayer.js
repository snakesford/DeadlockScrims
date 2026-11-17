import {changePlayer, newPlayer, joinMatch, bootPlayer, closeMatch, leaveMatch} from './match-model.mjs?v=leave-match-1';
const $ = id => document.getElementById(id);
const message = text => { $('match-status').textContent = text; if (current) $('status').textContent = text; };
let sdk, db, uid, matchId, current, connected = false, busy = false, unsubscribe;
let requestedId = new URL(location.href).searchParams.get('match');
const validId = id => /^[A-Za-z0-9_-]{20,64}$/.test(id || '');
function controls() {
  $('match-create').disabled = !uid || !connected || busy;
  $('match-join').disabled = !uid || !connected || busy || !validId(requestedId) || !!current?.closed;
}
async function action(work) {
  if (busy) return;
  if (!connected) { message('You are offline. Reconnect before changing your match.'); return; }
  busy = true; controls(); renderMatch();
  try { await work(); message('Match saved.'); return true; }
  catch (error) { message(error.message || 'Unable to save this change.'); }
  finally { busy = false; controls(); renderMatch(); }
}
function playerName() {
  const name = $('match-name').value.trim();
  if (!name || name.length > 60) throw new Error('Enter a name (1–60 characters).');
  return name;
}
function watch(id) {
  unsubscribe?.(); current = null; matchId = id; renderMatch();
  const link = new URL(location.href); link.searchParams.set('match', id); link.hash = 'match';
  history.replaceState(null, '', link); showPage();
  $('match-link').value = link.href;
  $('match-share').hidden = false;
  unsubscribe = sdk.onValue(sdk.ref(db, `matches/${id}`), snapshot => {
    const wasJoined = !!current?.players?.[uid];
    current = snapshot.val(); renderMatch();
    if (wasJoined && current && !current.players?.[uid]) message('The host removed you from the lobby. You can rejoin using the invite link.');
    if (!current) message('This match does not exist.');
  }, error => { current = null; renderMatch(); message(`Unable to load match: ${error.message}`); });
}
async function updateMatch(transform) {
  return action(async () => {
    // Transactions retry against the newest complete match, including hero claims.
    let conflict;
    const result = await sdk.runTransaction(sdk.ref(db, `matches/${matchId}`), value => {
      if (!value) return value; // Firebase may initially supply an empty local cache.
      try { conflict = undefined; return transform(value); }
      catch (error) { conflict = error; return undefined; }
    }, {applyLocally: false});
    if (conflict) throw conflict;
    if (!result.committed || !result.snapshot.exists()) throw new Error('Match changed. Please try again.');
  });
}
function updatePlayer(target, patch) {
  return updateMatch(value => changePlayer(value, uid, target, patch));
}
function renderMatchCounts() {
  const container = $('match-counts'); container.replaceChildren();
  container.hidden = !current || !!current.closed;
  if (container.hidden) return;
  const players = Object.values(current.players || {});
  for (const [tier, label, color] of [
    ['all', 'Total players', '#edf0e6'], ['high', 'High', '#f8e8a0'],
    ['mid', 'Mid', '#dcd9f7'], ['newer', 'Newer', '#cde6fa'], ['unsorted', 'Unsorted', '#f1f3eb']
  ]) {
    const count = tier === 'all' ? players.length : players.filter(player => (player.tier || 'unsorted') === tier).length;
    const card = document.createElement('section'); card.className = 'stat-card';
    card.style.setProperty('--tier-color', color);
    const title = document.createElement('h2'); title.textContent = label;
    const number = document.createElement('strong'); number.textContent = count;
    const caption = document.createElement('span'); caption.textContent = tier === 'all' ? 'In this match' : `${players.length ? Math.round(count / players.length * 100) : 0}% of the lobby`;
    card.append(title, number, caption); container.append(card);
  }
}
function renderMatch() {
  controls();
  $('match-close').hidden = !current || current.owner !== uid || !!current.closed;
  $('match-close').disabled = !connected || busy;
  $('match-leave').hidden = !current?.players?.[uid] || !!current?.closed;
  $('match-leave').disabled = !connected || busy;
  $('match-share').hidden = !current || !!current.closed;
  window.dispatchEvent(new CustomEvent('roster:sync', {detail: current && !current.closed ? {
    players: Object.entries(current.players || {}).map(([id, player]) => ({id, name: player.name, tier: player.tier || 'unsorted'})),
    connected,
    joined: !!current.players?.[uid],
    canEdit: id => connected && !busy && !!current?.players?.[uid] && (id === uid || current.owner === uid),
    update: updatePlayer
  } : null}));
  renderMatchCounts();
  $('match-title').textContent = current?.name || 'MATCH LOBBY';
  const list = $('match-players'); list.replaceChildren();
  $('match-details').textContent = current ? `Match ${matchId} · ${current.allowDuplicates ? 'Duplicate heroes allowed' : 'Unique heroes only'}${current.owner === uid ? ' · You are the administrator' : ''}` : '';
  if (current?.closed) {
    $('match-details').textContent = 'This match has been closed by the host.';
    message('Match closed. Create a new match to play again.');
    return;
  }
  for (const [id, player] of Object.entries(current?.players || {})) {
    const card = document.createElement('section'); card.className = 'player-stat-card';
    const header = document.createElement('div'); header.className = 'match-player-header';
    const heading = document.createElement('h3'); heading.textContent = player.name + (id === uid ? ' (you)' : ''); header.append(heading);
    const ranks = [['unsorted', 'Unsorted'], ['high', 'High'], ['mid', 'Mid'], ['newer', 'Newer']];
    const tier = ranks.some(([value]) => value === player.tier) ? player.tier : 'unsorted';
    const rank = document.createElement(current.owner === uid ? 'select' : 'span');
    rank.className = `match-player-rank rank-${tier}`;
    rank.setAttribute('aria-label', `Rank for ${player.name}`);
    if (current.owner === uid) {
      for (const [value, label] of ranks) rank.add(new Option(label, value));
      rank.value = tier; rank.disabled = !connected || busy;
      rank.onchange = () => updatePlayer(id, {tier: rank.value});
    } else {
      rank.textContent = ranks.find(([value]) => value === tier)[1];
    }
    header.append(rank); card.append(header);
    const editable = connected && !busy && (id === uid || current.owner === uid);
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
    const ready = document.createElement('button'); ready.className = 'match-ready'; ready.textContent = player.ready ? '✓ Ready' : 'Not ready'; ready.disabled = !editable;
    ready.setAttribute('aria-pressed', String(player.ready)); ready.onclick = () => updatePlayer(id, {ready: !player.ready}); card.append(ready);
    if (current.owner === uid && id !== uid) {
      const boot = document.createElement('button'); boot.type = 'button';
      boot.className = 'boot-player'; boot.textContent = 'Boot';
      boot.setAttribute('aria-label', `Boot ${player.name} from lobby`);
      boot.disabled = !connected || busy;
      boot.onclick = () => updateMatch(value => bootPlayer(value, uid, id));
      card.append(boot);
    }
    list.append(card);
  }
}
window.addEventListener('account:name-changed', async event => {
  if (!current?.players?.[uid] || current.closed) return;
  const saved = await updatePlayer(uid, {name: event.detail.name});
  if (!saved) $('account-status').textContent = 'Name saved on this device. The lobby name could not be updated; reconnect and save again.';
});
$('match-leave').onclick = async () => {
  const left = await updateMatch(value => leaveMatch(value, uid));
  if (!left) return;
  unsubscribe?.(); unsubscribe = undefined;
  current = null; matchId = null; requestedId = null;
  const link = new URL(location.href); link.searchParams.delete('match');
  history.replaceState(null, '', link);
  renderMatch(); message('You left the match. Use its invite link to join again.');
};
$('match-close').onclick = () => updateMatch(value => closeMatch(value, uid));
$('match-create').onclick = () => action(async () => {
  const name = playerName();
  const lobbyName = $('lobby-name').value.trim();
  if (lobbyName.length > 60) throw new Error('Lobby name must be 60 characters or fewer.');
  const reference = sdk.push(sdk.ref(db, 'matches'));
  await sdk.set(reference, {...(lobbyName ? {name: lobbyName} : {}), owner: uid, slots: {'0': uid}, allowDuplicates: $('match-duplicates').checked, players: {[uid]: newPlayer(name)}});
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
