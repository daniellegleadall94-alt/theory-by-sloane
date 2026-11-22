import assert from 'node:assert/strict';
import {forecastRecurringWork} from '../src/workloadForecast.ts';
import {rangeWorkload,defaultCapacity} from '../src/workManagement.ts';
import type {Task} from '../src/work.ts';
const task:Task={id:'routine',title:'Routine',due:'2026-11-02',done:false,priority:'Medium',discipline:'Email',campaign:'',accountableOwnerId:'alex',effortHours:2,plannedDate:'2026-11-03',recurrence:{mode:'daily',unit:'days',interval:1,days:[],count:3}};
const original=JSON.stringify(task),forecast=forecastRecurringWork([task],'2026-11-30');
assert.equal(forecast.tasks.length,3);assert.equal(JSON.stringify(task),original);assert.equal(forecast.tasks[1].due,'2026-11-03');assert.equal(forecast.tasks[1].plannedDate,undefined);assert.equal(forecast.tasks[1].forecastOf,task.id);
assert.equal(rangeWorkload(forecast.tasks,'alex','2026-11-02','2026-11-08',defaultCapacity).hours,6);
assert.equal(forecastRecurringWork([{...task,recurrence:{...task.recurrence!,completed:2}}],'2026-11-30').tasks.length,1);
assert.equal(forecastRecurringWork([{...task,recurrence:{...task.recurrence!,basis:'completion'}}],'2026-11-30').completionBased,1);
assert.equal(forecastRecurringWork([{...task,recurrence:{...task.recurrence!,paused:true}}],'2026-11-30').tasks.length,1);
const monthly=forecastRecurringWork([{...task,due:'2026-01-31',recurrence:{...task.recurrence!,mode:'monthly',unit:'months'}}],'2026-03-31');assert.deepEqual(monthly.tasks.map(t=>t.due),['2026-01-31','2026-02-28','2026-03-31']);
assert.equal(forecastRecurringWork([{...task,seriesDefaults:{effortHours:5,accountableOwnerId:'bea'}}],'2026-11-04').tasks[1].effortHours,5);
console.log('Read-only recurrence forecasts respect counts, month ends, paused/completion-based rules and future defaults.');

const oneOff={...task,start:'2026-11-01',due:'2026-11-04',scheduledDue:'2026-11-02',seriesDefaults:{start:'2026-11-02',due:'2026-11-02',calendarTime:null}};
const restored=forecastRecurringWork([oneOff],'2026-11-30').tasks;
assert.equal(restored[1].due,'2026-11-03');assert.equal(restored[1].start,'2026-11-03');assert.equal(restored[1].calendarTime,null);

const exceptions=forecastRecurringWork([{...task,recurrence:{...task.recurrence!,count:4},recurrenceOverrides:{'2026-11-03':{cancelled:true},'2026-11-04':{title:'Moved forecast',start:'2026-11-06',due:'2026-11-06'}}}],'2026-11-30').tasks;
assert.deepEqual(exceptions.map(t=>t.due),['2026-11-02','2026-11-06','2026-11-05']);assert.equal(exceptions[1].title,'Moved forecast');
