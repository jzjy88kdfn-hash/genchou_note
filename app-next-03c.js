function legacyPhotosHtml(e){const refs=Array.isArray(e.photos)?e.photos:[];if(!refs.length)return"";const imgs=refs.map(r=>photoCache.get(r)|| (isDataUrl(r)?r:"")).filter(Boolean);if(!imgs.length)return"";return `<div class="legacyPhotos">${imgs.map(src=>`<img src="${src}" alt="旧実測写真">`).join("")}</div>`}
async function renderResults(){const s=currentSite();await ensureSurfaceAspects();const t=totals();$("resultStatus").textContent=`${t.length}項目・実測${s.entries.length}件`;$("resultTable").innerHTML=`<div class="resultRow head"><div>項目</div><div>単位</div><div>合計</div><div>回数</div></div>`+t.map(x=>`<div class="resultRow"><div>${esc(x.name)}</div><div>${esc(x.unit)}</div><div><b>${x.qty.toFixed(3)}</b></div><div>${x.count}</div></div>`).join("");$("surfaceEvidence").innerHTML=s.surfaces.filter(sf=>sf.photoRef).map(sf=>`<div class="evidenceCard"><div class="evidenceTitle"><b>面 ${sf.seq}</b><span class="pill ${sf.completed?"ok":"warn"}">${sf.completed?(sf.completionWarnings?.length?"完了・注意":"完了"):"未完了"}・較正${sf.calibrations.length}本・${surfaceEntries(sf.id).length}件${sf.completionWarnings?.length?`<br>${esc(sf.completionWarnings.join("／"))}`:""}</span></div>${evidenceSvg(sf)}</div>`).join("")||`<p class="hint">面写真はまだありません。</p>`;$("entryTable").innerHTML=s.entries.map((e,n)=>`<div class="entryFull"><b>${n+1}</b><span>${esc(e.role==="opening"?`${e.itemName}（開口控除）`:e.itemName)}</span><span>${Number(e.quantity).toFixed(3)}${esc(e.unit)}</span><span class="formula">${esc(e.formula)}${e.memo?"／"+esc(e.memo):""}${legacyPhotosHtml(e)}</span><button data-del-all="${e.id}">削除</button></div>`).join("")||`<p class="hint">実測データがありません。</p>`;$("entryTable").querySelectorAll("[data-del-all]").forEach(b=>b.onclick=()=>deleteAnyEntry(b.dataset.delAll));$("printSiteName").textContent=s.name||"";$("printSiteDate").textContent=s.date||"";$("printAddress").textContent=s.address||"";$("printStaff").textContent=s.staff||"";renderDrawingPrint();saveSoon()}
async function deleteAnyEntry(id){const e=currentSite().entries.find(x=>x.id===id);if(!e||!confirm("この実測を削除しますか？"))return;removeEntryState(id);await saveNow();renderResults();if(activeSurfaceId){renderSurfaceEntries();renderCaulkSuggestion()}}

