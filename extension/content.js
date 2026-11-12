(() => {
  'use strict';
  if (window.top !== window) return;
  let pinned = null, busy = false, previous = '', repeats = 0, lastDisplay = '', picking = false;
  let host, shadow, status, question, list, counts, pause, toggle, body,rankLabel,continuousButton;
  let continuous=true;
  let collapsed=false,letterMode=false,letterDelay=120;
  let grind=false,grindButton,grindPort=null,lastSyncAt=0,nextLocalStep=0,joiningUntil=0;
  const grindController=PufferGrind.createController();
  let autoRevision=-1,controlPending=false,controlSerial=0;
  let slime=false,slimeButton,currentPaused=false,autoNote;
  const controller=PufferAutoplay.createController();
  const refill=PufferAutoplay.createRefillTracker();
  let autoTimer=null,latestState=null,latestIdentity='';
  function element(tag, text, cls) { const node = document.createElement(tag); if (text) node.textContent = text; if (cls) node.className = cls; return node; }
  async function send(type, data) {
    const reply = await chrome.runtime.sendMessage({type, data});
    if (!reply || !reply.ok) throw new Error(reply?.error || 'Extension connection unavailable');
    return reply.data;
  }
  function mount() {
    if (!document.body) return;
    host = element('div'); host.id = 'puffer-companion-root';
    host.style.cssText = 'position:fixed!important;top:12px!important;right:16px!important;width:340px!important;z-index:2147483647!important;';
    shadow = host.attachShadow({mode: 'closed'});
    const style = element('style'); style.textContent = PufferStyles; shadow.append(style);
    const panel = element('section', '', 'panel'); shadow.append(panel);
    const bar = element('div', '', 'bar'); bar.append(element('span', '', 'dot'), element('span', 'Puffer Party Helper', 'brand'));
    toggle = element('button', '−', 'icon'); toggle.title = 'Collapse panel'; bar.append(toggle); panel.append(bar);
    slimeButton=element('button','Autofill','slime');panel.append(slimeButton);
    slimeButton.setAttribute('aria-pressed','false');
    slimeButton.title='Prepare a word and try Enter at controlled intervals. Rejections advance to the next word. Escape stops.';
    grindButton=element('button','Grind mode','grind');grindButton.setAttribute('aria-pressed','false');grindButton.title='Auto-join Join next games and keep Autofill running in this tab while you use another tab. Off by default.';panel.append(grindButton);grindButton.onclick=()=>setGrind(!grind).catch(error=>{status.textContent=error.message;});
    body = element('div', '', 'body'); panel.append(body);
    question = element('div', 'Waiting for a game category…', 'question'); status = element('div', 'Connecting to extension…', 'status');
    autoNote=element('div','Auto play off','auto-note');body.append(autoNote);
    const delayLabel=element('label','Average Enter delay: 700 ms (±15%)','delay-label');
    const delaySlider=element('input');delaySlider.type='range';delaySlider.min='100';delaySlider.max='3000';delaySlider.step='50';delaySlider.value='700';delaySlider.setAttribute('aria-label','Delay between Enter presses');
    const applyDelay=value=>{const ms=Math.max(100,Math.min(3000,Number(value)||700));delaySlider.value=String(ms);delayLabel.textContent='Average Enter delay: '+ms+' ms (±15%)';controller.setDelay(ms);};
    delaySlider.oninput=()=>applyDelay(delaySlider.value);
    delaySlider.onchange=()=>{if(chrome.storage?.local)chrome.storage.local.set({enterDelay:Number(delaySlider.value)}).catch(()=>{});};
    if(chrome.storage?.local)chrome.storage.local.get('enterDelay').then(saved=>{if(saved.enterDelay!==undefined)applyDelay(saved.enterDelay);}).catch(()=>{});
    const delayControl=element('div','','delay-control');delayControl.append(delayLabel,delaySlider);body.append(delayControl);
    const letterButton=element('button','Letter by letter','typing-button');letterButton.setAttribute('aria-pressed','false');
    letterButton.title='Waits for the visible Type prompt. Physical typing in the game answer box is blocked while Autofill and this mode are ON. Escape stops.';
    const letterLabel=element('label','Letter delay: 120 ms / 100 WPM average (±15%)','delay-label');
    const letterSlider=element('input');letterSlider.type='range';letterSlider.min='20';letterSlider.max='220';letterSlider.step='1';letterSlider.value='120';letterSlider.disabled=true;letterSlider.setAttribute('aria-label','Average delay between letters; midpoint 100 words per minute');
    const saveTyping=()=>{if(chrome.storage?.local)chrome.storage.local.set({letterMode,letterDelay}).catch(()=>{});};
    const applyTyping=()=>{controller.setLetterMode(letterMode);controller.setLetterDelay(letterDelay);letterButton.dataset.on=String(letterMode);letterButton.setAttribute('aria-pressed',String(letterMode));letterSlider.disabled=!letterMode;letterSlider.value=String(letterDelay);const rate=PufferAutoplay.typingRate(letterDelay);letterLabel.textContent='Letter delay: '+letterDelay+' ms / '+(Number.isInteger(rate)?rate:rate.toFixed(1))+' WPM average (±15%)';scheduleAutofill();};
    letterButton.onclick=()=>{letterMode=!letterMode;applyTyping();saveTyping();};
    letterSlider.oninput=()=>{letterDelay=Math.max(20,Math.min(220,Number(letterSlider.value)||120));applyTyping();};letterSlider.onchange=saveTyping;
    if(chrome.storage?.local)chrome.storage.local.get(['letterMode','letterDelay']).then(saved=>{letterMode=!!saved.letterMode;if(Number.isFinite(saved.letterDelay))letterDelay=Math.max(20,Math.min(220,saved.letterDelay));applyTyping();}).catch(()=>{});
    const letterControl=element('div','','delay-control');letterControl.append(letterButton,letterLabel,letterSlider,element('div','Faster  ·  midpoint = 100 WPM  ·  Slower','typing-scale'));body.append(letterControl);
    rankLabel=element('div','KRILLION TIER ORDER / ESTIMATES','meta');body.append(question,status,rankLabel);
    list = element('ol', '', 'answers'); body.append(list); counts = element('div', '', 'counts'); body.append(counts);
    const actions = element('div', '', 'actions'); pause = element('button', 'Pause');
    const retry = element('button', 'Retry AI');retry.title='Retry the AI request manually. Temporary and interrupted-stream failures also retry automatically.'; const choose = element('button', 'Choose question'); const reset = element('button', 'Reset used');
    const chooseInput=element('button','Choose answer box');chooseInput.onclick=()=>{picking='answer';status.textContent='Click the game answer textbox once. Escape cancels.';};
    continuousButton=element('button','Live top-up: ON');continuousButton.title='Stream more suggestions every 18 seconds while this category remains active; API limits apply.';
    continuousButton.onclick=()=>{continuous=!continuous;continuousButton.textContent='Live top-up: '+(continuous?'ON':'OFF');};
    const settings=element('button','AI settings');settings.onclick=()=>send('open-settings',{});
    body.append(element('p','made by BotAaron_ | v3.0.0 | Extension only','footer'));
    actions.append(settings,pause,retry,continuousButton,choose,chooseInput,reset);body.append(actions,element('p','Tier order: One in a Krillion > Deep Cut > Rare > Schooler > Too Clever > Plankton. GAME = read from page; est. = AI guess.','footer'));
    slimeButton.onclick=()=>setSlime(!slime);
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&slime){setSlime(false);status.textContent='Auto play stopped.';}},true);
    toggle.onclick=()=>{
      collapsed=!collapsed;panel.className=collapsed?'panel compact':'panel';body.hidden=collapsed;slimeButton.hidden=collapsed;grindButton.hidden=collapsed;
      host.style.setProperty('width',collapsed?'36px':'340px','important');toggle.textContent=collapsed?'+':'−';toggle.title=collapsed?'Expand helper':'Collapse panel';toggle.setAttribute('aria-expanded',String(!collapsed));
      if(!collapsed){const rect=host.getBoundingClientRect();if(rect.left>innerWidth-350){host.style.setProperty('left',Math.max(0,innerWidth-350)+'px','important');host.style.setProperty('right','auto','important');}}
    };
    pause.onclick = () => act('pause'); retry.onclick = () => act('retry'); reset.onclick = () => act('reset');
    choose.onclick = () => { picking = 'question'; status.textContent = 'Click the question on the page once. Escape cancels.'; };
    let drag = null;
    bar.addEventListener('pointerdown', event => { if (event.target.closest('button')) return; const rect = host.getBoundingClientRect(); drag = {x: event.clientX - rect.left, y: event.clientY - rect.top}; bar.setPointerCapture(event.pointerId); });
    bar.addEventListener('pointermove', event => { if (!drag) return; host.style.setProperty('left', Math.max(0, Math.min(innerWidth - (collapsed?36:340), event.clientX - drag.x)) + 'px', 'important'); host.style.setProperty('top', Math.max(0, Math.min(innerHeight - 50, event.clientY - drag.y)) + 'px', 'important'); host.style.setProperty('right', 'auto', 'important'); });
    bar.addEventListener('pointerup', () => { drag = null; });
    document.addEventListener('click', event => {
      if(!picking||event.composedPath().includes(host))return;
      event.preventDefault();event.stopPropagation();
      if(picking==='answer'){
        const input=event.target.closest('input,textarea');
        if(!input){status.textContent='Click inside the game answer textbox.';return;}
        PufferAutoplay.pinInput(document,input);controller.reset(document,previous);status.textContent='Answer box selected. Auto play will use it.';
      }else{pinned=event.target;previous='';repeats=0;status.textContent='Question selected. Watching automatically…';}
      picking=false;
    },true);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') picking = false; });
    document.body.append(host);
  }
  function paintSlime(){slimeButton.textContent='Autofill';slimeButton.dataset.on=String(slime);slimeButton.setAttribute('aria-pressed',String(slime));slimeButton.title='Autofill '+(slime?'ON':'OFF')+' - click to toggle; Escape stops';}
  async function setSlime(enabled){
    const serial=++controlSerial;controlPending=true;slime=enabled;paintSlime();
    if(!enabled){controller.stop(document);autoNote.textContent='Auto play stopped';}
    if(!enabled&&autoTimer){clearTimeout(autoTimer);autoTimer=null;}
    if(!enabled&&grind)await setGrind(false);
    try{const state=await send('autoplay',{enabled});if(serial===controlSerial){controlPending=false;render(state);}}
    catch(error){if(serial===controlSerial){controlPending=false;slime=false;paintSlime();status.textContent=error.message;}}
  }
  const tabCanRun=()=>document.visibilityState==='visible'||grind;
  function paintGrind(){grindButton.dataset.on=String(grind);grindButton.setAttribute('aria-pressed',String(grind));grindButton.title='Grind mode '+(grind?'ON':'OFF')+' - auto-joins Join next and runs in background';}
  function connectGrind(){
    if(!grind||grindPort)return;
    try{
      const port=chrome.runtime.connect({name:'puffer-grind'});grindPort=port;
      port.onMessage.addListener(message=>{if(message.type==='grind-pulse'&&grind){grindStep();if(Date.now()-lastSyncAt>=300)tick();}});
      port.onDisconnect.addListener(()=>{if(grindPort===port)grindPort=null;if(grind)setTimeout(connectGrind,1000);});
    }catch{autoNote.textContent='Background connection lost - reload the extension and launch again';}
  }
  async function setGrind(enabled,restoring=false){
    if(enabled){
      await setSlime(true);if(!slime)return;
      if(!restoring){const result=await send('grind',{enabled:true});if(!result.enabled)return;}
      grind=true;paintGrind();connectGrind();autoNote.textContent='Grind mode on - auto-joining and running in background';tick();
    }else{
      grind=false;paintGrind();const port=grindPort;grindPort=null;if(port)port.disconnect();
      try{await send('grind',{enabled:false});}catch{}
    }
  }
  function grindStep(){
    if(!grind||!slime||currentPaused||picking||Date.now()<joiningUntil)return;
    if(grindController.step(document,true)){joiningUntil=Date.now()+1500;autoNote.textContent='Grind mode - joining next game';controller.stop(document);return;}
    if(!latestState||!latestState.question||Date.now()<nextLocalStep)return;
    const due=controller.timing?.dueAt;if(due!=null&&due>Date.now())return;
    const snapshot=PufferReader.read(document,pinned),identity=PufferReader.normalize(snapshot.question)+'|'+snapshot.categoryId;
    if(identity!==latestIdentity)return;
    const note=controller.step(document,latestState.answers,true,identity);autoNote.textContent=note;
    nextLocalStep=Date.now()+(/^Waiting|^Cannot|^Textbox/.test(note)?200:15);
  }
  function render(state) {
    latestState=state;
    currentPaused=state.paused;
    if(!controlPending&&typeof state.autoPlay==='boolean'&&(state.autoPlayRevision??0)>=autoRevision){autoRevision=state.autoPlayRevision??0;slime=state.autoPlay;paintSlime();}
    status.textContent = state.status; question.textContent = state.question || 'Waiting for a game category…'; pause.textContent = state.paused ? 'Resume' : 'Pause';
    counts.textContent = `${state.answers.length} available · ${state.usedCount} used · live ${new Date().toLocaleTimeString()}`;
    const ranked=state.rankedAnswers||state.answers.map(word=>({word,tier:'Unrated',source:'AI estimate'}));
    rankLabel.textContent=ranked.some(x=>x.source==='Game')?'KRILLION TIERS / GAME + ESTIMATES':'KRILLION TIER ORDER / AI ESTIMATES';
    const signature = JSON.stringify([ranked,state.paused]);
    if (signature === lastDisplay) return; lastDisplay = signature; list.replaceChildren();
    if (!state.answers.length) { list.append(element('li', state.paused ? 'Suggestions paused.' : 'Answers appear automatically when a question is detected.', 'empty')); return; }
    ranked.forEach((entry, index) => {
      const word=entry.word;
      const row = element('li', '', 'answer'), copy = element('button', '', 'word'), mark = element('button', '✓', 'mark');
      copy.append(element('span',word),element('span',(entry.source==='Game'?'GAME / ':'est. / ')+entry.tier,'tier'+(entry.source==='Game'?' game':'')));
      copy.title = 'Copy ' + word; mark.title = 'Mark ' + word + ' as used';
      copy.onclick = async () => { try { await navigator.clipboard.writeText(word); status.textContent = 'Copied ' + word; } catch { status.textContent = 'Clipboard unavailable. Select and copy the word manually.'; } };
      mark.onclick = () => act('mark', {word}); row.append(element('span', String(index + 1).padStart(2, '0'), 'rank'), copy, mark); list.append(row);
    });
  }
  async function act(type, data) { try { render(await send(type, data)); } catch (error) { status.textContent = error.message; } }
  function scheduleAutofill(){
    if(autoTimer){clearTimeout(autoTimer);autoTimer=null;}
    const due=controller.timing?.dueAt;
    if(!slime||currentPaused||picking||!tabCanRun()||!latestState||due==null||due<=Date.now())return;
    autoTimer=setTimeout(()=>{
      autoTimer=null;
      if(!slime||currentPaused||picking||!tabCanRun()||!latestState)return;
      const snapshot=PufferReader.read(document,pinned),identity=PufferReader.normalize(snapshot.question)+'|'+snapshot.categoryId;
      if(identity!==latestIdentity)return;
      autoNote.textContent=controller.step(document,latestState.answers,true,identity);
      scheduleAutofill();
    },Math.max(10,due-Date.now()));
  }
  async function tick() {
    if (busy || picking || !host) return; busy = true;
    lastSyncAt=Date.now();
    try {
      if(grind&&!slime&&!controlPending)await setGrind(false);
      if(grind&&slime&&!currentPaused&&grindController.step(document,true)){joiningUntil=Date.now()+1500;autoNote.textContent='Grind mode - joining next game';}
      const snapshot = PufferReader.read(document, pinned);
      snapshot.continuous=continuous&&tabCanRun();snapshot.extensionVersion='3.0.0';
      const identity = PufferReader.normalize(snapshot.question) + '|' + snapshot.categoryId;
      if (identity !== previous) { previous = identity; repeats = 1; } else repeats++;
      // Confirm changes before resetting used words or making a paid request.
      if (repeats >= 2) {
        const state=await send('sync',snapshot);render(state);
        const active=slime&&!state.paused&&!picking&&tabCanRun()&&Date.now()>=joiningUntil&&state.question&&PufferReader.normalize(state.question)===PufferReader.normalize(snapshot.question);
        latestIdentity=identity;
        autoNote.textContent=controller.step(document,state.answers,!!active,identity);
        scheduleAutofill();
        const working=state.generating??/streaming|finding|generating|automatic retry|cooling down/i.test(state.status||'');
        const blocked=/quota|api key|key rejected|access denied|model unavailable|billing|permission|regional|rejected the request/i.test(state.status||'');
        if(refill.shouldRefresh(identity,state.answers,controller.attempted||new Set(),!!active&&!working&&!blocked)){
          autoNote.textContent='Refilling: fewer than 5 untried suggestions or 60% attempted';
          const refreshed=await send('retry',{});render(refreshed);
        }

      }
    } catch (error) { status.textContent = /fetch|abort|network/i.test(error.message) ? 'Extension connection interrupted. Reload this game tab.' : error.message; }
    finally { busy = false; }
  }
  async function start() {
    mount();
    PufferAutoplay.installKeyboardGuard(document,()=>slime&&letterMode&&!currentPaused&&!picking&&document.visibilityState==='visible');
    try{const saved=await send('grind-state',{});if(saved.enabled)await setGrind(true,true);}catch{}
    const observer=new MutationObserver(()=>{if(!busy)setTimeout(tick,40);});observer.observe(document.body,{childList:true,subtree:true,characterData:true});
    tick(); setInterval(tick, 200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
})();
