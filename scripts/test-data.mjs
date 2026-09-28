import assert from 'node:assert/strict';
import {readFile,pseudonymize,anonymize,reconcile,encode,newId,newAnonymousId,ID,ANONYMOUS_ID} from '../lib/data.ts';
const rows=Array.from({length:100},(_,i)=>({nom:'Élodie '+i,email:`test${i}@example.com`,age:32+i%10,salaire:77863.93+i,departement:'75',code_postal:i%2?'69003':'75011',date_naissance:'1992-06-14',CA:i,code:'00123',note:'a; b, "c"\nligne 2'}));
const data={name:'clients.json',format:'json',columns:Object.keys(rows[0]),rows};
for(const format of ['json','csv','xls','xlsx']){
 const original=Object.values((await readFile(new File([encode(data,format)],'clients.'+format))).sheets)[0];
 assert.equal(original.rows.length,100);assert.equal(original.rows[0].code,'00123');assert.equal(original.rows[0].nom,'Élodie 0');assert.equal(original.rows[0].note,rows[0].note);
 const {mapping,pseudonymized}=await pseudonymize(original,{nom:'remove',email:'remove',age:'age',salaire:'salary',departement:'geo'});
 assert(!pseudonymized.columns.includes('nom'));assert(!pseudonymized.columns.includes('email'));
 assert(pseudonymized.columns.includes('age_pseudonymized'));assert(pseudonymized.columns.includes('salaire_pseudonymized'));assert(pseudonymized.columns.includes('departement_pseudonymized'));
 assert.equal(String(pseudonymized.rows[0].age_pseudonymized),'30-35 ans');
 assert.match(String(pseudonymized.rows[0].salaire_pseudonymized),/^75.*000 - 80.*000$/);
 assert.equal(String(pseudonymized.rows[0].departement_pseudonymized),'Île-de-France');
 const postalPseudo=await pseudonymize(original,{code_postal:'geo'});assert.equal(String(postalPseudo.pseudonymized.rows[0].code_postal_pseudonymized),'Paris');assert.equal(String(postalPseudo.pseudonymized.rows[1].code_postal_pseudonymized),'Rhône');
 const anon=await anonymize(original,{nom:'remove',email:'remove',age:'age',salaire:'salary',code_postal:'geo',date_naissance:'date'});assert(anon.columns.includes(ANONYMOUS_ID));assert(!anon.columns.includes('nom'));assert(!anon.columns.includes('email'));assert.equal(String(anon.rows[0].code_postal),'Paris');assert.equal(String(anon.rows[1].code_postal),'Rhône');assert.equal(String(anon.rows[0].date_naissance),'1992');assert.match(String(anon.rows[0][ANONYMOUS_ID]),/^anon_[a-zA-Z0-9]{20}$/);
 assert.equal(new Set(mapping.rows.map(r=>r[ID])).size,100);
 const roundMapping=Object.values((await readFile(new File([encode(mapping,format)],'mapping.'+format))).sheets)[0];
 const result={...pseudonymized,columns:[ID,'age_pseudonymized','salaire_pseudonymized','segment','CA','CA_ai'],rows:[...pseudonymized.rows].reverse().map(r=>({[ID]:r[ID],age_pseudonymized:r.age_pseudonymized,salaire_pseudonymized:r.salaire_pseudonymized,segment:'Premium',CA:99,CA_ai:'existant'}))};
 const roundResult=Object.values((await readFile(new File([encode(result,format)],'result.'+format))).sheets)[0];
 const report=reconcile(roundMapping,roundResult);assert.equal(report.matched,100);assert.equal(report.data.rows[0].nom,'Élodie 0');assert.equal(report.data.rows[0].segment,'Premium');assert.equal(String(report.data.rows[0].CA),'0');assert.equal(report.data.rows[0].CA_ai,'existant');assert.equal(new Set(report.data.columns).size,report.data.columns.length);assert(!report.data.columns.includes(ID));assert(!report.data.columns.includes('age_pseudonymized'));assert(!report.data.columns.includes('salaire_pseudonymized'));assert(!report.data.columns.includes('CA_ai_2'));assert(report.data.columns.includes('age'));assert(report.data.columns.includes('salaire'));
 const anomalies=reconcile(mapping,{...result,rows:[result.rows[0],result.rows[0],{[ID]:'UNKNOWN'}]});assert.equal(anomalies.duplicates,1);assert.equal(anomalies.unknown.length,1);assert.equal(anomalies.missing.length,99);
 const caseChanged=reconcile(mapping,{...result,rows:[{[ID]:String(mapping.rows[0][ID]).toUpperCase()}]});assert.equal(caseChanged.matched,0);
 console.log(format+': cycle complet 100 lignes OK');
}
for(let i=0;i<1000;i++){const id=newId();assert.match(id,/^pseudo_[a-zA-Z0-9]{24}$/);assert.match(id.slice(7),/[A-Z]/);assert.match(id.slice(7),/[a-z]/);assert.match(id.slice(7),/[0-9]/);const anonId=newAnonymousId();assert.match(anonId,/^anon_[a-zA-Z0-9]{20}$/);}
await assert.rejects(()=>readFile(new File(['a,a\n1,2'],'duplicate.csv')));
await assert.rejects(()=>readFile(new File(['[{"a":{"nested":1}}]'],'nested.json')));
assert.throws(()=>reconcile(data,data),/absente/);
await assert.rejects(()=>pseudonymize({...data,columns:[ID,...data.columns]},{nom:'remove'}),/existe déjà/);
console.log('IDs, pseudonymisation, restauration, conflits, doublons, casse et fichiers invalides OK');
