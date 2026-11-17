import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../dist/js/theme.js',import.meta.url),'utf8');
function setup({saved=null,light=false,blocked=false}={}){
 const events={};const root={dataset:{}};const select={value:'',addEventListener:(name,fn)=>events.select=fn};
 const system={matches:light,addEventListener:(name,fn)=>events.system=fn};
 const stored=[];let ready=false;
 vm.runInNewContext(source,{
  window:{matchMedia:()=>system,addEventListener:(name,fn)=>events[name]=fn},
  document:{documentElement:root,getElementById:()=>ready?select:null,addEventListener:(name,fn)=>events[name]=fn},
  localStorage:{getItem:()=>{if(blocked)throw new Error('Blocked');return saved;},setItem:(key,value)=>{if(blocked)throw new Error('Blocked');stored.push(value);}}
 });
 return {root,select,system,events,stored,mount(){ready=true;events.DOMContentLoaded();}};
}
test('theme follows system before paint and persists an explicit selection',()=>{
 const state=setup({light:true});assert.equal(state.root.dataset.theme,'light');
 state.mount();assert.equal(state.select.value,'system');
 state.select.value='dark';state.events.select();
 assert.equal(state.root.dataset.theme,'dark');assert.deepEqual(state.stored,['dark']);
 state.system.matches=true;state.events.system();assert.equal(state.root.dataset.theme,'dark');
 state.select.value='system';state.events.select();assert.equal(state.root.dataset.theme,'light');
 state.system.matches=false;state.events.system();assert.equal(state.root.dataset.theme,'dark');
});
test('saved themes override system and changes synchronize across tabs',()=>{
 const state=setup({saved:'light',light:false});assert.equal(state.root.dataset.theme,'light');state.mount();
 state.events.storage({key:'roster-theme-v1',newValue:'dark'});assert.equal(state.select.value,'dark');
 state.system.matches=true;state.events.storage({key:'roster-theme-v1',newValue:null});
 assert.equal(state.select.value,'system');assert.equal(state.root.dataset.theme,'light');
});
test('theme remains usable when storage is unavailable or invalid',()=>{
 const state=setup({blocked:true});state.mount();state.select.value='light';state.events.select();assert.equal(state.root.dataset.theme,'light');
 assert.equal(setup({saved:'invalid',light:true}).root.dataset.theme,'light');
});
