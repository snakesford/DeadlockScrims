import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

class Element {
  children=[];
  style={setProperty(){}};
  classList={add(){},remove(){}};
  lastChild={};
  add(option){this.children.push(option);}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  setAttribute(){}
  querySelector(){return this.body ||= new Element();}
  closest(){return this.parent ||= new Element();}
  close(){this.open=false;}
}

test('multiplayer sync works with the roster script in a separate scope', () => {
  const elements=new Map();
  const element=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  const listeners=new Map();
  const context=vm.createContext({
    document:{querySelector:element,getElementById:id=>element('#'+id),createElement:()=>new Element(),querySelectorAll:()=>[]},
    window:{addEventListener:(name,fn)=>listeners.set(name,fn),dispatchEvent:event=>listeners.get(event.type)?.(event)},
    CustomEvent:class {constructor(type,{detail}){this.type=type;this.detail=detail;}},
    localStorage:{getItem:()=>JSON.stringify([{id:'local',name:'Local player',tier:'high'}])},
    URL,location:{href:'https://example.test/'},heroCatalog:[],
    Option:class {},
  });
  const root=new URL('../dist/js/',import.meta.url);
  vm.runInContext(`(()=>{${readFileSync(new URL('app.js',root),'utf8')}\n})()`,context);
  assert.equal(vm.runInContext('typeof setSharedRoster',context),'undefined');
  const multiplayer=readFileSync(new URL('multiplayer.js',root),'utf8').replace(/^import .*;\n/,'').replace(/initialize\(\);\s*$/,'');
  vm.runInContext(multiplayer,context);
  for (const value of ['', 'not a link', 'https://example.test/?match=../bad', 'javascript:alert(1)']) {
    element('#match-invite').value=value;
    assert.equal(vm.runInContext('enteredMatchId()',context),null);
  }
  element('#match-invite').value=' https://example.test/?match=ABCDEFGHJKLMNPQRST234#match ';
  assert.equal(vm.runInContext('enteredMatchId()',context),'ABCDEFGHJKLMNPQRST234');
  element('#match-invite').value='';
  // Rendering before authentication must also work.
  vm.runInContext('renderMatch()',context);
  assert.equal(element('#total').textContent,1);
  vm.runInContext(`current={owner:'host',players:{}}; renderMatch()`,context);
  assert.equal(element('#total').textContent,0);
  assert.equal(element('#add-form').closest().hidden,true);
  // Exercise the same event with a remote roster update.
  vm.runInContext(`window.dispatchEvent(new CustomEvent('roster:sync',{detail:{players:[{id:'guest',name:'Guest',tier:'unsorted'}],connected:true,canEdit:()=>false}}))`,context);
  assert.equal(element('#total').textContent,1);
  const unsorted=element('#board').children.find(section=>section.className==='tier-row unsorted');
  assert.equal(unsorted.body.children[0].children[0].textContent,'Guest');
  vm.runInContext("uid='host'; connected=true; current={owner:'host',players:{}}; renderMatch()",context);
  assert.equal(element('#match-close').hidden,false);
  assert.equal(element('#match-leave').hidden,true);
  assert.equal(element('#match-close').disabled,false);
  vm.runInContext("current.players={guest:{name:'Guest',tier:'mid',hero:'',team:'unassigned',ready:false,wins:3,roster:{'0':{hero:'Haze',priority:2}}}}; renderMatch()",context);
  const fields=element('#match-players').children[0].children[1];
  assert.equal(fields.className,'player-stat-fields');
  assert.equal(fields.children[0].children[1].children[1].textContent,3);
  const heroes=fields.children[1].children[1];
  assert.equal(heroes.children[0].title,'Haze');
  assert.equal(heroes.children[0].children.length,1);
  assert.equal(heroes.children[0].children[0].children.at(-1).textContent,'▲\n▲');
  let rank=element('#match-players').children[0].children[0].children[1];
  assert.equal(rank.value,'mid');
  assert.equal(element('#match-counts').children[0].children[1].textContent,1);
  assert.equal(element('#match-counts').children[2].children[1].textContent,1);
  assert.equal(rank.disabled,false);
  vm.runInContext("updatePlayer=(id,patch)=>{current.players[id]={...current.players[id],...patch};renderMatch();}",context);
  rank.value='high'; rank.onchange();
  rank=element('#match-players').children[0].children[0].children[1];
  assert.equal(rank.value,'high');
  assert.equal(element('#match-counts').children[1].children[1].textContent,1);
  assert.equal(element('#match-counts').children[2].children[1].textContent,0);
  const high=element('#board').children.find(section=>section.className==='tier-row high');
  assert.equal(high.body.children[0].children[0].textContent,'Guest');
  vm.runInContext("uid='guest'; renderMatch()",context);
  assert.equal(element('#match-create').disabled,true);
  assert.equal(element('#lobby-name').disabled,true);
  rank=element('#match-players').children[0].children[0].children[1];
  assert.equal(rank.textContent,'High');
  assert.equal(element('#match-leave').hidden,false);
  assert.equal(element('#match-leave').disabled,false);
  assert.equal(rank.onchange,undefined);
  assert.equal(element('#match-close').hidden,true);
  vm.runInContext("current.closed=true; renderMatch()",context);
  assert.equal(element('#match-create').disabled,false);
  assert.equal(element('#lobby-name').disabled,false);
  assert.equal(element('#match-close').hidden,true);
  assert.equal(element('#match-join').disabled,true);
  assert.equal(element('#match-share').hidden,true);
  assert.equal(element('#match-leave').hidden,true);
  assert.match(element('#match-status').textContent,/Match closed/);
  assert.equal(element('#add-form').closest().hidden,false);
  vm.runInContext('current=null; renderMatch()',context);
  vm.runInContext('matchLoading=true; controls()',context);
  assert.equal(element('#match-create').disabled,true);
  vm.runInContext('matchLoading=false; controls()',context);
  assert.equal(element('#match-create').disabled,false);
  assert.equal(element('#add-form').closest().hidden,false);
  assert.equal(element('#total').textContent,1);
});

