export function changePlayer(match, actor, target, patch) {
  if (!match || !match.players?.[actor]) throw new Error('Join the match first.');
  if (actor !== target && actor !== match.owner) throw new Error('Only the match administrator can edit another player.');
  if (!match.players[target]) throw new Error('Player not found.');
  const next = structuredClone(match);
  const player = next.players[target];
  for (const field of Object.keys(patch)) {
    if (!['name', 'hero', 'team', 'ready'].includes(field)) throw new Error('Invalid player field.');
  }
  Object.assign(player, patch);
  if ('hero' in patch && patch.hero !== match.players[target].hero) player.ready = false;
  next.claims = {};
  for (const [uid, entry] of Object.entries(next.players)) {
    if (!entry.hero || next.allowDuplicates) continue;
    if (next.claims[entry.hero]) throw new Error('That hero was just selected by another player. Choose another hero.');
    next.claims[entry.hero] = uid;
  }
  return next;
}
export function newPlayer(name, slot = '0') {
  return {slot, name: name.trim(), hero: '', team: 'unassigned', ready: false};
}

export function joinMatch(match, uid, name) {
  if (!match) return match;
  if (match.players?.[uid]) return match;
  const slot = Array.from({length: 12}, (_, i) => String(i)).find(i => !match.slots?.[i]);
  if (slot === undefined) throw new Error('This match is full (12 players).');
  const next = structuredClone(match);
  next.slots[slot] = uid;
  next.players[uid] = newPlayer(name, slot);
  return next;
}

export function bootPlayer(match, actor, target) {
  if (!match || actor !== match.owner) throw new Error('Only the host can boot players.');
  if (target === match.owner) throw new Error('The host cannot be booted.');
  if (!match.players?.[target]) throw new Error('Player not found.');
  const next = structuredClone(match);
  delete next.slots[next.players[target].slot];
  delete next.players[target];
  for (const [hero, uid] of Object.entries(next.claims || {})) {
    if (uid === target) delete next.claims[hero];
  }
  return next;
}
