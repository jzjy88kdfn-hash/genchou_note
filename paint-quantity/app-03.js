'use strict';
function normalizeProject(p){
  p.categories=Array.isArray(p.categories)&&p.categories.length?p.categories:clone(DEFAULT_CATEGORIES);
  p.imageIds=Array.isArray(p.imageIds)?p.imageIds:[];
  p.images=Array.isArray(p.images)?p.images:[];
  const byId=new Map(p.images.map(im=>[im.id,im]));
  p.images=p.imageIds.map(id=>{
    const im=byId.get(id)||{id};
    im.measurements=Array.isArray(im.measurements)?im.measurements:[];im.confirmed=!!im.confirmed;im.noTarget=!!im.noTarget;
    im.calibrations=Array.isArray(im.calibrations)?im.calibrations:[];
    if(im.calibration&&!im.calibrations.length){
      const legacy={...im.calibration,id:uid('cal'),name:'旧実寸設定',type:'line'};
      im.calibrations=[legacy];im.activeCalibrationId=legacy.id;
      im.measurements.forEach(m=>{if(m.unit!=='count'&&!m.calibrationId)m.calibrationId=legacy.id});
    }
    delete im.calibration;
    im.calibrations=im.calibrations.filter(c=>c&&c.id&&Array.isArray(c.points));
    im.calibrations.forEach(c=>{if(c.type==='line'&&!c.center)c.center=calibrationCenter(c)});
    if(im.activeCalibrationId!=='AUTO'&&!im.calibrations.some(c=>c.id===im.activeCalibrationId))im.activeCalibrationId='AUTO';
    if(!im.activeCalibrationId)im.activeCalibrationId='AUTO';
    im.measurements.forEach(m=>{
      if(m.unit==='count')return;
      if(!m.calibrationMode)m.calibrationMode=m.calibrationId?'locked':'auto';
      if(m.calibrationMode==='auto')m.calibrationId=null;
      if(!Array.isArray(m.calibrationIds))m.calibrationIds=m.calibrationId?[m.calibrationId]:[];
      if(!Number.isFinite(m.confidence))m.confidence=m.calibrationMode==='locked'?3:0;
      if(m.blockingReason===undefined)m.blockingReason=null;
    });
    return im;
  });
  p.currentIndex=Math.max(0,Math.min(Number(p.currentIndex)||0,Math.max(0,p.imageIds.length-1)));
  p.auditTrail=Array.isArray(p.auditTrail)?p.auditTrail:[];p.revision=Math.max(0,Number(p.revision)||0);p.schemaVersion=APP_VERSION;
  p.version=APP_VERSION;return p;
}
async function exportCurrentProject(){
  if(!project){showToast('案件を開いてください');return}
  try{
    await persistProject();
    const images=[];
    for(let i=0;i<project.imageIds.length;i++){
      const rec=await dbGet(STORE_IMAGES,project.imageIds[i]);
      if(!rec?.blob)throw new Error(`画像${i+1}が見つかりません`);
      const {blob,...meta}=rec;
      images.push({...meta,dataURL:await blobToDataURL(blob)});
      els.saveBadge.textContent=`書出し ${i+1}/${project.imageIds.length}`;
    }
    const payload={format:'YAMAZAKI_PAINT_QUANTITY_BACKUP',version:APP_VERSION,productVersion:PRODUCT_VERSION,exportedAt:nowISO(),project:clone(project),images};
    payload.integrity=await digestText(JSON.stringify(backupUnsignedPayload(payload)));
    payload.checksum=backupChecksum(backupUnsignedPayload(payload));payload.checksumAlgorithm='FNV1A32+LEN';
    const blob=new Blob([JSON.stringify(payload)],{type:'application/json'});
    recordAudit('BACKUP_EXPORTED',{imageCount:images.length,checksum:payload.checksum,integrityAlgorithm:payload.integrity.algorithm});scheduleSave(0);
    const stamp=new Date().toISOString().slice(0,10).replaceAll('-','');
    downloadBlob(blob,`${safeFileName(project.name)}_${stamp}.paintbackup`);
    els.saveBadge.textContent='保存済み';showToast('バックアップを保存しました');
  }catch(err){console.error(err);showToast(`バックアップ失敗：${err.message||err}`)}
}
async function importBackupFile(file){
  const createdIds=[];
  try{
    const raw=await file.text(),payload=JSON.parse(raw);
    if(payload?.format!=='YAMAZAKI_PAINT_QUANTITY_BACKUP'||!payload.project||!Array.isArray(payload.images))throw new Error('対応するバックアップではありません');
    const integrityCheck=await verifyPayloadIntegrity(payload);if(!integrityCheck.ok)throw new Error('バックアップの整合性が一致しません。破損または改変されています');
    if(payload.checksum){const given=payload.checksum;if(given!==backupChecksum(backupUnsignedPayload(payload)))throw new Error('バックアップが破損または変更されています')} 
    if(payload.images.length<1||payload.images.length>100)throw new Error('画像枚数が不正です');
    const oldProject=normalizeProject(payload.project),newProjectId=uid('project'),idMap=new Map();
    for(const oldId of oldProject.imageIds)idMap.set(oldId,uid('image'));
    const recordsByOld=new Map(payload.images.map(r=>[r.id,r]));
    for(let i=0;i<oldProject.imageIds.length;i++){
      const oldId=oldProject.imageIds[i],rec=recordsByOld.get(oldId);
      if(!rec?.dataURL)throw new Error(`画像${i+1}のデータがありません`);
      const id=idMap.get(oldId),blob=dataURLToBlob(rec.dataURL),{dataURL,...meta}=rec;
      await dbPut(STORE_IMAGES,{...meta,id,projectId:newProjectId,blob});createdIds.push(id);
    }
    const restored=clone(oldProject);
    restored.id=newProjectId;restored.name=`${oldProject.name||'名称未設定'}（復元）`;restored.createdAt=nowISO();restored.updatedAt=nowISO();
    restored.imageIds=oldProject.imageIds.map(id=>idMap.get(id));
    restored.images=oldProject.images.map(im=>({...im,id:idMap.get(im.id)}));
    restored.currentIndex=0;restored.status='editing';restored.version=APP_VERSION;
    project=restored;recordAudit('BACKUP_IMPORTED',{sourceVersion:payload.version||null,checksumVerified:!!payload.checksum,integrityVerified:!integrityCheck.legacy,integrityAlgorithm:integrityCheck.algorithm});await persistProject();await requestPersistentStorage();await openWorkspace();showToast(!integrityCheck.legacy?'SHA整合性確認済みで復元しました':payload.checksum?'検証済みバックアップを復元しました':'旧形式バックアップを復元しました');
  }catch(err){
    for(const id of createdIds)try{await dbDelete(STORE_IMAGES,id)}catch(_){}
    showToast(`復元失敗：${err.message||err}`)
  }
}

