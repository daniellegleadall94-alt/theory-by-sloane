export function csvText(headers:string[],rows:unknown[][]):string{
 const cell=(value:unknown)=>{let text=String(value??'');if(/^[\s\u0000-\u001f]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"'};
 return '\uFEFF'+[headers,...rows].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
export function downloadCsv(filename:string,headers:string[],rows:unknown[][]){
 const url=URL.createObjectURL(new Blob([csvText(headers,rows)],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
