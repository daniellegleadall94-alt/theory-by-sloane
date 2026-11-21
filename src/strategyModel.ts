export const strategyModules=[
 {key:'foundations',name:'Foundations',months:12,description:'Your purpose, direction and brand promise.'},
 {key:'context',name:'Business Context',months:6,description:'What the business needs marketing to achieve.'},
 {key:'audience',name:'Audience',months:6,description:'The people you need to reach and understand.'},
 {key:'market',name:'Market & Competitors',months:3,description:'Your market, competitors and emerging trends.'},
 {key:'swot',name:'SWOT',months:3,description:'Strengths, weaknesses, opportunities and threats.'},
 {key:'positioning',name:'Positioning & Messaging',months:6,description:'Your value, proof and voice.'},
 {key:'objectives',name:'Objectives & KPIs',months:1,description:'Measurable goals and accountable owners.'},
 {key:'channels',name:'Channel Mix',months:3,description:'Each channel’s purpose and strategic goals.'},
 {key:'budget',name:'Budget & Resources',months:3,description:'Investment, people and tools.'},
 {key:'measurement',name:'Review & Measurement',months:3,description:'How you measure success and learn.'}
] as const;
export const foundationQuestions=[
 {key:'mission',label:'Mission',helper:'In one or two sentences, describe what you do, who you help and the difference you make.',example:'We help independent retailers grow through practical marketing that turns local knowledge into lasting customer relationships.'},
 {key:'vision',label:'Vision',helper:'Describe the future you want to create. Think beyond this year’s targets.',example:'A high street where independent businesses thrive and every community has places worth coming back to.'},
 {key:'values',label:'Values',helper:'Add the principles that guide decisions. Separate values with commas.',example:'Clarity, care, curiosity, accountability'},
 {key:'brandPromise',label:'Brand promise',helper:'What can people consistently expect when they choose you?',example:'Clear advice, thoughtful execution and marketing that feels true to your business.'},
 {key:'why',label:'Why we exist',helper:'Explain the human reason behind the business, beyond making a profit.',example:'Good independent businesses deserve to be seen. We exist to give them the confidence and support to grow.'}
] as const;
export type Foundations={mission:string;vision:string;values:string[];brandPromise:string;why:string};
export const emptyFoundations=():Foundations=>({mission:'',vision:'',values:[],brandPromise:'',why:''});
export const foundationFilled=(answers:Foundations)=>foundationQuestions.filter(question=>question.key==='values'?answers.values.length>0:!!answers[question.key].trim()).length;
export function validateFoundations(value:unknown):value is Foundations{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;const answers=value as Foundations;
 return ['mission','vision','brandPromise','why'].every(key=>typeof answers[key as keyof Foundations]==='string'&&(answers[key as keyof Foundations] as string).length<=6000)&&Array.isArray(answers.values)&&answers.values.length<=30&&answers.values.every(value=>typeof value==='string'&&value.trim().length>0&&value.length<=80);
}
export const strategyDay=(at=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(at);
export function nextStrategyReview(day:string,months:number){const source=new Date(day+'T12:00:00Z'),target=new Date(Date.UTC(source.getUTCFullYear(),source.getUTCMonth()+months,1,12));target.setUTCDate(Math.min(source.getUTCDate(),new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate()));return target.toISOString().slice(0,10)}
export type FoundationRecord={id:string;title:string;strategyBuilder:true;moduleKey:'foundations';entityId:string;answers:Foundations;reviewMonths:number;status:'Not started'|'In progress'|'Complete';version:number;updatedAt:string;completedAt?:string;reviewedAt?:string;nextReviewDate?:string;copiedFrom?:{id:string;version:number};unitIds:string[];reviewTaskId?:string;reviewEventId?:string};
export type StrategySnapshot={version:number;reason:string;at:string;answers:Foundations;reviewMonths:number};
export const moduleStatus=(record:FoundationRecord|null,today:string)=>!record?'Not started':record.status==='Complete'&&record.nextReviewDate&&record.nextReviewDate<=today?'Needs review':record.status;
export const safeStrategyLink=(value:unknown):value is string=>typeof value==='string'&&/^\/\?strategyOrg=[a-zA-Z0-9-]+&strategyEntity=[a-zA-Z0-9-]+&strategyModule=foundations$/.test(value);
