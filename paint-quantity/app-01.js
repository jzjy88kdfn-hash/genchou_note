'use strict';

const DB_NAME='paintQuantityToolDB';
const DB_VERSION=6;
const APP_VERSION=9;
const PRODUCT_VERSION='PAINT_QUANTITY_OPERATIONAL';
const CALCULATION_VERSION='PAINT_QUANTITY_STANDARD';
const STORE_PROJECTS='projects';
const STORE_IMAGES='images';
const STORE_RECOVERY='recovery';
const EMERGENCY_PREFIX='paintQuantityEmergency:';
const DEVICE_DIAG_ID='__paint_quantity_device_diagnostic__';
const DEVICE_DIAG_LOCAL_KEY='paintQuantityDeviceDiagnosticV1';
const RUN_SESSION_ID=uid('session');
const DEFAULT_CATEGORIES=[
  {id:'wall',name:'外壁',unit:'m2'},
  {id:'soffit',name:'軒天',unit:'m2'},
  {id:'barge',name:'破風',unit:'m'},
  {id:'gutter_h',name:'横樋',unit:'m'},
  {id:'gutter_v',name:'竪樋',unit:'m'},
  {id:'band',name:'幕板',unit:'m'},
  {id:'canopy',name:'庇',unit:'m'},
  {id:'flashing',name:'水切り',unit:'m'},
  {id:'seal',name:'コーキング',unit:'m'},
  {id:'shutter',name:'シャッター',unit:'m2'},
  {id:'shutter_box',name:'シャッターBOX',unit:'count'}
];

const $=s=>document.querySelector(s);
const els={
  homeScreen:$('#homeScreen'),workspace:$('#workspace'),summaryScreen:$('#summaryScreen'),
  fileInput:$('#fileInput'),uploadBox:$('#uploadBox'),projectList:$('#projectList'),
  canvas:$('#measureCanvas'),canvasWrap:$('#canvasWrap'),canvasEmpty:$('#canvasEmpty'),
  progressFill:$('#progressFill'),zoomBadge:$('#zoomBadge'),saveBadge:$('#saveBadge'),
  categoryRow:$('#categoryRow'),calibrateBtn:$('#calibrateBtn'),applyCalibrationBtn:$('#applyCalibrationBtn'),applyPerspectiveCalibrationBtn:$('#applyPerspectiveCalibrationBtn'),scaleStatus:$('#scaleStatus'),workflowHint:$('#workflowHint'),
  calibrationManagerList:$('#calibrationManagerList'),calibrationWarnings:$('#calibrationWarnings'),qualityStatus:$('#qualityStatus'),addLineCalibrationBtn:$('#addLineCalibrationBtn'),addPlaneCalibrationBtn:$('#addPlaneCalibrationBtn'),
  panBtn:$('#panBtn'),drawBtn:$('#drawBtn'),minusBtn:$('#minusBtn'),completeShapeBtn:$('#completeShapeBtn'),
  confirmImageBtn:$('#confirmImageBtn'),undoBtn:$('#undoBtn'),redoBtn:$('#redoBtn'),
  prevImageBtn:$('#prevImageBtn'),nextImageBtn:$('#nextImageBtn'),imageListBtn:$('#imageListBtn'),
  importBackupBtn:$('#importBackupBtn'),backupInput:$('#backupInput'),storageCheckBtn:$('#storageCheckBtn'),runReadinessBtn:$('#runReadinessBtn'),deviceDiagnosticHomeBtn:$('#deviceDiagnosticHomeBtn'),readinessBadge:$('#readinessBadge'),readinessSummary:$('#readinessSummary'),readinessItems:$('#readinessItems'),readinessAdvice:$('#readinessAdvice'),
  exportBackupBtn:$('#exportBackupBtn'),settingsStorageBtn:$('#settingsStorageBtn'),storageInfo:$('#storageInfo'),summaryBackupBtn:$('#summaryBackupBtn'),
  restoreRecoveryBtn:$('#restoreRecoveryBtn'),verifyDataBtn:$('#verifyDataBtn'),deviceDiagnosticBtn:$('#deviceDiagnosticBtn'),deviceDiagnosticInfo:$('#deviceDiagnosticInfo'),operationStatus:$('#operationStatus'),finalAuditBtn:$('#finalAuditBtn'),exportCsvBtn:$('#exportCsvBtn'),printReportBtn:$('#printReportBtn'),exportAuditBtn:$('#exportAuditBtn'),
  backBtn:$('#backBtn'),helpBtn:$('#helpBtn'),settingsBtn:$('#settingsBtn'),
  headerTitle:$('#headerTitle'),headerSub:$('#headerSub'),toast:$('#toast')
};

let db=null;
let project=null;
let currentImage=null;
let currentImageRecord=null;
let imageElement=null;
let selectedCategoryId='wall';
let mode='draw';
let minus=false;
let draftPoints=[];
let calibrationDraft=null;
let history=[];
let future=[];
let saveTimer=null;
let pointerState=new Map();
let gestureStart=null;
let view={scale:1,offsetX:0,offsetY:0,minScale:1};
let canvasSize={w:0,h:0,dpr:1};
let isDrawing=false;
let runtimeReadiness=null;
const MAX_PROJECT_IMAGES=100;
const RECOMMENDED_PROJECT_IMAGES=40;
const RECOMMENDED_SOURCE_BYTES=250*1024*1024;

