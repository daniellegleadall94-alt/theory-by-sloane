import {useWorkspace} from './WorkspaceContext';
export function LinkedObjectives({id,kind,organisationId}:{id:string;kind:'task'|'campaign';organisationId?:string|null}){
 const workspace=useWorkspace();
 const goals=workspace.records.filter(item=>item.kind==='objective'&&item.organisationId===(organisationId||null)&&((item[kind==='task'?'taskIds':'campaignIds']||[]) as string[]).includes(id));
 if(!goals.length)return null;
 return <section className="strategy-linked-goals"><strong>Strategic goals supported</strong>{goals.map(goal=><div key={goal.id}><span>{String(goal.title)}</span><small>{String(goal.target||'')} · {String(goal.kpi||'')} · {Number(goal.progress)||0}%</small></div>)}</section>;
}
