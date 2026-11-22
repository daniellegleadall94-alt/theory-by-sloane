export const contactTypes=['Contact','Supplier','Agency','Customer','Media'] as const;
export type ContactRecord={id:string;version?:number;contactDirectory:true;title:string;contactType:typeof contactTypes[number];companyName:string;jobTitle:string;email:string;phone:string;website:string;description:string;status:'Active'|'Archived';unitIds:string[]};
export function validContact(value:unknown):value is ContactRecord{
 const c=value as ContactRecord;if(!c||c.contactDirectory!==true||!contactTypes.includes(c.contactType)||!['Active','Archived'].includes(c.status))return false;
 for(const [key,max] of Object.entries({title:180,companyName:180,jobTitle:180,email:254,phone:80,website:2000,description:8000}))if(typeof c[key as keyof ContactRecord]!=='string'||String(c[key as keyof ContactRecord]).length>max)return false;
 if(!c.title.trim()||c.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email))return false;
 if(c.website){try{const url=new URL(c.website);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return false}catch{return false}}
 return true;
}
