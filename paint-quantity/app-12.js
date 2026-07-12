'use strict';
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