async function persistProject(){
  if(!project||!db)return;
  els.saveBadge.textContent='保存中…';els.saveBadge.style.color='#fde68a';
  project.updatedAt=nowISO();project.revision=Math.max(0,Number(project.revision)||0)+1;project.schemaVersion=APP_VERSION;
  const errors=structuralProjectErrors(project);if(errors.length){els.saveBadge.textContent='保存停止';els.saveBadge.style.color='#fecdd3';throw new Error(errors[0])}
  try{
    const snapshot=clone(project);delete snapshot.integrity;snapshot.integrity={algorithm:'FNV1A32+LEN',checksum:projectChecksum(snapshot),savedAt:nowISO(),revision:snapshot.revision};
    await dbPut(STORE_PROJECTS,snapshot);await writeRecoverySnapshot(snapshot);project.integrity=clone(snapshot.integrity);
    els.saveBadge.textContent='二重保存済み';els.saveBadge.style.color='#a7f3d0';
  }catch(err){
    els.saveBadge.textContent='保存失敗';els.saveBadge.style.color='#fecdd3';
    throw err;
  }
}
function scheduleSave(delay=350){
  if(!project)return;
  els.saveBadge.textContent='保存中…';els.saveBadge.style.color='#fde68a';
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>persistProject().catch(()=>showToast('保存に失敗しました')),Math.max(0,delay));
}

async function renderProjectList(){
  const all=(await dbAll(STORE_PROJECTS)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  els.projectList.innerHTML='';
  if(!all.length){
    els.projectList.innerHTML='<div style="color:var(--muted);font-size:12px;padding:8px 2px">保存中の案件はありません</div>';
    return;
  }
  all.forEach(p=>{
    const row=document.createElement('div');row.className='project-row';
    const finished=p.status==='completed',done=(p.images||[]).filter(im=>im.confirmed).length;
    row.innerHTML=`<div class="meta"><strong>${escapeHtml(p.name||'名称未設定')}</strong><span>${p.imageIds.length}枚・完了 ${done}/${p.imageIds.length}・${finished?'集計済み':'途中保存'}・${new Date(p.updatedAt).toLocaleString('ja-JP')}</span></div><button class="smallbtn">${finished?'結果':'再開'}</button>`;
    row.querySelector('button').onclick=()=>loadProject(p.id,finished);
    els.projectList.appendChild(row);
  });
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
