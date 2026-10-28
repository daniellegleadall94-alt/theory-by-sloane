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
export type Capacity={weeklyHours:number;workingDays:number[];daysOff:string[]};
export const defaultCapacity:Capacity={weeklyHours:37.5,workingDays:[1,2,3,4,5],daysOff:[]};
const shift=(date:string,n:number)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
export function weeklyWorkload(tasks:Task[],ownerId:string,week:string,capacity:Capacity){
 const end=shift(week,6),active=tasks.filter(t=>!t.done&&!t.archived&&!t.occurrenceOf&&(t.accountableOwnerId||t.assigneeIds?.[0])===ownerId);
 const days=Array.from({length:7},(_,i)=>shift(week,i));
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
