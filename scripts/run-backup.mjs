import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {loadEnv} from 'vite';
import {createBackup} from '../server/backup.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const statusPath=join(root,'.data/backup-status.json');let previous={};
try{previous=JSON.parse(readFileSync(statusPath,'utf8'))}catch{}
try{
 const config=JSON.parse(readFileSync('.data/backup-config.json','utf8'));
 if(config.enabled!==true)process.exit(0);
 if(!process.argv.includes('--now')&&previous.lastSuccess&&Date.now()-Date.parse(previous.lastSuccess)<86400000)process.exit(0);
 if(process.platform!=='win32')throw Error('Personal OneDrive verification requires Windows.');
 const personal=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\OneDrive\\Accounts\\Personal' -Name UserFolder).UserFolder"],{encoding:'utf8',windowsHide:true}).trim();
 if(!personal||resolve(config.destination).toLowerCase()!==resolve(personal,'Theory Backups').toLowerCase())throw Error('Backup destination must be the registered Personal OneDrive Theory Backups folder.');
 const env={...process.env,...loadEnv('development',root,'THEORY_')};
 const result=await createBackup({databasePath:env.THEORY_DATABASE_PATH||'.data/theory.sqlite',destination:config.destination,keyFile:config.keyFile,retentionDays:config.retentionDays,runtimeSettings:env});
 writeFileSync(statusPath,JSON.stringify({lastSuccess:result.createdAt,file:result.file,verified:true},null,2));
 console.log(JSON.stringify({verified:true,createdAt:result.createdAt,bytes:result.bytes}));
}catch(error){writeFileSync(statusPath,JSON.stringify({...previous,lastAttempt:new Date().toISOString(),error:error.message},null,2));console.error('Theory backup failed. See local backup status.');process.exitCode=1}
