export function changePlayer(match, actor, target, patch) {
  if (!match || !match.players?.[actor]) throw new Error('Join the match first.');
  if (match.closed) throw new Error('This match is closed.');
  if (actor !== target && actor !== match.owner) throw new Error('Only the match administrator can edit another player.');
  if (!match.players[target]) throw new Error('Player not found.');
  const next = structuredClone(match);
  const player = next.players[target];
  for (const field of Object.keys(patch)) {
    if (!['name', 'hero', 'team', 'ready', 'tier'].includes(field)) throw new Error('Invalid player field.');
  }
  if ('tier' in patch && !['unsorted', 'high', 'mid', 'newer'].includes(patch.tier)) throw new Error('Invalid skill level.');
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
  return {slot, name: name.trim(), hero: '', team: 'unassigned', ready: false, tier: 'unsorted'};
}

export function joinMatch(match, uid, name) {
  if (!match) return match;
  if (match.closed) throw new Error('This match is closed.');
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
  if (match.closed) throw new Error('This match is closed.');
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

export function closeMatch(match, actor) {
  if (!match || actor !== match.owner) throw new Error('Only the host can close the match.');
  if (match.closed) throw new Error('This match is already closed.');
  return {...structuredClone(match), closed: true};
}

export function leaveMatch(match, actor) {
  if (!match?.players?.[actor]) throw new Error('Join the match first.');
  if (match.closed) throw new Error('This match is closed.');
  const next = structuredClone(match);
  delete next.slots[next.players[actor].slot];
  delete next.players[actor];
  for (const [hero, uid] of Object.entries(next.claims || {})) {
    if (uid === actor) delete next.claims[hero];
  }
  if (actor === next.owner) {
    const remaining = Object.keys(next.players).sort((a, b) => Number(next.players[a].slot) - Number(next.players[b].slot));
    if (remaining.length) next.owner = remaining[0];
    else next.closed = true;
  }
  return next;
}
