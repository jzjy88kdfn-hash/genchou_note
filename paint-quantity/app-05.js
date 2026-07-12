'use strict';
function draw(){
  const c=els.canvas,ctx=c.getContext('2d');
  ctx.setTransform(canvasSize.dpr,0,0,canvasSize.dpr,0,0);
  ctx.clearRect(0,0,canvasSize.w,canvasSize.h);
  if(!imageElement?.complete)return;
  ctx.save();
  ctx.translate(view.offsetX,view.offsetY);ctx.scale(view.scale,view.scale);
  ctx.drawImage(imageElement,0,0);
  ctx.restore();
  for(const m of currentImage?.measurements||[])drawMeasurement(ctx,m,false);
  for(const cal of currentImage?.calibrations||[])drawCalibration(ctx,cal,cal.id===currentImage.activeCalibrationId);
  if(calibrationDraft)drawCalibration(ctx,{points:calibrationDraft,draft:true,type:(mode==='calibrate-plane'||calibrationDraft.length>=3)?'plane':'line'},true);
  if(draftPoints.length)drawDraft(ctx);
}
function catColor(id){
  const palette=['#2dd4bf','#38bdf8','#fbbf24','#a78bfa','#fb7185','#34d399','#fb923c','#60a5fa','#e879f9','#f87171'];
  const i=Math.max(0,project.categories.findIndex(c=>c.id===id));return palette[i%palette.length];
}
function drawMeasurement(ctx,m){
  const color=m.negative?'#fb7185':catColor(m.categoryId);
  const pts=m.points.map(imageToScreen);
  ctx.save();ctx.lineJoin='round';ctx.lineCap='round';ctx.strokeStyle=color;ctx.fillStyle=color;
  ctx.lineWidth=m.negative?4:3;ctx.setLineDash(m.negative?[8,6]:[]);
  if(m.unit==='count'){
    const p=pts[0];ctx.beginPath();ctx.arc(p.x,p.y,11,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#06101b';ctx.font='900 12px -apple-system';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(m.negative?'−':'+',p.x,p.y+1);
  }else{
    ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
    if(m.unit==='m2'){ctx.closePath();ctx.globalAlpha=.18;ctx.fill();ctx.globalAlpha=1}
    ctx.stroke();
    const markers=m.unit==='m'?[pts[0],pts[pts.length-1]]:pts;
    markers.forEach(p=>{ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fill()});
  }
  ctx.setLineDash([]);
  if(m.value!=null&&pts.length){
    const p=pts.reduce((a,b)=>({x:a.x+b.x/pts.length,y:a.y+b.y/pts.length}),{x:0,y:0});
    const cal=m.unit==='count'?null:calibrationById(m.calibrationId);
    const model=m.unit==='count'?'':(m.calibrationMode==='auto'?(m.strategy==='auto-plane'?'・遠近':'・補間'):(cal?`・${cal.name}`:''));
    const quality=m.unit==='count'||!m.confidence?'':`・★${Math.round(m.confidence)}`;
    const text=(m.negative?'− ':'')+fmt(m.value,m.unit)+model+quality;
    ctx.font='800 12px -apple-system';const w=ctx.measureText(text).width+14;
    ctx.fillStyle='rgba(2,8,15,.82)';roundRect(ctx,p.x-w/2,p.y-13,w,26,8);ctx.fill();
    ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,p.x,p.y);
  }
  ctx.restore();
}
function roundRect(ctx,x,y,w,h,r){
  r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();
}
function drawCalibration(ctx,cal,isActive=false){
  const pts=(cal.points||cal).map(imageToScreen);if(pts.length<2)return;
  ctx.save();ctx.strokeStyle=isActive?'#fbbf24':'#f8fafc';ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=isActive?4:2.5;ctx.setLineDash([7,5]);
  ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);if((cal.type==='plane'||pts.length===4)&&pts.length>=3)ctx.closePath();ctx.stroke();ctx.setLineDash([]);
  pts.forEach((p,i)=>{ctx.beginPath();ctx.arc(p.x,p.y,isActive?7:5,0,Math.PI*2);ctx.fill();if(cal.draft&&cal.type==='plane'){ctx.fillStyle='#06101b';ctx.font='900 10px -apple-system';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(i+1),p.x,p.y);ctx.fillStyle=ctx.strokeStyle}});
  if((isActive||cal.draft)&&(cal.realLength||cal.realWidth)){
    const mid=pts.reduce((a,b)=>({x:a.x+b.x/pts.length,y:a.y+b.y/pts.length}),{x:0,y:0});
    const t=cal.type==='plane'?`${cal.name||'面'} ${cal.realWidth}×${cal.realHeight}m`:`${cal.name||'基準'} ${cal.realLength}m`;
    ctx.font='800 12px -apple-system';const w=ctx.measureText(t).width+14;
    ctx.fillStyle='rgba(2,8,15,.85)';roundRect(ctx,mid.x-w/2,mid.y-13,w,26,8);ctx.fill();ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t,mid.x,mid.y);
  }
  ctx.restore();
}
function drawDraft(ctx){
  const cat=selectedCategory();if(!cat)return;
  const pts=draftPoints.map(imageToScreen);ctx.save();ctx.strokeStyle='#fff';ctx.fillStyle='#fff';ctx.lineWidth=3;ctx.setLineDash([5,5]);ctx.beginPath();
  pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
  if(cat.unit==='m2'&&pts.length>2)ctx.lineTo(pts[0].x,pts[0].y);
  ctx.stroke();ctx.setLineDash([]);pts.forEach((p,i)=>{ctx.beginPath();ctx.arc(p.x,p.y,i===0?6:4,0,Math.PI*2);ctx.fill()});ctx.restore();
}
function updateZoom(){els.zoomBadge.textContent=`${Math.round(view.scale/view.minScale*100)}%`}

