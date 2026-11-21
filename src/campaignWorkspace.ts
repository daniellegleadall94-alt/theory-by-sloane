import type {Task} from './work';
import {taskStart,type PortfolioRow} from './portfolio.ts';
export type CampaignScope={id:string;name:string;end:string;budget:number;status:string;category?:string};
export const campaignTasks=(tasks:Task[],id:string)=>tasks.filter(task=>task.campaign===id&&!task.archived);
export const scopeCampaignRows=(rows:PortfolioRow[],workspace:string,id:string)=>rows.filter(row=>row.workspace===workspace&&row.task.campaign===id&&!row.task.archived);
export function campaignAnchor(tasks:Task[],id:string,today:string){
 const matching=campaignTasks(tasks,id),open=matching.filter(task=>!task.done&&!!task.due),dated=(open.length?open:matching.filter(task=>!!task.due)).map(task=>taskStart(task)).sort();
 return dated[0]||today;
}
export function campaignMetrics(tasks:Task[],today:string){
 const active=tasks.filter(task=>!task.archived),completed=active.filter(task=>task.done).length;
 return {total:active.length,completed,progress:active.length?Math.round(completed/active.length*100):0,overdue:active.filter(task=>!task.done&&!!task.due&&task.due<today).length,unscheduled:active.filter(task=>!task.done&&!task.due).length,milestones:active.filter(task=>task.milestone)};
}
