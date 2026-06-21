let saveToastTimer=null;
function showSavedMessage(){
  const el=document.getElementById('saveToast');
  if(!el)return;
  el.textContent='保存しました';
  el.classList.add('show');
  clearTimeout(saveToastTimer);
  saveToastTimer=setTimeout(()=>el.classList.remove('show'),1600);
}
function manualSave(){
  if(typeof safeSave==='function'){
    if(safeSave())showSavedMessage();
    return;
  }
  try{
    localStorage.setItem('genchou_note_manual_save',String(Date.now()));
    showSavedMessage();
  }catch(e){
    alert('保存容量を超えました。');
  }
}
