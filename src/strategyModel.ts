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
export const contextQuestions=[
 {key:'products',label:'Products and services',helper:'Describe what you sell, who it serves and the products or services that matter most.',example:'We supply durable clay drainage systems to builders and merchants, supported by technical advice and reliable delivery.'},
 {key:'revenue',label:'Revenue priorities',helper:'Explain where growth should come from. Include priority products, customers or markets and any commercial constraints.',example:'Grow repeat orders from existing merchants and increase adoption of our premium range. Protect margin rather than competing on price alone.'},
 {key:'goals',label:'Business goals marketing must support',helper:'Describe the business outcomes marketing should help achieve, and how you will recognise progress.',example:'Build awareness among regional specifiers, generate qualified product enquiries and help account managers win repeat orders. Agree measurable targets with Sales.'}
] as const;
export const personaFields=[
 {key:'name',label:'Persona name',helper:'Give this audience a memorable working name.',example:'Practical Priya',short:true},
 {key:'segment',label:'Segment',helper:'Which part of your audience does this persona represent?',example:'Independent builders’ merchants',short:true},
 {key:'role',label:'Role',helper:'Describe their role in the buying decision.',example:'Branch manager who recommends products and places orders',short:true},
 {key:'painPoints',label:'Pain points',helper:'What problems, frustrations or barriers matter to them?',example:'Unreliable stock availability and technical queries that delay orders.'},
 {key:'goals',label:'Goals',helper:'What does success look like for this person?',example:'Keep customers supplied, protect margin and build repeat business.'},
 {key:'triggers',label:'Buying triggers',helper:'What prompts them to start looking or make a purchase?',example:'A new project, a stock shortage or a contractor asking for an alternative.'},
 {key:'where',label:'Where they spend time',helper:'Where do they look for advice and information?',example:'Trade publications, supplier visits, merchant events and LinkedIn.'},
 {key:'channels',label:'Preferred channels',helper:'How do they prefer to hear from a business like yours?',example:'Practical email updates, short product guides and a direct conversation.'}
] as const;
export type Persona={id:string}&Record<typeof personaFields[number]['key'],string>;
export const emptyPersona=(id:string):Persona=>({id,name:'',segment:'',role:'',painPoints:'',goals:'',triggers:'',where:'',channels:''});
export const audienceQuestions=[{key:'personas',label:'Audience personas',helper:'Build a clear picture of each audience. Add at least one persona and complete its fields; you can keep unfinished cards as drafts.',example:'A buying decision may involve a specifier, a purchaser and an end user. Give each a separate persona when their needs differ.'}] as const;
export type SupportedStrategyModule='foundations'|'context'|'audience';
export type StrategyAnswer=string|string[]|Persona[];
export type StrategyAnswers=Record<string,StrategyAnswer>;
export const strategyStarted=(answers:StrategyAnswers)=>Object.values(answers).some(value=>Array.isArray(value)?value.length>0:!!value.trim());
export const supportedStrategyModule=(key:unknown):key is SupportedStrategyModule=>key==='foundations'||key==='context'||key==='audience';
export const strategyQuestions=(key:SupportedStrategyModule)=>key==='audience'?audienceQuestions:key==='context'?contextQuestions:foundationQuestions;
export const emptyStrategyAnswers=(key:SupportedStrategyModule):StrategyAnswers=>key==='audience'?{personas:[]}:key==='context'?{products:'',revenue:'',goals:''}:emptyFoundations();
export const strategyFilled=(key:SupportedStrategyModule,answers:StrategyAnswers)=>key==='audience'?(validateStrategyAnswers(key,answers)&&(answers.personas as Persona[]).length>0&&(answers.personas as Persona[]).every(persona=>personaFields.every(field=>persona[field.key].trim()))?1:0):strategyQuestions(key).filter(question=>Array.isArray(answers[question.key])?(answers[question.key] as string[]).length>0:typeof answers[question.key]==='string'&&!!(answers[question.key] as string).trim()).length;
export const strategyAnswerText=(value:StrategyAnswer|undefined):string=>typeof value==='string'?value:!value?'':value.map(item=>typeof item==='string'?item:personaFields.map(field=>field.label+': '+(item[field.key]||'Not answered')).join('\n')).join(typeof value[0]==='string'?', ':'\n\n');
export function validateStrategyAnswers(key:SupportedStrategyModule,value:unknown):value is StrategyAnswers{
 if(key==='foundations')return validateFoundations(value);
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const answers=value as StrategyAnswers;
 if(key==='audience')return Object.keys(answers).length===1&&Array.isArray(answers.personas)&&answers.personas.length<=30&&new Set(answers.personas.map(persona=>typeof persona==='object'&&persona?.id)).size===answers.personas.length&&answers.personas.every(persona=>!!persona&&typeof persona==='object'&&!Array.isArray(persona)&&Object.keys(persona).length===personaFields.length+1&&typeof persona.id==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(persona.id)&&personaFields.every(field=>typeof persona[field.key]==='string'&&persona[field.key].length<=('short' in field?200:3000)));
 return Object.keys(answers).length===contextQuestions.length&&contextQuestions.every(({key})=>typeof answers[key]==='string'&&(answers[key] as string).length<=6000);
}
export const foundationFilled=(answers:Foundations)=>foundationQuestions.filter(question=>question.key==='values'?answers.values.length>0:!!answers[question.key].trim()).length;
export function validateFoundations(value:unknown):value is Foundations{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;const answers=value as Foundations;
 return ['mission','vision','brandPromise','why'].every(key=>typeof answers[key as keyof Foundations]==='string'&&(answers[key as keyof Foundations] as string).length<=6000)&&Array.isArray(answers.values)&&answers.values.length<=30&&answers.values.every(value=>typeof value==='string'&&value.trim().length>0&&value.length<=80);
}
export const strategyDay=(at=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(at);
export function nextStrategyReview(day:string,months:number){const source=new Date(day+'T12:00:00Z'),target=new Date(Date.UTC(source.getUTCFullYear(),source.getUTCMonth()+months,1,12));target.setUTCDate(Math.min(source.getUTCDate(),new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate()));return target.toISOString().slice(0,10)}
export type FoundationRecord={id:string;title:string;strategyBuilder:true;moduleKey:SupportedStrategyModule;entityId:string;answers:StrategyAnswers;reviewMonths:number;status:'Not started'|'In progress'|'Complete';version:number;updatedAt:string;completedAt?:string;reviewedAt?:string;nextReviewDate?:string;copiedFrom?:{id:string;version:number};unitIds:string[];reviewTaskId?:string;reviewEventId?:string};
export type StrategySnapshot={version:number;reason:string;at:string;answers:StrategyAnswers;reviewMonths:number};
export const moduleStatus=(record:FoundationRecord|null,today:string)=>!record?'Not started':record.status==='Complete'&&record.nextReviewDate&&record.nextReviewDate<=today?'Needs review':record.status;
export const safeStrategyLink=(value:unknown):value is string=>typeof value==='string'&&/^\/\?strategyOrg=[a-zA-Z0-9-]+&strategyEntity=[a-zA-Z0-9-]+&strategyModule=(foundations|context|audience)$/.test(value);
