import assert from 'node:assert/strict';
import {nextOccurrence,noRecurrence,completeTask,reminderInstant,type Task} from '../src/work.ts';
import {palettes,defaultTheme,validateTheme,readability,onColour,contrastRatio} from '../src/theme.ts';
const r=(extra:object)=>({...noRecurrence,...extra});
assert.equal(nextOccurrence('2026-02-31',r({mode:'daily'})),null);
assert.equal(nextOccurrence('2026-10-30',r({mode:'weekdays'})),'2026-11-02');
assert.equal(nextOccurrence('2026-10-26',r({mode:'weekly',days:[1,3,5]})),'2026-10-28');
assert.equal(nextOccurrence('2026-10-28',r({mode:'weekly',days:[1,3,5]})),'2026-10-30');
assert.equal(nextOccurrence('2026-10-28',r({mode:'custom',interval:3,unit:'days'})),'2026-10-31');
assert.equal(nextOccurrence('2026-10-22',r({mode:'weekly',interval:2,days:[4],anchor:'2026-10-22'})),'2026-11-05');
assert.equal(nextOccurrence('2026-10-05',r({mode:'monthly',monthlyPattern:'weekday',ordinal:1,weekday:1})),'2026-11-02');
assert.equal(nextOccurrence('2026-10-30',r({mode:'monthly',monthlyPattern:'weekday',ordinal:-1,weekday:5})),'2026-11-27');
assert.equal(nextOccurrence('2028-02-29',r({mode:'annually',month:2,monthDay:29,anchor:'2028-02-29'})),'2029-02-28');
assert.equal(nextOccurrence('2026-10-28',r({mode:'daily',count:1})),null);
assert.equal(nextOccurrence('2026-10-28',r({mode:'daily',endDate:'2026-10-28'})),null);
assert.equal(nextOccurrence('2026-10-28',r({mode:'daily',paused:true})),null);
assert.equal(reminderInstant('2026-10-24T09:00','Europe/London'),'2026-10-24T08:00:00.000Z');
assert.equal(reminderInstant('2026-10-26T09:00','Europe/London'),'2026-10-26T09:00:00.000Z');
assert.throws(()=>reminderInstant('2027-03-28T01:30','Europe/London'),/does not exist/);
const task:Task={id:'series',title:'Review',campaign:'campaign',discipline:'SEO',due:'2026-10-24',priority:'Medium',done:false,unitIds:['brand-one','brand-two'],plannedDate:'2026-10-23',reminderAt:'2026-10-24T08:00:00.000Z',reminderTimeZone:'Europe/London',recurrence:r({mode:'daily',basis:'completion',timeZone:'Europe/London'}),checklist:[{id:'step',title:'Check',done:true}]};
const completed=completeTask([task],task.id,'2026-10-26T12:00:00Z');
assert.equal(completed[0].due,'2026-10-27');assert.equal(completed[0].plannedDate,undefined);assert.equal(completed[0].checklist?.[0].done,false);assert.deepEqual(completed[0].unitIds,task.unitIds);assert.equal(completed[1].due,task.due);assert.equal(completed[1].plannedDate,task.plannedDate);assert.equal(completed[0].reminderAt,'2026-10-27T09:00:00.000Z');
for(const preset of Object.keys(palettes) as (keyof typeof palettes)[])for(const contrast of ['soft','balanced','strong'] as const){const t={...defaultTheme,preset,contrast};assert.ok(readability(t).every(c=>c.ratio>=4.5),JSON.stringify(t));assert.deepEqual(validateTheme(t),t)}
assert.ok(contrastRatio(onColour('#C9822B'),'#C9822B')>=4.5);
assert.throws(()=>validateTheme({...defaultTheme,primary:'javascript:bad'}));
assert.throws(()=>validateTheme({...defaultTheme,primary:'#777777'}),/readability/);
const rescheduled=completeTask([{...task,due:'2026-11-02',scheduledDue:'2026-10-31',recurrence:r({mode:'monthly',anchor:'2026-10-31'}),seriesDefaults:{title:'Series title',unitIds:['original-brand']}}],task.id,'2026-11-02T12:00:00Z');
assert.equal(rescheduled[0].due,'2026-11-30');assert.equal(rescheduled[0].title,'Series title');assert.deepEqual(rescheduled[0].unitIds,['original-brand']);assert.deepEqual(rescheduled[1].unitIds,task.unitIds);
const paused=completeTask([{...task,recurrence:r({mode:'daily',paused:true})}],task.id,'2026-10-24T12:00:00Z');assert.equal(paused[1].occurrenceOf,task.id);assert.equal(paused[0].recurrence?.paused,true);
const ended=completeTask([{...task,recurrence:r({mode:'daily',count:1})}],task.id,'2026-10-24T12:00:00Z');assert.equal(ended[0].occurrenceOf,task.id);assert.deepEqual(completeTask(ended,task.id,'2026-10-25T12:00:00Z'),ended);
console.log('Advanced recurrence, DST, completion history and theme readability checks passed');

assert.equal(nextOccurrence('2026-11-22',r({mode:'daily',interval:3})),'2026-11-25');
assert.equal(nextOccurrence('2026-01-31',r({mode:'monthly',interval:2})),'2026-03-31');
assert.equal(nextOccurrence('2028-02-29',r({mode:'annually',interval:4})),'2032-02-29');
const resized:Task={...task,start:'2026-11-01',due:'2026-11-05',scheduledDue:'2026-10-31',calendarTime:{start:'15:00',end:'16:00',timeZone:'Europe/London'},recurrence:r({mode:'monthly',anchor:'2026-10-31'}),seriesDefaults:{start:'2026-10-30',due:'2026-10-31',calendarTime:null}};
const resizedNext=completeTask([resized],resized.id,'2026-11-05T18:00:00Z');
assert.equal(resizedNext[0].start,'2026-11-29');assert.equal(resizedNext[0].due,'2026-11-30');assert.equal(resizedNext[0].calendarTime,null);
assert.equal(resizedNext[1].start,'2026-11-01');assert.equal(resizedNext[1].calendarTime?.start,'15:00');

const future:Task={...task,due:'2026-12-01',recurrence:r({mode:'daily',count:4}),recurrenceOverrides:{'2026-12-02':{cancelled:true},'2026-12-03':{title:'One future change',due:'2026-12-05',start:'2026-12-05'}}};
const nextFuture=completeTask([future],future.id,'2026-12-01T12:00:00Z');assert.equal(nextFuture[0].due,'2026-12-05');assert.equal(nextFuture[0].scheduledDue,'2026-12-03');assert.equal(nextFuture[0].recurrence?.completed,2);assert.equal(nextFuture[0].title,'One future change');
const afterFuture=completeTask(nextFuture,future.id,'2026-12-05T12:00:00Z');assert.equal(afterFuture[0].due,'2026-12-04');assert.equal(afterFuture[0].title,task.title);assert.equal(afterFuture[0].recurrence?.completed,3);

const movedMonth={...task,due:'2027-02-03',scheduledDue:'2027-01-31',recurrence:r({mode:'monthly'}),seriesDefaults:{due:'2027-01-31',start:''}};
assert.equal(completeTask([movedMonth],task.id,'2027-02-03T12:00:00Z')[0].due,'2027-02-28');
