/* API requests and credentials stay inside the extension service worker. */
importScripts('ai-client.js', 'engine.js');
const engine = new PufferEngine.Engine(loadConfig, state => chrome.storage.session.set({['engine-'+state.id]:state}));
async function loadConfig() {
  return (await chrome.storage.session.get('aiConfig')).aiConfig || (await chrome.storage.local.get('aiConfig')).aiConfig || {};
}
const grindPorts=new Map();
const allowed = value => {
  try { const u = new URL(value); return u.protocol === 'https:' && ['krillion.io', 'www.krillion.io'].includes(u.hostname); }
  catch { return false; }
};
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id === chrome.runtime.id && sender.url === chrome.runtime.getURL('popup.html')) {
    (async () => {
      if (message.type === 'settings-load') return loadConfig();
      if (message.type === 'settings-test') {
        const config=await loadConfig();
        if(!config.key)throw new Error('Save your API key first.');
        const controller=new AbortController();
        const timer=setTimeout(()=>controller.abort(),45000);
        try {
          const answers=await PufferAI.generate(config,'Name a primary color.',[],()=>{},controller.signal);
          return {message:config.provider+' connection successful. Model: '+config.model+'. Received '+answers.length+' suggestions.'};
        } catch(error) {
          if(controller.signal.aborted)throw new Error('AI connection test timed out. Try again.');
          throw error;
        } finally {clearTimeout(timer);}
      }
      if (message.type !== 'settings-save') throw new Error('Unknown settings operation');
      const config = message.data || {};
      if (!['Gemini','OpenAI'].includes(config.provider) || !/^[a-zA-Z0-9._-]{1,100}$/.test(config.model || '') || !config.key?.trim()) throw new Error('Choose a provider, model and API key.');
      if ((config.provider === 'Gemini' && config.key.startsWith('sk-')) || (config.provider === 'OpenAI' && config.key.startsWith('AIza'))) throw new Error('This API key belongs to the other provider.');
      const clean = {provider:config.provider,model:config.model,key:config.key.trim(),remember:config.remember===true};
      await chrome.storage.local.remove('aiConfig');
      if (clean.remember) await chrome.storage.local.set({aiConfig:clean});
      await chrome.storage.session.set({aiConfig:clean});
      engine.invalidate();
      return {saved:true};
    })().then(data=>reply({ok:true,data}),error=>reply({ok:false,error:error.message}));
    return true;
  }
  if (!sender.tab || !allowed(sender.url) || sender.frameId !== 0) return false;
  const id = sender.tab.id;
  (async () => {
    if(message.type==='grind-state')return {enabled:!!(await chrome.storage.session.get('grind-'+id))['grind-'+id]};
    if(message.type==='grind'){
      const enabled=message.data?.enabled===true;
      if(enabled){
        await chrome.storage.session.set({['grind-'+id]:true});
        try{const old=(await chrome.storage.session.get('discard-'+id))['discard-'+id];if(old===undefined){const tab=await chrome.tabs.get(id);await chrome.storage.session.set({['discard-'+id]:tab.autoDiscardable!==false});}await chrome.tabs.update(id,{autoDiscardable:false});}catch{}
      }else{
        await chrome.storage.session.remove('grind-'+id);
        const old=(await chrome.storage.session.get('discard-'+id))['discard-'+id];if(old!==undefined){try{await chrome.tabs.update(id,{autoDiscardable:old});}catch{}await chrome.storage.session.remove('discard-'+id);}
        const running=grindPorts.get(id);if(running)running.stop();
      }
      return {enabled};
    }
    if (message.type === 'open-settings') { await chrome.tabs.create({url:chrome.runtime.getURL('popup.html')}); return {}; }
    if (!['sync', 'mark', 'pause', 'retry', 'reset', 'autoplay'].includes(message.type)) throw new Error('Unknown operation');
    if (!engine.states.has(id)) { const saved=(await chrome.storage.session.get('engine-'+id))['engine-'+id]; engine.restore(id,saved); }
    return engine.handle(id, message.type, message.data || {});
  })().then(data => reply({ok: true, data}), error => reply({ok: false, error: error.message || 'Reload the extension and game tab.'}));
  return true;
});
chrome.tabs.onRemoved.addListener(id => { engine.remove(id); chrome.storage.session.remove('engine-' + id); });
chrome.runtime.onConnect.addListener(port=>{
  const sender=port.sender;
  if(port.name!=='puffer-grind'||!sender?.tab||sender.frameId!==0||!allowed(sender.url)){port.disconnect();return;}
  const id=sender.tab.id;let stopped=false,timer=null;
  const job={stop(){if(stopped)return;stopped=true;if(timer!==null)clearInterval(timer);if(grindPorts.get(id)===job)grindPorts.delete(id);try{port.disconnect();}catch{}}};
  port.onDisconnect.addListener(()=>job.stop());
  (async()=>{
    if(!(await chrome.storage.session.get('grind-'+id))['grind-'+id]||stopped){job.stop();return;}
    const prior=grindPorts.get(id);if(prior)prior.stop();grindPorts.set(id,job);
    // Port messages keep the worker active only during explicitly enabled Grind mode.
    timer=setInterval(()=>{try{port.postMessage({type:'grind-pulse'});}catch{job.stop();}},25);
    port.postMessage({type:'grind-pulse'});
  })().catch(()=>job.stop());
});
chrome.tabs.onRemoved.addListener(id=>{const job=grindPorts.get(id);if(job)job.stop();chrome.storage.session.remove(['grind-'+id,'discard-'+id]);});