test('Skill Levels requires membership and redirects after leaving or closing', () => {
 const elements=new Map();
 const element=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
 const listeners=new Map();
 const location={href:'https://example.test/#skills',hash:'#skills'};
 const context=vm.createContext({
   document:{querySelector:element,querySelectorAll:()=>[]},
   localStorage:{getItem:()=>null},URL,location,
   history:{replaceState:(state,title,url)=>{location.href=String(url);location.hash=new URL(url).hash;}},
   window:{addEventListener:(name,fn)=>listeners.set(name,fn)},
 });
 vm.runInContext(readFileSync(new URL('../dist/js/navigation.js',import.meta.url),'utf8'),context);
 assert.equal(element('[data-page="skills"]').hidden,true);
 assert.equal(element('#match-page').hidden,false);
 assert.equal(location.hash,'#match');
 listeners.get('roster:sync')({detail:{joined:false}});
 assert.equal(element('[data-page="skills"]').hidden,true);
 listeners.get('roster:sync')({detail:{joined:true}});
 assert.equal(element('[data-page="skills"]').hidden,false);
 location.hash='#skills';listeners.get('hashchange')();
 assert.equal(element('#skills-page').hidden,false);
 listeners.get('roster:sync')({detail:{joined:false}});
 assert.equal(element('#skills-page').hidden,true);
 assert.equal(element('#match-page').hidden,false);
 listeners.get('roster:sync')({detail:{joined:true}});
 location.hash='#skills';listeners.get('hashchange')();
 listeners.get('roster:sync')({detail:null});
 assert.equal(element('[data-page="skills"]').hidden,true);
 assert.equal(element('#match-page').hidden,false);
});
