"use strict";

const DB_NAME="field_survey_ledger_db", DB_VERSION=2, STORE="app", RECOVERY_STORE="recovery", PHOTO_STORE="photos";
const KEY="state", RECOVERY_KEY="latest", EMERGENCY_KEY="field_survey_ledger_emergency_v3", LEGACY_EMERGENCY_KEY="field_survey_ledger_emergency_v2", SCHEMA_VERSION=3;
const BUILD_ID="20260916-RELEASE-01";
const MAX_SIDE=2200, JPEG_QUALITY=.82;
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>\"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const round3=n=>Math.round((Number(n)||0)*1000)/1000;
const uid=()=>crypto.randomUUID?crypto.randomUUID():"id_"+Date.now()+"_"+Math.random().toString(16).slice(2);
const now=()=>new Date().toISOString();
const localDate=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const mkPoint=(x,y,id=uid())=>({id,x:clamp(Number(x)||0,0,1),y:clamp(Number(y)||0,0,1)});
function normalizeAnnotation(a){if(!a||!Array.isArray(a.points))return null;return{...a,points:a.points.map(p=>mkPoint(p.x,p.y,p.id||uid()))}}
function recordAudit(type,data={}){const s=currentSite();if(!s)return;(s.auditTrail||(s.auditTrail=[])).push({id:uid(),type,at:now(),...data});if(s.auditTrail.length>1500)s.auditTrail.splice(0,s.auditTrail.length-1500)}
const photoCache=new Map();
let db=null, saveTimer=null, state={schemaVersion:SCHEMA_VERSION,updatedAt:"",currentSiteId:"",sites:[]};
let activeSurfaceId="", activeItemId="", activeAreaMode="rect", draft=null, showSaved=false, beamParts=[], undoStack=[];
let openingMode=false, openingParentItemId="";
let dragIndex=-1, pointerActive=false, activePointerId=null, pointerStartSnapshot=null;

