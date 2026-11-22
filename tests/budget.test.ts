import assert from 'node:assert/strict';
import {validSpend,spendTotals,type SpendEntry} from '../src/budgetModel.ts';
const entry:SpendEntry={id:'expense',financialEntry:true,title:'Shared artwork',amount:100,currency:'GBP',stage:'Committed',date:'2026-11-21',supplier:'Studio',channel:'Design',unitIds:['a','b'],spendAllocations:[{unitId:'a',campaignId:'one',amount:60},{unitId:'b',campaignId:'two',amount:40}]};
assert.ok(validSpend(entry));assert.equal(spendTotals([entry]).forecast,100);assert.equal(spendTotals([entry],['a']).forecast,60);assert.equal(spendTotals([entry],[],'two').forecast,40);
const paid={...entry,stage:'Actual'} as SpendEntry;assert.deepEqual(spendTotals([paid]),{planned:0,committed:0,actual:100,forecast:100});
assert.equal(spendTotals([{...entry,archived:true}]).forecast,0);
for(const change of [{amount:99},{amount:NaN},{amount:100.001},{date:'2026-02-30'},{currency:'USD'},{spendAllocations:[entry.spendAllocations[0],entry.spendAllocations[0]]},{unitIds:['a']}])assert.equal(validSpend({...entry,...change}),false);
console.log('Expenditure splits, company filters, campaign totals and stage transitions passed.');
