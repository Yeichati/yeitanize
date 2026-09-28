import Papa from 'papaparse';
import * as XLSX from 'xlsx';
export type Cell = string | number | boolean | null;
export type Row = Record<string, Cell>;
export type Dataset = {name:string; format:string; columns:string[]; rows:Row[]};
export type Loaded = {name:string; format:string; sheets:Record<string,Dataset>};
export const ID='anonymized_id';
function validate(columns:string[],rows:Row[],name:string,format:string):Dataset {
 if(!columns.length||!rows.length) throw Error('Ce fichier ne contient aucune ligne de données.');
 if(columns.some(c=>!c.trim())||new Set(columns).size!==columns.length) throw Error('Les noms de colonnes doivent être renseignés et uniques.');
 if(rows.length>100000||columns.length>500) throw Error('Limite du POC : 100 000 lignes et 500 colonnes par feuille.');
 return {name,format,columns,rows};
}
export async function readFile(file:File):Promise<Loaded>{
 const format=file.name.split('.').pop()?.toLowerCase()||'';
 if(!['csv','json','xls','xlsx'].includes(format)) throw Error('Format non supporté. Utilisez un fichier CSV, JSON, XLS ou XLSX.');
 if(file.size>20*1024*1024) throw Error('Ce fichier dépasse la limite de 20 Mo du POC.');
 const sheets:Record<string,Dataset>=Object.create(null);
 if(format==='json'){
  let data;try {data=JSON.parse((await file.text()).replace(/^\uFEFF/,''));}catch{throw Error('JSON invalide. Vérifiez la syntaxe du fichier.');}
  if(!Array.isArray(data)||!data.length||data.some(r=>!r||Array.isArray(r)||typeof r!=='object')) throw Error('Le JSON doit être un tableau d’objets non vide.');
  if(data.some(r=>Object.values(r).some(v=>v!==null&&typeof v==='object'))) throw Error('Le POC accepte uniquement des champs JSON simples, sans objets ni tableaux imbriqués.');
  const columns=Array.from(new Set<string>(data.flatMap(r=>Object.keys(r))));
  sheets.Données=validate(columns,data,file.name,format);
 }else if(format==='csv'){
  const parsed=Papa.parse<string[]>((await file.text()).replace(/^\uFEFF/,''),{skipEmptyLines:'greedy',dynamicTyping:false});
  if(parsed.errors.length) throw Error('CSV invalide : '+parsed.errors[0].message);
  const [columns,...values]=parsed.data;
  if(!columns||values.some(r=>r.length!==columns.length)) throw Error('CSV invalide : chaque ligne doit avoir le même nombre de colonnes.');
  sheets.Données=validate(columns,values.map(r=>Object.fromEntries(columns.map((c,i)=>[c,r[i]]))),file.name,format);
 }else{
  let wb; try{wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false});}catch{throw Error('Impossible de lire ce classeur. Vérifiez son format et retirez sa protection par mot de passe.');}
  for(const name of wb.SheetNames){
   const matrix=XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[name],{header:1,defval:null,raw:true,blankrows:false});
   if(matrix.length<2) continue;
   const columns=matrix[0].map(v=>String(v??''));
   if(matrix.some(r=>r.length>columns.length)) throw Error('La feuille « '+name+' » contient des cellules sans en-tête.');
   sheets[name]=validate(columns,matrix.slice(1).map(r=>Object.fromEntries(columns.map((c,i)=>[c,r[i]??null]))),file.name,format);
  }
  if(!Object.keys(sheets).length) throw Error('Ce classeur ne contient aucune feuille avec des données.');
 }
 return {name:file.name,format,sheets};
}
export function newId(){
 const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
 let key='';while(key.length<24){for(const n of crypto.getRandomValues(new Uint8Array(32))){if(n<248)key+=chars[n%62];if(key.length===24)break;}}
 if(!/[a-z]/.test(key)||!/[A-Z]/.test(key)||!/[0-9]/.test(key)) return newId();
 return 'anon_'+key;
}
export function pseudonymize(data:Dataset,hidden:string[]){
 if(data.columns.includes(ID)) throw Error('La colonne anonymized_id existe déjà. Renommez-la avant de commencer.');
 if(!hidden.length)throw Error('Sélectionnez au moins une colonne à masquer.');
 const used=new Set<string>();
 const rows:Row[]=data.rows.map(r=>{let id=newId();while(used.has(id))id=newId();used.add(id);return {[ID]:id,...r};});
 const cols=[ID,...data.columns.filter(c=>!hidden.includes(c))];
 return {mapping:{...data,columns:[ID,...data.columns],rows},anonymous:{...data,columns:cols,rows:rows.map(r=>Object.fromEntries(cols.map(c=>[c,r[c]])))}};
}
function index(data:Dataset){
 if(!data.columns.includes(ID))throw Error('La colonne anonymized_id est absente de '+data.name+'.');
 const m=new Map<string,Row>();let duplicates=0,invalid=0;
 for(const r of data.rows){const id=r[ID];if(typeof id!=='string'||!id.trim()){invalid++;continue;}if(m.has(id))duplicates++;else m.set(id,r);}
 return {m,duplicates,invalid};
}
export function reconcile(source:Dataset,result:Dataset){
 const a=index(source),b=index(result);
 const matched=[...a.m.keys()].filter(k=>b.m.has(k)).length;
 const unknown=[...b.m.keys()].filter(k=>!a.m.has(k));
 const missing=[...a.m.keys()].filter(k=>!b.m.has(k));
 const occupied=new Set(source.columns);const renames:Record<string,string>=Object.create(null);
 const incoming=result.columns.filter(c=>c!==ID);
 for(const c of incoming){let name=c,i=2;if(occupied.has(name)){name=c+'_ai';while(occupied.has(name)||incoming.includes(name))name=c+'_ai_'+i++;}occupied.add(name);renames[c]=name;}
 const rows=source.rows.map(r=>{const extra=b.m.get(r[ID] as string);return {...Object.fromEntries(source.columns.filter(c=>c!==ID).map(c=>[c,r[c]??null])),...Object.fromEntries(incoming.map(c=>[renames[c],extra?.[c]??null]))};});
 return {matched,unknown,missing,duplicates:a.duplicates+b.duplicates,invalid:a.invalid+b.invalid,renames,data:{...source,columns:[...source.columns.filter(c=>c!==ID),...incoming.map(c=>renames[c])],rows}};
}
export function encode(data:Dataset,format:string):Blob{
 const rows=data.rows.map(r=>Object.fromEntries(data.columns.map(c=>[c,r[c]??null])));
 if(format==='json')return new Blob([JSON.stringify(rows,null,2)],{type:'application/json'});
 if(format==='csv')return new Blob(['\uFEFF'+Papa.unparse({fields:data.columns,data:rows.map(r=>data.columns.map(c=>r[c]))},{escapeFormulae:true})],{type:'text/csv;charset=utf-8'});
 if(format==='xls'&&(rows.length>65535||data.columns.length>256))throw Error('Le format XLS est limité à 65 535 lignes de données et 256 colonnes. Choisissez XLSX.');
 const sheet=XLSX.utils.aoa_to_sheet([data.columns,...rows.map(r=>data.columns.map(c=>r[c]))]);
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,sheet,'Données');
 return new Blob([XLSX.write(wb,{type:'array',bookType:format==='xls'?'biff8':'xlsx'})],{type:'application/octet-stream'});
}
export function download(data:Dataset,format:string,suffix:string){
 const url=URL.createObjectURL(encode(data,format));const a=document.createElement('a');a.href=url;a.download=data.name.replace(/\.[^.]+$/,'')+'_'+suffix+'.'+format;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