function blankItem(name="",unit="㎡",group="塗装"){return{id:uid(),name,unit,group,memo:""}}
function defaultItems(){return[
  blankItem("外壁","㎡","塗装"),blankItem("軒天","㎡","塗装"),blankItem("破風","m","付帯"),blankItem("横樋","m","付帯"),blankItem("竪樋","m","付帯")
]}
function newSite(){const id=uid();return{id,name:"",date:localDate(),staff:"",address:"",memo:"",items:defaultItems(),entries:[],surfaces:[],lastSurfaceItemIds:[],itemPrefs:{},auditTrail:[]}}
function currentSite(){return state.sites.find(s=>s.id===state.currentSiteId)||state.sites[0]}
function newSurface(site){const seq=(site.surfaces?.reduce((m,x)=>Math.max(m,Number(x.seq)||0),0)||0)+1;return{id:uid(),seq,selectedItemIds:[],photoRef:"",photoHistory:[],calibrations:[],calibrationRevision:0,objects:[],calibrationSkipped:false,imageAspect:0,completionWarnings:[],completed:false,startedAt:now(),completedAt:""}}
function normalize(raw){
  const src=raw&&typeof raw==="object"?raw:{};
  const out={schemaVersion:SCHEMA_VERSION,updatedAt:src.updatedAt||"",currentSiteId:src.currentSiteId||"",sites:[]};
  const sites=Array.isArray(src.sites)?src.sites:[];
  out.sites=sites.map(s=>{
    const base=newSite();
    const site={...base,...s};
    site.items=Array.isArray(s.items)?s.items.map(i=>({...blankItem(),...i})):defaultItems();
    site.entries=Array.isArray(s.entries)?s.entries.map(e=>({...e,photos:Array.isArray(e.photos)?e.photos:[],annotation:normalizeAnnotation(e.annotation),surfaceId:e.surfaceId||"",role:e.role||"normal",measurement:e.measurement&&typeof e.measurement==="object"?e.measurement:null,calibrationRevision:Number(e.calibrationRevision)||0})):[];
    site.surfaces=Array.isArray(s.surfaces)?s.surfaces.map((sf,idx)=>({id:sf.id||uid(),seq:Number(sf.seq)||idx+1,selectedItemIds:Array.isArray(sf.selectedItemIds)?sf.selectedItemIds:[],photoRef:sf.photoRef||"",photoHistory:Array.isArray(sf.photoHistory)?sf.photoHistory:[],calibrations:Array.isArray(sf.calibrations)?sf.calibrations.map(c=>({...c,points:Array.isArray(c.points)?c.points.map(p=>mkPoint(p.x,p.y,p.id||uid())):[]})):[],calibrationRevision:Number(sf.calibrationRevision)||0,objects:Array.isArray(sf.objects)?sf.objects.map(o=>({...o,annotation:normalizeAnnotation(o.annotation)})):[],calibrationSkipped:!!sf.calibrationSkipped,imageAspect:Number(sf.imageAspect)||0,completionWarnings:Array.isArray(sf.completionWarnings)?sf.completionWarnings:[],completed:!!sf.completed,startedAt:sf.startedAt||now(),completedAt:sf.completedAt||""})):[];
    site.lastSurfaceItemIds=Array.isArray(s.lastSurfaceItemIds)?s.lastSurfaceItemIds:[];
    site.itemPrefs=s.itemPrefs&&typeof s.itemPrefs==="object"?s.itemPrefs:{};
    site.auditTrail=Array.isArray(s.auditTrail)?s.auditTrail:[];
    return site;
  });
  if(!out.sites.length)out.sites=[newSite()];
  if(!out.sites.some(s=>s.id===out.currentSiteId))out.currentSiteId=out.sites[0].id;
  return out;
}
function isDataUrl(v){return typeof v==="string"&&v.startsWith("data:image/")}
function validState(v){return !!(v&&typeof v==="object"&&Array.isArray(v.sites))}
function activeSurface(){return currentSite()?.surfaces?.find(s=>s.id===activeSurfaceId)||null}
function activeItem(){return currentSite()?.items?.find(i=>i.id===activeItemId)||null}
function touchSurface(){const sf=activeSurface();if(sf){sf.completed=false;sf.completedAt="";sf.completionWarnings=[]}}
function surfaceEntries(surfaceId=activeSurfaceId){return currentSite().entries.filter(e=>e.surfaceId===surfaceId)}
function itemEntries(itemId){return currentSite().entries.filter(e=>e.itemId===itemId)}

function openDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE);if(!d.objectStoreNames.contains(RECOVERY_STORE))d.createObjectStore(RECOVERY_STORE);if(!d.objectStoreNames.contains(PHOTO_STORE))d.createObjectStore(PHOTO_STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function idbGet(store,key){return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readonly"),r=tx.objectStore(store).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function idbPut(store,key,value){return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readwrite"),r=tx.objectStore(store).put(value,key);tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error)})}
function idbDelete(store,key){return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).delete(key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}
function idbClear(store){return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).clear();tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}
function idbKeys(store){return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readonly"),r=tx.objectStore(store).getAllKeys();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)})}
function readEmergency(){for(const k of [EMERGENCY_KEY,LEGACY_EMERGENCY_KEY])try{const x=JSON.parse(localStorage.getItem(k)||"null");if(validState(x?.state))return x}catch{}return null}
function writeEmergency(){try{localStorage.setItem(EMERGENCY_KEY,JSON.stringify({state,updatedAt:state.updatedAt||now()}))}catch{}}
async function photoGet(ref){if(!ref)return"";if(isDataUrl(ref))return ref;if(photoCache.has(ref))return photoCache.get(ref);const v=await idbGet(PHOTO_STORE,ref).catch(()=>"");if(v)photoCache.set(ref,v);return v||""}
async function photoPut(data,id=uid()){await idbPut(PHOTO_STORE,id,data);photoCache.set(id,data);return id}
function allPhotoRefs(data=state){const refs=[];for(const s of data.sites||[]){for(const sf of s.surfaces||[]){if(sf.photoRef)refs.push(sf.photoRef);for(const h of sf.photoHistory||[])if(h.photoRef)refs.push(h.photoRef)}for(const e of s.entries||[])for(const p of e.photos||[])if(typeof p==="string"&&p)refs.push(p)}return refs}
async function hydratePhotos(){for(const ref of [...new Set(allPhotoRefs().filter(r=>!isDataUrl(r)))])await photoGet(ref)}
async function migrateInlinePhotos(){let changed=false;for(const s of state.sites){for(const sf of s.surfaces||[]){if(isDataUrl(sf.photoRef)){sf.photoRef=await photoPut(sf.photoRef);changed=true}for(const h of sf.photoHistory||[])if(isDataUrl(h.photoRef)){h.photoRef=await photoPut(h.photoRef);changed=true}}for(const e of s.entries){const out=[];for(const p of e.photos||[]){if(isDataUrl(p)){out.push(await photoPut(p));changed=true}else if(p&&typeof p==="object"&&isDataUrl(p.data)){out.push(await photoPut(p.data,p.id||uid()));changed=true}else if(typeof p==="string")out.push(p)}e.photos=out}}return changed}
async function cleanupPhotos(){const used=new Set(allPhotoRefs().filter(Boolean).filter(r=>!isDataUrl(r))),keys=await idbKeys(PHOTO_STORE);for(const k of keys)if(!used.has(k)){await idbDelete(PHOTO_STORE,k).catch(()=>{});photoCache.delete(k)}}
async function load(){db=await openDb();const primary=await idbGet(STORE,KEY).catch(()=>null),recoveryRaw=await idbGet(RECOVERY_STORE,RECOVERY_KEY).catch(()=>null),recovery=recoveryRaw?.state||recoveryRaw,em=readEmergency();const c=[primary,recovery,em?.state].filter(validState).sort((a,b)=>Date.parse(b.updatedAt||0)-Date.parse(a.updatedAt||0));state=normalize(c[0]||state);const migrated=await migrateInlinePhotos();await hydratePhotos();await cleanupPhotos();if(migrated||Number(c[0]?.schemaVersion||1)<SCHEMA_VERSION)await saveNow(true)}
function setSaveState(t,bad=false){const e=$("saveState");if(e){e.textContent=t;e.style.color=bad?"#b42318":""}}
function saveSoon(){clearTimeout(saveTimer);setSaveState("保存中…");saveTimer=setTimeout(()=>saveNow().catch(()=>{}),280)}
async function saveNow(quiet=false){state.schemaVersion=SCHEMA_VERSION;state.updatedAt=now();writeEmergency();const snap=structuredClone(state);await new Promise((resolve,reject)=>{const tx=db.transaction([STORE,RECOVERY_STORE],"readwrite");tx.objectStore(STORE).put(snap,KEY);tx.objectStore(RECOVERY_STORE).put({state:snap,savedAt:state.updatedAt},RECOVERY_KEY);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});if(!quiet)setSaveState("保存済み");updateStorage()}

function readFile(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(r.error);r.readAsDataURL(file)})}
async function compress(file){const src=await readFile(file);return new Promise((res,rej)=>{const im=new Image();im.onload=()=>{const ratio=Math.min(1,MAX_SIDE/im.naturalWidth,MAX_SIDE/im.naturalHeight),w=Math.max(1,Math.round(im.naturalWidth*ratio)),h=Math.max(1,Math.round(im.naturalHeight*ratio)),c=document.createElement("canvas");c.width=w;c.height=h;const x=c.getContext("2d",{alpha:false});x.fillStyle="#fff";x.fillRect(0,0,w,h);x.drawImage(im,0,0,w,h);res(c.toDataURL("image/jpeg",JPEG_QUALITY))};im.onerror=()=>rej(new Error("画像読込失敗"));im.src=src})}

function syncSiteFromUi(){const s=currentSite();s.name=$("siteName").value||"";s.date=$("siteDate").value||"";s.staff=$("siteStaff").value||"";s.address=$("siteAddress").value||"";s.memo=$("siteMemo").value||""}
