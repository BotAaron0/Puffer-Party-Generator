/* Only the isolated content script on Krillion can use this fixed local bridge. */
const sessions = new Map();
const grindPorts=new Map();
const allowed = value => {
  try { const u = new URL(value); return u.protocol === 'https:' && ['krillion.io', 'www.krillion.io'].includes(u.hostname); }
  catch { return false; }
};
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (!sender.tab || !allowed(sender.url) || sender.frameId !== 0) return false;
  const id = sender.tab.id;
  (async () => {
    if (message.type === 'pair') {
      if (!Number.isInteger(message.port) || message.port < 1024 || message.port > 65535 || !/^[a-f0-9]{64}$/.test(message.token)) throw new Error('Invalid launch session');
      const session = {port: message.port, token: message.token};
      sessions.set(id, session);
      await chrome.storage.session.set({['tab-' + id]: session});
      return {paired: true};
    }
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
    if (!['sync', 'mark', 'pause', 'retry', 'reset', 'autoplay'].includes(message.type)) throw new Error('Unknown operation');
    let session = sessions.get(id);
    if (!session) { session = (await chrome.storage.session.get('tab-' + id))['tab-' + id]; if (session) sessions.set(id, session); }
    if (!session) throw new Error('Click Launch Krillion in the desktop app to connect this tab.');
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`http://127.0.0.1:${session.port}/${message.type}`, {
        method: 'POST', headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.token},
        body: JSON.stringify(message.data || {}), signal: controller.signal, cache: 'no-store', redirect: 'error'
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Desktop connection failed');
      return data;
    } finally { clearTimeout(timeout); }
  })().then(data => reply({ok: true, data}), error => reply({ok: false, error: error.message || 'Keep the desktop app open, then launch again.'}));
  return true;
});
chrome.tabs.onRemoved.addListener(id => { sessions.delete(id); chrome.storage.session.remove('tab-' + id); });
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
