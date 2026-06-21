const ITEM_SET_STORE='genchou_note_item_sets_v1';
const ACTIVE_SET_STORE='genchou_note_active_item_set_v1';
function setUid(){return 'set_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
function getAllGlobalItemsForSet(){return typeof globalItems==='function'?globalItems():[]}
function findGlobalIdsByNames(names){const list=getAllGlobalItemsForSet();return list.filter(i=>names.includes(i.name)).map(i=>i.id)}
function defaultItemSets(){
  return [
    {id:setUid(),name:'塗装セット',itemIds:findGlobalIdsByNames(['外壁','軒天','屋根','鉄部','鉄部小物','雨樋','養生'])},
    {id:setUid(),name:'防水セット',itemIds:findGlobalIdsByNames(['屋根','四周壁','養生'])},
    {id:setUid(),name:'シールセット',itemIds:findGlobalIdsByNames(['シーリング','外壁','養生'])},
    {id:setUid(),name:'外構セット',itemIds:findGlobalIdsByNames(['鉄部','鉄部小物','養生'])},
    {id:setUid(),name:'自由セット',itemIds:findGlobalIdsByNames(['外壁','シーリング','鉄部'])}
  ];
}
function loadItemSets(){
  let sets=[];
  try{sets=JSON.parse(localStorage.getItem(ITEM_SET_STORE)||'[]')}catch(e){}
  if(!Array.isArray(sets)||!sets.length){sets=defaultItemSets();saveItemSets(sets);if(!localStorage.getItem(ACTIVE_SET_STORE))localStorage.setItem(ACTIVE_SET_STORE,sets[0]?.id||'')}
  return sets;
}
function saveItemSets(sets){localStorage.setItem(ITEM_SET_STORE,JSON.stringify(sets))}
function activeSetId(){let id=localStorage.getItem(ACTIVE_SET_STORE)||'';const sets=loadItemSets();if(!sets.some(s=>s.id===id)){id=sets[0]?.id||'';localStorage.setItem(ACTIVE_SET_STORE,id)}return id}
function activeSet(){return loadItemSets().find(s=>s.id===activeSetId())||null}
function setActiveItemSet(id){localStorage.setItem(ACTIVE_SET_STORE,id);renderMeasure();renderItemSetPanel();if(typeof showSavedMessage==='function')showSavedMessage()}
function activeSetItems(){const set=activeSet();const ids=set?.itemIds||[];return getAllGlobalItemsForSet().filter(i=>ids.includes(i.id))}
try{favoriteGlobalItems=function(){return activeSetItems()}}catch(e){window.favoriteGlobalItems=activeSetItems}
function saveCurrentSetItems(){const id=document.getElementById('activeItemSetSelect')?.value||activeSetId();const sets=loadItemSets();const set=sets.find(s=>s.id===id);if(!set)return;const ids=[...document.querySelectorAll('.setItemCheck:checked')].map(x=>x.value);set.itemIds=ids;saveItemSets(sets);localStorage.setItem(ACTIVE_SET_STORE,id);renderMeasure();renderItemSetPanel();if(typeof showSavedMessage==='function')showSavedMessage()}
function addItemSet(){const name=prompt('追加するセット名を入力してください','新しいセット');if(!name)return;const sets=loadItemSets();const n={id:setUid(),name:name.trim(),itemIds:[]};sets.push(n);saveItemSets(sets);localStorage.setItem(ACTIVE_SET_STORE,n.id);renderMeasure();renderItemSetPanel();if(typeof showSavedMessage==='function')showSavedMessage()}
function renameItemSet(){const set=activeSet();if(!set)return;const name=prompt('セット名を変更してください',set.name);if(!name)return;const sets=loadItemSets();const target=sets.find(s=>s.id===set.id);if(target)target.name=name.trim();saveItemSets(sets);renderItemSetPanel();if(typeof showSavedMessage==='function')showSavedMessage()}
function deleteItemSet(){const set=activeSet();if(!set)return;if(loadItemSets().length<=1){alert('セットは最低1つ必要です。');return}if(!confirm('セット「'+set.name+'」を削除しますか？'))return;let sets=loadItemSets().filter(s=>s.id!==set.id);saveItemSets(sets);localStorage.setItem(ACTIVE_SET_STORE,sets[0]?.id||'');renderMeasure();renderItemSetPanel();if(typeof showSavedMessage==='function')showSavedMessage()}
function renderItemSetPanel(){
  const tools=document.getElementById('view-tools');if(!tools)return;
  let host=document.getElementById('itemSetPanel');
  if(!host){host=document.createElement('div');host.id='itemSetPanel';host.className='card flat';tools.appendChild(host)}
  const sets=loadItemSets();const active=activeSetId();const items=getAllGlobalItemsForSet();const activeIds=(sets.find(s=>s.id===active)?.itemIds)||[];
  host.innerHTML='<h2><span class="num">3</span>項目セット切替</h2><div class="hint">現場ごとに使う項目をセットで切り替えます。チェックした項目だけが実測画面の「よく使う項目」に出ます。</div><div class="grid" style="margin-top:10px"><div><label>使用するセット</label><select id="activeItemSetSelect" onchange="setActiveItemSet(this.value)">'+sets.map(s=>'<option value="'+s.id+'" '+(s.id===active?'selected':'')+'>'+escapeHtml(s.name)+'</option>').join('')+'</select></div><div class="btnRow"><button class="primary" onclick="saveCurrentSetItems()">このセットを保存</button><button onclick="addItemSet()">セット追加</button><button onclick="renameItemSet()">名称変更</button><button class="danger" onclick="deleteItemSet()">削除</button></div><div class="list">'+items.map(i=>'<label class="itemCard" style="display:flex;gap:10px;align-items:center"><input type="checkbox" class="setItemCheck" value="'+i.id+'" '+(activeIds.includes(i.id)?'checked':'')+' onchange="saveCurrentSetItems()" style="width:auto;min-height:auto"><span><b>'+escapeHtml(i.name)+'（'+i.unit+'）</b><div class="meta">'+escapeHtml(i.group||'分類なし')+' / '+escapeHtml(i.memo||'')+'</div></span></label>').join('')+'</div></div>';
  const old=document.getElementById('commonItemsPanel');if(old)old.classList.add('hidden');
}
window.setActiveItemSet=setActiveItemSet;
window.saveCurrentSetItems=saveCurrentSetItems;
window.addItemSet=addItemSet;
window.renameItemSet=renameItemSet;
window.deleteItemSet=deleteItemSet;
window.renderItemSetPanel=renderItemSetPanel;
const baseRenderAllForSets=window.renderAll;
window.renderAll=function(){baseRenderAllForSets();renderItemSetPanel()};
setTimeout(()=>{loadItemSets();renderItemSetPanel();renderMeasure()},0);
