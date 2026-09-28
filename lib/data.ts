import Papa from 'papaparse';
import * as XLSX from 'xlsx';
export type Cell = string | number | boolean | null;
export type Row = Record<string, Cell>;
export type Dataset = {name:string; format:string; columns:string[]; rows:Row[]};
export type Loaded = {name:string; format:string; sheets:Record<string,Dataset>};
export type ColumnTreatment = 'keep'|'remove'|'geo'|'age'|'salary';
export const ID='pseudonymized_id';
export const LEGACY_ID='anonymized_id';
export const PSEUDONYMIZED_SUFFIX='_pseudonymized';

const REGION_NAMES:Record<string,string>={
 '01':'Guadeloupe','02':'Martinique','03':'Guyane','04':'La Réunion','06':'Mayotte','11':'Île-de-France','24':'Centre-Val de Loire','27':'Bourgogne-Franche-Comté','28':'Normandie','32':'Hauts-de-France','44':'Grand Est','52':'Pays de la Loire','53':'Bretagne','75':'Nouvelle-Aquitaine','76':'Occitanie','84':'Auvergne-Rhône-Alpes','93':'Provence-Alpes-Côte d’Azur','94':'Corse'
};
const DEPARTMENTS:Array<[string,string,string]>=[
['01','Ain','84'],['02','Aisne','32'],['03','Allier','84'],['04','Alpes-de-Haute-Provence','93'],['05','Hautes-Alpes','93'],['06','Alpes-Maritimes','93'],['07','Ardèche','84'],['08','Ardennes','44'],['09','Ariège','76'],['10','Aube','44'],['11','Aude','76'],['12','Aveyron','76'],['13','Bouches-du-Rhône','93'],['14','Calvados','28'],['15','Cantal','84'],['16','Charente','75'],['17','Charente-Maritime','75'],['18','Cher','24'],['19','Corrèze','75'],['21','Côte-d’Or','27'],['22','Côtes-d’Armor','53'],['23','Creuse','75'],['24','Dordogne','75'],['25','Doubs','27'],['26','Drôme','84'],['27','Eure','28'],['28','Eure-et-Loir','24'],['29','Finistère','53'],['2A','Corse-du-Sud','94'],['2B','Haute-Corse','94'],['30','Gard','76'],['31','Haute-Garonne','76'],['32','Gers','76'],['33','Gironde','75'],['34','Hérault','76'],['35','Ille-et-Vilaine','53'],['36','Indre','24'],['37','Indre-et-Loire','24'],['38','Isère','84'],['39','Jura','27'],['40','Landes','75'],['41','Loir-et-Cher','24'],['42','Loire','84'],['43','Haute-Loire','84'],['44','Loire-Atlantique','52'],['45','Loiret','24'],['46','Lot','76'],['47','Lot-et-Garonne','75'],['48','Lozère','76'],['49','Maine-et-Loire','52'],['50','Manche','28'],['51','Marne','44'],['52','Haute-Marne','44'],['53','Mayenne','52'],['54','Meurthe-et-Moselle','44'],['55','Meuse','44'],['56','Morbihan','53'],['57','Moselle','44'],['58','Nièvre','27'],['59','Nord','32'],['60','Oise','32'],['61','Orne','28'],['62','Pas-de-Calais','32'],['63','Puy-de-Dôme','84'],['64','Pyrénées-Atlantiques','75'],['65','Hautes-Pyrénées','76'],['66','Pyrénées-Orientales','76'],['67','Bas-Rhin','44'],['68','Haut-Rhin','44'],['69','Rhône','84'],['70','Haute-Saône','27'],['71','Saône-et-Loire','27'],['72','Sarthe','52'],['73','Savoie','84'],['74','Haute-Savoie','84'],['75','Paris','11'],['76','Seine-Maritime','28'],['77','Seine-et-Marne','11'],['78','Yvelines','11'],['79','Deux-Sèvres','75'],['80','Somme','32'],['81','Tarn','76'],['82','Tarn-et-Garonne','76'],['83','Var','93'],['84','Vaucluse','93'],['85','Vendée','52'],['86','Vienne','75'],['87','Haute-Vienne','75'],['88','Vosges','44'],['89','Yonne','27'],['90','Territoire de Belfort','27'],['91','Essonne','11'],['92','Hauts-de-Seine','11'],['93','Seine-Saint-Denis','11'],['94','Val-de-Marne','11'],['95','Val-d’Oise','11'],['971','Guadeloupe','01'],['972','Martinique','02'],['973','Guyane','03'],['974','La Réunion','04'],['976','Mayotte','06']
];
const DEP_BY_CODE=new Map(DEPARTMENTS.map(([code,name,region])=>[code,{code,name,region}]));
function normalizeText(v:string){return v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[’']/g,"'").trim().toLowerCase();}
const DEP_BY_NAME=new Map(DEPARTMENTS.map(([code,name,region])=>[normalizeText(name),{code,name,region}]));

type CommuneReference={nom:string;departement:string};
let communeIndexPromise:Promise<Map<string,string|null>>|null=null;
async function loadCommuneIndex(){
 if(communeIndexPromise)return communeIndexPromise;
 communeIndexPromise=(async()=>{
  const response=await fetch('https://unpkg.com/@etalab/decoupage-administratif@6.0.0/data/communes.json');
  if(!response.ok)throw Error('Impossible de charger le référentiel géographique public nécessaire à la transformation des villes.');
  const communes=await response.json() as CommuneReference[];
  const index=new Map<string,string|null>();
  for(const commune of communes){
   if(!commune?.nom||!commune?.departement)continue;
   const key=normalizeText(commune.nom),existing=index.get(key);
   if(existing===undefined)index.set(key,commune.departement);
   else if(existing!==commune.departement)index.set(key,null);
  }
  return index;
 })();
 return communeIndexPromise;
}

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
 return 'pseudo_'+key;
}
function toNumber(value:Cell){
 if(typeof value==='number')return Number.isFinite(value)?value:null;
 if(typeof value!=='string')return null;
 const cleaned=value.trim().replace(/\s/g,'').replace(/€/g,'').replace(',', '.');
 const n=Number(cleaned);return Number.isFinite(n)?n:null;
}
function generalizeAge(value:Cell):Cell{
 const n=toNumber(value);if(n===null||n<0)return value;
 const low=Math.floor(n/5)*5;return `${low}-${low+5} ans`;
}
function generalizeSalary(value:Cell):Cell{
 const n=toNumber(value);if(n===null||n<0)return value;
 const low=Math.floor(n/5000)*5000;return `${low.toLocaleString('fr-FR')} - ${(low+5000).toLocaleString('fr-FR')}`;
}
async function generalizeGeoValues(values:Cell[]):Promise<Cell[]>{
 const parsed=values.map(v=>typeof v==='string'||typeof v==='number'?String(v).trim():'');
 const allDepartmentLike=parsed.every(v=>!v||DEP_BY_CODE.has(v.toUpperCase())||DEP_BY_NAME.has(normalizeText(v)));
 if(allDepartmentLike){
  return parsed.map((v,i)=>{
   if(!v)return values[i];
   const dep=DEP_BY_CODE.get(v.toUpperCase())||DEP_BY_NAME.get(normalizeText(v));
   return dep?REGION_NAMES[dep.region]||dep.region:values[i];
  });
 }
 const communes=await loadCommuneIndex();
 return parsed.map((v,i)=>{
  if(!v)return values[i];
  const depCode=communes.get(normalizeText(v));
  if(!depCode)return depCode===null?'Commune ambiguë':values[i];
  return DEP_BY_CODE.get(depCode)?.name||depCode;
 });
}
export async function pseudonymize(data:Dataset,treatments:Record<string,ColumnTreatment>){
 if(data.columns.includes(ID)||data.columns.includes(LEGACY_ID)) throw Error('Une colonne d’identifiant de pseudonymisation existe déjà. Renommez-la avant de commencer.');
 const selected=data.columns.filter(c=>(treatments[c]||'keep')!=='keep');
 if(!selected.length)throw Error('Sélectionnez au moins une colonne à retirer ou pseudonymiser.');
 const generatedNames=new Set<string>();
 for(const c of data.columns){
  if((treatments[c]||'keep')==='remove')continue;
  const name=(treatments[c]||'keep')==='keep'?c:c+PSEUDONYMIZED_SUFFIX;
  if(generatedNames.has(name)||data.columns.includes(name)&&name!==c)throw Error(`Le nom de colonne « ${name} » entrerait en conflit avec une colonne existante.`);
  generatedNames.add(name);
 }
 const used=new Set<string>();
 const mappingRows:Row[]=data.rows.map(r=>{let id=newId();while(used.has(id))id=newId();used.add(id);return {[ID]:id,...r};});
 const pseudoColumns=[ID,...data.columns.filter(c=>(treatments[c]||'keep')!=='remove').map(c=>(treatments[c]||'keep')==='keep'?c:c+PSEUDONYMIZED_SUFFIX)];
 const transformedByColumn:Record<string,Cell[]>=Object.create(null);
 for(const c of data.columns){
  const treatment=treatments[c]||'keep';if(treatment==='keep'||treatment==='remove')continue;
  const values=data.rows.map(r=>r[c]??null);
  transformedByColumn[c]=treatment==='age'?values.map(generalizeAge):treatment==='salary'?values.map(generalizeSalary):await generalizeGeoValues(values);
 }
 const pseudoRows:Row[]=mappingRows.map((r,rowIndex)=>{
  const out:Row={[ID]:r[ID]};
  for(const c of data.columns){
   const treatment=treatments[c]||'keep';if(treatment==='remove')continue;
   if(treatment==='keep')out[c]=r[c]??null;else out[c+PSEUDONYMIZED_SUFFIX]=transformedByColumn[c][rowIndex]??null;
  }
  return out;
 });
 return {mapping:{...data,columns:[ID,...data.columns],rows:mappingRows},pseudonymized:{...data,columns:pseudoColumns,rows:pseudoRows}};
}
function findIdColumn(data:Dataset){
 if(data.columns.includes(ID))return ID;
 if(data.columns.includes(LEGACY_ID))return LEGACY_ID;
 throw Error(`La colonne ${ID} est absente de ${data.name}.`);
}
function index(data:Dataset){
 const idColumn=findIdColumn(data);const m=new Map<string,Row>();let duplicates=0,invalid=0;
 for(const r of data.rows){const id=r[idColumn];if(typeof id!=='string'||!id.trim()){invalid++;continue;}if(m.has(id))duplicates++;else m.set(id,r);}
 return {m,duplicates,invalid,idColumn};
}
export function reconcile(source:Dataset,result:Dataset){
 const a=index(source),b=index(result);
 const matched=[...a.m.keys()].filter(k=>b.m.has(k)).length;
 const unknown=[...b.m.keys()].filter(k=>!a.m.has(k));
 const missing=[...a.m.keys()].filter(k=>!b.m.has(k));
 const sourceOriginalColumns=source.columns.filter(c=>c!==a.idColumn);
 const incoming=result.columns.filter(c=>c!==b.idColumn).filter(c=>{
  // Le mapping est la source de vérité pour toutes les colonnes d'origine.
  // Une colonne renvoyée telle quelle par l'IA ne doit donc jamais être dupliquée
  // (ex. commentaire -> commentaire_ai). Seules les nouvelles colonnes IA sont ajoutées.
  if(sourceOriginalColumns.includes(c))return false;
  if(!c.endsWith(PSEUDONYMIZED_SUFFIX))return true;
  const original=c.slice(0,-PSEUDONYMIZED_SUFFIX.length);
  return !sourceOriginalColumns.includes(original);
 });
 const occupied=new Set(sourceOriginalColumns);const renames:Record<string,string>=Object.create(null);
 for(const c of incoming){let name=c,i=2;if(occupied.has(name)){name=c+'_ai';while(occupied.has(name)||incoming.includes(name))name=c+'_ai_'+i++;}occupied.add(name);renames[c]=name;}
 const rows=source.rows.map(r=>{const extra=b.m.get(r[a.idColumn] as string);return {...Object.fromEntries(sourceOriginalColumns.map(c=>[c,r[c]??null])),...Object.fromEntries(incoming.map(c=>[renames[c],extra?.[c]??null]))};});
 return {matched,unknown,missing,duplicates:a.duplicates+b.duplicates,invalid:a.invalid+b.invalid,renames,data:{...source,columns:[...sourceOriginalColumns,...incoming.map(c=>renames[c])],rows}};
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
