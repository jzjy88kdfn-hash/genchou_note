'use strict';
function showSummaryScreen(){
  els.homeScreen.classList.remove('active');els.workspace.classList.remove('active');els.summaryScreen.classList.add('active');els.backBtn.classList.remove('hidden');
  const confirmedCount=project.images.filter(im=>im.confirmed).length,allConfirmed=confirmedCount===project.images.length;updateOperationStatus(project.lastAudit);
  els.headerTitle.textContent=allConfirmed?'集計結果':'暫定集計';els.headerSub.textContent=`完了 ${confirmedCount}/${project.imageIds.length}枚・全写真の合計`;
  $('#summaryProjectName').textContent=project.name||'名称未設定';
  const totals=aggregate();$('#resultGrid').innerHTML='';
  project.categories.forEach(c=>{
    const r=document.createElement('div');r.className='resultRow';
    r.innerHTML=`<div><strong>${escapeHtml(c.name)}</strong><div class="resultSub">${unitLabel(c.unit)}で集計</div></div><span>${fmt(totals[c.id]||0,c.unit)}</span>`;
    $('#resultGrid').appendChild(r);
  });
  $('#imageResults').innerHTML='';
  project.images.forEach((im,i)=>{
    const t=imageAggregate(im),rows=project.categories.filter(c=>Math.abs(t[c.id]||0)>0.0001).map(c=>`<div class="minirow"><span>${escapeHtml(c.name)}</span><b>${fmt(t[c.id],c.unit)}</b></div>`).join('');
    const block=document.createElement('div');block.className='imageBlock';
    const lows=im.measurements.filter(m=>m.unit!=='count'&&(m.confidence||0)<=2).length,blocked=im.measurements.filter(m=>m.blockingReason).length;
    block.innerHTML=`<header><strong>画像 ${i+1}</strong><span>${im.confirmed?(im.noTarget?'対象なし・完了':'完了'):'未完了'}${blocked?`・確定不可${blocked}件`:lows?`・品質注意${lows}件`:''}</span><button class="smallbtn">修正</button></header><div class="minirows">${rows||'<span style="color:var(--muted);font-size:11px">数量なし</span>'}</div>`;
    block.querySelector('button').onclick=async()=>{project.status='editing';project.currentIndex=i;await openWorkspace();scheduleSave()};
    $('#imageResults').appendChild(block);
  });
}
$('#returnMeasureBtn').onclick=()=>{project.status='editing';openWorkspace();scheduleSave()};
$('#newProjectBtn').onclick=()=>{project=null;showHome();renderProjectList()};
els.backBtn.onclick=async()=>{
  if(els.workspace.classList.contains('active')){
    try{await persistProject()}catch(_){showToast('保存を確認してください')}
    showHome();await renderProjectList();
  }else if(els.summaryScreen.classList.contains('active')){showHome();await renderProjectList();}
};
els.uploadBox.onclick=async()=>{const r=runtimeReadiness||await runReadinessCheck(false);if(r.blocked){showToast('保存機能を確認できないため開始できません');return}els.fileInput.click()};
els.uploadBox.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();els.uploadBox.click()}};
els.fileInput.onchange=async e=>{await createProjectFromFiles([...e.target.files]);e.target.value=''};
document.addEventListener('paste',async e=>{
  if(!els.homeScreen.classList.contains('active'))return;
  const files=[...e.clipboardData.items].filter(i=>i.type.startsWith('image/')).map(i=>i.getAsFile()).filter(Boolean);
  if(files.length)await createProjectFromFiles(files);
});
['dragenter','dragover'].forEach(type=>els.uploadBox.addEventListener(type,e=>{e.preventDefault();els.uploadBox.style.borderColor='var(--brand)'}));
['dragleave','drop'].forEach(type=>els.uploadBox.addEventListener(type,e=>{e.preventDefault();els.uploadBox.style.borderColor=''}));
els.uploadBox.addEventListener('drop',e=>createProjectFromFiles([...e.dataTransfer.files].filter(f=>f.type.startsWith('image/'))));
