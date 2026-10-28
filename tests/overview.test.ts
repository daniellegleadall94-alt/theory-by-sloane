import assert from 'node:assert/strict';
import {moveTask,weekStart,addDays,dayDistance,workspaceStorage} from '../src/overview.ts';
import {completeTask,noRecurrence,type Task} from '../src/work.ts';

const task:Task={id:'task',title:'Launch',overviewId:'plan',horizon:'development',campaign:'campaign',discipline:'Brand Management',priority:'High',start:'2026-10-27',due:'2026-10-30',done:false,plannerAllocated:true};
const moved=moveTask(task,'2026-11-02');
assert.equal(moved.start,'2026-10-30');assert.equal(moved.due,'2026-11-02');assert.equal(moved.overviewId,'plan');assert.equal(moved.campaign,'campaign');assert.equal(moved.plannerAllocated,true);
assert.equal(task.due,'2026-10-30');
const completed=completeTask([moved],'task','2026-11-02T12:00:00Z');assert.equal(completed[0].done,true);assert.equal(completed[0].overviewId,'plan');assert.equal(completeTask(completed,'task','2026-11-03')[0].done,false);
const recurring={...task,recurrence:{...noRecurrence,mode:'weekly' as const,days:[5]}};
const next=completeTask([recurring],'task','2026-10-30T12:00:00Z');assert.equal(next[0].due,'2026-11-06');assert.equal(next[0].start,'2026-11-03');assert.equal(next[1].done,true);assert.equal(next[1].overviewId,'plan');assert.equal(next[1].start,'2026-10-27');assert.equal(next[1].occurrenceOf,'task');
const rescheduled=moveTask(recurring,'2026-11-13');assert.equal(rescheduled.recurrence?.anchor,'2026-11-13');
assert.equal(weekStart('2026-11-01'),'2026-10-26');assert.equal(weekStart('2026-10-26'),'2026-10-26');assert.equal(addDays('2028-02-28',1),'2028-02-29');assert.equal(dayDistance('2026-10-24','2026-10-26'),2);
assert.equal(workspaceStorage('guest-personal','theory.tasks.v1'),'theory.tasks.v1');assert.notEqual(workspaceStorage('u:a','theory.tasks.v1'),workspaceStorage('u:b','theory.tasks.v1'));
console.log('Overview scheduling, shared completion, recurring duration and workspace isolation checks passed');
