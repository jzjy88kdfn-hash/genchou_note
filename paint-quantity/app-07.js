'use strict';
function planeAmbiguity(unit,pts){
  const candidates=(currentImage?.calibrations||[]).filter(c=>c.type==='plane').map(cal=>({cal,relation:planeRelation(cal,pts)})).filter(x=>x.relation.allInside);
  if(candidates.length<2)return null;
  const values=[];for(const x of candidates){try{const mapped=worldPoints(x.cal,pts),value=unit==='m'?pathLength(mapped):polygonArea(mapped);if(Number.isFinite(value)&&value>0)values.push({...x,value})}catch(_){}}
  if(values.length<2)return null;const nums=values.map(v=>v.value),mean=nums.reduce((a,v)=>a+v,0)/nums.length,spread=(Math.max(...nums)-Math.min(...nums))/Math.max(mean,1e-9);
  return spread>.05?{spread,best:values.sort((a,b)=>planeShapeQuality(b.cal)-planeShapeQuality(a.cal))[0]}:null;
}

function calculateMeasurement(unit,pts,requestedId=currentImage?.activeCalibrationId){
  const geometryError=validateGeometry(unit,pts);if(geometryError)throw new Error(geometryError);
  if(unit==='count')return{value:1,calibrationMode:'none',strategy:'count',calibrationIds:[],confidence:5,warning:null,blockingReason:null};
  if(requestedId&&requestedId!=='AUTO')return lockedCalibrationResult(unit,pts,calibrationById(requestedId));
  const ambiguity=planeAmbiguity(unit,pts);if(ambiguity){const mapped=worldPoints(ambiguity.best.cal,pts),value=unit==='m'?pathLength(mapped):polygonArea(mapped);return{value,calibrationMode:'auto',strategy:'auto-plane-ambiguous',calibrationId:null,calibrationIds:(currentImage.calibrations||[]).filter(c=>c.type==='plane'&&planeRelation(c,pts).allInside).map(c=>c.id),confidence:1,warning:'複数の遠近補正面で数量が一致しません',blockingReason:'使用する実寸設定を固定してください'}}
  const plane=chooseAutoPlane(pts),hasLine=(currentImage?.calibrations||[]).some(c=>c.type==='line');
  if(plane?.allInside){
    const mapped=worldPoints(plane.cal,pts),value=unit==='m'?pathLength(mapped):polygonArea(mapped);
    return{value,calibrationMode:'auto',strategy:'auto-plane',calibrationId:null,calibrationIds:[plane.cal.id],confidence:plane.confidence,warning:null,blockingReason:null};
  }
  if(plane&&!hasLine){
    const mapped=worldPoints(plane.cal,pts),value=unit==='m'?pathLength(mapped):polygonArea(mapped);
    return{value,calibrationMode:'auto',strategy:'auto-plane-estimate',calibrationId:null,calibrationIds:[plane.cal.id],confidence:1,warning:plane.warning,blockingReason:plane.blockingReason};
  }
  const interpolated=unit==='m'?interpolatedPathLength(pts):interpolatedPolygonArea(pts);if(!interpolated)return null;
  return{...interpolated,calibrationMode:'auto',strategy:'auto-interpolation',calibrationId:null};
}
function calculateValue(unit,pts,calibrationId=currentImage?.activeCalibrationId){return calculateMeasurement(unit,pts,calibrationId)?.value??null}
function validateMeasurementAgainstCalibration(cal,pts,unit=selectedCategory()?.unit){
  const geometryError=validateGeometry(unit,pts);if(geometryError)return geometryError;
  if(isAutoCalibration()){
    if(!(currentImage?.calibrations||[]).length)return '実寸設定を1件以上登録してください';
    if(!chooseAutoPlane(pts)&&!(currentImage?.calibrations||[]).some(c=>c.type==='line'))return 'この位置を自動計算できません。使用する実寸設定を固定してください';
    return null;
  }
  if(!cal)return '使用する実寸設定を選択してください';
  if(cal.type==='plane'&&(!cal.homography||cal.points.length!==4))return '4点の実寸設定データが不正です';
  return null;
}
function applyMeasurementResult(m,result){
  m.value=result.value;m.calibrationMode=result.calibrationMode;m.strategy=result.strategy;m.calibrationId=result.calibrationId||null;
  m.calibrationIds=result.calibrationIds||[];m.confidence=result.confidence||1;m.warning=result.warning||null;m.blockingReason=result.blockingReason||null;m.updatedAt=nowISO();m.calculationVersion=CALCULATION_VERSION;return m;
}
function recalculateMeasurementObject(m){
  if(m.unit==='count'){const err=validateGeometry('count',m.points);if(err)throw new Error(err);m.value=1;m.confidence=5;m.blockingReason=null;return m}
  const requested=m.calibrationMode==='locked'?m.calibrationId:'AUTO',result=calculateMeasurement(m.unit,m.points,requested);if(!result)throw new Error('再計算できません');return applyMeasurementResult(m,result);
}
function recalculateAutoMeasurements(){
  let changed=0;
  for(const m of currentImage?.measurements||[]){
    if(m.unit==='count'||m.calibrationMode!=='auto')continue;
    try{recalculateMeasurementObject(m);changed++}catch(err){m.value=null;m.confidence=0;m.warning=err.message||'再計算できません';m.blockingReason=m.warning}
  }
  updateQualityUI();return changed;
}
function recalculateFutureMeasurements(){
  for(const m of future){try{recalculateMeasurementObject(m)}catch(err){m.value=null;m.confidence=0;m.warning=err.message||'やり直しデータを再計算できません';m.blockingReason=m.warning}}
}
function revalidateAllMeasurements(){
  for(const m of currentImage?.measurements||[]){try{recalculateMeasurementObject(m)}catch(err){return err.message||'数量を再検証できません'}}
  updateQualityUI();return null;
}
function commitMeasurement(){
  const cat=selectedCategory();if(!cat)return;
  const cal=activeCalibration();
  if(cat.unit!=='count'&&!(currentImage?.calibrations||[]).length){showToast('先に実寸設定を1件以上登録してください');return}
  if(cat.unit==='m'&&draftPoints.length<2){showToast('2点以上なぞってください');return}
  if(cat.unit==='m2'&&draftPoints.length<3){showToast('3点以上で囲んでください');return}
  const invalid=validateMeasurementAgainstCalibration(cal,draftPoints,cat.unit);if(invalid){showToast(invalid);return}
  let result;try{result=calculateMeasurement(cat.unit,draftPoints,currentImage.activeCalibrationId)}catch(err){showToast(err.message);return}
  if(!result||!Number.isFinite(result.value)||result.value<=0){showToast('数量を計算できません');return}
  const m=applyMeasurementResult({id:uid('m'),categoryId:cat.id,unit:cat.unit,negative:minus,points:clone(draftPoints),createdAt:nowISO(),updatedAt:nowISO(),calculationVersion:CALCULATION_VERSION},result);
  currentImage.measurements.push(m);recordAudit('MEASUREMENT_ADDED',{imageId:currentImage.id,measurementId:m.id,categoryId:m.categoryId,unit:m.unit,value:m.value,negative:m.negative,strategy:m.strategy,confidence:m.confidence});
  history.push('add');future=[];draftPoints=[];markImageDirty();scheduleSave();updateHistoryUI();updateModeUI();updateScaleUI();draw();
  if(result.warning)showToast(result.warning);else showToast(`${confidenceStars(result.confidence)} ${result.strategy.includes('plane')?'遠近補正':'自動補間'}で算出`);
}
function pushCount(p){
  const cat=selectedCategory();if(!cat)return;
  const m={id:uid('m'),categoryId:cat.id,unit:'count',negative:minus,points:[p],value:1,confidence:5,calculationVersion:CALCULATION_VERSION,createdAt:nowISO(),updatedAt:nowISO()};currentImage.measurements.push(m);recordAudit('COUNT_ADDED',{imageId:currentImage.id,measurementId:m.id,categoryId:m.categoryId,negative:m.negative});
  history.push('add');future=[];markImageDirty();scheduleSave();updateHistoryUI();draw();
}
function undo(){
  if(draftPoints.length){
    draftPoints.pop();updateModeUI();draw();return;
  }
  const m=currentImage?.measurements.pop();if(!m)return;
  future.push(m);recordAudit('UNDO',{imageId:currentImage.id,measurementId:m.id});markImageDirty();scheduleSave(0);updateHistoryUI();draw();
}
function redo(){
  const m=future.pop();if(!m)return;
  try{recalculateMeasurementObject(m)}catch(err){showToast(`やり直し不可：${err.message||err}`);updateHistoryUI();return}
  if(m.blockingReason&&(!Number.isFinite(m.value)||m.value<=0)){showToast(`やり直し不可：${m.blockingReason}`);updateHistoryUI();return}
  m.updatedAt=nowISO();currentImage.measurements.push(m);recordAudit('REDO',{imageId:currentImage.id,measurementId:m.id,value:m.value});markImageDirty();scheduleSave(0);updateHistoryUI();updateScaleUI();draw();
}
