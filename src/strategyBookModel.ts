import {strategyModules,strategyQuestions,strategyAnswerText,type FoundationRecord,type SupportedStrategyModule} from './strategyModel.ts';
export type BookPage={title:string;lines:string[]};
export function wrapBookText(text:string,width=66){return text.split(/\r?\n/).flatMap(paragraph=>{const lines:string[]=[];let line='';for(const word of paragraph.split(/\s+/)){if(!word)continue;if(Array.from(line+' '+word).length>width&&line){lines.push(line);line=''}const chars=Array.from(word);while(chars.length>width){if(line){lines.push(line);line=''}lines.push(chars.splice(0,width).join(''))}line+=(line?' ':'')+chars.join('')}lines.push(line);return lines})}
export function strategyBookPages(name:string,records:Partial<Record<SupportedStrategyModule,FoundationRecord|null>>,selected:SupportedStrategyModule[],goals:{id:string;title:string;target?:string;kpi?:string;due?:string;progress?:number}[],date:string):BookPage[]{
 const pages:BookPage[]=[{title:'Marketing strategy',lines:[...wrapBookText(name),'',date,'','Prepared in Theory']},{title:'Contents',lines:selected.map(key=>strategyModules.find(item=>item.key===key)!.name)}];
 for(const key of selected){const module=strategyModules.find(item=>item.key===key)!,record=records[key];let lines:string[]=[];for(const question of strategyQuestions(key)){let answer=record?.answers[question.key];let text=key==='objectives'?(answer as string[]||[]).map(id=>{const goal=goals.find(item=>item.id===id);return goal?[goal.title,goal.target,goal.kpi,goal.due,'Progress: '+(goal.progress||0)+'%'].filter(Boolean).join(' · '):'Objective unavailable'}).join('\n\n'):strategyAnswerText(answer);if(question.key==='allocations')text=(record?.answers.mode==='Percent'?'Percentages (%)':'Amounts (£ GBP)')+'\n'+text;lines.push(question.label.toUpperCase(),...wrapBookText(text||'Not yet answered'),'')}
  for(let offset=0;offset<Math.max(1,lines.length);offset+=34)pages.push({title:module.name+(offset?' · continued':''),lines:lines.slice(offset,offset+34)});
 }
 const objectiveIds=selected.includes('objectives')?(records.objectives?.answers.goals||[]) as string[]:[];
 const summary=objectiveIds.flatMap(id=>{const goal=goals.find(item=>item.id===id);return goal?[...wrapBookText(goal.title),...wrapBookText([goal.target,goal.kpi,goal.due].filter(Boolean).join(' · ')),'']:[]});
 for(let offset=0;offset<Math.max(1,summary.length);offset+=34)pages.push({title:'Objectives & KPIs summary'+(offset?' · continued':''),lines:summary.length?summary.slice(offset,offset+34):['No objectives included in this edition.']});
 return pages;
}

export async function makeStrategyPdf(pages:BookPage[],brand:{name:string;colour:string;logo?:string}){
 const {PDFDocument}=await import('pdf-lib');const pdf=await PDFDocument.create();pdf.setTitle(brand.name+' marketing strategy');pdf.setCreator('Theory');
 let logo:HTMLImageElement|undefined;if(brand.logo&&/^data:image\/(webp|png|jpeg);base64,/.test(brand.logo)){logo=new Image();logo.src=brand.logo;await logo.decode()}
 const style=getComputedStyle(document.documentElement),ink=style.getPropertyValue('--ink').trim()||'black',surface=style.getPropertyValue('--surface').trim()||'white';
 for(const [index,page] of pages.entries()){
  const canvas=document.createElement('canvas');canvas.width=1190;canvas.height=1684;const ctx=canvas.getContext('2d');if(!ctx)throw Error('PDF rendering is not available in this browser.');ctx.scale(2,2);ctx.fillStyle=surface;ctx.fillRect(0,0,595,842);ctx.fillStyle=brand.colour;ctx.fillRect(0,0,595,12);ctx.fillStyle=ink;ctx.font='11px Arial';ctx.fillText('THEORY / '+brand.name.slice(0,65),42,45);if(logo){const scale=Math.min(70/logo.width,30/logo.height);ctx.drawImage(logo,480,25,logo.width*scale,logo.height*scale)}ctx.font='bold 23px Arial';const titleLines=wrapBookText(page.title,36);titleLines.forEach((line,i)=>ctx.fillText(line,42,92+i*28));ctx.font='12px Arial';const start=titleLines.length>1?150:128;
  page.lines.forEach((line,i)=>{if(ctx.measureText(line).width>511)throw Error('A line is too wide to export. Shorten long unbroken text before downloading.');ctx.fillText(line,42,start+i*18)});ctx.font='10px Arial';ctx.fillText(String(index+1)+' / '+pages.length,510,810);const image=await pdf.embedPng(canvas.toDataURL('image/png'));const sheet=pdf.addPage([595,842]);sheet.drawImage(image,{x:0,y:0,width:595,height:842});
 }
 return pdf.save();
}
