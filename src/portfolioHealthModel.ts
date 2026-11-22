import {spendTotals,validSpend,type SpendEntry} from './budgetModel.ts';
import {validPerformance} from './performanceModel.ts';
type RecordItem={id:string;kind?:string;unitIds?:string[];[key:string]:unknown};
export function portfolioHealth(records:RecordItem[],unitIds:string[],today:string){
 const matches=(r:RecordItem)=>!unitIds.length||r.unitIds?.some(id=>unitIds.includes(id));
 const tasks=records.filter(r=>r.kind==='task'&&!r.archived&&!r.occurrenceOf),spend=records.filter(r=>r.kind==='expense'&&validSpend(r)) as unknown as SpendEntry[];
 return records.filter(r=>r.kind==='campaign'&&!r.archived&&r.status!=='Completed'&&matches(r)).map(campaign=>{
  const work=tasks.filter(t=>t.campaign===campaign.id&&matches(t)),open=work.filter(t=>!t.done),overdue=open.filter(t=>typeof t.due==='string'&&t.due&&t.due<today),blocked=open.filter(t=>Array.isArray(t.dependencyIds)&&t.dependencyIds.some(id=>tasks.some(p=>p.id===id&&!p.done))),unresolved=open.filter(t=>Array.isArray(t.dependencyIds)&&t.dependencyIds.some(id=>!tasks.some(p=>p.id===id))),totals=spendTotals(spend,unitIds,campaign.id);
  const budget=unitIds.length&&Array.isArray(campaign.allocations)?campaign.allocations.filter(a=>unitIds.includes(a.unitId)).reduce((sum,a)=>sum+Number(a.amount||0),0):unitIds.length?0:Number(campaign.budget||0);
  return {campaign,taskCount:work.length,completed:work.filter(t=>t.done).length,overdue:overdue.length,blocked:blocked.length,unresolved:unresolved.length,unassigned:open.filter(t=>!Array.isArray(t.assigneeIds)||!t.assigneeIds.length).length,milestones:work.filter(t=>t.milestone),ownerIds:[...new Set(work.flatMap(t=>Array.isArray(t.assigneeIds)?t.assigneeIds as string[]:[]))],budget,totals,hasSpend:spend.some(e=>!e.archived&&e.spendAllocations.some(a=>a.campaignId===campaign.id&&(!unitIds.length||unitIds.includes(a.unitId)))),
   objectives:records.filter(r=>r.kind==='objective'&&!r.archived&&matches(r)&&(Array.isArray(r.campaignIds)&&r.campaignIds.includes(campaign.id)||Array.isArray(campaign.objectiveIds)&&campaign.objectiveIds.includes(r.id))),
   measures:records.filter(r=>r.kind==='kpi'&&!r.archived&&r.campaignId===campaign.id&&matches(r)&&validPerformance(r)),health:overdue.length||blocked.length||unresolved.length||totals.forecast>budget?'Needs attention':!work.length?'No delivery records':'No recorded delivery flags'};
 });
}
