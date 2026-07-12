'use strict';
// SHA-256フォールバックを正しい定数で最終固定する。
globalThis.sha256Fallback=function(text){
  const bytes=new TextEncoder().encode(text),K=new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  const size=Math.ceil((bytes.length+9)/64)*64,msg=new Uint8Array(size);msg.set(bytes);msg[bytes.length]=0x80;const dv=new DataView(msg.buffer),bits=bytes.length*8;dv.setUint32(size-8,Math.floor(bits/0x100000000),false);dv.setUint32(size-4,bits>>>0,false);
  const H=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]),w=new Uint32Array(64),rotr=(x,n)=>(x>>>n)|(x<<(32-n));
  for(let o=0;o<size;o+=64){for(let i=0;i<16;i++)w[i]=dv.getUint32(o+i*4,false);for(let i=16;i<64;i++){const s0=rotr(w[i-15],7)^rotr(w[i-15],18)^(w[i-15]>>>3),s1=rotr(w[i-2],17)^rotr(w[i-2],19)^(w[i-2]>>>10);w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0}let[a,b,c,d,e,f,g,h]=H;for(let i=0;i<64;i++){const S1=rotr(e,6)^rotr(e,11)^rotr(e,25),ch=(e&f)^(~e&g),t1=(h+S1+ch+K[i]+w[i])>>>0,S0=rotr(a,2)^rotr(a,13)^rotr(a,22),maj=(a&b)^(a&c)^(b&c),t2=(S0+maj)>>>0;h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0}H[0]=(H[0]+a)>>>0;H[1]=(H[1]+b)>>>0;H[2]=(H[2]+c)>>>0;H[3]=(H[3]+d)>>>0;H[4]=(H[4]+e)>>>0;H[5]=(H[5]+f)>>>0;H[6]=(H[6]+g)>>>0;H[7]=(H[7]+h)>>>0}
  return[...H].map(x=>x.toString(16).padStart(8,'0')).join('');
};
els.helpBtn.onclick=()=>openSheet('helpSheet');
els.importBackupBtn.onclick=()=>els.backupInput.click();
els.backupInput.onchange=async e=>{const f=e.target.files?.[0];if(f)await importBackupFile(f);e.target.value=''};
els.storageCheckBtn.onclick=()=>updateStorageInfo(true);
els.runReadinessBtn.onclick=()=>runReadinessCheck(true);
els.deviceDiagnosticHomeBtn.onclick=async()=>{await runDeviceDiagnostic();await runReadinessCheck(false)};
els.exportBackupBtn.onclick=exportCurrentProject;
els.summaryBackupBtn.onclick=exportCurrentProject;
els.finalAuditBtn.onclick=()=>runProjectAudit({show:true});
els.exportCsvBtn.onclick=exportCsvReport;
els.printReportBtn.onclick=()=>window.print();
els.exportAuditBtn.onclick=exportAuditTrail;
els.settingsStorageBtn.onclick=()=>updateStorageInfo(true);
els.restoreRecoveryBtn.onclick=restorePreviousRecovery;
els.verifyDataBtn.onclick=verifySavedData;
els.deviceDiagnosticBtn.onclick=runDeviceDiagnostic;
els.settingsBtn.onclick=()=>{
  const hasProject=!!project;document.querySelectorAll('.projectOnly').forEach(n=>n.classList.toggle('hiddenByContext',!hasProject));
  $('#settingsSheetTitle').textContent=hasProject?'案件設定・診断':'設定・診断';$('#saveSettingsBtn').textContent=hasProject?'保存':'閉じる';
  if(hasProject)$('#projectNameInput').value=project.name||'';openSheet('settingsSheet');updateStorageInfo(false);renderDeviceDiagnosticInfo();
};
$('#saveSettingsBtn').onclick=()=>{if(!project){closeSheet('settingsSheet');return}project.name=$('#projectNameInput').value.trim()||'名称未設定';recordAudit('PROJECT_NAME_UPDATED',{name:project.name});closeSheet('settingsSheet');scheduleSave();if(els.summaryScreen.classList.contains('active'))showSummaryScreen();showToast('案件名を保存しました')};
$('#deleteProjectBtn').onclick=deleteCurrentProject;
$('#addCategoryBtn').onclick=()=>{
  const name=$('#categoryNameInput').value.trim(),unit=$('#categoryUnitInput').value;
  if(!name){showToast('カテゴリ名を入力してください');return}
  if(project.categories.some(c=>c.name===name)){showToast('同名カテゴリがあります');return}
  const c={id:uid('cat'),name,unit};project.categories.push(c);recordAudit('CATEGORY_ADDED',{categoryId:c.id,name,unit});selectedCategoryId=c.id;
  $('#categoryNameInput').value='';closeSheet('categorySheet');renderCategories();scheduleSave();showToast('カテゴリを追加しました');
};
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&project)persistProject().catch(()=>{})});
window.addEventListener('pagehide',()=>{if(project){project.updatedAt=nowISO();const snapshot=clone(project);delete snapshot.integrity;snapshot.integrity={algorithm:'FNV1A32+LEN',checksum:projectChecksum(snapshot),savedAt:nowISO(),revision:snapshot.revision};writeEmergencySnapshot(snapshot);if(db)dbPut(STORE_PROJECTS,snapshot).catch(()=>{})}});

async function init(){
  try{
    db=await openDB();await requestPersistentStorage();await renderProjectList();showHome();renderDeviceDiagnosticInfo();document.querySelectorAll('button').forEach(b=>b.type='button');document.querySelectorAll('.sheetBackdrop').forEach(x=>{x.setAttribute('role','dialog');x.setAttribute('aria-modal','true');x.setAttribute('aria-hidden','true')});await runReadinessCheck(false);
  }catch(err){
    console.error(err);showToast('端末内保存を利用できません');
  }
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'){const open=[...document.querySelectorAll('.sheetBackdrop.open')].pop();if(open)closeSheet(open.id)}});
window.addEventListener('unhandledrejection',e=>{console.error(e.reason);showToast('処理エラーが発生しました')});
window.addEventListener('error',e=>console.error(e.error||e.message));
init();
