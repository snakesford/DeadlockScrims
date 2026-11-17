import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../dist/js/account.js',import.meta.url),'utf8');
function load(storage){
 const nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',children:[],append(...children){this.children.push(...children);},replaceChildren(){this.children=[];},setCustomValidity(){},reportValidity(){}});return nodes.get(id);};
 const events=[];
 const context=vm.createContext({document:{querySelector:node,createElement:()=>node(Symbol())},localStorage:{getItem:()=>storage.value||null,setItem:(key,value)=>storage.value=value},structuredClone,heroCatalog:[{name:'Haze',image:'haze.png'}],window:{dispatchEvent:event=>events.push(event)},CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}},editHeroes:(person,save)=>save(['Haze'],{Haze:2})});
 vm.runInContext(source,context);return {node,context,events};
}
test('account name and hero preferences save and restore without changing the roster',()=>{
 const storage={};const first=load(storage);
 first.node('#account-name').value='  Alice  ';
 first.node('#account-form').onsubmit({preventDefault(){}});
 assert.equal(first.node('#match-name').value,'Alice');
 assert.equal(first.events[0].detail.name,'Alice');
 first.node('#account-select-heroes').onclick();
 const saved=JSON.parse(storage.value);
 assert.deepEqual(saved,{name:'Alice',favoriteHeroes:['Haze'],favoriteHeroPriorities:{Haze:2}});
 const restored=load(storage);vm.runInContext('renderAccount()',restored.context);
 assert.equal(restored.node('#match-name').value,'Alice');
 assert.equal(restored.node('#account-name').value,'Alice');
 assert.equal(restored.node('#account-heroes').children[0].children[1].textContent,'Haze');
 assert.equal(restored.node('#account-heroes').children[0].children[2].textContent,'High priority');
});
