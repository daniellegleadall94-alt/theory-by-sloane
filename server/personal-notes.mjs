// Reuse the notes system; NULL company ownership denotes a private user note.
export function allowPersonalNotes(db){
 if(!db.prepare('PRAGMA table_info(notes)').all().find(c=>c.name==='company_id')?.notnull)return;
 db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
 try{
  db.exec(`CREATE TABLE notes_nullable(id TEXT PRIMARY KEY,company_id TEXT REFERENCES companies(id),owner_id TEXT NOT NULL REFERENCES users(id),data TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);
   INSERT INTO notes_nullable SELECT id,company_id,owner_id,data,version FROM notes;
   DROP TABLE notes; ALTER TABLE notes_nullable RENAME TO notes;`);
  if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Note migration failed reference checks.');
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e}finally{db.exec('PRAGMA foreign_keys=ON')}
}