function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function pathLength(pts){let n=0;for(let i=1;i<pts.length;i++)n+=distance(pts[i-1],pts[i]);return n}
function polygonArea(pts){return Math.abs(signedPolygonArea(pts))}
function signedPolygonArea(pts){let a=0;for(let i=0,j=pts.length-1;i<pts.length;j=i++)a+=pts[j].x*pts[i].y-pts[i].x*pts[j].y;return a/2}
function cross2(a,b,c){return(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)}
function nearlySamePoint(a,b,tol=Math.max(0.75,imageDiagonal()*.00025)){return distance(a,b)<=tol}
function pointOnSegment(p,a,b,tol=Math.max(0.75,imageDiagonal()*.00025)){
  if(Math.abs(cross2(a,b,p))>tol*Math.max(1,distance(a,b)))return false;
  return p.x>=Math.min(a.x,b.x)-tol&&p.x<=Math.max(a.x,b.x)+tol&&p.y>=Math.min(a.y,b.y)-tol&&p.y<=Math.max(a.y,b.y)+tol;
}
function segmentIntersection(a,b,c,d){
  const eps=Math.max(1e-8,imageDiagonal()*1e-9),o1=cross2(a,b,c),o2=cross2(a,b,d),o3=cross2(c,d,a),o4=cross2(c,d,b);
  if(((o1>eps&&o2<-eps)||(o1<-eps&&o2>eps))&&((o3>eps&&o4<-eps)||(o3<-eps&&o4>eps)))return true;
  if(Math.abs(o1)<=eps&&pointOnSegment(c,a,b))return true;if(Math.abs(o2)<=eps&&pointOnSegment(d,a,b))return true;
  if(Math.abs(o3)<=eps&&pointOnSegment(a,c,d))return true;if(Math.abs(o4)<=eps&&pointOnSegment(b,c,d))return true;return false;
}
function cleanPolygonPoints(pts){
  const tol=Math.max(.75,imageDiagonal()*.00025),out=[];
  for(const p of pts){if(!out.length||!nearlySamePoint(out[out.length-1],p,tol))out.push({x:p.x,y:p.y})}
  if(out.length>2&&nearlySamePoint(out[0],out[out.length-1],tol))out.pop();
  let changed=true,guard=0;
  while(changed&&out.length>3&&guard++<out.length*3){changed=false;for(let i=0;i<out.length;i++){
    const a=out[(i-1+out.length)%out.length],b=out[i],c=out[(i+1)%out.length];
    if(Math.abs(cross2(a,b,c))<=tol*Math.max(1,distance(a,c))&&pointOnSegment(b,a,c,tol)){out.splice(i,1);changed=true;break}
  }}
  return out;
}
function polygonHasSelfIntersection(pts){
  const n=pts.length;for(let i=0;i<n;i++){const a=pts[i],b=pts[(i+1)%n];for(let j=i+1;j<n;j++){
    if(j===i||j===(i+1)%n||i===(j+1)%n)continue;
    if(i===0&&j===n-1)continue;
    const c=pts[j],d=pts[(j+1)%n];if(segmentIntersection(a,b,c,d))return true;
  }}return false;
}
function validateGeometry(unit,pts){
  if(!Array.isArray(pts))return'図形データが不正です';
  if(pts.some(p=>!pointInsideImage(p,.01)))return'画像の範囲外に点があります';
  if(unit==='count')return pts.length===1?null:'箇所データが不正です';
  if(unit==='m'){
    if(pts.length<2)return'2点以上なぞってください';
    if(pathLength(pts)<Math.max(2,imageDiagonal()*.0015))return'線が短すぎます';
    return null;
  }
  const poly=cleanPolygonPoints(pts);
  if(poly.length<3)return'3点以上で囲んでください';
  if(polygonHasSelfIntersection(poly))return'線が交差しています。交差しない順番で囲んでください';
  const minArea=Math.max(4,imageDiagonal()*imageDiagonal()*1e-7);
  if(polygonArea(poly)<minArea)return'面積が小さすぎるか、点の並びが不正です';
  return null;
}
function pointInTriangle(p,a,b,c,eps=1e-9){const s1=cross2(a,b,p),s2=cross2(b,c,p),s3=cross2(c,a,p);const neg=s1<-eps||s2<-eps||s3<-eps,pos=s1>eps||s2>eps||s3>eps;return!(neg&&pos)}
function triangulateSimplePolygon(input){
  const pts=cleanPolygonPoints(input);if(pts.length<3)throw new Error('図形を三角形分割できません');
  if(polygonHasSelfIntersection(pts))throw new Error('線が交差しているため面積を計算できません');
  const ccw=signedPolygonArea(pts)>0,idx=pts.map((_,i)=>i),triangles=[];let guard=0;
  while(idx.length>3&&guard++<pts.length*pts.length*2){let clipped=false;
    for(let k=0;k<idx.length;k++){
      const ia=idx[(k-1+idx.length)%idx.length],ib=idx[k],ic=idx[(k+1)%idx.length],a=pts[ia],b=pts[ib],c=pts[ic];
      const z=cross2(a,b,c);if((ccw&&z<=1e-9)||(!ccw&&z>=-1e-9))continue;
      let contains=false;for(const ip of idx){if(ip===ia||ip===ib||ip===ic)continue;if(pointInTriangle(pts[ip],a,b,c,1e-8)){contains=true;break}}
      if(contains)continue;triangles.push([a,b,c]);idx.splice(k,1);clipped=true;break;
    }
    if(!clipped)throw new Error('凹型図形を正しく分割できません。点を少なくして囲み直してください');
  }
  if(idx.length===3)triangles.push(idx.map(i=>pts[i]));return triangles;
}
