import {readFile} from 'node:fs/promises';
import {before, after, beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import {ref, set, get, runTransaction, update, remove, onValue} from 'firebase/database';
import {changePlayer, newPlayer, joinMatch} from '../dist/js/match-model.mjs';
let env;
const id = 'abcdefghijklmnopqrst';
const path = `matches/${id}`;
const db = uid => env.authenticatedContext(uid).database();
const initial = () => ({owner:'alice',slots:{'0':'alice'},allowDuplicates:false,players:{alice:newPlayer('Alice')}});
before(async () => { env = await initializeTestEnvironment({projectId:'demo-deadlock-scrims', database:{host:'127.0.0.1',port:9000,rules:await readFile('database.rules.json','utf8')}}); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearDatabase(); await set(ref(db('alice'),path),initial()); await set(ref(db('bob'),path),joinMatch(initial(),'bob','Bob')); });
test('authenticated link reads, own join, denied listing and anonymous access',async () => {
 await assertSucceeds(get(ref(db('bob'),path)));
 await assertFails(get(ref(db('bob'),'matches')));
 await assertFails(get(ref(env.unauthenticatedContext().database(),path)));
 await assertFails(set(ref(db('eve'),`${path}/players/other`),newPlayer('Other')));
 await assertFails(set(ref(db('eve'),'matches/zzzzzzzzzzzzzzzzzzzz/players/eve'),newPlayer('Eve')));
});
test('own updates and owner override; no other edits, escalation or deletion',async () => {
 await assertSucceeds(update(ref(db('bob'),`${path}/players/bob`),{ready:true}));
 await assertFails(update(ref(db('bob'),`${path}/players/alice`),{ready:true}));
 await assertSucceeds(update(ref(db('alice'),`${path}/players/bob`),{team:'amber'}));
 await assertFails(set(ref(db('bob'),`${path}/owner`),'bob'));
 await assertFails(remove(ref(db('bob'),`${path}/players/alice`)));
 await assertFails(remove(ref(db('alice'),path)));
 await assertFails(update(ref(db('bob'),`${path}/players/bob`),{ready:'yes'}));
 await assertFails(update(ref(db('bob'),`${path}/players/bob`),{admin:true}));
});
test('atomic competing picks: exactly one wins; direct duplicate writes fail',async () => {
 const pick = actor => runTransaction(ref(db(actor),path),value => { try { return value ? changePlayer(value,actor,actor,{hero:'Haze'}) : value; } catch { return undefined; } },{applyLocally:false});
 const results = await Promise.allSettled([pick('alice'),pick('bob')]);
 assert.equal(results.filter(r=>r.status==='fulfilled' && r.value.committed && r.value.snapshot.val()?.claims?.Haze).length,1);
 const state=(await get(ref(db('alice'),path))).val();
 const loser=state.claims.Haze==='alice'?'bob':'alice';
 await assertFails(update(ref(db(loser),`${path}/players/${loser}`),{hero:'Haze'}));
 await assertFails(set(ref(db(loser),`${path}/claims/Haze`),loser));
});
test('cannot delete and replace another member or bypass claims via a root write',async () => {
 const state=(await get(ref(db('bob'),path))).val();
 delete state.players.alice; state.players.eve=newPlayer('Eve');
 await assertFails(set(ref(db('bob'),path),state));
 const duplicate=initial();duplicate.players.bob={...newPlayer('Bob'),hero:'Haze'};duplicate.players.alice.hero='Haze';duplicate.claims={Haze:'alice'};
 await assertFails(set(ref(db('alice'),path),duplicate));
});
test('claims cannot be deleted or reassigned while the owning player still holds the hero',async () => {
 const state=(await get(ref(db('alice'),path))).val();
 await set(ref(db('alice'),path),changePlayer(state,'alice','alice',{hero:'Haze'}));
 await assertFails(remove(ref(db('bob'),`${path}/claims`)));
 await assertFails(remove(ref(db('alice'),`${path}/claims/Haze`)));
 await assertFails(update(ref(db('bob'),path),{'players/bob/hero':'Haze','claims/Haze':'bob'}));
 const picked=(await get(ref(db('alice'),path))).val();
 await assertSucceeds(set(ref(db('alice'),path),changePlayer(picked,'alice','alice',{hero:'Abrams'})));
});
test('independent matches, duplicate mode, invalid hero and settings edits',async () => {
 const other='matches/uvwxyzabcdefghijklmn';
 const duplicate=initial();duplicate.allowDuplicates=true;
 await set(ref(db('alice'),other),duplicate);
 await set(ref(db('bob'),other),joinMatch(duplicate,'bob','Bob'));
 await assertSucceeds(update(ref(db('alice'),other),{'players/alice/hero':'Haze','players/bob/hero':'Haze'}));
 assert.equal((await get(ref(db('alice'),path))).val().players.alice.hero,'');
 await assertFails(set(ref(db('bob'),`${path}/allowDuplicates`),true));
 await assertFails(set(ref(db('bob'),`${path}/players/bob/hero`),'Fake hero'));
 await assertFails(set(ref(db('bob'),`${path}/players/bob/team`),'invalid'));
});

test('listeners receive remote changes and a fresh client restores saved selections', async () => {
 const observer=db('bob');
 let unsubscribe;
 const observed=new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('Remote update was not delivered')),5000);
   unsubscribe=onValue(ref(observer,path),snapshot=>{
     if(snapshot.val()?.players.alice.hero==='Haze') {clearTimeout(timer);resolve(snapshot.val());}
   },reject);
 });
 try {
   const state=(await get(ref(db('alice'),path))).val();
   await set(ref(db('alice'),path),changePlayer(state,'alice','alice',{hero:'Haze',team:'amber'}));
   const remote=await observed;
   assert.equal(remote.players.alice.team,'amber');
   const refreshed=env.authenticatedContext('alice').database();
   assert.equal((await get(ref(refreshed,path))).val().players.alice.hero,'Haze');
 } finally {unsubscribe?.();}
});

test('named lobbies validate names and preserve them through joins and player updates', async () => {
 const namedPath='matches/namedlobbyabcdefghij';
 const named={...initial(),name:'Friday night scrims'};
 for (const name of ['', 'x'.repeat(61), 123]) {
   await assertFails(set(ref(db('alice'),namedPath),{...named,name}));
 }
 await assertSucceeds(set(ref(db('alice'),namedPath),named));
 const joined=joinMatch(named,'bob','Bob');
 await assertSucceeds(set(ref(db('bob'),namedPath),joined));
 await assertSucceeds(set(ref(db('bob'),namedPath),changePlayer(joined,'bob','bob',{ready:true})));
 assert.equal((await get(ref(db('bob'),namedPath))).val().name,named.name);
 await assertFails(set(ref(db('bob'),`${namedPath}/name`),'Changed name'));
});
