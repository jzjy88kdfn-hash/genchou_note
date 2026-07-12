'use strict';
async function createProjectFromFiles(files){
  files=files.filter(f=>f&&(f.type?.startsWith('image/')||/\.(jpe?g|png|webp|heic|heif)$/i.test(f.name||'')));
  if(!files.length)return;
  if(files.length>MAX_PROJECT_IMAGES){showToast(`1案件${MAX_PROJECT_IMAGES}枚までです`);return}
  const sourceBytes=files.reduce((n,f)=>n+(Number(f.size)||0),0);
  if((files.length>RECOMMENDED_PROJECT_IMAGES||sourceBytes>RECOMMENDED_SOURCE_BYTES)&&!confirm(`写真が${files.length}枚（${bytesLabel(sourceBytes)}）あります。端末負荷とバックアップ容量が大きくなるため、案件を分けることを推奨します。続けますか？`))return;
  const pid=uid('project'),cats=clone(DEFAULT_CATEGORIES),ids=[];
  let storedBytes=0,originalBytes=0;
  els.uploadBox.classList.add('busy');
  try{
    await requestPersistentStorage();
    for(let i=0;i<files.length;i++){
      const f=files[i],id=uid('image');ids.push(id);
      els.uploadBox.querySelector('strong').textContent=`画像を最適化中 ${i+1}/${files.length}`;
      const c=await compressImageFile(f);storedBytes+=c.storedSize;originalBytes+=c.originalSize;
      await dbPut(STORE_IMAGES,{id,projectId:pid,name:f.name||`画像${i+1}`,type:c.type,blob:c.blob,width:c.width,height:c.height,originalSize:c.originalSize,storedSize:c.storedSize,compressed:c.compressed});
    }
    project={
      id:pid,name:`塗装数量拾い ${new Date().toLocaleDateString('ja-JP')}`,
      createdAt:nowISO(),updatedAt:nowISO(),status:'editing',currentIndex:0,
      imageIds:ids,categories:cats,storageBytes:storedBytes,originalBytes,
      images:ids.map(id=>({id,calibrations:[],activeCalibrationId:'AUTO',measurements:[],confirmed:false,noTarget:false})),auditTrail:[],revision:0,schemaVersion:APP_VERSION,version:APP_VERSION
    };
    recordAudit('PROJECT_CREATED',{imageCount:ids.length,storedBytes,originalBytes});await persistProject();await openWorkspace();
    if(originalBytes>storedBytes)showToast(`${bytesLabel(originalBytes-storedBytes)}軽量化しました`);
  }catch(err){
    console.error(err);
    for(const id of ids)try{await dbDelete(STORE_IMAGES,id)}catch(_){}
    showToast(`画像登録失敗：${err.message||'保存容量を確認してください'}`);
  }finally{
    els.uploadBox.classList.remove('busy');
    els.uploadBox.querySelector('strong').textContent='写真をまとめて選択';
  }
}
async function loadProject(id,showSummary=false){
  let p=await dbGet(STORE_PROJECTS,id).catch(()=>null),recovered=false;
  if(p&&(!verifyProjectChecksum(p)||structuralProjectErrors(p).length)){p=await bestRecoverySnapshot(id);recovered=!!p}
  if(!p){p=await bestRecoverySnapshot(id);recovered=!!p}
  if(!p){showToast('案件データを復旧できません');return}
  project=normalizeProject(p);if(recovered){recordAudit('AUTO_RECOVERY',{reason:'primary_invalid'});await persistProject();showToast('復旧データから案件を回復しました')}
  if(showSummary||project.status==='completed')showSummaryScreen();
  else openWorkspace();
}
async function deleteCurrentProject(){
  if(!project)return;
  if(!confirm(`「${project.name||'名称未設定'}」と保存画像を削除します。バックアップがない場合は復元できません。削除しますか？`))return;
  for(const id of project.imageIds)await dbDelete(STORE_IMAGES,id);
  await dbDelete(STORE_PROJECTS,project.id);await dbDelete(STORE_RECOVERY,project.id).catch(()=>{});try{localStorage.removeItem(emergencyKey(project.id))}catch(_){}
  project=null;currentImage=null;imageElement=null;
  closeSheet('settingsSheet');showHome();renderProjectList();
}
function showHome(){
  els.homeScreen.classList.add('active');els.workspace.classList.remove('active');els.summaryScreen.classList.remove('active');
  els.backBtn.classList.add('hidden');els.headerTitle.textContent='塗装数量算出';els.headerSub.textContent='画像から面積・長さ・箇所を拾う';
}
async function openWorkspace(){
  els.homeScreen.classList.remove('active');els.summaryScreen.classList.remove('active');els.workspace.classList.add('active');
  els.backBtn.classList.remove('hidden');
  if(project.currentIndex>=project.imageIds.length)project.currentIndex=Math.max(0,project.imageIds.length-1);
  await loadCurrentImage();
}
async function loadCurrentImage(){
  if(!project)return;
  currentImage=project.images[project.currentIndex];
  const rec=await dbGet(STORE_IMAGES,currentImage.id);
  currentImageRecord=rec;
  if(!rec){showToast('画像データがありません');return}
  imageElement=new Image();
  const url=URL.createObjectURL(rec.blob);
  imageElement.onload=()=>{
    URL.revokeObjectURL(url);els.canvasEmpty.classList.add('hidden');fitImage();draw();
  };
  imageElement.onerror=()=>{URL.revokeObjectURL(url);els.canvasEmpty.textContent='画像を表示できません';};
  imageElement.src=url;
  history=[];future=[];draftPoints=[];calibrationDraft=null;mode='draw';minus=false;
  selectedCategoryId=project.categories[0]?.id||null;
  renderWorkspaceUI(rec.name);
  resizeCanvas();
}
function renderWorkspaceUI(imageName=''){
  const total=project.imageIds.length, idx=project.currentIndex+1;
  els.headerTitle.textContent=`画像 ${idx} / ${total}`;
  els.headerSub.textContent=imageName;
  els.progressFill.style.width=`${(idx/total)*100}%`;
  renderCategories();updateModeUI();updateScaleUI();updateHistoryUI();updateNavigationUI();
}
function updateNavigationUI(){
  if(!project)return;
  const total=project.imageIds.length,done=project.images.filter(im=>im.confirmed).length;
  els.prevImageBtn.disabled=project.currentIndex<=0;
  els.nextImageBtn.disabled=project.currentIndex>=total-1;
  els.imageListBtn.textContent=`画像一覧 ${done}/${total}`;
  els.confirmImageBtn.textContent=project.currentIndex<total-1?'完了→次へ':'写真を完了';
}
async function goToImage(index){
  if(!project||index<0||index>=project.imageIds.length)return;
  if(draftPoints.length||calibrationDraft){showToast('未確定の線・図形を確定または戻してください');return}
  project.currentIndex=index;await persistProject();await loadCurrentImage();
}
async function openImagePicker(){
  const list=$('#imagePickerList');list.innerHTML='';
  for(let i=0;i<project.images.length;i++){
    const im=project.images[i],rec=await dbGet(STORE_IMAGES,im.id),count=im.measurements.length;
    const b=document.createElement('button');b.className='imagePick'+(i===project.currentIndex?' current':'');
    b.innerHTML=`<span class="num">${i+1}</span><span class="info"><strong>${escapeHtml(rec?.name||`画像${i+1}`)}</strong><span>数量 ${count}件・実寸設定 ${(im.calibrations||[]).length}件</span></span><span class="state ${im.confirmed?'done':''}">${im.confirmed?'完了':'編集中'}</span>`;
    b.onclick=async()=>{closeSheet('imagePickerSheet');await goToImage(i)};list.appendChild(b);
  }
  openSheet('imagePickerSheet');
}
function renderCategories(){
  els.categoryRow.innerHTML='';
  project.categories.forEach(c=>{
    const b=document.createElement('button');b.className='catbtn'+(c.id===selectedCategoryId?' active':'');
    b.textContent=`${c.name} ${unitLabel(c.unit)}`;
    b.onclick=()=>{selectedCategoryId=c.id;draftPoints=[];renderCategories();draw();};
    els.categoryRow.appendChild(b);
  });
  const add=document.createElement('button');add.className='catbtn';add.textContent='＋ カテゴリ';
  add.onclick=()=>openSheet('categorySheet');els.categoryRow.appendChild(add);
}
function selectedCategory(){return project.categories.find(c=>c.id===selectedCategoryId)}
function activeCalibration(){
  if(!currentImage||currentImage.activeCalibrationId==='AUTO')return null;
  return currentImage.calibrations?.find(c=>c.id===currentImage.activeCalibrationId)||null;
}
function isAutoCalibration(){return !currentImage||currentImage.activeCalibrationId==='AUTO'||!currentImage.activeCalibrationId}
function confidenceStars(n){n=Math.max(0,Math.min(5,Math.round(Number(n)||0)));return '★'.repeat(n)+'☆'.repeat(5-n)}
function imageMinimumConfidence(){
  const values=(currentImage?.measurements||[]).filter(m=>m.unit!=='count'&&Number.isFinite(m.confidence)).map(m=>m.confidence);
  return values.length?Math.min(...values):0;
}
function updateQualityUI(){
  const q=imageMinimumConfidence();els.qualityStatus.classList.remove('qualityLow','qualityMid');
  if(!q){els.qualityStatus.textContent='品質目安 —';return}
  els.qualityStatus.textContent=`品質目安 ${confidenceStars(q)}`;
  if(q<=2)els.qualityStatus.classList.add('qualityLow');else if(q===3)els.qualityStatus.classList.add('qualityMid');
}
function updateWorkflowHint(){
  if(!els.workflowHint||!currentImage)return;
  const cat=selectedCategory(),hasScale=(currentImage.calibrations||[]).length>0;let msg='実寸が分かる部分を設定してください。';
  if(mode.startsWith('calibrate'))msg=mode==='calibrate-plane'?'左上→右上→右下→左下の順に指定してください。':'実寸が分かる1本をなぞってください。';
  else if(draftPoints.length)msg=cat?.unit==='m2'?'囲み終えたら「線・面確定」を押してください。':'なぞり終えたら「線・面確定」を押してください。';
  else if(cat?.unit==='count')msg=`${cat.name}の位置をタップしてください。`;
  else if(!hasScale)msg='最初に「実寸設定」を行ってください。';
  else if(!currentImage.measurements.length)msg='項目を選び、写真上をなぞってください。';
  else msg='追加計測するか、「写真を完了」を押してください。';
  els.workflowHint.innerHTML=`<b>次：</b>${escapeHtml(msg)}`;
}
function updateModeUI(){
  els.panBtn.classList.toggle('active',mode==='pan');
  els.drawBtn.classList.toggle('active',mode==='draw');
  els.calibrateBtn.classList.toggle('active',mode.startsWith('calibrate'));
  els.minusBtn.classList.toggle('active',minus);
  const cat=selectedCategory();
  els.completeShapeBtn.disabled=!cat||cat.unit==='count'||draftPoints.length<2;
  updateWorkflowHint();
}
function updateScaleUI(){
  const cal=activeCalibration(),count=currentImage?.calibrations?.length||0;
  if(isAutoCalibration()){
    els.scaleStatus.textContent=count?`自動補間・実寸設定${count}件`:'実寸設定なし';
    els.scaleStatus.classList.toggle('active',count>0);
  }else if(cal){
    els.scaleStatus.textContent=`固定：${cal.name||'実寸設定'}・${cal.type==='plane'?'遠近補正':'簡易'}`;
    els.scaleStatus.classList.add('active');
  }else{
    els.scaleStatus.textContent='実寸設定なし';els.scaleStatus.classList.remove('active');
  }
  updateQualityUI();
}
function updateHistoryUI(){els.undoBtn.disabled=!currentImage?.measurements?.length;els.redoBtn.disabled=!future.length}

