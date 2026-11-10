(() => {
  'use strict';
  if (window.top !== window) return;
  let pairing = null;
  const hash = location.hash.match(/^#puffer=(\d{4,5})\.([a-f0-9]{64})$/);
  if (hash) {
    // This is a short-lived local session token, never the OpenAI API key.
    pairing = {type: 'pair', port: Number(hash[1]), token: hash[2]};
    history.replaceState(history.state, '', location.pathname + location.search);
  }
  let pinned = null, busy = false, previous = '', repeats = 0, lastDisplay = '', picking = false;
  let host, shadow, status, question, list, counts, pause, toggle, body;
  let slime=false,slimeButton,playing=false,lastPlay=0,playCategory='',turnAttempts=0,wasMyTurn=false,currentPaused=false;
  const attemptedWords=new Set();
  function element(tag, text, cls) { const node = document.createElement(tag); if (text) node.textContent = text; if (cls) node.className = cls; return node; }
  async function send(type, data) {
    const reply = await chrome.runtime.sendMessage({type, data});
    if (!reply || !reply.ok) throw new Error(reply?.error || 'Desktop connection unavailable');
    return reply.data;
  }
  function mount() {
    if (!document.body) return;
    host = element('div'); host.id = 'puffer-companion-root';
    host.style.cssText = 'position:fixed!important;top:12px!important;right:16px!important;width:340px!important;z-index:2147483647!important;';
    shadow = host.attachShadow({mode: 'closed'});
    const style = element('style'); style.textContent = `
      :host{all:initial;color-scheme:dark}*{box-sizing:border-box}.panel{font:13px/1.45 system-ui,sans-serif;color:#eaf3ff;background:#101b2bf5;border:1px solid #31465e;border-radius:18px;box-shadow:0 14px 46px #0005;overflow:hidden;backdrop-filter:blur(16px)}
      .bar{display:flex;align-items:center;gap:8px;padding:13px 15px;cursor:move;background:#15263a}.dot{width:8px;height:8px;border-radius:50%;background:#53dfbd}.brand{font-weight:750;letter-spacing:1.3px;font-size:11px;flex:1}.icon{padding:1px 8px!important;color:#b1c7da!important}.body{padding:14px}.question{font-size:15px;font-weight:650;margin:0 0 9px;overflow-wrap:anywhere}.status{font-size:12px;color:#a5bbce;margin-bottom:10px}.meta{font-size:10px;letter-spacing:.8px;color:#73cbb6;margin:10px 0}.answers{list-style:none;margin:0;padding:0;max-height:265px;overflow:auto;scrollbar-width:thin}.answer{display:flex;align-items:center;border-top:1px solid #ffffff0c;gap:9px}.rank{font:12px ui-monospace,monospace;color:#6f8ea9;width:23px;text-align:right;flex-shrink:0}.word{background:transparent!important;border:0!important;flex:1;text-align:left;color:#f1f6ff!important;padding:9px 0!important;overflow-wrap:anywhere;min-width:0;font-size:14px!important}.mark{padding:4px 8px!important;color:#a3becf!important}.actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}button{font:inherit;cursor:pointer;border:1px solid #344a61;border-radius:8px;background:#1c3047;color:#dbeaf5;padding:6px 9px}button:hover{background:#29445f}.footer{font-size:10px;color:#7f9ab2;margin:12px 0 0}.empty{padding:15px 0;color:#7f9ab2}.counts{font-size:11px;color:#95b0c5;margin-top:9px}
    `; shadow.append(style);
    const panel = element('section', '', 'panel'); shadow.append(panel);
    const bar = element('div', '', 'bar'); bar.append(element('span', '', 'dot'), element('span', 'PUFFER COMPANION', 'brand'));
    toggle = element('button', '−', 'icon'); toggle.title = 'Collapse panel'; bar.append(toggle); panel.append(bar);
    body = element('div', '', 'body'); panel.append(body);
    question = element('div', 'Waiting for a game category…', 'question'); status = element('div', 'Connecting to desktop app…', 'status');
    body.append(question, status, element('div', 'AI ESTIMATE · RAREST FIRST', 'meta'));
    list = element('ol', '', 'answers'); body.append(list); counts = element('div', '', 'counts'); body.append(counts);
    const actions = element('div', '', 'actions'); pause = element('button', 'Pause');
    const retry = element('button', 'Retry AI'); const choose = element('button', 'Choose question'); const reset = element('button', 'Reset used');
    actions.append(pause, retry, choose, reset); body.append(actions, element('p', 'Click a word to copy · ✓ marks it used. Rarity is estimated, not Krillion scoring.', 'footer'));
    slimeButton=element('button','Slime them out: OFF');slimeButton.style.cssText='width:100%;margin-top:12px;border-color:#53dfbd;color:#53dfbd;font-weight:700;';
    body.append(slimeButton);
    slimeButton.onclick=()=>{slime=!slime;slimeButton.textContent='Slime them out: '+(slime?'ON':'OFF');status.textContent=slime?'Auto play armed. Waiting for a confirmed turn.':'Auto play stopped.';};
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&slime){slime=false;slimeButton.textContent='Slime them out: OFF';status.textContent='Auto play stopped.';}},true);
    toggle.onclick = () => { body.hidden = !body.hidden; toggle.textContent = body.hidden ? '+' : '−'; };
    pause.onclick = () => act('pause'); retry.onclick = () => act('retry'); reset.onclick = () => act('reset');
    choose.onclick = () => { picking = true; status.textContent = 'Click the question on the page once. Escape cancels.'; };
    let drag = null;
    bar.addEventListener('pointerdown', event => { if (event.target.closest('button')) return; const rect = host.getBoundingClientRect(); drag = {x: event.clientX - rect.left, y: event.clientY - rect.top}; bar.setPointerCapture(event.pointerId); });
    bar.addEventListener('pointermove', event => { if (!drag) return; host.style.setProperty('left', Math.max(0, Math.min(innerWidth - 340, event.clientX - drag.x)) + 'px', 'important'); host.style.setProperty('top', Math.max(0, Math.min(innerHeight - 50, event.clientY - drag.y)) + 'px', 'important'); host.style.setProperty('right', 'auto', 'important'); });
    bar.addEventListener('pointerup', () => { drag = null; });
    document.addEventListener('click', event => { if (!picking || event.composedPath().includes(host)) return; event.preventDefault(); event.stopPropagation(); pinned = event.target; picking = false; previous = ''; repeats = 0; status.textContent = 'Question selected. Watching automatically…'; }, true);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') picking = false; });
    document.body.append(host);
  }
  function render(state) {
    currentPaused=state.paused;
    status.textContent = state.status; question.textContent = state.question || 'Waiting for a game category…'; pause.textContent = state.paused ? 'Resume' : 'Pause';
    counts.textContent = `${state.answers.length} available · ${state.usedCount} used this category`;
    const signature = JSON.stringify(state.answers);
    if (signature === lastDisplay) return; lastDisplay = signature; list.replaceChildren();
    if (!state.answers.length) { list.append(element('li', state.paused ? 'Suggestions paused.' : 'Answers appear automatically when a question is detected.', 'empty')); return; }
    state.answers.forEach((word, index) => {
      const row = element('li', '', 'answer'), copy = element('button', word, 'word'), mark = element('button', '✓', 'mark');
      copy.title = 'Copy ' + word; mark.title = 'Mark ' + word + ' as used';
      copy.onclick = async () => { try { await navigator.clipboard.writeText(word); status.textContent = 'Copied ' + word; } catch { status.textContent = 'Clipboard unavailable. Select and copy the word manually.'; } };
      mark.onclick = () => act('mark', {word}); row.append(element('span', String(index + 1).padStart(2, '0'), 'rank'), copy, mark); list.append(row);
    });
  }
  async function act(type, data) { try { render(await send(type, data)); } catch (error) { status.textContent = error.message; } }
  async function tick() {
    if (busy || picking || !host) return; busy = true;
    try {
      const snapshot = PufferReader.read(document, pinned);
      const identity = PufferReader.normalize(snapshot.question) + '|' + snapshot.categoryId;
      if (identity !== previous) { previous = identity; repeats = 1; } else repeats++;
      // Confirm changes before resetting used words or making a paid request.
      if (repeats >= 2) {
        const state=await send('sync',snapshot);render(state);
        if(identity!==playCategory){playCategory=identity;attemptedWords.clear();turnAttempts=0;}
        const turn=PufferAutoplay.myTurn(document);
        if(!turn){turnAttempts=0;wasMyTurn=false;}else if(!wasMyTurn){turnAttempts=0;wasMyTurn=true;}
        if(slime&&!state.paused&&!playing&&turn&&turnAttempts<3&&state.question&&PufferReader.normalize(state.question)===PufferReader.normalize(snapshot.question)&&document.visibilityState==='visible'&&Date.now()-lastPlay>2500){
          const word=PufferAutoplay.nextWord(state.answers,attemptedWords);
          if(word){playing=true;lastPlay=Date.now();
            try {const sent=await PufferAutoplay.play(document,word,()=>slime&&!currentPaused&&!picking&&PufferReader.normalize(PufferReader.read(document,pinned).question)===PufferReader.normalize(snapshot.question));if(sent){attemptedWords.add(word);turnAttempts++;status.textContent='Attempted '+word+' · watching for acceptance';}}
            finally{playing=false;}
          }
        }
      }
    } catch (error) { status.textContent = /fetch|abort|network/i.test(error.message) ? 'Keep the desktop app open, then click Launch Krillion again.' : error.message; }
    finally { busy = false; }
  }
  async function start() {
    mount();
    try { if (pairing) { const reply = await chrome.runtime.sendMessage(pairing); if (!reply?.ok) throw new Error(reply?.error || 'Pairing failed'); pairing = null; } }
    catch (error) { status.textContent = error.message; }
    tick(); setInterval(tick, 400);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
})();
