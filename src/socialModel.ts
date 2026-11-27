export const socialPlatforms = ['Facebook','Instagram','LinkedIn','X'] as const;
export const socialStates = ['Draft','In review','Ready','Planned','Published manually'] as const;
export const socialCategories = ['Education','Products & services','People & culture','Customer stories','News','Behind the scenes'];
export type SocialRecord = {
 id:string; version?:number; unitIds:string[]; title:string; socialStudio:true;
 socialType:'post'|'category'|'template'|'plan'; description:string; platform:string;
 categoryId:string; assetIds:string[]; date:string; time:string; timeZone:string;
 status:string; publishedUrl:string; campaign:string; days:number[]; weeks:number;
 categoryIds:string[]; archived?:boolean; updatedAt?:string;
};
export function socialRecord(type:SocialRecord['socialType'],unitIds:string[]=[]):SocialRecord {
 return {id:crypto.randomUUID(),unitIds,title:'',socialStudio:true,socialType:type,description:'',platform:'LinkedIn',categoryId:'',assetIds:[],date:'',time:'09:00',timeZone:'Europe/London',status:'Draft',publishedUrl:'',campaign:'',days:[1,3,5],weeks:4,categoryIds:[]};
}
export function socialDay(date:Date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
export function validSocialDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value}
export function validateSocial(record:SocialRecord){
 if(record.socialStudio!==true||!['post','category','template','plan'].includes(record.socialType))throw Error('Choose a valid social record type.');
 for(const [field,max] of Object.entries({title:180,description:20000,platform:30,categoryId:100,date:10,time:5,timeZone:100,status:30,publishedUrl:2000,campaign:100}))if(typeof record[field as keyof SocialRecord]!=='string'||String(record[field as keyof SocialRecord]).length>max)throw Error('Check the social record fields.');
 if(!record.title.trim())throw Error('Give this item a name.');
 if(!socialPlatforms.includes(record.platform as typeof socialPlatforms[number]))throw Error('Choose a supported platform.');
 if(!socialStates.includes(record.status as typeof socialStates[number]))throw Error('Choose a planning status.');
 if(record.date&&!validSocialDate(record.date))throw Error('Choose a valid date.');
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(record.time))throw Error('Choose a valid posting time.');
 try{new Intl.DateTimeFormat('en-GB',{timeZone:record.timeZone}).format()}catch{throw Error('Choose a valid time zone.')}
 for(const field of ['assetIds','categoryIds'] as const)if(!Array.isArray(record[field])||record[field].length>30||record[field].some(id=>typeof id!=='string'||id.length>100))throw Error('Choose valid linked items.');
 if(!Array.isArray(record.days)||record.days.length>7||record.days.some(day=>!Number.isInteger(day)||day<0||day>6)||!Number.isInteger(record.weeks)||record.weeks<1||record.weeks>12)throw Error('Choose posting days and between 1 and 12 weeks.');
 if(record.socialType==='plan'&&(!record.date||!record.days.length))throw Error('Choose a start date and preferred posting days.');
 if(record.status==='Planned'&&!record.date)throw Error('Choose a date for this planned post.');
 if(record.publishedUrl){let url;try{url=new URL(record.publishedUrl)}catch{throw Error('Enter a valid published URL.')}if(url.protocol!=='https:'||url.username||url.password)throw Error('Use an HTTPS published URL.');}
 if(record.status==='Published manually'&&!record.publishedUrl)throw Error('Add the published post link to record manual publication.');
}
// Preview only. Generated drafts never authorise delivery to a social account.
export function generateSocialPlan(plan:SocialRecord,categories:SocialRecord[],existing:SocialRecord[]=[]){
 validateSocial(plan);const result:SocialRecord[]=[];const start=new Date(plan.date+'T12:00:00');
 const selected=categories.filter(c=>plan.categoryIds.includes(c.id)&&!c.archived);
 for(let day=0;day<plan.weeks*7;day++){
  const date=new Date(start);date.setDate(start.getDate()+day);if(!plan.days.includes(date.getDay()))continue;
  const dateText=socialDay(date),category=selected[result.length%Math.max(1,selected.length)];
  if(existing.some(p=>p.socialType==='post'&&!p.archived&&p.platform===plan.platform&&p.date===dateText&&p.time===plan.time&&JSON.stringify([...p.unitIds].sort())===JSON.stringify([...plan.unitIds].sort())))continue;
  result.push({...socialRecord('post',plan.unitIds),title:category?category.title+' · '+dateText:plan.title+' · '+dateText,platform:plan.platform,categoryId:category?.id||'',description:category?.description||'',date:dateText,time:plan.time,timeZone:plan.timeZone,campaign:plan.campaign,status:'Draft'});
 }
 return result;
}
export function socialInstant(date:string,time:string,timeZone:string){
 if(!validSocialDate(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('Choose a valid date and time.');
 const target=date+'T'+time,base=Date.parse(target+':00Z'),matches:string[]=[];
 const format=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 for(let minutes=-840;minutes<=840;minutes+=15){const instant=new Date(base+minutes*60000),parts=Object.fromEntries(format.formatToParts(instant).map(p=>[p.type,p.value]));if(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`===target)matches.push(instant.toISOString())}
 if(matches.length!==1)throw Error('This time is skipped or repeated by the daylight-saving clock change. Choose a different time.');return matches[0];
}
