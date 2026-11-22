import {addDays} from '../src/overview.ts';
const fail=message=>{throw Object.assign(Error(message),{status:422})};
const unitOf=r=>r.mode==='custom'?r.unit:({daily:'days',weekdays:'weeks',weekly:'weeks',monthly:'months',annually:'years'})[r.mode];
const span=(start,end)=>Math.round((Date.parse(end)-Date.parse(start))/86400000);
// Task rules are anchored to the due date; providers anchor rules to event starts.
export function taskCalendarRecurrence(data){
 const r=data.recurrence;if(!r||r.mode==='none'||data.done||data.occurrenceOf||r.paused||r.basis==='completion')return null;

 const start=data.start||data.due,days=span(start,data.due),unit=unitOf(r);
 if(days&&['weeks','months','years'].includes(unit))fail('Multi-day weekly, monthly and yearly task series cannot yet sync without changing their schedule.');
 const count=r.count? r.count-(r.completed||0):undefined;
 if(count!==undefined&&count<1)fail('This task series has no remaining scheduled occurrences.');
 const anchor=r.anchor||data.due,day=new Date(anchor+'T12:00:00Z');
 return {...r,anchor:start,startDate:start,completed:undefined,count,endDate:r.endDate?addDays(r.endDate,-days):undefined,...(['months','years'].includes(unit)?{monthDay:r.monthDay||day.getUTCDate(),...(unit==='years'?{month:r.month||day.getUTCMonth()+1}:{})}:{})};
}
export function taskRecurrenceFromCalendar(data,rule,start,due){
 if(!rule)return data.recurrence?.paused||data.recurrence?.basis==='completion'?data.recurrence:undefined;
 const days=span(start,due),unit=unitOf(rule);if(days&&['weeks','months','years'].includes(unit))fail('This multi-day recurring event cannot be imported as a task without changing its schedule.');
 if(data.occurrenceOf)fail('Completed task history cannot be changed by calendar sync.');
 const completed=data.recurrence?.completed||0;
 return {...rule,anchor:due,startDate:due,completed,count:rule.count?rule.count+completed:undefined,endDate:rule.endDate?addDays(rule.endDate,days):undefined,basis:'scheduled'};
}
