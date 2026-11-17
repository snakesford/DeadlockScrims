import {test} from 'node:test';
import assert from 'node:assert/strict';
import {changePlayer, newPlayer, joinMatch, bootPlayer, closeMatch, leaveMatch} from '../dist/js/match-model.mjs';
const fixture = () => ({owner: 'a', allowDuplicates: false, players: {a: newPlayer('Alice'), b: newPlayer('Bob')}});
test('claims survive unrelated updates and reject a racing duplicate pick', () => {
  const first = changePlayer(fixture(), 'a', 'a', {hero: 'Abrams'});
  assert.throws(() => changePlayer(first, 'b', 'b', {hero: 'Abrams'}), /another player/);
  const second = changePlayer(first, 'b', 'b', {team: 'amber', ready: true});
  assert.equal(second.players.a.hero, 'Abrams');
  assert.equal(second.claims.Abrams, 'a');
});
test('switch releases previous hero, resets ready, and leaves input untouched', () => {
  const first = changePlayer(fixture(), 'a', 'a', {hero: 'Abrams', ready: true});
  const next = changePlayer(first, 'a', 'a', {hero: 'Haze'});
  assert.equal(next.claims.Abrams, undefined);
  assert.equal(next.claims.Haze, 'a');
  assert.equal(next.players.a.ready, false);
  assert.equal(first.players.a.hero, 'Abrams');
});
test('only administrator can edit another player; duplicate mode is supported', () => {
  assert.throws(() => changePlayer(fixture(), 'b', 'a', {ready: true}), /administrator/);
  assert.equal(changePlayer(fixture(), 'a', 'b', {ready: true}).players.b.ready, true);
  const state = fixture(); state.allowDuplicates = true;
  const result = changePlayer(changePlayer(state, 'a', 'a', {hero: 'Haze'}), 'b', 'b', {hero: 'Haze'});
  assert.equal(result.players.b.hero, 'Haze');
});

test('joining is idempotent, allocates independent slots, and rejects full matches', () => {
  let state={owner:'a', allowDuplicates:false, slots:{'0':'a'}, players:{a:newPlayer('Alice')}};
  state=joinMatch(state,'b','Bob');
  assert.equal(state.players.b.slot,'1');
  assert.deepEqual(joinMatch(state,'b','New name'),state);
  for(let i=2;i<12;i++)state=joinMatch(state,'user'+i,'Player '+i);
  assert.throws(()=>joinMatch(state,'extra','Extra'),/full/);
});

test('booting releases the slot and hero, preserves other players, and permits rejoining', () => {
 const initial={owner:'a',allowDuplicates:false,slots:{'0':'a'},players:{a:newPlayer('Alice')}};
 const joined=joinMatch(initial,'b','Bob');
 const picked=changePlayer(joined,'b','b',{hero:'Haze',ready:true});
 assert.throws(()=>bootPlayer(picked,'b','a'),/host/);
 assert.throws(()=>bootPlayer(picked,'a','a'),/host/);
 const booted=bootPlayer(picked,'a','b');
 assert.equal(booted.players.b,undefined);
 assert.equal(booted.slots['1'],undefined);
 assert.equal(booted.claims.Haze,undefined);
 assert.deepEqual(booted.players.a,picked.players.a);
 assert.equal(picked.players.b.hero,'Haze');
 assert.throws(()=>changePlayer(booted,'b','b',{ready:true}),/Join/);
 const rejoined=joinMatch(booted,'b','Bob');
 assert.deepEqual(rejoined.players.b,newPlayer('Bob','1'));
});

test('skill levels start unsorted and respect player editing permissions', () => {
 const state=fixture();
 assert.equal(state.players.a.tier,'unsorted');
 const changed=changePlayer(state,'a','b',{tier:'high'});
 assert.equal(changed.players.b.tier,'high');
 assert.equal(state.players.b.tier,'unsorted');
 assert.equal(changePlayer(changed,'b','b',{tier:'mid'}).players.b.tier,'mid');
 assert.throws(()=>changePlayer(state,'b','a',{tier:'high'}),/administrator/);
 assert.throws(()=>changePlayer(state,'a','b',{tier:'expert'}),/Invalid skill/);
});

test('only host can close a match and closed matches reject joins and edits', () => {
 const state=fixture();
 assert.throws(()=>closeMatch(state,'b'),/host/);
 const closed=closeMatch(state,'a');
 assert.equal(closed.closed,true);
 assert.equal(state.closed,undefined);
 assert.throws(()=>joinMatch(closed,'c','Charlie'),/closed/);
 assert.throws(()=>joinMatch(closed,'b','Bob'),/closed/);
 assert.throws(()=>changePlayer(closed,'a','a',{tier:'high'}),/closed/);
 assert.throws(()=>bootPlayer(closed,'a','b'),/closed/);
});

test('leaving frees claims, allows rejoining, transfers host, and closes an empty lobby', () => {
 let state={owner:'a',allowDuplicates:false,slots:{'0':'a'},players:{a:newPlayer('Alice')}};
 state=joinMatch(state,'b','Bob');
 state=changePlayer(state,'b','b',{hero:'Haze'});
 const left=leaveMatch(state,'b');
 assert.equal(left.players.b,undefined);
 assert.equal(left.claims.Haze,undefined);
 assert.equal(left.slots['1'],undefined);
 assert.equal(joinMatch(left,'b','Bob').players.b.slot,'1');
 const transferred=leaveMatch(state,'a');
 assert.equal(transferred.owner,'b');
 assert.equal(transferred.players.a,undefined);
 const empty=leaveMatch(transferred,'b');
 assert.equal(empty.closed,true);
 assert.deepEqual(empty.players,{});
 assert.throws(()=>leaveMatch(state,'outsider'),/Join/);
});
