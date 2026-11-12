(() => {
  const $=id=>document.getElementById(id);
  const defaults={Gemini:'gemini-3.5-flash-lite',OpenAI:'gpt-4.1-mini'};
  const link=()=>{$('key-link').href=$('provider').value==='Gemini'?'https://aistudio.google.com/apikey':'https://platform.openai.com/api-keys';};
  async function request(type,data){const result=await chrome.runtime.sendMessage({type,data});if(!result?.ok)throw new Error(result?.error||'Extension unavailable');return result.data;}
  async function save(){await request('settings-save',{provider:$('provider').value,model:$('model').value.trim(),key:$('key').value.trim(),remember:$('remember').checked});$('status').textContent='Saved. Suggestions start automatically in the game.';}
  $('provider').onchange=()=>{$('model').value=defaults[$('provider').value];$('key').value='';link();};
  $('settings').onsubmit=async event=>{event.preventDefault();try{await save();}catch(error){$('status').textContent=error.message;}};
  $('test').onclick=async()=>{
    const button=$('test');button.disabled=true;
    try{await save();$('status').textContent='Testing AI connection...';const result=await request('settings-test');$('status').textContent=result.message;}
    catch(error){$('status').textContent=error.message;}
    finally{button.disabled=false;}
  };
  $('launch').onclick=async()=>{try{await save();await chrome.tabs.create({url:'https://krillion.io/party'});}catch(error){$('status').textContent=error.message;}};
  request('settings-load').then(config=>{if(config.provider)$('provider').value=config.provider;$('model').value=config.model||defaults[$('provider').value];$('key').value=config.key||'';$('remember').checked=!!config.remember;link();}).catch(error=>{$('status').textContent=error.message;});
})();
