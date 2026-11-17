import {changePlayer, newPlayer, joinMatch, bootPlayer, closeMatch, leaveMatch, profileRoster, validateName, createMatchCode} from './match-model.mjs?v=match-code-1';
const $ = id => document.getElementById(id);
const message = text => { $('match-status').textContent = text; if (current) $('status').textContent = text; };
let sdk, db, uid, matchId, current, connected = false, busy = false, unsubscribe;
let requestedId = new URL(location.href).searchParams.get('match');
const validId = id => /^[A-Za-z0-9_-]{20,64}$/.test(id || '');
function enteredMatchId() {
  try {
    const link = new URL(($('match-invite').value || '').trim());
    if (!['https:', 'http:'].includes(link.protocol)) return null;
    const id = link.searchParams.get('match');
    return validId(id) ? id : null;
  } catch { return null; }
}
$('match-invite').value = validId(requestedId) ? location.href : '';
$('match-invite').oninput = controls;
function controls() {
  $('match-create').disabled = !uid || !connected || busy;
  $('match-join').disabled = !uid || !connected || busy || !validId(enteredMatchId());
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
  return validateName($('match-name').value);
}
function watch(id) {
  unsubscribe?.(); current = null; matchId = id; requestedId = id; renderMatch();
  const link = new URL(location.href); link.searchParams.set('match', id); link.hash = 'match';
  history.replaceState(null, '', link); showPage();
  $('match-link').value = link.href;
  $('match-invite').value = link.href;
  $('match-share').hidden = false;
  let profileLoaded = false;
  unsubscribe = sdk.onValue(sdk.ref(db, `matches/${id}`), snapshot => {
    const wasJoined = !!current?.players?.[uid];
    current = snapshot.val(); renderMatch();
    if (!profileLoaded && current?.players?.[uid] && !current.closed && connected && !busy) {
      profileLoaded = true;
      const roster = profileRoster(window.getAccountProfile?.() || {});
      if (JSON.stringify(current.players[uid].roster || {}) !== JSON.stringify(roster)) updatePlayer(uid, {roster});
    }
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
function renderMatchTeams() {
  const container = $('match-teams');
  container.replaceChildren();
  container.hidden = !current || !!current.closed;
  $('match-teams-section').hidden = container.hidden;
  if (container.hidden) return;
  for (const [team, name] of [['sapphire', 'Archmother'], ['amber', 'Hidden King']]) {
    const panel = document.createElement('section'); panel.className = `match-team match-team-${team}`;
    const players = Object.values(current.players || {}).filter(player => player.team === team)
      .sort((a, b) => Number(a.slot) - Number(b.slot));
    const heading = document.createElement('h2'); heading.textContent = `${name} · ${players.length}`;
    panel.append(heading);
    const list = document.createElement('ul'); list.className = 'match-team-players';
    for (let slot = 0; slot < Math.max(6, players.length); slot++) {
      const player = players[slot];
      const row = document.createElement('li'); row.className = 'match-team-player';
      if (!player) {
        row.classList.add('match-team-empty');
        row.setAttribute('aria-label', `${name} empty player slot ${slot + 1}`);
        const placeholder = document.createElement('div'); placeholder.className = 'match-team-hero';
        const spacer = document.createElement('strong'); spacer.setAttribute('aria-hidden', 'true');
        row.append(spacer, placeholder); list.append(row); continue;
      }
      const top = Object.values(player.roster || {}).sort((a, b) => (b.priority || 0) - (a.priority || 0))[0];
      const hero = heroCatalog.find(hero => hero.name === top?.hero);
      const card = document.createElement('div'); card.className = 'match-team-hero';
      if (top?.priority > 0) card.classList.add('has-priority');
      if (hero) {
        const portrait = document.createElement('img'); portrait.src = hero.image;
        portrait.alt = hero.name; portrait.loading = 'lazy'; card.append(portrait);
        const priority = document.createElement('span'); priority.className = 'match-team-priority';
        priority.textContent = Array(top.priority || 0).fill('▲').join('\n');
        priority.setAttribute('aria-label', `Priority ${top.priority || 0}`);
        card.append(priority);
      }
      const label = document.createElement('strong'); label.textContent = player.name;
      row.append(label, card); list.append(row);
    }
    panel.append(list); container.append(panel);
  }
}
function renderMatch() {
  controls();
  $('match-lobby').hidden = !current || !!current.closed;
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
  renderMatchTeams();
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
    const fields = document.createElement('div'); fields.className = 'player-stat-fields';
    const winsSection = document.createElement('div'); winsSection.className = 'wins-section';
    const winsLabel = document.createElement('span'); winsLabel.textContent = 'Wins';
    const counter = document.createElement('div'); counter.className = 'wins-counter';
    const wins = Number.isSafeInteger(player.wins) ? player.wins : 0;
    const number = document.createElement('output'); number.textContent = wins;
    number.setAttribute('aria-label', `Wins for ${player.name}`);
    const up = document.createElement('button'); up.textContent = '↑'; up.setAttribute('aria-label', `Add a win for ${player.name}`);
    const down = document.createElement('button'); down.textContent = '↓'; down.setAttribute('aria-label', `Remove a win for ${player.name}`);
    up.disabled = !editable || wins === Number.MAX_SAFE_INTEGER; down.disabled = !editable || wins === 0;
    const adjustWins = amount => updateMatch(value => changePlayer(value, uid, id, {wins: Math.max(0, (value.players[id]?.wins || 0) + amount)}));
    up.onclick = () => adjustWins(1); down.onclick = () => adjustWins(-1);
    counter.append(up, number, down); winsSection.append(winsLabel, counter);
    const rosterSection = document.createElement('div'); rosterSection.className = 'character-stat';
    const rosterLabel = document.createElement('span'); rosterLabel.textContent = 'Roster';
    const heroes = document.createElement('ul'); heroes.className = 'favorite-heroes';
    for (const entry of Object.values(player.roster || {}).sort((a, b) => (b.priority || 0) - (a.priority || 0))) {
      const hero = heroCatalog.find(hero => hero.name === entry.hero);
      const item = document.createElement('li'); item.className = 'stats-hero'; item.title = entry.hero;
      const portrait = document.createElement('div'); portrait.className = 'stats-hero-portrait';
      if (entry.priority > 0) portrait.classList.add('has-priority');
      if (hero) {
        const image = document.createElement('img'); image.src = hero.image; image.alt = hero.name; image.loading = 'lazy'; portrait.append(image);
      } else { const label = document.createElement('span'); label.textContent = entry.hero; portrait.append(label); }
      const marker = document.createElement('span'); marker.className = 'stats-hero-priority'; marker.textContent = Array(entry.priority || 0).fill('▲').join('\n');
      marker.setAttribute('aria-label', `Priority ${entry.priority || 0}`); portrait.append(marker);
      item.append(portrait); heroes.append(item);
    }
    if (!heroes.children.length) { const empty = document.createElement('li'); empty.className = 'heroes-empty'; empty.textContent = 'No heroes selected'; heroes.append(empty); }
    rosterSection.append(rosterLabel, heroes); fields.append(winsSection, rosterSection); card.append(fields);
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
    select('Team', [['unassigned', 'Unassigned'], ['sapphire', 'Archmother'], ['amber', 'Hidden King']], player.team, 'team');
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
window.addEventListener('account:heroes-changed', async event => {
  if (!current?.players?.[uid] || current.closed) return;
  const saved = await updatePlayer(uid, {roster: profileRoster(event.detail)});
  if (!saved) $('account-status').textContent = 'Heroes saved on this device. Reconnect and save again to update the match.';
});
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
  const lobbyName = validateName($('lobby-name').value, {optional: true});
  const reference = sdk.ref(db, `matches/${createMatchCode()}`);
  const match = {...(lobbyName ? {name: lobbyName} : {}), owner: uid, slots: {'0': uid}, allowDuplicates: false, players: {[uid]: newPlayer(name, '0', window.getAccountProfile?.() || {})}};
  const created = await sdk.runTransaction(reference, value => value === null ? match : undefined, {applyLocally: false});
  if (!created.committed) throw new Error('This code is already in use. Please create the match again.');
  watch(reference.key);
});
$('match-join').onclick = () => action(async () => {
  const name = playerName();
  const code = enteredMatchId();
  if (!validId(code)) throw new Error('Paste a valid match invite link.');
  let conflict;
  const result = await sdk.runTransaction(sdk.ref(db, `matches/${code}`), value => {
    try { conflict = undefined; return joinMatch(value, uid, name, window.getAccountProfile?.() || {}); }
    catch (error) { conflict = error; return undefined; }
  }, {applyLocally: false});
  if (conflict) throw conflict;
  if (!result.committed || !result.snapshot.exists()) throw new Error('Unable to join match: match does not exist.');
  watch(code);
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
      message(connected ? 'Connected. Create a match or paste an invite link to join.' : 'Offline — showing last received match. Changes are disabled until reconnection.');
    });
    if (validId(requestedId)) watch(requestedId);
    else if (requestedId) message('Invalid match link. Create a new match.');
  } catch (error) { message(`Multiplayer could not start: ${error.message}`); }
}
initialize();
