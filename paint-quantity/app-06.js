'use strict';
function solveLinearSystem(A,b){
  const n=b.length,M=A.map((r,i)=>[...r,b[i]]);
  for(let c=0;c<n;c++){
    let pivot=c;for(let r=c+1;r<n;r++)if(Math.abs(M[r][c])>Math.abs(M[pivot][c]))pivot=r;
    if(Math.abs(M[pivot][c])<1e-10)throw new Error('較正点の配置が不正です');
    [M[c],M[pivot]]=[M[pivot],M[c]];const d=M[c][c];for(let j=c;j<=n;j++)M[c][j]/=d;
    for(let r=0;r<n;r++){if(r===c)continue;const f=M[r][c];for(let j=c;j<=n;j++)M[r][j]-=f*M[c][j]}
  }
  return M.map(r=>r[n]);
}
function computeHomography(src,dst){
  const A=[],b=[];
  for(let i=0;i<4;i++){
    const x=src[i].x,y=src[i].y,u=dst[i].x,v=dst[i].y;
    A.push([x,y,1,0,0,0,-u*x,-u*y]);b.push(u);
    A.push([0,0,0,x,y,1,-v*x,-v*y]);b.push(v);
  }
  const h=solveLinearSystem(A,b);return [...h,1];
}
function projectPoint(H,p){
  const d=H[6]*p.x+H[7]*p.y+H[8];if(Math.abs(d)<1e-9)throw new Error('遠近補正の限界を超えています');
  const q={x:(H[0]*p.x+H[1]*p.y+H[2])/d,y:(H[3]*p.x+H[4]*p.y+H[5])/d};
  if(!Number.isFinite(q.x)||!Number.isFinite(q.y)||Math.abs(q.x)>1e6||Math.abs(q.y)>1e6)throw new Error('遠近補正の外挿が大きすぎます');return q;
}
function isConvexQuad(pts){
  const minArea=Math.max(100,imageDiagonal()*imageDiagonal()*5e-5);
  if(pts.length!==4||pts.some(p=>!pointInsideImage(p,.01))||Math.abs(signedPolygonArea(pts))<minArea||polygonHasSelfIntersection(pts))return false;
  let sign=0;for(let i=0;i<4;i++){const a=pts[i],b=pts[(i+1)%4],c=pts[(i+2)%4],z=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);if(Math.abs(z)<1e-8)return false;const s=Math.sign(z);if(sign&&s!==sign)return false;sign=s}return true;
}
function pointInPolygon(p,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if(((a.y>p.y)!==(b.y>p.y))&&(p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y+1e-12)+a.x))inside=!inside}return inside}
function pointInOrOnPolygon(p,poly){if(poly.some((a,i)=>pointOnSegment(p,a,poly[(i+1)%poly.length])))return true;return pointInPolygon(p,poly)}
function calibrationById(id){return currentImage?.calibrations?.find(c=>c.id===id)||null}
function centroid(pts){return pts.reduce((a,p)=>({x:a.x+p.x/pts.length,y:a.y+p.y/pts.length}),{x:0,y:0})}
function calibrationCenter(cal){return centroid(cal.points||[])}
function pointSegmentDistance(p,a,b){
  const dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;if(!l2)return distance(p,a);
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l2));return distance(p,{x:a.x+t*dx,y:a.y+t*dy});
}
function polygonBoundaryDistance(p,poly){let d=Infinity;for(let i=0;i<poly.length;i++)d=Math.min(d,pointSegmentDistance(p,poly[i],poly[(i+1)%poly.length]));return d}
function imageDiagonal(){const d=imageDimensions();return Math.hypot(d.w||1000,d.h||1000)}
function samplePolylinePoints(pts,stepCount=5){const out=[];for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];for(let j=0;j<stepCount;j++){const t=j/stepCount;out.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t})}}return out}
function worldPoints(cal,pts){
  if(cal.type==='plane'){
    const H=cal.homography||computeHomography(cal.points,[{x:0,y:0},{x:cal.realWidth,y:0},{x:cal.realWidth,y:cal.realHeight},{x:0,y:cal.realHeight}]);
    const mapped=pts.map(p=>projectPoint(H,p)),limit=Math.max(cal.realWidth,cal.realHeight)*100;
    if(mapped.some(p=>Math.abs(p.x)>limit||Math.abs(p.y)>limit))throw new Error('実寸設定から離れすぎています');return mapped;
  }
  return pts.map(p=>({x:p.x/cal.pixelsPerMeter,y:p.y/cal.pixelsPerMeter}));
}
function planeShapeQuality(cal){
  const e=cal.points.map((p,i)=>distance(p,cal.points[(i+1)%4])),ratio=Math.max(...e)/Math.max(1,Math.min(...e));
  const xs=cal.points.map(p=>p.x),ys=cal.points.map(p=>p.y),box=(Math.max(...xs)-Math.min(...xs))*(Math.max(...ys)-Math.min(...ys));
  const fill=box?polygonArea(cal.points)/box:0;
  let stars=5;if(ratio>5||fill<.22)stars=2;else if(ratio>3.5||fill<.35)stars=3;else if(ratio>2.5||fill<.48)stars=4;return stars;
}
function planeRelation(cal,pts){
  const samples=samplePolylinePoints(pts,6),inside=samples.filter(p=>pointInOrOnPolygon(p,cal.points)).length,coverage=inside/Math.max(1,samples.length),c=centroid(pts),centerInside=pointInOrOnPolygon(c,cal.points),boundary=polygonBoundaryDistance(c,cal.points),proximity=centerInside?0:boundary/imageDiagonal();
  return{coverage,centerInside,proximity,allInside:coverage>=.999};
}
function chooseAutoPlane(pts){
  const planes=(currentImage?.calibrations||[]).filter(c=>c.type==='plane');if(!planes.length)return null;
  const scored=planes.map(cal=>{const r=planeRelation(cal,pts),score=(r.allInside?12:0)+(r.centerInside?5:0)+r.coverage*5-Math.min(4,r.proximity*15);return{cal,...r,score}}).sort((a,b)=>b.score-a.score);
  const best=scored[0],second=scored[1];
  if(best.allInside)return{...best,confidence:Math.max(2,Math.min(5,planeShapeQuality(best.cal)))};
  const clear=planes.length===1||!second||best.proximity<.08||second.proximity>best.proximity*1.8;
  if(clear&&best.proximity<.30)return{...best,confidence:1,warning:'実寸設定の四角形の外側です。使用する設定を固定し、同じ平面か確認してください',blockingReason:'自動判定では実寸設定の外側を確定できません'};
  return null;
}
function angleSimilarity(a,b){const la=Math.hypot(a.x,a.y),lb=Math.hypot(b.x,b.y);if(!la||!lb)return 0;return Math.abs((a.x*b.x+a.y*b.y)/(la*lb))}
function lineCalibrationField(p,direction=null){
  const lines=(currentImage?.calibrations||[]).filter(c=>c.type==='line'&&Number.isFinite(c.pixelsPerMeter)&&c.pixelsPerMeter>0);
  if(!lines.length)return null;
  const diag=imageDiagonal(),samples=lines.map(cal=>{const center=calibrationCenter(cal),d=distance(p,center),v={x:cal.points[1].x-cal.points[0].x,y:cal.points[1].y-cal.points[0].y},similarity=direction?angleSimilarity(v,direction):1;return{cal,center,d,ppm:cal.pixelsPerMeter,similarity}});
  const nearest=Math.min(...samples.map(s=>s.d)),soft=Math.max(30,diag*.035);
  const weighted=samples.map(s=>({...s,w:(1/(s.d*s.d+soft*soft))*(direction?(.03+Math.pow(s.similarity,6)):1)}));
  const sumW=weighted.reduce((a,s)=>a+s.w,0),ppm=weighted.reduce((a,s)=>a+s.ppm*s.w,0)/sumW;
  const variance=weighted.reduce((a,s)=>a+s.w*(s.ppm-ppm)**2,0)/sumW,cv=Math.sqrt(variance)/ppm,maxSim=Math.max(...samples.map(s=>s.similarity));
  let confidence=lines.length===1?2:lines.length===2?3:4;
  if(lines.length>=3&&cv<.08)confidence++;if(cv>.18)confidence--;if(cv>.32)confidence-=2;if(nearest>diag*.28)confidence--;
  if(direction){if(maxSim<Math.cos(Math.PI/6))confidence=1;else if(maxSim<Math.cos(Math.PI/12))confidence=Math.min(confidence,2);else if(lines.length===1)confidence=Math.min(confidence,3)}
  const xs=samples.map(s=>s.center.x),ys=samples.map(s=>s.center.y),margin=diag*.08;
  const outside=p.x<Math.min(...xs)-margin||p.x>Math.max(...xs)+margin||p.y<Math.min(...ys)-margin||p.y>Math.max(...ys)+margin;if(outside&&lines.length>1)confidence--;
  let warning=cv>.30?'較正倍率の差が大きいため再確認してください':outside&&lines.length>1?'較正範囲の外側を補間しています':null;
  if(direction&&maxSim<Math.cos(Math.PI/6))warning='計測方向に合う較正線がありません。近い方向の較正を追加してください';
  return{ppm,confidence:Math.max(1,Math.min(5,confidence)),cv,nearest,warning,calibrationIds:weighted.sort((a,b)=>b.w-a.w).slice(0,Math.min(4,weighted.length)).map(s=>s.cal.id)};
}
function interpolatedPathLength(pts){
  let total=0,qualities=[],warnings=[],ids=new Set();
  for(let i=1;i<pts.length;i++){
    const a=pts[i-1],b=pts[i],dir={x:b.x-a.x,y:b.y-a.y},px=distance(a,b),steps=Math.max(1,Math.ceil(px/35));
    for(let j=0;j<steps;j++){
      const t=(j+.5)/steps,p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t},field=lineCalibrationField(p,dir);if(!field)return null;
      total+=(px/steps)/field.ppm;qualities.push(field.confidence);field.calibrationIds.forEach(id=>ids.add(id));if(field.warning)warnings.push(field.warning);
    }
  }
  return{value:total,confidence:Math.min(...qualities),warning:warnings[0]||null,calibrationIds:[...ids],blockingReason:Math.min(...qualities)<=1?'計測方向に適合する較正が不足しています':null};
}
function triangleAreaIntegrated(tri,depth,collector){
  const area=polygonArea(tri);if(area<=0)return 0;const mids=[centroid(tri),...tri],fields=mids.map(p=>lineCalibrationField(p)).filter(Boolean);if(fields.length!==mids.length)throw new Error('面積を補間できません');
  const factors=fields.map(f=>1/(f.ppm*f.ppm)),min=Math.min(...factors),max=Math.max(...factors),long=Math.max(distance(tri[0],tri[1]),distance(tri[1],tri[2]),distance(tri[2],tri[0]));
  if(depth<4&&(long>imageDiagonal()*.07||(max-min)/Math.max(min,1e-12)>.06)){
    const[a,b,c]=tri,ab={x:(a.x+b.x)/2,y:(a.y+b.y)/2},bc={x:(b.x+c.x)/2,y:(b.y+c.y)/2},ca={x:(c.x+a.x)/2,y:(c.y+a.y)/2};
    return triangleAreaIntegrated([a,ab,ca],depth+1,collector)+triangleAreaIntegrated([ab,b,bc],depth+1,collector)+triangleAreaIntegrated([ca,bc,c],depth+1,collector)+triangleAreaIntegrated([ab,bc,ca],depth+1,collector);
  }
  for(const f of fields){collector.qualities.push(f.confidence);f.calibrationIds.forEach(id=>collector.ids.add(id));if(f.warning)collector.warnings.push(f.warning)}
  return area*factors.reduce((a,v)=>a+v,0)/factors.length;
}
function interpolatedPolygonArea(pts){
  const triangles=triangulateSimplePolygon(pts),collector={qualities:[],warnings:[],ids:new Set()};let total=0;
  for(const tri of triangles)total+=triangleAreaIntegrated(tri,0,collector);
  const lineCount=(currentImage?.calibrations||[]).filter(c=>c.type==='line').length,raw=collector.qualities.length?Math.min(...collector.qualities):1,confidence=lineCount===1?2:Math.max(1,Math.min(3,raw));
  const warning=collector.warnings[0]||(lineCount===1?'正面に近い写真として面積を算出しました。斜め写真は4点の実寸設定を使用してください':'簡易実寸設定から面積を算出しました。斜め写真は4点の実寸設定を推奨します');
  return{value:total,confidence,warning,blockingReason:confidence<=1?'面積を算出できる実寸設定が不足しています':null,calibrationIds:[...collector.ids]};
}
function lockedCalibrationResult(unit,pts,cal){
  if(!cal)return null;const mapped=worldPoints(cal,pts),value=unit==='m'?pathLength(mapped):polygonArea(mapped);
  let confidence=cal.type==='plane'?planeShapeQuality(cal):3,warning=null,blockingReason=null;
  if(cal.type==='plane'){
    const r=planeRelation(cal,pts);if(!r.allInside){warning='固定した実寸設定の外側を計算しています。同じ平面か確認してください';confidence=Math.min(confidence,r.proximity>.25?1:r.proximity>.12?2:3);if(r.proximity>.25)blockingReason='実寸設定から離れすぎています'}
  }else if(unit==='m2'){confidence=2;warning='正面に近い写真として面積を算出しました。斜め写真は4点の実寸設定を使用してください';blockingReason=null}
  else{
    let q=5;for(let i=1;i<pts.length;i++){const v={x:pts[i].x-pts[i-1].x,y:pts[i].y-pts[i-1].y},cv={x:cal.points[1].x-cal.points[0].x,y:cal.points[1].y-cal.points[0].y},sim=angleSimilarity(v,cv);if(sim<Math.cos(Math.PI/6))q=1;else if(sim<Math.cos(Math.PI/12))q=Math.min(q,2);else q=Math.min(q,3)}confidence=Math.min(confidence,q);if(confidence<=1){warning='較正線と計測方向が大きく異なります';blockingReason='計測方向に合う較正が必要です'}
  }
  return{value,calibrationMode:'locked',strategy:cal.type==='plane'?'locked-plane':'locked-line',calibrationId:cal.id,calibrationIds:[cal.id],confidence,warning,blockingReason};
}
