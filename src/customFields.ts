import {validTaskDate} from './work.ts';
export type CustomField={id:string;name:string;type:'text'|'number'|'date'|'checkbox'|'dropdown'|'multi-select';value:string|number|boolean|string[];options?:string[]};
export function validCustomFields(fields:unknown):fields is CustomField[]{
 if(!Array.isArray(fields)||fields.length>30||new Set(fields.map(f=>f?.id)).size!==fields.length)return false;
 return fields.every(f=>{
  if(!f||typeof f.id!=='string'||!f.id||f.id.length>100||typeof f.name!=='string'||!f.name.trim()||f.name.length>80)return false;
  if(f.type==='text')return typeof f.value==='string'&&f.value.length<=2000;
  if(f.type==='number')return typeof f.value==='number'&&Number.isFinite(f.value);
  if(f.type==='date')return f.value===''||validTaskDate(f.value);
  if(f.type==='checkbox')return typeof f.value==='boolean';
  if(!['dropdown','multi-select'].includes(f.type)||!Array.isArray(f.options)||!f.options.length||f.options.length>50||f.options.some((o:unknown)=>typeof o!=='string'||!o.trim()||o.length>100)||new Set(f.options).size!==f.options.length)return false;
  return f.type==='dropdown'?f.value===''||typeof f.value==='string'&&f.options.includes(f.value):Array.isArray(f.value)&&new Set(f.value).size===f.value.length&&f.value.every((v:unknown)=>typeof v==='string'&&f.options.includes(v));
 });
}
