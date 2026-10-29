import assert from 'node:assert/strict';
import {defaultMenu,menuCatalog,moveMenu,readMenu,validMenu} from '../src/navigationModel.ts';

const defaults=defaultMenu();
assert.equal(defaults.filter(item=>item.visible).length,7);
const migrated=readMenu('',JSON.stringify(['My Calendar','My Calendar','unknown']));
assert.equal(migrated[0].id,'My Calendar');
assert.equal(migrated[0].visible,true);
assert.equal(new Set(migrated.map(item=>item.id)).size,menuCatalog.length);
const hidden=defaults.map(item=>({...item,visible:false}));
assert.equal(validMenu(hidden),true);
assert.deepEqual(readMenu(JSON.stringify(hidden)),hidden);
const reordered=moveMenu(defaults,'Budget & Resources','My Dashboard');
assert.equal(reordered[0].id,'Budget & Resources');
assert.equal(validMenu(reordered),true);
assert.equal(reordered[0].visible,false); // Reordering must not change visibility.
assert.equal(defaults[0].id,'My Dashboard'); // Drafts must not mutate saved layouts.
assert.deepEqual(moveMenu(reordered,'Budget & Resources','Files & Knowledge').at(-1),reordered[0]);
assert.deepEqual(moveMenu(defaults,'missing','My Dashboard'),defaults);
assert.equal(validMenu([...defaults.slice(1),defaults[1]]),false);
assert.equal(validMenu([{id:'Settings',visible:false},...defaults.slice(1)]),false);
assert.deepEqual(readMenu('invalid'),defaults);
console.log('Primary menu defaults, migration, visibility and reorder checks passed.');
