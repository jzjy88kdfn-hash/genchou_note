function signed(v,d=3){const n=Number(v)||0;return `${n<0?"−":""}${Math.abs(n).toFixed(d)}`}
function drawingDims(e){
  const m=e.measurement||{};
  if(e.unit==="㎡"){
    if(m.areaMode==="rect"&&m.h>0&&m.w>0)return `H${Number(m.h).toFixed(3)} × W${Number(m.w).toFixed(3)}${Number(m.count||1)>1?` × ${m.count}`:""}`;
    if(m.areaMode==="beam"&&m.beamH>0&&m.beamW>0){
      const net=round3((m.beamParts||[]).reduce((a,p)=>a+(Number(p.sign)||1)*(Number(p.length)||0),0));
      return `梁成${Number(m.beamH).toFixed(3)}×2 ＋ 梁幅${Number(m.beamW).toFixed(3)} ／ L${net.toFixed(3)}`;
    }
  }
  if(e.unit==="m"&&m.length>0)return `L${Number(m.length).toFixed(3)}${Number(m.count||1)>1?` × ${m.count}`:""}`;
  return e.formula||"";
}
function drawingLabelLines(e,no){
  const name=e.role==="opening"?`${e.itemName} 開口控除`:e.itemName;
  const dims=drawingDims(e),qty=`${signed(e.quantity)}${e.unit||""}`;
  const first=`No.${no} ${name}`;
  return dims&&dims!==String(e.quantity)?[first,dims,qty]:[first,qty];
}
function svgTextBlock(x,y,lines,cls="drawing-label"){
  const safe=lines.filter(Boolean).slice(0,3);
  return `<text class="${cls}" x="${x}" y="${y}">${safe.map((t,i)=>`<tspan x="${x}" dy="${i?44:0}">${esc(t)}</tspan>`).join("")}</text>`;
}
function drawingSvg(sf){
  const photo=photoCache.get(sf.photoRef)||"";if(!photo)return"";
  const aspect=sf.imageAspect||1,h=1000*aspect,cv=p=>({x:p.x*1000,y:p.y*h}),parts=[];
  parts.push(`<defs><marker id="dimArrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="drawing-arrow"/></marker></defs>`);
  for(const c of sf.calibrations||[]){
    if(!c.points?.[0]||!c.points?.[1])continue;
    const a=cv(c.points[0]),b=cv(c.points[1]),mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
    parts.push(`<line class="drawing-cal" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" marker-start="url(#dimArrow)" marker-end="url(#dimArrow)"/>`);
    parts.push(svgTextBlock(mx+12,my-16,[`基準 ${Number(c.value).toFixed(3)}m`],"drawing-cal-label"));
  }
  const es=surfaceEntries(sf.id).filter(e=>e.annotation);
  es.forEach((e,idx)=>{
    const pts=e.annotation.points.map(cv),sh=e.annotation.shape,cls=e.role==="opening"?"drawing-opening":"drawing-measure";
    if(sh==="line"&&pts.length>=2){
      parts.push(`<line class="${cls}" x1="${pts[0].x}" y1="${pts[0].y}" x2="${pts[1].x}" y2="${pts[1].y}" marker-start="url(#dimArrow)" marker-end="url(#dimArrow)"/>`);
    }else if(sh==="point"&&pts.length){
      parts.push(`<circle class="${cls}" cx="${pts[0].x}" cy="${pts[0].y}" r="16"/>`);
    }else if(pts.length>=3){
      parts.push(`<polygon class="${cls}" points="${pts.map(p=>`${p.x},${p.y}`).join(" ")}"/>`);
    }
    if(pts.length){
      const cx=pts.reduce((a,p)=>a+p.x,0)/pts.length,cy=pts.reduce((a,p)=>a+p.y,0)/pts.length;
      parts.push(svgTextBlock(cx+12,Math.max(42,cy-18),drawingLabelLines(e,idx+1)));
    }
  });
  return `<div class="drawingCanvasWrap"><div class="drawingStage" style="aspect-ratio:${(1/aspect).toFixed(6)} / 1"><img src="${photo}" alt="面${sf.seq}の基準写真"><svg viewBox="0 0 1000 ${h}" role="img" aria-label="面${sf.seq}の寸法・数量注記">${parts.join("")}</svg></div></div>`;
}
function drawingRows(sf){
  const es=surfaceEntries(sf.id);
  const rows=[];
  es.filter(e=>e.annotation).forEach((e,idx)=>rows.push(`<tr><td>${idx+1}</td><td>${esc(e.role==="opening"?`${e.itemName}（開口控除）`:e.itemName)}</td><td>${esc(drawingDims(e)||"—")}</td><td>${signed(e.quantity)} ${esc(e.unit||"")}</td><td>${esc(e.formula||"")}</td></tr>`));
  const derived=es.filter(e=>!e.annotation&&e.role==="derived-opening-perimeter");
  for(const e of derived)rows.push(`<tr><td>派生</td><td>${esc(e.itemName)}</td><td>サッシ囲み再利用</td><td>${signed(e.quantity)} ${esc(e.unit||"")}</td><td>${esc(e.formula||"")}</td></tr>`);
  return rows.join("");
}
function drawingSheet(sf){
  const warning=!sf.calibrations?.length?"未較正：写真上の位置証拠として出力。実寸縮尺は確定していません。":sf.completionWarnings?.length?sf.completionWarnings.join("／"):"";
  return `<article class="drawingSheet">
    <div class="drawingHeader"><div><h1>現地調査 実測図</h1><b>${esc(currentSite().name||"現場名未入力")} ／ 面 ${sf.seq}</b></div><div class="drawingMeta">現調日 ${esc(currentSite().date||"")}<br>担当 ${esc(currentSite().staff||"")}</div></div>
    ${warning?`<div class="drawingWarning">${esc(warning)}</div>`:""}
    ${drawingSvg(sf)}
    <table class="drawingTable"><thead><tr><th>No.</th><th>対象</th><th>寸法</th><th>数量</th><th>算定式</th></tr></thead><tbody>${drawingRows(sf)||`<tr><td colspan="5">この面の数量登録はありません。</td></tr>`}</tbody></table>
    <div class="drawingFoot">※寸法・数量は現地調査時の実測記録に基づきます。基準寸法は数量集計に含みません。</div>
  </article>`;
}
function renderDrawingPrint(){const s=currentSite(),surfaces=s.surfaces.filter(sf=>sf.photoRef);$("drawingPrint").innerHTML=surfaces.map(drawingSheet).join("")||`<p>面写真がありません。</p>`}
async function ensureSurfaceAspects(){for(const sf of currentSite().surfaces){if(!sf.photoRef||sf.imageAspect)continue;const src=await photoGet(sf.photoRef);if(!src)continue;sf.imageAspect=await new Promise(res=>{const im=new Image();im.onload=()=>res(im.naturalHeight/im.naturalWidth||1);im.onerror=()=>res(1);im.src=src})}}
