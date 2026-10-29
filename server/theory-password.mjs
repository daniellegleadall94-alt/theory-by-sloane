import {scrypt as derive,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(derive);
// Reuse Theory's existing salted scrypt format, including a dummy derivation on failure.
export async function verifyTheoryPassword(password,stored){
 const valid=typeof stored==='string'&&/^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(stored);
 const [salt,saved]=valid?stored.split(':'):['invalid','0'.repeat(128)];
 const actual=await scrypt(password,salt,64);
 return timingSafeEqual(Buffer.from(saved,'hex'),actual)&&valid;
}
