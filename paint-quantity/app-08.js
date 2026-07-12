'use strict';
els.canvas.addEventListener('pointerdown',e=>{
  e.preventDefault();els.canvas.setPointerCapture(e.pointerId);pointerState.set(e.pointerId,canvasPoint(e));
  if(pointerState.size===2){
    const pts=[...pointerState.values()];gestureStart={dist:distance(pts[0],pts[1]),scale:view.scale,mid:{x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2},offsetX:view.offsetX,offsetY:view.offsetY};return;
  }
  const p=canvasPoint(e);
  if(mode==='pan'){gestureStart={pan:p,offsetX:view.offsetX,offsetY:view.offsetY};return}
  const ip=screenToImage(p);
  if(!pointInsideImage(ip)){showToast('画像の範囲内を指定してください');return}
  if(mode==='calibrate-line'){calibrationDraft=[ip,ip];isDrawing=true;draw();return}
  if(mode==='calibrate-plane'){if(!calibrationDraft)calibrationDraft=[];calibrationDraft.push(ip);if(calibrationDraft.length===4){if(!isConvexQuad(calibrationDraft)){calibrationDraft=[];showToast('4点は同じ面を囲む順番で指定してください')}else{mode='draw';$('#realWidthInput').value='';$('#realHeightInput').value='';$('#planeCalibrationNameInput').value=`実寸設定 ${(currentImage.calibrations?.length||0)+1}`;openSheet('perspectiveCalibrationSheet')}}draw();return}
  const cat=selectedCategory();if(!cat)return;
  if(cat.unit==='count'){pushCount(ip);return}
  isDrawing=true;
  if(cat.unit==='m'){draftPoints=[ip]}
  else{draftPoints.push(ip);isDrawing=false;updateModeUI();draw()}
});
els.canvas.addEventListener('pointermove',e=>{
  if(!pointerState.has(e.pointerId))return;e.preventDefault();const p=canvasPoint(e);pointerState.set(e.pointerId,p);
  if(pointerState.size===2&&gestureStart){
    const pts=[...pointerState.values()],d=distance(pts[0],pts[1]),mid={x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2};
    const before=screenToImage(gestureStart.mid);
    view.scale=Math.max(view.minScale*.7,Math.min(view.minScale*8,gestureStart.scale*(d/gestureStart.dist)));
    view.offsetX=mid.x-before.x*view.scale;view.offsetY=mid.y-before.y*view.scale;updateZoom();draw();return;
  }
  if(mode==='pan'&&gestureStart?.pan){
    view.offsetX=gestureStart.offsetX+(p.x-gestureStart.pan.x);view.offsetY=gestureStart.offsetY+(p.y-gestureStart.pan.y);draw();return;
  }
  if(mode==='calibrate-line'&&isDrawing&&calibrationDraft){calibrationDraft[1]=clampPointToImage(screenToImage(p));draw();return}
  const cat=selectedCategory();
  if(mode==='draw'&&isDrawing&&cat?.unit==='m'){
    const ip=clampPointToImage(screenToImage(p)),last=draftPoints[draftPoints.length-1];
    if(!last||distance(last,ip)>4/view.scale)draftPoints.push(ip);
    updateModeUI();draw();
  }
});
function endPointer(e){
  if(!pointerState.has(e.pointerId))return;e.preventDefault();pointerState.delete(e.pointerId);
  if(mode==='calibrate-line'&&isDrawing&&calibrationDraft){
    isDrawing=false;if(distance(calibrationDraft[0],calibrationDraft[1])<10/view.scale){calibrationDraft=null;showToast('もう少し長くなぞってください');}
    else{mode='draw';$('#realLengthInput').value='';$('#lineCalibrationNameInput').value=`実寸設定 ${(currentImage.calibrations?.length||0)+1}`;openSheet('calibrationSheet');setTimeout(()=>$('#realLengthInput').focus(),200)}draw();
  }else if(mode==='draw'&&isDrawing&&selectedCategory()?.unit==='m'){isDrawing=false;updateModeUI();draw()}
  if(pointerState.size<2)gestureStart=null;
}
els.canvas.addEventListener('pointerup',endPointer);
els.canvas.addEventListener('pointercancel',endPointer);
els.canvas.addEventListener('wheel',e=>{
  e.preventDefault();const p=canvasPoint(e),before=screenToImage(p),factor=e.deltaY<0?1.1:.9;
  view.scale=Math.max(view.minScale*.7,Math.min(view.minScale*8,view.scale*factor));
  view.offsetX=p.x-before.x*view.scale;view.offsetY=p.y-before.y*view.scale;updateZoom();draw();
},{passive:false});

