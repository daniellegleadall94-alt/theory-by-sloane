import type {Task} from './work';
export type Vertical={name:string;purpose:string;stakeholders:string};
export type MarketingPlan={unitIds?:string[];id:string;name:string;workspace:string;verticals:Vertical[];created:string};
export const horizons=[['immediate','0–3 months','Immediate actions & goals'],['development','3–6 months','Development goals'],['strategic','6+ months','Strategic goals & actions'],['recurring','Recurring','Regular responsibilities'],['adhoc','Ad hoc','Unplanned & one-off work']] as const;
export const addDays=(day:string,count:number)=>{const date=new Date(day+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+count);return date.toISOString().slice(0,10)};
export const dayDistance=(a:string,b:string)=>Math.round((new Date(b+'T12:00:00Z').getTime()-new Date(a+'T12:00:00Z').getTime())/86400000);
export const weekStart=(day:string)=>addDays(day,-((new Date(day+'T12:00:00Z').getUTCDay()+6)%7));
export function moveTask(task:Task,date:string):Task{const duration=task.start?Math.max(0,dayDistance(task.start,task.due)):0;return {...task,due:date,start:task.start?addDays(date,-duration):undefined,recurrence:task.recurrence?{...task.recurrence,anchor:date}:undefined}}
export const workspaceStorage=(workspace:string,key:string)=>workspace==='guest-personal'?key:`${workspace}:${key}`;
