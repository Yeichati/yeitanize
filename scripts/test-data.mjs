import assert from 'node:assert/strict';
import {readFile,pseudonymize,reconcile,encode,newId,ID} from '../lib/data.ts';
const rows=Array.from({length:100},(_,i)=>({nom:'Élodie '+i,email:`test${i}@example.com`,CA:i,code:'00123',note:'a; b, "c"\nligne 2'}));
const data={name:'clients.json',format:'json',columns:Object.keys(rows[0]),rows};
for(const format of ['json','csv','xls','xlsx']){
 const original=Object.values((await readFile(new File([encode(data,format)],'clients.'+format))).sheets)[0];
 assert.equal(original.rows.length,100);assert.equal(original.rows[0].code,'00123');assert.equal(original.rows[0].nom,'Élodie 0');assert.equal(original.rows[0].note,rows[0].note);
 const {mapping,anonymous}=pseudonymize(original,['nom','email']);
 assert(!anonymous.columns.includes('nom'));assert(!anonymous.columns.includes('email'));
 assert.equal(new Set(mapping.rows.map(r=>r[ID])).size,100);
 const roundMapping=Object.values((await readFile(new File([encode(mapping,format)],'mapping.'+format))).sheets)[0];
 const result={...anonymous,columns:[ID,'segment','CA','CA_ai'],rows:[...anonymous.rows].reverse().map(r=>({[ID]:r[ID],segment:'Premium',CA:99,CA_ai:'existant'}))};
 const roundResult=Object.values((await readFile(new File([encode(result,format)],'result.'+format))).sheets)[0];
 const report=reconcile(roundMapping,roundResult);assert.equal(report.matched,100);assert.equal(report.data.rows[0].nom,'Élodie 0');assert.equal(report.data.rows[0].segment,'Premium');assert.equal(String(report.data.rows[0].CA),'0');assert.equal(new Set(report.data.columns).size,report.data.columns.length);assert(!report.data.columns.includes(ID));
 const anomalies=reconcile(mapping,{...result,rows:[result.rows[0],result.rows[0],{[ID]:'UNKNOWN'}]});assert.equal(anomalies.duplicates,1);assert.equal(anomalies.unknown.length,1);assert.equal(anomalies.missing.length,99);
 const caseChanged=reconcile(mapping,{...result,rows:[{[ID]:String(mapping.rows[0][ID]).toUpperCase()}]});assert.equal(caseChanged.matched,0);
 console.log(format+': cycle complet 100 lignes OK');
}
for(let i=0;i<1000;i++){const id=newId();assert.match(id,/^anon_[a-zA-Z0-9]{24}$/);assert.match(id.slice(5),/[A-Z]/);assert.match(id.slice(5),/[a-z]/);assert.match(id.slice(5),/[0-9]/);}
await assert.rejects(()=>readFile(new File(['a,a\n1,2'],'duplicate.csv')));
await assert.rejects(()=>readFile(new File(['[{"a":{"nested":1}}]'],'nested.json')));
assert.throws(()=>reconcile(data,data),/absente/);
assert.throws(()=>pseudonymize({...data,columns:[ID,...data.columns]},['nom']),/existe déjà/);
console.log('IDs, conflits, doublons, casse et fichiers invalides OK');