function uid(prefix='id'){return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`}
function nowISO(){return new Date().toISOString()}
function unitLabel(u){return u==='m2'?'㎡':u==='m'?'m':'箇所'}
function fmt(v,u){return u==='count'?`${Math.round(v)} 箇所`:`${Number(v).toFixed(2)} ${unitLabel(u)}`}
function clone(o){return JSON.parse(JSON.stringify(o))}
function bytesLabel(n){
  if(!Number.isFinite(n))return '不明';
  if(n<1024)return `${n}B`;
  if(n<1024*1024)return `${(n/1024).toFixed(1)}KB`;
  if(n<1024*1024*1024)return `${(n/1024/1024).toFixed(1)}MB`;
  return `${(n/1024/1024/1024).toFixed(2)}GB`;
}
function safeFileName(s){return String(s||'案件').replace(/[\\/:*?"<>|]/g,'_').slice(0,60)}
function markImageDirty(){
  if(!currentImage)return;
  currentImage.confirmed=false;currentImage.noTarget=false;
  if(project)project.status='editing';
  updateNavigationUI();
}
function showToast(msg){
  els.toast.textContent=msg;els.toast.classList.add('show');
  clearTimeout(showToast.t);showToast.t=setTimeout(()=>els.toast.classList.remove('show'),1700);
}
function openSheet(id){const sheet=$('#'+id);if(sheet){sheet.classList.add('open');sheet.setAttribute('aria-hidden','false');const first=sheet.querySelector('button,input,select');if(first)setTimeout(()=>{try{first.focus({preventScroll:true})}catch(_){first.focus()}},30)}}
function closeSheet(id){const sheet=$('#'+id);if(sheet){sheet.classList.remove('open');sheet.setAttribute('aria-hidden','true')}}
document.addEventListener('click',e=>{
  const id=e.target.dataset.close;
  if(id){closeSheet(id);if(id==='calibrationSheet'||id==='perspectiveCalibrationSheet'){calibrationDraft=null;mode='draw';updateModeUI();draw()}}
  if(e.target.classList.contains('sheetBackdrop')){const closedId=e.target.id;e.target.classList.remove('open');if(closedId==='calibrationSheet'||closedId==='perspectiveCalibrationSheet'){calibrationDraft=null;mode='draw';updateModeUI();draw()}}
});

function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const d=req.result;
      if(!d.objectStoreNames.contains(STORE_PROJECTS))d.createObjectStore(STORE_PROJECTS,{keyPath:'id'});
      if(!d.objectStoreNames.contains(STORE_IMAGES))d.createObjectStore(STORE_IMAGES,{keyPath:'id'});
      if(!d.objectStoreNames.contains(STORE_RECOVERY))d.createObjectStore(STORE_RECOVERY,{keyPath:'id'});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
function tx(store,mode='readonly'){return db.transaction(store,mode).objectStore(store)}
function dbPut(store,value){return new Promise((resolve,reject)=>{const r=tx(store,'readwrite').put(value);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function dbGet(store,key){return new Promise((resolve,reject)=>{const r=tx(store).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function dbDelete(store,key){return new Promise((resolve,reject)=>{const r=tx(store,'readwrite').delete(key);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)})}
function dbAll(store){return new Promise((resolve,reject)=>{const r=tx(store).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)})}

function fnv1a32Text(text,seed=0x811c9dc5){let h=seed>>>0;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0}return h>>>0}
function checksumObject(value){const text=JSON.stringify(value),h=fnv1a32Text(text);return `FNV1A32-${h.toString(16).padStart(8,'0')}-${text.length}`}
function projectForChecksum(p){const c=clone(p);delete c.integrity;return c}
function projectChecksum(p){return checksumObject(projectForChecksum(p))}
function verifyProjectChecksum(p){return !p?.integrity?.checksum||p.integrity.checksum===projectChecksum(p)}
function recordAudit(action,detail={}){if(!project)return;project.auditTrail=Array.isArray(project.auditTrail)?project.auditTrail:[];project.auditTrail.push({id:uid('audit'),at:nowISO(),action,detail});if(project.auditTrail.length>500)project.auditTrail=project.auditTrail.slice(-500)}
function structuralProjectErrors(p){
  const errors=[];if(!p||typeof p!=='object')return['案件データがありません'];
  if(!p.id)errors.push('案件IDがありません');if(!Array.isArray(p.imageIds)||!Array.isArray(p.images))errors.push('画像一覧が不正です');
  if(Array.isArray(p.imageIds)&&new Set(p.imageIds).size!==p.imageIds.length)errors.push('画像IDが重複しています');
  if(Array.isArray(p.imageIds)&&Array.isArray(p.images)&&(p.imageIds.length!==p.images.length||p.imageIds.some((id,i)=>p.images[i]?.id!==id)))errors.push('画像順序が一致しません');
  if(!Array.isArray(p.categories)||!p.categories.length)errors.push('カテゴリがありません');
  const categoryIds=new Set((p.categories||[]).map(c=>c.id));if(categoryIds.size!==(p.categories||[]).length)errors.push('カテゴリIDが重複しています');
  for(const [i,im] of (p.images||[]).entries()){
    if(!Array.isArray(im.calibrations)||!Array.isArray(im.measurements)){errors.push(`画像${i+1}の計測データが不正です`);continue}
    const calIds=new Set(im.calibrations.map(c=>c.id));if(calIds.size!==im.calibrations.length)errors.push(`画像${i+1}の較正IDが重複しています`);if(im.noTarget&&im.measurements.length)errors.push(`画像${i+1}の対象なし状態が矛盾しています`);
    for(const m of im.measurements){if(!categoryIds.has(m.categoryId))errors.push(`画像${i+1}に不明カテゴリがあります`);if(!Number.isFinite(m.value)||m.value<=0)errors.push(`画像${i+1}に不正数量があります`);if(!Array.isArray(m.points))errors.push(`画像${i+1}の図形データが不正です`)}
  }
  return [...new Set(errors)];
}
