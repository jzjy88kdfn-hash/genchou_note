async function importBackup(file){
  const p=JSON.parse(await file.text());if(p.schema!=="field-survey-ledger"||!p.data)throw new Error("対応していないバックアップです");
  const v=Number(p.schemaVersion||1),raw=v>=2?JSON.stringify({data:p.data,photos:p.photos||{}}):JSON.stringify(p.data);if(p.checksum&&await sha256(raw)!==p.checksum)throw new Error("バックアップ整合性エラー");if(!confirm("バックアップを追加復元しますか？"))return;
  const imported=normalize(p.data),photoMap=new Map();for(const [oldRef,data] of Object.entries(p.photos||{}))photoMap.set(oldRef,await photoPut(data));
  async function mappedPhoto(ref){if(!ref)return"";if(ref&&typeof ref==="object"&&isDataUrl(ref.data))return await photoPut(ref.data,ref.id||uid());if(photoMap.has(ref))return photoMap.get(ref);if(isDataUrl(ref))return await photoPut(ref);if(v>=2)throw new Error("バックアップ内の写真データが不足しています");const local=await photoGet(ref);return local?await photoPut(local):""}
  const added=[];
  for(const source of imported.sites){
    const itemMap=new Map(source.items.map(i=>[i.id,uid()])),surfaceMap=new Map(source.surfaces.map(sf=>[sf.id,uid()])),entryMap=new Map(source.entries.map(e=>[e.id,uid()]));
    const objectMap=new Map();for(const sf of source.surfaces)for(const o of sf.objects||[])objectMap.set(o.id,uid());
    const items=source.items.map(i=>({...i,id:itemMap.get(i.id)})),entries=[];
    for(const e of source.entries){const photos=[];for(const r of e.photos||[]){const m=await mappedPhoto(r);if(m)photos.push(m)}entries.push({...e,id:entryMap.get(e.id),itemId:itemMap.get(e.itemId)||e.itemId,surfaceId:surfaceMap.get(e.surfaceId)||e.surfaceId,photos,sourceObjectIds:Array.isArray(e.sourceObjectIds)?e.sourceObjectIds.map(id=>objectMap.get(id)||id):[]})}
    const surfaces=[];for(const sf of source.surfaces){const hist=[];for(const h of sf.photoHistory||[]){const r=await mappedPhoto(h.photoRef);if(r)hist.push({...h,photoRef:r})}surfaces.push({...sf,id:surfaceMap.get(sf.id),selectedItemIds:sf.selectedItemIds.map(x=>itemMap.get(x)||x),photoRef:await mappedPhoto(sf.photoRef),photoHistory:hist,objects:(sf.objects||[]).map(o=>({...o,id:objectMap.get(o.id),itemId:itemMap.get(o.itemId)||o.itemId,entryId:entryMap.get(o.entryId)||o.entryId}))})}
    const site={...source,id:uid(),items,surfaces,entries,lastSurfaceItemIds:(source.lastSurfaceItemIds||[]).map(x=>itemMap.get(x)||x),itemPrefs:{},auditTrail:[...(source.auditTrail||[]),{id:uid(),type:"backup.import",at:now()}]};state.sites.push(site);added.push(site);
  }
  if(added.length)state.currentSiteId=added[0].id;await saveNow();renderAll();toast("復元しました");
}
