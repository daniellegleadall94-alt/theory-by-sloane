import assert from 'node:assert/strict';
import {portfolioHealth} from '../src/portfolioHealthModel.ts';
const records=[{id:'c',kind:'campaign',name:'Launch',unitIds:['a','b'],budget:100,allocations:[{unitId:'a',amount:60},{unitId:'b',amount:40}]},{id:'t1',kind:'task',campaign:'c',unitIds:['a'],due:'2026-11-01',done:false,dependencyIds:['private'],assigneeIds:[]},{id:'t2',kind:'task',campaign:'c',unitIds:['b'],due:'2026-11-20',done:true},{id:'o',kind:'objective',campaignIds:['c'],unitIds:['a'],title:'Growth'},{id:'s',kind:'expense',financialEntry:true,title:'Spend',amount:120,currency:'GBP',stage:'Actual',date:'2026-11-01',supplier:'',channel:'',unitIds:['a','b'],spendAllocations:[{unitId:'a',campaignId:'c',amount:80},{unitId:'b',campaignId:'c',amount:40}]}];
const scoped=portfolioHealth(records,['a'],'2026-11-22')[0];assert.equal(scoped.taskCount,1);assert.equal(scoped.unresolved,1);assert.equal(scoped.overdue,1);assert.equal(scoped.unassigned,1);assert.equal(scoped.budget,60);assert.equal(scoped.totals.actual,80);assert.equal(scoped.health,'Needs attention');assert.equal(scoped.objectives.length,1);
const all=portfolioHealth(records,[],'2026-11-22')[0];assert.equal(all.taskCount,2);assert.equal(all.completed,1);assert.equal(all.totals.actual,120);
assert.equal(portfolioHealth([{id:'empty',kind:'campaign'}],[],'2026-11-22')[0].health,'No delivery records');
console.log('Portfolio health retains allocation scope, missing evidence and unresolved dependency signals.');

