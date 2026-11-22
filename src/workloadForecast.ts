import {nextOccurrence,scheduledTaskOccurrence,validTaskDate,type Task} from './work.ts';
export type ForecastTask=Task&{forecastOf?:string};
/** Planning projections only. Never persist these as task records or completion history. */
export function forecastRecurringWork(tasks:Task[],until:string){
 const result:ForecastTask[]=[...tasks];let completionBased=0,limited=false,steps=0;
 for(const task of tasks){
  const r=task.recurrence;
  if(task.done||task.archived||task.occurrenceOf||!r||r.mode==='none'||r.paused||!validTaskDate(task.due))continue;
  if(r.basis==='completion'){completionBased++;continue;}
  let recurrence={...r,anchor:r.anchor||task.scheduledDue||task.due},due=task.scheduledDue||task.due;
  while(due<=until){
   if(++steps>10000){limited=true;break;}
   const next=nextOccurrence(due,recurrence);if(!next||next<=due||next>until)break;
   recurrence={...recurrence,completed:(recurrence.completed||0)+1};due=next;
   if(task.recurrenceOverrides?.[due]?.cancelled)continue;
   result.push({...scheduledTaskOccurrence(task,due),id:task.id+':forecast:'+due,forecastOf:task.id,plannedDate:undefined,scheduledDue:undefined,done:false,status:'To do',actualHours:undefined,completedAt:undefined,recurrence,seriesDefaults:undefined});
  }
  if(limited)break;
 }
 return {tasks:result,completionBased,limited};
}
