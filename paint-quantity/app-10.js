'use strict';
function aggregate(){
  const totals={};project.categories.forEach(c=>totals[c.id]=0);
  project.images.forEach(im=>im.measurements.forEach(m=>{const v=Number.isFinite(m.value)?m.value:0;totals[m.categoryId]=(totals[m.categoryId]||0)+(m.negative?-v:v)}));
  return totals;
}
function imageAggregate(im){
  const t={};im.measurements.forEach(m=>{const v=Number.isFinite(m.value)?m.value:0;t[m.categoryId]=(t[m.categoryId]||0)+(m.negative?-v:v)});return t;
}

function csvCell(v){v=String(v??'');return /[",\n]/.test(v)?`"${v.replaceAll('"','""')}"`:v}
function exportCsvReport(){
  if(!project)return;const rows=[['案件名','画像番号','カテゴリ','単位','加減','数量','品質目安','算出方式','完了状態']];
  project.images.forEach((im,i)=>im.measurements.forEach(m=>{const c=project.categories.find(x=>x.id===m.categoryId);rows.push([project.name,i+1,c?.name||m.categoryId,unitLabel(m.unit),m.negative?'減算':'加算',Number(m.value).toFixed(m.unit==='count'?0:4),m.unit==='count'?5:(m.confidence||0),m.strategy||'count',im.confirmed?'完了':'未完了'])}));
  rows.push([]);rows.push(['カテゴリ別合計']);const totals=aggregate();project.categories.forEach(c=>rows.push([c.name,Number(totals[c.id]||0).toFixed(c.unit==='count'?0:4),unitLabel(c.unit)]));
  const csv='\ufeff'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n');downloadBlob(new Blob([csv],{type:'text/csv;charset=utf-8'}),`${safeFileName(project.name)}_数量表.csv`);recordAudit('CSV_EXPORTED',{rows:rows.length});scheduleSave();
}
function exportAuditTrail(){
  if(!project)return;const data={format:'YAMAZAKI_PAINT_QUANTITY_AUDIT',productVersion:PRODUCT_VERSION,exportedAt:nowISO(),projectId:project.id,projectName:project.name,revision:project.revision,integrity:project.integrity,auditTrail:project.auditTrail||[],lastAudit:project.lastAudit||null};
  downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),`${safeFileName(project.name)}_監査履歴.json`);
}
async function runProjectAudit({show=true}={}){
  const errors=structuralProjectErrors(project),warnings=[];if(!project)return{ok:false,errors:['案件がありません'],warnings:[]};
  const imageRecords=[];for(let i=0;i<project.imageIds.length;i++){const rec=await dbGet(STORE_IMAGES,project.imageIds[i]).catch(()=>null);imageRecords.push(!!rec?.blob);if(!rec?.blob)errors.push(`画像${i+1}の原本データがありません`)}
  project.images.forEach((im,i)=>{
    if(!im.confirmed)errors.push(`画像${i+1}が未完了です`);
    if(!im.measurements.length&&!im.noTarget)errors.push(`画像${i+1}は数量なしですが「対象なし」が確定されていません`);if(im.noTarget&&im.measurements.length)errors.push(`画像${i+1}は対象なしと数量が同時に存在します`);
    const blocked=im.measurements.filter(m=>m.blockingReason);if(blocked.length)errors.push(`画像${i+1}に確定不可数量が${blocked.length}件あります`);
    const lows=im.measurements.filter(m=>m.unit!=='count'&&(m.confidence||0)<=2);if(lows.length)warnings.push(`画像${i+1}に品質目安が低い数量が${lows.length}件あります`);
    const totals=imageAggregate(im);for(const c of project.categories)if((totals[c.id]||0)<-0.0001)errors.push(`画像${i+1}の${c.name}は減算超過です`);
  });
  const deviceState=readDeviceDiagnosticLocal();if(!deviceState?.stage2PassedAt)warnings.push('Safari再起動後の保存確認が未完了です');if(unstableOrigin())warnings.push('ローカルファイル起動では保存が不安定な場合があります。作業後にバックアップを保存してください');
  const result={ok:errors.length===0,errors:[...new Set(errors)],warnings:[...new Set(warnings)],checkedAt:nowISO(),productVersion:PRODUCT_VERSION,revision:project.revision,imageRecords,deviceDiagnosticPassedAt:deviceState?.stage2PassedAt||null,origin:location.origin||location.protocol};
  project.lastAudit=result;recordAudit('FINAL_AUDIT',{ok:result.ok,errorCount:result.errors.length,warningCount:result.warnings.length});await persistProject();updateOperationStatus(result);if(show)showToast(result.ok?'案件チェック：利用候補OK':`案件チェック：異常${result.errors.length}件`);return result;
}
function updateOperationStatus(result=project?.lastAudit){
  if(!els.operationStatus)return;if(!result){els.operationStatus.className='operationStatus warn';els.operationStatus.textContent='全写真の完了後、案件チェックを実行してください。';return}
  if(!result.ok){els.operationStatus.className='operationStatus ng';els.operationStatus.innerHTML=`<b>運用停止</b><br>${escapeHtml(result.errors.slice(0,3).join('／'))}${result.errors.length>3?` 他${result.errors.length-3}件`:''}`;return}
  els.operationStatus.className=result.warnings.length?'operationStatus warn':'operationStatus ok';els.operationStatus.innerHTML=`<b>${result.warnings.length?'利用候補（注意あり）':'利用候補OK'}</b><br>異常0件${result.warnings.length?`・注意${result.warnings.length}件`:'・全確認済み'}・${new Date(result.checkedAt).toLocaleString('ja-JP')}`;
}
async function verifySavedData(){
  if(!project)return;await persistProject();const saved=await dbGet(STORE_PROJECTS,project.id),recovery=await dbGet(STORE_RECOVERY,project.id).catch(()=>null),errors=structuralProjectErrors(saved);
  const ok=!errors.length&&verifyProjectChecksum(saved)&&recovery?.current?.checksum===projectChecksum(recovery.current.project);recordAudit('SAVED_DATA_VERIFIED',{ok,errors});await persistProject();showToast(ok?'保存データ・復旧データとも正常です':'保存データに異常があります');return ok;
}
async function restorePreviousRecovery(){
  if(!project)return;const r=await dbGet(STORE_RECOVERY,project.id).catch(()=>null),candidate=r?.previous?.project;if(!candidate){showToast('復元できる直前状態がありません');return}
  if(!confirm('現在の編集内容を、直前に二重保存した状態へ戻しますか？'))return;
  if(r.previous.checksum!==projectChecksum(candidate)||structuralProjectErrors(candidate).length){showToast('復旧データが不正です');return}
  project=normalizeProject(clone(candidate));recordAudit('MANUAL_RECOVERY',{sourceSavedAt:r.previous.savedAt});await persistProject();closeSheet('settingsSheet');await openWorkspace();showToast('直前状態へ復元しました');
}