function outputAudit({evidenceOnly=false,drawing=false}={}){
  const s=currentSite(),issues=[];
  if(!String(s.name||"").trim())issues.push("現場名が未入力です");
  if(drawing){
    const surfaces=s.surfaces.filter(sf=>sf.photoRef);
    if(!surfaces.length)issues.push("実測図に使える面写真がありません");
    for(const sf of surfaces){
      const es=surfaceEntries(sf.id);
      if(!sf.calibrations.length&&!sf.calibrationSkipped)issues.push(`面${sf.seq}：較正が未確定です`);
      for(const e of es)if(e.role!=="derived-opening-perimeter"&&!e.annotation)issues.push(`面${sf.seq}：${e.itemName}に対象位置がありません`);
    }
    return [...new Set(issues)];
  }
  if(evidenceOnly){if(!s.entries.length&&!s.surfaces.some(sf=>sf.photoRef))issues.push("写真または実測がありません");return issues}
  if(!s.entries.length)issues.push("実測が0件です");
  for(const sf of s.surfaces){
    if((surfaceEntries(sf.id).length||sf.photoRef)&&!sf.completed)issues.push(`面${sf.seq}が未完了です`);
    if(sf.completed&&!sf.photoRef)issues.push(`面${sf.seq}に全景写真がありません`);
    for(const w of sf.completionWarnings||[])issues.push(`面${sf.seq}：${w}`);
  }
  for(const [i,e] of s.entries.entries()){
    if(!Number.isFinite(Number(e.quantity))||Number(e.quantity)===0)issues.push(`実測No.${i+1}の数量が不正です`);
    if(e.surfaceId&&!e.annotation&&e.role!=="derived-opening-perimeter")issues.push(`実測No.${i+1}に対象位置がありません`);
  }
  for(const t of totals())if(t.qty<=0)issues.push(`${t.name}の合計が${t.qty.toFixed(3)}${t.unit}です`);
  return[...new Set(issues)];
}
function printWithMode(label,layout="report"){
  $("printModeLabel").textContent=label;
  document.body.dataset.printMode=label;
  document.body.dataset.printLayout=layout;
  let st=$("dynamicPrintPage");
  if(!st){st=document.createElement("style");st.id="dynamicPrintPage";document.head.appendChild(st)}
  st.textContent=layout==="drawing"?'@media print{@page{size:A4 landscape;margin:7mm}}':'@media print{@page{size:A4 portrait;margin:9mm}}';
  window.print();
  setTimeout(()=>{delete document.body.dataset.printMode;delete document.body.dataset.printLayout;st.remove()},1000);
}
async function showOutput(){
  await renderResults();
  showSheet("出力",[
    {label:"数量PDF（監査済み）",cls:"primary",run:()=>{const issues=outputAudit();if(issues.length)return alert("数量PDFは監査で停止しました。\n\n"+issues.join("\n"));printWithMode("数量確定","report")}},
    {label:"実測図PDF（寸法・数量入り）",run:()=>{const issues=outputAudit({drawing:true});if(issues.length&&!confirm("実測図に注意があります。\n\n"+issues.join("\n")+"\n\n注意表示付きで出力しますか？"))return;printWithMode("現地調査 実測図","drawing")}},
    {label:"現調記録PDF（未確定可）",run:()=>{const issues=outputAudit({evidenceOnly:true});if(issues.length)return alert(issues.join("\n"));printWithMode("現調記録・数量未確定を含む","report")}},
    {label:"集計をコピー",run:async()=>{const text=totals().map(x=>`${x.name}\t${x.qty.toFixed(3)} ${x.unit}`).join("\n");await navigator.clipboard.writeText(text);toast("集計をコピーしました")}}
  ]);
}

function showSurfaceItemManager(){const sf=activeSurface(),s=currentSite();if(!sf)return;const selected=new Set(sf.selectedItemIds);$("sheetRoot").innerHTML=`<div class="sheetBackdrop" id="sheetBackdrop"><div class="sheet"><h3>この面の測定項目</h3><div id="surfaceItemSheet" class="chipGrid">${s.items.filter(i=>i.name.trim()).map(i=>`<button class="chip ${selected.has(i.id)?"selected":""}" data-sheet-item="${i.id}">${esc(i.name)} <small>${esc(i.unit)}</small></button>`).join("")}</div><button id="surfaceItemSheetDone" class="primary">確定</button><button data-close>閉じる</button></div></div>`;const root=$("sheetRoot"),back=$("sheetBackdrop");back.onclick=e=>{if(e.target.id==="sheetBackdrop"||e.target.hasAttribute("data-close"))root.innerHTML=""};root.querySelectorAll("[data-sheet-item]").forEach(b=>b.onclick=()=>{const id=b.dataset.sheetItem;if(selected.has(id)){if(surfaceEntries(sf.id).some(e=>e.itemId===id))return alert("この面ですでに実測がある項目は外せません。");selected.delete(id);b.classList.remove("selected")}else{selected.add(id);b.classList.add("selected")}});$("surfaceItemSheetDone").onclick=()=>{if(!selected.size)return alert("1項目以上選択してください。");sf.selectedItemIds=[...selected];s.lastSurfaceItemIds=[...selected];touchSurface();recordAudit("surface.items.change",{surfaceId:sf.id,count:selected.size});root.innerHTML="";if(activeItemId&&!selected.has(activeItemId))activeItemId=sf.selectedItemIds[0]||"";renderItemRail();if(activeItemId)selectItem(activeItemId);saveSoon()}}
