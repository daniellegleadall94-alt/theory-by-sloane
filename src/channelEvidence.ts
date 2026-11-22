type EvidenceRecord={id:string;kind?:string;organisationId?:string|null;unitIds?:string[];archived?:unknown;[key:string]:unknown};
export function channelEvidence(records:EvidenceRecord[],organisationId:string,companyId:string,channel:string,today:string){
 const scoped=records.filter(r=>r.organisationId===organisationId&&!r.archived&&r.unitIds?.includes(companyId));
 const modules=scoped.filter(r=>r.kind==='strategy'&&r.strategyBuilder===true&&r.entityId===companyId);
 const mix=modules.find(r=>r.moduleKey==='channels'),answers=mix?.answers as {channels?:{name:string;purpose:string;objectiveIds:string[]}[]}|undefined;
 const entry=answers?.channels?.find(c=>c.name.trim().toLowerCase()===channel.trim().toLowerCase());
 const goals=scoped.filter(r=>r.kind==='objective'&&entry?.objectiveIds.includes(r.id));
 const kpis=scoped.filter(r=>r.kind==='kpi'&&r.performanceMeasure===true&&goals.some(g=>g.kpiId===r.id));
 // A period still in progress is not labelled a missed target.
 const closed=kpis.filter(r=>typeof r.periodEnd==='string'&&r.periodEnd<today&&typeof r.actual==='number'&&typeof r.target==='number');
 return {hasPurpose:!!entry?.purpose.trim(),linkedGoals:goals.length,unavailableGoals:(entry?.objectiveIds.length||0)-goals.length,companyReviewsDue:modules.filter(r=>typeof r.nextReviewDate==='string'&&r.nextReviewDate<=today).length,measuredGoals:kpis.length,missedTargets:closed.filter(r=>r.direction==='At most'?Number(r.actual)>Number(r.target):Number(r.actual)<Number(r.target)).length};
}
