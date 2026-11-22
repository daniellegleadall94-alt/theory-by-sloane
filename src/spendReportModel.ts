import {validSpend,type SpendEntry} from './budgetModel.ts';
export type SpendDimension='company'|'campaign'|'channel'|'supplier'|'month';
export function spendReport(entries:SpendEntry[],units:string[],dimension:SpendDimension,from='',to=''){
 const groups=new Map<string,{key:string;planned:number;committed:number;actual:number;entryIds:Set<string>}>();
 for(const entry of entries){
  if(entry.archived||!validSpend(entry)||from&&entry.date<from||to&&entry.date>to)continue;
  for(const allocation of entry.spendAllocations){
   if(units.length&&!units.includes(allocation.unitId))continue;
   const key=dimension==='company'?allocation.unitId:dimension==='campaign'?allocation.campaignId:dimension==='channel'?entry.channel:dimension==='supplier'?entry.supplierId||entry.supplier:entry.date.slice(0,7);
   const group=groups.get(key)||{key,planned:0,committed:0,actual:0,entryIds:new Set<string>()};
   const cents=Math.round(allocation.amount*100);
   if(entry.stage==='Planned')group.planned+=cents;else if(entry.stage==='Committed')group.committed+=cents;else group.actual+=cents;
   group.entryIds.add(entry.id);groups.set(key,group);
  }
 }
 return [...groups.values()].map(g=>({key:g.key,planned:g.planned/100,committed:g.committed/100,actual:g.actual/100,forecast:(g.actual+g.committed)/100,entries:g.entryIds.size})).sort((a,b)=>b.forecast-a.forecast||a.key.localeCompare(b.key));
}
