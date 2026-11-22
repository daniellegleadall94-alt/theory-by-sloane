export type SpendAllocation={unitId:string;campaignId:string;amount:number};
export type SpendEntry={id:string;version?:number;financialEntry:true;title:string;amount:number;currency:'GBP';stage:'Planned'|'Committed'|'Actual';date:string;supplier:string;supplierId?:string;channel:string;unitIds:string[];spendAllocations:SpendAllocation[];archived?:boolean};
export function validSpend(value:unknown):value is SpendEntry{
 const e=value as SpendEntry,amount=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1e9&&Math.abs(n*100-Math.round(n*100))<.00001;
 return !!e&&e.financialEntry===true&&typeof e.title==='string'&&!!e.title.trim()&&e.title.length<=180&&amount(e.amount)&&e.currency==='GBP'&&['Planned','Committed','Actual'].includes(e.stage)&&typeof e.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(e.date)&&!Number.isNaN(Date.parse(e.date))&&new Date(e.date).toISOString().slice(0,10)===e.date&&typeof e.supplier==='string'&&e.supplier.length<=180&&typeof e.channel==='string'&&e.channel.length<=180&&Array.isArray(e.unitIds)&&Array.isArray(e.spendAllocations)&&e.spendAllocations.length>0&&e.spendAllocations.length<=100&&e.spendAllocations.every(a=>a&&typeof a.unitId==='string'&&typeof a.campaignId==='string'&&amount(a.amount)&&(!a.unitId||e.unitIds.includes(a.unitId)))&&new Set(e.spendAllocations.map(a=>a.unitId+'|'+a.campaignId)).size===e.spendAllocations.length&&Math.abs(e.spendAllocations.reduce((sum,a)=>sum+Math.round(a.amount*100),0)-Math.round(e.amount*100))===0&&e.unitIds.every(id=>e.spendAllocations.some(a=>a.unitId===id))&&(!e.unitIds.length||e.spendAllocations.every(a=>a.unitId));
}
export function spendTotals(entries:SpendEntry[],units:string[]=[],campaignId?:string){
 const totals={Planned:0,Committed:0,Actual:0};
 for(const entry of entries){if(entry.archived||!validSpend(entry))continue;for(const a of entry.spendAllocations)if((!units.length||units.includes(a.unitId))&&(campaignId===undefined||campaignId===a.campaignId))totals[entry.stage]+=Math.round(a.amount*100)}
 return {planned:totals.Planned/100,committed:totals.Committed/100,actual:totals.Actual/100,forecast:(totals.Committed+totals.Actual)/100};
}
