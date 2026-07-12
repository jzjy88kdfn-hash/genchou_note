'use strict';
function openCalibrationManager(){draftPoints=[];calibrationDraft=null;mode='draw';renderCalibrationManager();updateModeUI();draw();openSheet('calibrationManagerSheet')}
els.calibrateBtn.onclick=openCalibrationManager;
els.addLineCalibrationBtn.onclick=()=>{closeSheet('calibrationManagerSheet');mode='calibrate-line';calibrationDraft=null;minus=false;updateModeUI();showToast('実寸が分かる1本をなぞる')};
els.addPlaneCalibrationBtn.onclick=()=>{closeSheet('calibrationManagerSheet');mode='calibrate-plane';calibrationDraft=[];minus=false;updateModeUI();showToast('左上→右上→右下→左下をタップ')};
$('#calibrationDoneBtn').onclick=()=>closeSheet('calibrationManagerSheet');
els.panBtn.onclick=()=>{mode='pan';draftPoints=[];calibrationDraft=null;updateModeUI();draw()};
els.drawBtn.onclick=()=>{mode='draw';calibrationDraft=null;updateModeUI();draw()};
els.minusBtn.onclick=()=>{minus=!minus;mode='draw';calibrationDraft=null;updateModeUI();showToast(minus?'減算モード':'加算モード')};
els.completeShapeBtn.onclick=commitMeasurement;
els.undoBtn.onclick=undo;els.redoBtn.onclick=redo;
els.applyCalibrationBtn.onclick=()=>{
  const real=parseFloat($('#realLengthInput').value),name=$('#lineCalibrationNameInput').value.trim()||`実寸設定 ${(currentImage.calibrations?.length||0)+1}`;
  if(!real||real<=0){showToast('正しい長さを入力してください');return}
  if(!calibrationDraft||calibrationDraft.length<2){showToast('実寸の基準線がありません');return}
  if(calibrationDraft.some(p=>!pointInsideImage(p))){showToast('実寸の基準線は画像内に指定してください');return}
  const px=distance(calibrationDraft[0],calibrationDraft[1]),cal={id:uid('cal'),name,type:'line',points:clone(calibrationDraft),realLength:real,pixelsPerMeter:px/real};
  currentImage.calibrations.push(cal);recordAudit('LINE_CALIBRATION_ADDED',{imageId:currentImage.id,calibrationId:cal.id,realLength:real});currentImage.activeCalibrationId='AUTO';recalculateAutoMeasurements();recalculateFutureMeasurements();
  calibrationDraft=null;mode='draw';closeSheet('calibrationSheet');markImageDirty();scheduleSave(0);updateScaleUI();updateModeUI();draw();showToast('簡易実寸設定を追加しました');
};
els.applyPerspectiveCalibrationBtn.onclick=()=>{
  const w=parseFloat($('#realWidthInput').value),h=parseFloat($('#realHeightInput').value),name=$('#planeCalibrationNameInput').value.trim()||`実寸設定 ${(currentImage.calibrations?.length||0)+1}`;
  if(!w||w<=0||!h||h<=0){showToast('正しい幅と高さを入力してください');return}
  if(!calibrationDraft||!isConvexQuad(calibrationDraft)){showToast('4点の指定が不正です');return}
  try{
    const dst=[{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}],H=computeHomography(calibrationDraft,dst),cal={id:uid('cal'),name,type:'plane',points:clone(calibrationDraft),realWidth:w,realHeight:h,homography:H};
    const check=calibrationDraft.map(p=>projectPoint(H,p));if(check.some((p,i)=>distance(p,dst[i])>Math.max(w,h)*1e-5))throw new Error('遠近補正の検証に失敗しました');
    currentImage.calibrations.push(cal);recordAudit('PLANE_CALIBRATION_ADDED',{imageId:currentImage.id,calibrationId:cal.id,realWidth:w,realHeight:h});currentImage.activeCalibrationId='AUTO';recalculateAutoMeasurements();recalculateFutureMeasurements();calibrationDraft=null;mode='draw';closeSheet('perspectiveCalibrationSheet');markImageDirty();scheduleSave(0);updateScaleUI();updateModeUI();draw();showToast('斜め写真の実寸設定を追加しました');
  }catch(err){showToast(err.message||'遠近補正に失敗しました')}
};
els.confirmImageBtn.onclick=async()=>{
  if(draftPoints.length||calibrationDraft){showToast('先に線・図形を確定してください');return}
  if(!currentImage.measurements.length){if(!confirm('数量がありません。この画像を「対象なし」として確定しますか？'))return;currentImage.noTarget=true}else currentImage.noTarget=false;
  const validationError=revalidateAllMeasurements();if(validationError){showToast(`確定不可：${validationError}`);draw();return}
  const blocked=currentImage.measurements.find(m=>m.blockingReason);if(blocked){showToast(`確定不可：${blocked.blockingReason}`);draw();scheduleSave();return}
  if(currentImage.measurements.some(m=>!Number.isFinite(m.value)||m.value<=0)){showToast('計算できていない数量があります');return}
  const subtotal=imageAggregate(currentImage),negativeCategory=project.categories.find(c=>(subtotal[c.id]||0)<-0.0001);if(negativeCategory){showToast(`確定不可：${negativeCategory.name}の減算が加算を超えています`);return}
  const lowest=imageMinimumConfidence();if(lowest&&lowest<=1){showToast('品質目安が低い数量があります。実寸設定を追加または固定してください');return}
  currentImage.confirmed=true;recordAudit('IMAGE_CONFIRMED',{imageId:currentImage.id,measurementCount:currentImage.measurements.length,minimumConfidence:imageMinimumConfidence()});
  if(project.currentIndex<project.imageIds.length-1){
    project.currentIndex++;await persistProject();await loadCurrentImage();
  }else{
    project.status=project.images.every(im=>im.confirmed)?'completed':'editing';await persistProject();showSummaryScreen();if(project.status==='completed')runProjectAudit({show:false}).catch(()=>{});
  }
};
els.prevImageBtn.onclick=()=>goToImage(project.currentIndex-1);
els.nextImageBtn.onclick=()=>goToImage(project.currentIndex+1);
els.imageListBtn.onclick=openImagePicker;
$('#imagePickerSummaryBtn').onclick=()=>{closeSheet('imagePickerSheet');showSummaryScreen()};