function calibrationConsistencyWarnings(){
  const warnings=[],lines=(currentImage?.calibrations||[]).filter(c=>c.type==='line');
  if(lines.length>=2){const ppms=lines.map(c=>c.pixelsPerMeter),ratio=Math.max(...ppms)/Math.min(...ppms);if(ratio>1.3)warnings.push('簡易実寸設定の倍率差が30%を超えています。斜め写真なら4点の実寸設定を追加してください。')}
  const planes=(currentImage?.calibrations||[]).filter(c=>c.type==='plane');
  if(!planes.length&&lines.length===1)warnings.push('簡易実寸設定が1本です。斜め写真では複数設定または4点の実寸設定を追加してください。');
  return warnings;
}
function renderCalibrationManager(){
  const list=els.calibrationManagerList;list.innerHTML='';const cals=currentImage?.calibrations||[];
  const auto=document.createElement('div');auto.className='calibrationCard calibrationAuto'+(isAutoCalibration()?' active':'');
  auto.innerHTML=`<div><strong>自動補間（推奨）</strong><span>位置に応じて面設定を選択し、簡易設定の間は距離に応じて補間します。</span></div><div class="calActions"><button class="smallbtn selectCal">使用</button></div>`;
  auto.querySelector('.selectCal').onclick=()=>{currentImage.activeCalibrationId='AUTO';draftPoints=[];recalculateAutoMeasurements();recalculateFutureMeasurements();markImageDirty();scheduleSave(0);renderCalibrationManager();updateScaleUI();draw();showToast('自動補間を使用')};list.appendChild(auto);
  if(!cals.length){const empty=document.createElement('div');empty.style.cssText='color:var(--muted);font-size:12px;padding:8px 2px';empty.textContent='実寸設定は未登録です';list.appendChild(empty)}
  cals.forEach((cal,i)=>{
    const card=document.createElement('div');card.className='calibrationCard'+(cal.id===currentImage.activeCalibrationId?' active':'');
    const detail=cal.type==='plane'?`斜め写真・遠近補正 ${cal.realWidth}×${cal.realHeight}m`:`簡易較正 ${cal.realLength}m・${cal.pixelsPerMeter.toFixed(1)}px/m`;
    card.innerHTML=`<div><strong>${escapeHtml(cal.name||`実寸設定 ${i+1}`)}</strong><span>${detail}</span></div><div class="calActions"><button class="smallbtn selectCal">固定</button><button class="smallbtn deleteCal">削除</button></div>`;
    card.querySelector('.selectCal').onclick=()=>{currentImage.activeCalibrationId=cal.id;draftPoints=[];markImageDirty();scheduleSave();renderCalibrationManager();updateScaleUI();draw();showToast(`${cal.name||'実寸設定'}へ固定`)};
    card.querySelector('.deleteCal').onclick=()=>{
      if(currentImage.measurements.some(m=>m.calibrationMode==='locked'&&m.calibrationId===cal.id)){showToast('固定使用した数量があるため削除できません');return}
      currentImage.calibrations=currentImage.calibrations.filter(c=>c.id!==cal.id);recordAudit('CALIBRATION_DELETED',{imageId:currentImage.id,calibrationId:cal.id});if(currentImage.activeCalibrationId===cal.id)currentImage.activeCalibrationId='AUTO';
      recalculateAutoMeasurements();markImageDirty();scheduleSave();renderCalibrationManager();updateScaleUI();draw();
    };
    list.appendChild(card);
  });
  const warnings=calibrationConsistencyWarnings();els.calibrationWarnings.innerHTML=warnings.map(w=>`<div class="calibrationWarning">⚠ ${escapeHtml(w)}</div>`).join('');
}
