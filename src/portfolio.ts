import {addDays,dayDistance,weekStart,workspaceStorage,type MarketingPlan} from './overview.ts';
import {completeTask,type Task} from './work.ts';

export const taskStatuses=['To do','In progress','In review','Done'] as const;
export type TaskStatus=typeof taskStatuses[number];
export type PortfolioWorkspace={id:string;name:string};
export type PortfolioRow={task:Task;workspace:string;company:string;campaignName:string;projectName:string;channel:string};
export const taskChannel=(task:Task,normalise:(name:string)=>string=(name=>name))=>task.channel?.trim()||(task.discipline==='Marketing'?'General marketing':normalise(task.discipline));
export function collectPortfolioRows(workspaces:PortfolioWorkspace[],tasksFor:(workspace:string)=>Task[],campaignsFor:(workspace:string)=>{id:string;name:string}[],plans:MarketingPlan[],normalise:(name:string)=>string=(name=>name)):PortfolioRow[]{
 return workspaces.flatMap(w=>tasksFor(w.id).map(task=>({task,workspace:w.id,company:w.name,campaignName:campaignsFor(w.id).find(c=>c.id===task.campaign)?.name||'',projectName:plans.find(plan=>plan.id===task.overviewId&&plan.workspace===w.id)?.name||'',channel:taskChannel(task,normalise)})));
}
export const getTaskStatus=(task:Task):TaskStatus=>task.done?'Done':task.status&&task.status!=='Done'?task.status:'To do';
export const taskStart=(task:Task)=>task.start&&task.start<=task.due?task.start:task.due;
export function setTaskStatus(tasks:Task[],id:string,status:TaskStatus,at:string):Task[]{
 const task=tasks.find(t=>t.id===id);if(!task||task.occurrenceOf)return tasks;
 if(status==='Done'&&!task.done)return completeTask(tasks,id,at);
 return tasks.map(t=>t.id===id?{...t,status,done:status==='Done',completedAt:status==='Done'?t.completedAt||at:undefined}:t);
}
export function shiftTask(task:Task,days:number):Task{
 return {...task,start:addDays(taskStart(task),days),due:addDays(task.due,days),recurrence:task.recurrence?{...task.recurrence,anchor:addDays(task.recurrence.anchor||task.due,days)}:undefined};
}
export function resizeTask(task:Task,edge:'start'|'end',date:string):Task{
 if(edge==='start')return {...task,start:date>task.due?task.due:date};
 const due=date<taskStart(task)?taskStart(task):date;
 return {...task,due,recurrence:task.recurrence?{...task.recurrence,anchor:due}:undefined};
}
export function taskBucket(task:Task,today:string,anchor=today):string{
 if(task.done)return 'Completed';
 if(!task.due)return 'Unscheduled';
 if(task.due<today)return 'Overdue';
 const end=addDays(weekStart(anchor),6),next=addDays(end,7);
 return task.due<=end?'Due this week':task.due<=next?'Next week':'Later';
}
export function packSchedule(rows:PortfolioRow[],start:string,count:number){
 const end=addDays(start,count-1),lanes:number[]=[];
 return rows.filter(row=>row.task.due>=start&&taskStart(row.task)<=end).sort((a,b)=>taskStart(a.task).localeCompare(taskStart(b.task))||a.task.due.localeCompare(b.task.due)||a.task.id.localeCompare(b.task.id)).map(row=>{
  const from=Math.max(0,dayDistance(start,taskStart(row.task))),to=Math.min(count-1,dayDistance(start,row.task.due));
  let lane=lanes.findIndex(last=>last<from);if(lane<0)lane=lanes.length;lanes[lane]=to;
  return {row,from,to,lane,startsHere:taskStart(row.task)>=start,endsHere:row.task.due<=end};
 });
}
export const DATA_EVENT='theory:workspace-data';
export const SCOPE_EVENT='theory:portfolio-scope';
export const BRAND_EVENT='theory:manage-brands';
export type PortfolioBrand={id:string;name:string;workspace:string;channels:string[]};
export type PortfolioChange={id:string;taskId:string;at:string;title:string;fields:string[];before?:Task;after?:Task;beforeWorkspace?:string;afterWorkspace?:string;beforeCampaign?:string;afterCampaign?:string};
export const ownerOf=(workspace:string)=>workspace==='guest-personal'?'guest':workspace.split(':')[0];
export const brandsKey=(owner:string)=>`theory.portfolio-brands.v1:${owner}`;
export const changesKey=(owner:string)=>`theory.portfolio-changes.v1:${owner}`;
export function readLocal<T>(key:string,fallback:T):T{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}}
const taskFields:Record<string,string>={title:'Title',start:'Start date',due:'End date',channel:'Channel',discipline:'Discipline',brand:'Brand',campaign:'Campaign',overviewId:'Project',groupId:'Planner list',status:'Status',done:'Completion',priority:'Priority',checklist:'Checklist',recurrence:'Recurrence',plannerAllocated:'Planner allocation'};
export function recordWorkspaceChanges(key:string,before:unknown,after:unknown){
 const suffix=key.endsWith('theory.tasks.v1')?'theory.tasks.v1':key.endsWith('theory.campaigns.v1')?'theory.campaigns.v1':'';if(!suffix||!Array.isArray(before)||!Array.isArray(after))return;
 const workspace=key===suffix?'guest-personal':key.slice(0,-suffix.length-1),owner=ownerOf(workspace),history=readLocal<PortfolioChange[]>(changesKey(owner),[]),at=new Date().toISOString();
 const changed:PortfolioChange[]=[];
 if(suffix==='theory.tasks.v1')for(const id of new Set([...before,...after].map(t=>t.occurrenceOf||t.id))){
  const old=before.find(t=>t.id===id) as Task|undefined,next=after.find(t=>t.id===id) as Task|undefined;
  const fields=old&&next?Object.entries(taskFields).filter(([field])=>JSON.stringify(old[field as keyof Task])!==JSON.stringify(next[field as keyof Task])).map(([,label])=>label):[old?'Deleted / moved from workspace':'Created / moved into workspace'];
  if(!fields.length||!old&&!next)continue;
  const campaigns=readWorkspace<{id:string;name:string}[]>(workspace,'theory.campaigns.v1',[]);
  changed.push({id:crypto.randomUUID(),taskId:String(id),at,title:(next||old)!.title,fields,before:old,after:next,beforeWorkspace:old?workspace:undefined,afterWorkspace:next?workspace:undefined,beforeCampaign:campaigns.find(c=>c.id===old?.campaign)?.name,afterCampaign:campaigns.find(c=>c.id===next?.campaign)?.name});
 }
 else for(const campaign of after){const old=before.find(c=>c.id===campaign.id);if(!old||JSON.stringify(old)===JSON.stringify(campaign))continue;for(const task of readWorkspace<Task[]>(workspace,'theory.tasks.v1',[]).filter(t=>t.campaign===campaign.id))changed.push({id:crypto.randomUUID(),taskId:task.id,at,title:task.title,fields:['Campaign details'],before:task,after:task,beforeWorkspace:workspace,afterWorkspace:workspace,beforeCampaign:old.name,afterCampaign:campaign.name})}
 for(const change of changed){const previous=history.findIndex(c=>c.taskId===change.taskId&&Math.abs(Date.parse(at)-Date.parse(c.at))<500);if(previous>=0){const old=history.splice(previous,1)[0];history.unshift({...change,before:old.before||change.before,beforeWorkspace:old.beforeWorkspace||change.beforeWorkspace,after:change.after||old.after,afterWorkspace:change.afterWorkspace||old.afterWorkspace,fields:[...new Set([...old.fields,...change.fields])],beforeCampaign:old.beforeCampaign||change.beforeCampaign,afterCampaign:change.afterCampaign||old.afterCampaign})}else history.unshift(change)}
 if(changed.length)localStorage.setItem(changesKey(owner),JSON.stringify(history.slice(0,20)));
}
export function readWorkspace<T>(workspace:string,key:string,fallback:T):T{try{return JSON.parse(localStorage.getItem(workspaceStorage(workspace,key))||'null')??fallback}catch{return fallback}}
export function publishStoredKey(key:string,value:unknown){const serialized=JSON.stringify(value),old=localStorage.getItem(key);if(old===serialized)return;localStorage.setItem(key,serialized);try{recordWorkspaceChanges(key,old?JSON.parse(old):[],value)}catch{/* A history failure must not discard the task edit. */}window.dispatchEvent(new CustomEvent(DATA_EVENT,{detail:{key}}))}
export function publishWorkspace(workspace:string,key:string,value:unknown){publishStoredKey(workspaceStorage(workspace,key),value)}
export function groupCampaignSchedule(rows:PortfolioRow[]){const groups=new Map<string,{id:string;name:string;company:string;rows:PortfolioRow[]}>();for(const row of rows){const id=row.workspace+':'+(row.task.campaign?'campaign:'+row.task.campaign:row.task.overviewId?'project:'+row.task.overviewId:'unassigned');if(!groups.has(id))groups.set(id,{id,name:row.campaignName||row.projectName||'Unassigned work',company:row.company,rows:[]});groups.get(id)!.rows.push(row)}return [...groups.values()].sort((a,b)=>a.company.localeCompare(b.company)||a.name.localeCompare(b.name))}
export function channelHealth(brand:PortfolioBrand,channel:string,rows:PortfolioRow[],from:string,count:number,today:string){const matching=rows.filter(r=>r.workspace===brand.workspace&&(r.task.unitIds?.length?r.task.unitIds.includes(brand.id):(r.task.brand||r.company)===brand.name)&&r.channel===channel),scheduled=matching.filter(r=>r.task.due>=from&&taskStart(r.task)<=addDays(from,count-1)),overdue=matching.filter(r=>!r.task.done&&!!r.task.due&&r.task.due<today).length;return {count:scheduled.length,overdue,completed:scheduled.filter(r=>r.task.done).length,state:!brand.channels.includes(channel)?'Not used':overdue?'Overdue':!scheduled.length?'Gap':'Scheduled'} as const}
export function transferTask(source:Task[],target:Task[],task:Task){
 if(target.some(t=>t.id===task.id))throw Error('A task with this ID already exists in the destination.');
 const originals=source.filter(t=>t.id===task.id||t.occurrenceOf===task.id);const moved=originals.length?originals.map(t=>t.id===task.id?task:{...t,overviewId:task.overviewId,campaign:task.campaign,groupId:task.groupId,discipline:task.discipline,channel:task.channel,brand:task.brand}):[task];
 return {source:source.filter(t=>!originals.some(old=>old.id===t.id)),target:[...target,...moved]};
}
