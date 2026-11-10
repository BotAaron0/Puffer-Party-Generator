/* Only the isolated content script on Krillion can use this fixed local bridge. */
const sessions = new Map();
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
