import assert from 'node:assert/strict';
import {dependencyCycle,blockers,dependencyWarnings,weeklyWorkload,rangeWorkload,parentCycle,completionCycle,rescheduleDependencies,defaultCapacity} from '../src/workManagement.ts';
import type {Task} from '../src/work.ts';
const task=(id:string,patch:Partial<Task>={}):Task=>({id,title:id,due:'2026-10-30',done:false,priority:'Medium',discipline:'Marketing',campaign:'',accountableOwnerId:'alex',...patch});
const a=task('a'),b=task('b',{dependencyIds:['a'],start:'2026-10-28'}),c=task('c',{dependencyIds:['b']});
assert.equal(dependencyCycle([a,b,c],{...a,dependencyIds:['c']}),true);
assert.equal(dependencyCycle([a,b,c],{...c,dependencyIds:['a']}),false);
assert.deepEqual(blockers(b,[a,b]),['a']);assert.deepEqual(blockers(b,[{...a,done:true},b]),[]);
assert.deepEqual(blockers(b,[{...a,done:true,skipped:true},b]),['a']);
assert.deepEqual(blockers(b,[b]),['a']);assert.equal(dependencyWarnings(b,[a,b]).length,1);
const tasks=[task('span',{start:'2026-10-26',due:'2026-11-06',effortHours:20}),task('planned',{plannedDate:'2026-10-27',due:'2026-12-01',effortHours:4}),task('unknown',{plannedDate:'2026-10-28'}),task('unscheduled',{due:''}),task('colleague',{effortHours:100,accountableOwnerId:'bea'}),task('complete',{done:true,effortHours:100}),task('archived',{archived:true,effortHours:100})];
const load=weeklyWorkload(tasks,'alex','2026-10-26',{...defaultCapacity,daysOff:['2026-10-27']});
assert.equal(load.hours,14);assert.equal(load.capacity,30);assert.equal(load.unestimated,1);assert.equal(load.unscheduled,1);
assert.equal(load.entries.length,3);assert.equal(weeklyWorkload(tasks,'alex','2026-11-02',defaultCapacity).hours,10);
assert.equal(weeklyWorkload([task('huge',{start:'0001-01-01',due:'9999-12-31',effortHours:10000})],'alex','2026-10-26',defaultCapacity).entries.length,1);
assert.equal(weeklyWorkload(tasks,'alex','2026-10-26',{weeklyHours:0,workingDays:[],daysOff:[]}).capacity,0);
console.log('Dependency graphs and workload allocation passed.');

assert.equal(parentCycle([task('parent'),task('child',{parentTaskId:'parent'})],task('parent',{parentTaskId:'child'})),true);
const november=rangeWorkload([task('work',{plannedDate:'2026-11-02',effortHours:55})],'alex','2026-11-01','2026-11-30',defaultCapacity);
assert.equal(november.hours,55);assert.equal(november.capacity,157.5);
const overloaded=weeklyWorkload([task('work',{plannedDate:'2026-11-02',effortHours:55})],'alex','2026-11-02',defaultCapacity);assert.ok(overloaded.hours>overloaded.capacity);
const cascade=rescheduleDependencies([task('brief',{start:'2026-11-01',due:'2026-11-02'}),task('art',{start:'2026-11-03',due:'2026-11-04',plannedDate:'2026-11-03',publicationDate:'2026-11-05',dependencyIds:['brief']})],'brief','2026-11-05');
assert.equal(cascade[1].after.due,'2026-11-07');assert.equal(cascade[1].after.plannedDate,'2026-11-03');assert.equal(cascade[1].after.publicationDate,'2026-11-05');

assert.equal(completionCycle([task('parent'),task('child',{parentTaskId:'parent'})],task('child',{parentTaskId:'parent',dependencyIds:['parent']})),true);
