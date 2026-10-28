import ExcelJS from 'exceljs';
import unzipper from 'unzipper';
import {parentPort,workerData} from 'node:worker_threads';

export function parseCsv(text){
 text=text.replace(/^\uFEFF/,'');const first=text.split(/\r?\n/,1)[0],delimiter=(first.match(/\t/g)||[]).length>(first.match(/,/g)||[]).length?'\t':(first.match(/;/g)||[]).length>(first.match(/,/g)||[]).length?';':',';
 const rows=[];let row=[],cell='',quoted=false,closed=false,line=1,rowLine=1;
 const endCell=()=>{row.push(cell);cell='';closed=false;if(row.length>80)throw Error('Use at most 80 columns.');};
 const endRow=()=>{endCell();if(row.some(v=>v.trim())){Object.defineProperty(row,'sourceRow',{value:rowLine});rows.push(row);}row=[];if(rows.length>1001)throw Error('Import at most 1,000 rows at a time.');};
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='\n')line++;if(c==='"'&&text[i+1]==='"'){cell+='"';i++}else if(c==='"'){quoted=false;closed=true}else cell+=c;}else if(c==='"'){if(cell||closed)throw Error('Unexpected quote in CSV.');quoted=true;}else if(c===delimiter)endCell();else if(c==='\n'){endRow();line++;rowLine=line;}else if(c==='\r'){if(text[i+1]==='\n')i++;endRow();line++;rowLine=line;}else{if(closed&&c.trim())throw Error('Unexpected text after a closing quote.');if(!closed)cell+=c;}if(cell.length>10000)throw Error('A cell is too long.');}
 if(quoted)throw Error('A quoted CSV cell is unfinished.');if(cell||row.length)endRow();return rows;
}
export async function parseSpreadsheet({name,base64}){
 if(typeof name!=='string'||typeof base64!=='string'||base64.length>6000000||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))throw Error('Choose a CSV or XLSX file up to 4 MB.');
 const buffer=Buffer.from(base64,'base64');if(buffer.length>4*1024*1024)throw Error('The file exceeds 4 MB.');let sheets;
 if(/\.csv$/i.test(name)){const rows=parseCsv(buffer.toString('utf8'));sheets=[{name:'CSV',rows,rowNumbers:rows.map((r,i)=>r.sourceRow||i+1)}];}
 else if(/\.xlsx$/i.test(name)){
  const zip=await unzipper.Open.buffer(buffer);if(zip.files.length>1000||zip.files.reduce((n,f)=>n+f.uncompressedSize,0)>25*1024*1024)throw Error('The workbook expands beyond the supported size.');
  // Check actual decompressed bytes too; central directory sizes alone are untrusted.
  let total=0;for(const file of zip.files){for await(const chunk of file.stream()){total+=chunk.length;if(total>25*1024*1024)throw Error('The workbook expands beyond the supported size.');}}
  const book=new ExcelJS.Workbook();await book.xlsx.load(buffer,{ignoreNodes:['drawing','picture','extLst','conditionalFormatting']});
  if(book.worksheets.length>20)throw Error('Use a workbook with at most 20 sheets.');
  sheets=book.worksheets.map(sheet=>{if(sheet.rowCount>1001||sheet.columnCount>80)throw Error('Use at most 1,000 data rows and 80 columns per sheet.');const rows=[],rowNumbers=[];sheet.eachRow((row,number)=>{const cells=Array.from({length:sheet.columnCount},(_,i)=>{const value=row.getCell(i+1).value;if(value==null)return '';if(value instanceof Date)return value.toISOString().slice(0,10);if(typeof value==='object'){if(value.formula||value.sharedFormula)return '[Formula: replace with a value]';if(value.richText)return value.richText.map(r=>r.text).join('');if(value.text)return String(value.text);return '[Unsupported cell]'}return String(value)});if(cells.some(v=>v.trim())){rows.push(cells);rowNumbers.push(number)}});return {name:sheet.name,rows,rowNumbers}});
 }else throw Error('Use CSV or modern Excel (.xlsx). Save older .xls files as .xlsx first.');
 return sheets.filter(s=>s.rows.length).map(sheet=>({name:sheet.name,rowNumbers:sheet.rowNumbers?.slice(1),headers:sheet.rows[0].map((value,i)=>String(value||'Column '+(i+1)).slice(0,100)),rows:sheet.rows.slice(1).map(row=>row.map(value=>{if(value.length>10000)throw Error('A cell is too long.');return value}))}));
}
if(parentPort&&workerData)parseSpreadsheet(workerData).then(result=>parentPort.postMessage({result})).catch(e=>parentPort.postMessage({error:e.message}));