function fitImage(){
  if(!imageElement||!canvasSize.w)return;
  const sx=canvasSize.w/imageElement.naturalWidth,sy=canvasSize.h/imageElement.naturalHeight;
  view.minScale=Math.min(sx,sy);
  view.scale=view.minScale;
  view.offsetX=(canvasSize.w-imageElement.naturalWidth*view.scale)/2;
  view.offsetY=(canvasSize.h-imageElement.naturalHeight*view.scale)/2;
  updateZoom();
}
function resizeCanvas(){
  const r=els.canvasWrap.getBoundingClientRect();canvasSize.dpr=Math.min(window.devicePixelRatio||1,2);
  canvasSize.w=Math.max(1,r.width);canvasSize.h=Math.max(1,r.height);
  els.canvas.width=Math.round(canvasSize.w*canvasSize.dpr);els.canvas.height=Math.round(canvasSize.h*canvasSize.dpr);
  const ctx=els.canvas.getContext('2d');ctx.setTransform(canvasSize.dpr,0,0,canvasSize.dpr,0,0);
  if(imageElement?.complete)fitImage();draw();
}
window.addEventListener('resize',()=>setTimeout(resizeCanvas,80));
function imageToScreen(p){return{x:p.x*view.scale+view.offsetX,y:p.y*view.scale+view.offsetY}}
function screenToImage(p){return{x:(p.x-view.offsetX)/view.scale,y:(p.y-view.offsetY)/view.scale}}
function imageDimensions(){return{w:imageElement?.naturalWidth||currentImageRecord?.width||0,h:imageElement?.naturalHeight||currentImageRecord?.height||0}}
function pointInsideImage(p,margin=0){const {w,h}=imageDimensions();return Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&p.x>=-margin&&p.y>=-margin&&p.x<=w+margin&&p.y<=h+margin}
function clampPointToImage(p){const {w,h}=imageDimensions();return{x:Math.max(0,Math.min(w,p.x)),y:Math.max(0,Math.min(h,p.y))}}
function canvasPoint(e){const r=els.canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
