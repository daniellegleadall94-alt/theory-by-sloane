import type {Task} from './work.ts';
import {validTaskDate} from './work.ts';

// Finish-to-start links never move dates implicitly. Each workspace has its own graph.
export function dependencyCycle(tasks:Task[],candidate:Task):boolean{
 const graph=new Map(tasks.map(t=>[t.id,t.dependencyIds||[]]));graph.set(candidate.id,candidate.dependencyIds||[]);
 const active=new Set<string>(),visited=new Set<string>();
 const visit=(id:string):boolean=>{if(active.has(id))return true;if(visited.has(id))return false;active.add(id);for(const parent of graph.get(id)||[])if(visit(parent))return true;active.delete(id);visited.add(id);return false};
 return visit(candidate.id);
}
export function blockers(task:Task,tasks:Task[]):string[]{return (task.dependencyIds||[]).filter(id=>{const dependency=tasks.find(t=>t.id===id);return !dependency||!dependency.done||!!dependency.skipped})}
export function dependencyWarnings(task:Task,tasks:Task[]):string[]{
 const messages:string[]=[];
 for(const id of task.dependencyIds||[]){const parent=tasks.find(t=>t.id===id);if(!parent){messages.push('A prerequisite is unavailable. Ask its owner to review this link.');continue}if(parent.due&&(task.plannedDate||task.start)&&parent.due>(task.plannedDate||task.start!))messages.push(`${parent.title} ends after this task is scheduled to start.`)}
 for(const child of tasks.filter(t=>!t.done&&t.dependencyIds?.includes(task.id)))if(task.due&&(child.plannedDate||child.start)&&task.due>(child.plannedDate||child.start!))messages.push(`${child.title} starts before this task is due to finish.`);
 return messages;
}
export type Capacity={weeklyHours:number;workingDays:number[];daysOff:string[];allocations?:{dimension:"brand"|"discipline";key:string;percent:number}[]};
export const defaultCapacity:Capacity={weeklyHours:37.5,workingDays:[1,2,3,4,5],daysOff:[]};
const shift=(date:string,n:number)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
export function weeklyWorkload(tasks:Task[],ownerId:string,week:string,capacity:Capacity){
 return rangeWorkload(tasks,ownerId,week,shift(week,6),capacity);
}
export function rangeWorkload(tasks:Task[],ownerId:string,week:string,end:string,capacity:Capacity){
 const active=tasks.filter(t=>!t.done&&!t.archived&&!t.occurrenceOf&&(t.accountableOwnerId||t.assigneeIds?.[0])===ownerId);
 const days=Array.from({length:Math.min(366,Math.round((Date.parse(end+'T12:00:00Z')-Date.parse(week+'T12:00:00Z'))/86400000)+1)},(_,i)=>shift(week,i));
 const working=(day:string)=>capacity.workingDays.includes(new Date(day+'T12:00:00Z').getUTCDay());
 const available=days.filter(day=>working(day)&&!capacity.daysOff.includes(day)).length;
 const hours=capacity.workingDays.length?capacity.weeklyHours/capacity.workingDays.length:0;
 const entries=active.flatMap(task=>{
  const start=task.plannedDate||task.start||task.due,finish=task.plannedDate||task.due||start;
  if(!validTaskDate(start)||!validTaskDate(finish)||finish<start||start>end||finish<week)return [];
  // Long spans are calculated arithmetically, without unbounded date enumeration.
  const countDays=(a:string,b:string)=>{const total=Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000)+1;const full=Math.floor(total/7)*capacity.workingDays.length;return full+Array.from({length:total%7},(_,i)=>shift(a,i)).filter(working).length};
  const spanWorking=countDays(start,finish),overlap=days.filter(d=>d>=start&&d<=finish&&working(d));
  const share=spanWorking?overlap.length/spanWorking:(start>=week&&start<=end?1:0);
  if(!share)return [];
  return [{task,hours:task.effortHours===undefined?null:Math.round(task.effortHours*share*100)/100}];
 });
 return {entries,hours:entries.reduce((n,e)=>n+(e.hours||0),0),capacity:Math.round(available*hours*100)/100,unestimated:entries.filter(e=>e.hours===null).length,overdue:active.filter(t=>!t.plannedDate&&t.due&&t.due<week).length,unscheduled:active.filter(t=>!t.plannedDate&&!t.start&&!t.due).length};
}


export function parentCycle(tasks:Task[],task:Task):boolean{
 const graph=new Map(tasks.map(t=>[t.id,t.parentTaskId]));graph.set(task.id,task.parentTaskId);
 const seen=new Set<string>();let id:string|undefined=task.id;
 while(id){if(seen.has(id)||seen.size>50)return true;seen.add(id);id=graph.get(id)}return false;
}
export function rescheduleDependencies(tasks:Task[],id:string,due:string):{before:Task;after:Task}[]{
 if(!validTaskDate(due))throw Error('Choose a valid new deadline.');
 const root=tasks.find(t=>t.id===id);if(!root||!root.due||root.done||root.occurrenceOf||root.recurrence&&root.recurrence.mode!=='none')throw Error('Choose an open, dated, non-recurring task.');
 const updated=new Map(tasks.map(t=>[t.id,{...t}])),touched=new Set([id]);
 const move=(task:Task,newDue:string)=>{if(newDue===task.due)return;if(task.deadlineLocked)throw Error('A committed deadline is locked. Its owner must explicitly unlock it first.');const delta=Math.round((Date.parse(newDue+'T12:00:00Z')-Date.parse(task.due+'T12:00:00Z'))/86400000);task.start=task.start?shift(task.start,delta):undefined;task.due=newDue;};
 move(updated.get(id)!,due);
 // Only successors move, only forwards, with one calendar-day finish-to-start separation.
 for(let pass=0;pass<tasks.length;pass++){
  let changed=false;
  for(const task of updated.values()){
   if(task.id===id||task.done||task.archived||task.occurrenceOf||!task.dependencyIds?.some(parent=>touched.has(parent)))continue;
   const parents=task.dependencyIds.map(parent=>updated.get(parent));if(parents.some(p=>!p))throw Error('A prerequisite is unavailable. Review the dependency links first.');
   const latest=parents.filter(p=>!p!.done).map(p=>p!.due).filter(Boolean).sort().at(-1);if(!latest)continue;
   if(!task.due)throw Error('A dependent task has no deadline. Schedule it before cascading changes.');
   const start=task.start||task.due,min=shift(latest,1);
   if(start<min){if(task.recurrence&&task.recurrence.mode!=='none')throw Error('Recurring successors require individual review.');const delta=Math.round((Date.parse(min+'T12:00:00Z')-Date.parse(start+'T12:00:00Z'))/86400000);move(task,shift(task.due,delta));touched.add(task.id);changed=true;}
  }
  if(!changed)break;if(pass===tasks.length-1)throw Error('Review circular dependencies before rescheduling.');
 }
 return [...updated.values()].flatMap(after=>{const before=tasks.find(t=>t.id===after.id)!;return before.start!==after.start||before.due!==after.due?[{before,after}]:[]});
}

// A parent also waits for its subtasks. Include those implicit completion edges.
export function completionCycle(tasks:Task[],candidate:Task):boolean{
 const combined=[...tasks.filter(t=>t.id!==candidate.id),candidate];
 const graph=combined.map(t=>({...t,dependencyIds:[...new Set([...(t.dependencyIds||[]),...combined.filter(c=>!!c.parentTaskId&&c.parentTaskId===t.id).map(c=>c.id)])]}));
 return dependencyCycle(graph,graph.find(t=>t.id===candidate.id)!);
}
