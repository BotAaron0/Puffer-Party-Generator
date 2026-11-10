(function(root){
  'use strict';
  const pinned=new WeakMap(),feedbackTicks=new WeakMap(),watching=new WeakSet();
  function visible(node){if(!node)return false;const r=node.getBoundingClientRect(),s=node.ownerDocument.defaultView.getComputedStyle(node);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&!node.closest('#puffer-companion-root,[aria-hidden="true"]');}
  function editable(node){return visible(node)&&!node.disabled&&!node.readOnly&&node.getAttribute('aria-disabled')!=='true';}
  function pinInput(doc,node){if(node&&/^(INPUT|TEXTAREA)$/i.test(node.tagName))pinned.set(doc,node);}
  function findInput(doc){
    const selected=pinned.get(doc);if(selected&&selected.isConnected!==false&&visible(selected))return selected;
    const choices=[...doc.querySelectorAll('input:not([type]),input[type="text"],input[type="search"],textarea')].filter(visible);
    const ranked=choices.map(node=>{const label=[node.placeholder,node.id,node.className,node.getAttribute('aria-label'),node.getAttribute('data-testid')].join(' ');return {node,score:/username|nickname|room.?code|search|chat|email|player.?name/i.test(label)?-1:/answer|word|guess|response|puffer/i.test(label)?100:/type|enter/i.test(label)?50:0};}).filter(x=>x.score>=0).sort((a,b)=>b.score-a.score);
    if(ranked[0]&&(ranked[0].score>0||ranked.length===1))return ranked[0].node;
    return null;
  }
  function myTurn(doc){
    for(const node of doc.querySelectorAll('[data-is-my-turn="true"],[data-your-turn="true"],[class*="your-turn"],[class*="yourTurn"]'))if(visible(node))return true;
    for(const node of doc.querySelectorAll('h1,h2,h3,p,span,strong,div'))if(node.childElementCount<=1&&visible(node)&&/\b(?:your (?:turn|puffer)|you (?:have|hold) the puffer)\b/i.test((node.innerText||'').trim())&&!/\b(?:not|isn.t) your\b/i.test(node.innerText||''))return true;
    return typeCue(doc);
  }
  function typeCue(doc){
    // The live prompt can include emoji, an em dash, and separate spans.
    // Strong ownership evidence wins over other players' waiting messages.
    for(const node of doc.querySelectorAll('h1,h2,h3,p,span,strong,div,label,button,[role="status"]')){
      if(node.childElementCount>6||!visible(node))continue;
      const raw=(node.innerText||node.textContent||'').trim();if(raw.length>180)continue;
      const text=raw.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
      if(/\b(?:not|isn t|isnt) your\b|\b(?:wait|waiting)\b/.test(text))continue;
      if(/\byour (?:puffer|turn)(?: \p{L}+){0,5} type\b/u.test(text))return true;
    }
    if(waitingCue(doc))return false;
    for(const node of doc.querySelectorAll('h1,h2,h3,p,span,strong,div,label,button,[role="status"]')){
      if(node.childElementCount>6||!visible(node))continue;
      const text=(node.innerText||'').replace(/\s+/g,' ').trim();
      if(text.length>140||/\b(?:chat|search|username|nickname|email|lobby|room code|waiting|wait|not your|do not|don.t)\b/i.test(text)||/^type of\b/i.test(text))continue;
      if(/^(?:(?:it['’]?s\s+)?your (?:turn|puffer)[\s!.,:\-–—−]*)?type\b/i.test(text))return true;
    }
    const input=findInput(doc);return !!input&&/^type\b/i.test(input.placeholder||'')&&!/chat|search|username|name|email/i.test(input.placeholder||'');
  }
  function waitingCue(doc){
    for(const node of doc.querySelectorAll('h1,h2,h3,p,span,strong,div,label,[role="status"]')){
      if(node.childElementCount>1||!visible(node))continue;
      const text=(node.innerText||'').replace(/\s+/g,' ').trim();
      if(text.length<=140&&(/^(?:please )?wait(?:ing)?\b|\bnot your (?:turn|puffer)\b|\banother player.s turn\b/i.test(text)||/^[^.!?]{1,50}['’]s puffer\b/i.test(text)))return true;
    }
    return false;
  }
  function installKeyboardGuard(doc,enabled){
    const root=typeof doc.defaultView?.addEventListener==='function'?doc.defaultView:doc;
    if(typeof root.addEventListener!=='function')return ()=>{};
    const handler=event=>{
      if(!enabled()||!event.isTrusted||event.key==='Escape')return;
      const input=findInput(doc);if(!input||(event.target!==input&&doc.activeElement!==input))return;
      if(event.target!==input&&event.target!==doc&&event.target!==doc.body)return;
      if(/^key/.test(event.type)){
        if(event.ctrlKey||event.metaKey||event.altKey||event.key==='Tab'||/^F\d{1,2}$/.test(event.key))return;
        if(!(event.key?.length===1||['Enter','Backspace','Delete','Dead','Process'].includes(event.key)))return;
      }
      event.preventDefault();event.stopImmediatePropagation();
    };
    const types=['keydown','keypress','keyup','beforeinput','paste','drop'];for(const type of types)root.addEventListener(type,handler,true);
    return ()=>{if(typeof root.removeEventListener==='function')for(const type of types)root.removeEventListener(type,handler,true);};
  }
  function area(input){return input.form?.parentElement||input.form||input.parentElement?.parentElement||input.parentElement||null;}
  function feedback(doc,input){
    const scope=area(input),texts=[];let shaking=false;
    const nodes=scope&&typeof scope.querySelectorAll==='function'?[...scope.querySelectorAll('[role="alert"],[aria-live],[class*="error"],[class*="invalid"],[class*="reject"],[class*="shake"],[data-error]')]:[];
    if(input.getAttribute('aria-invalid')==='true')texts.push('invalid answer');
    for(const node of nodes){if(!visible(node))continue;const text=(node.innerText||node.textContent||'').trim();if(text)texts.push(text);if(/shake|reject|invalid|error/i.test(String(node.className)))shaking=true;}
    const text=texts.join(' ').slice(0,500);
    const wait=/not your (?:turn|puffer)|wait(?:ing)?(?: for| until)?|another player|someone else/i.test(text);
    const rejected=shaking||/invalid|not (?:a )?valid|reject|not accepted|not allowed|already (?:used|said|played)|doesn.t (?:fit|match|count)|not recogni[sz]ed|unknown word|wrong answer|try (?:another|a different)/i.test(text);
    return {kind:wait?'wait':rejected?'reject':'none',text,signature:(wait?'wait':rejected?'reject':'none')+'|'+text+'|'+shaking,revision:feedbackTicks.get(doc)||0};
  }
  function watch(doc){
    if(watching.has(doc)||typeof doc.addEventListener!=='function')return;watching.add(doc);
    const bump=node=>{const input=findInput(doc),scope=input&&area(input);if(scope&&typeof scope.contains==='function'&&(scope.contains(node)||node===input))feedbackTicks.set(doc,(feedbackTicks.get(doc)||0)+1);};
    doc.addEventListener('animationstart',event=>{if(/shake|reject|invalid|error/i.test(event.animationName||''))bump(event.target);},true);
    const Observer=doc.defaultView.MutationObserver;
    if(Observer&&doc.body)new Observer(records=>{for(const record of records){
      const node=record.target,old=record.oldValue||'';
      const activated=record.attributeName==='class'?/shake|reject|invalid|error/i.test(String(node.className))&&!/shake|reject|invalid|error/i.test(old):record.attributeName==='aria-invalid'?node.getAttribute?.('aria-invalid')==='true'&&old!=='true':!!node.getAttribute?.('data-error')&&node.getAttribute('data-error')!==old;
      if(activated)bump(node);
    }}).observe(doc.body,{attributes:true,attributeOldValue:true,subtree:true,attributeFilter:['class','aria-invalid','data-error']});
  }
  function write(doc,input,word){
    const view=doc.defaultView,prototype=/textarea/i.test(input.tagName)?view.HTMLTextAreaElement.prototype:view.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype,'value').set.call(input,word);
    const EventType=view.InputEvent||view.Event;
    input.dispatchEvent(new EventType('input',{bubbles:true,inputType:'insertText',data:word}));
    input.dispatchEvent(new view.Event('change',{bubbles:true}));
  }
  function submit(doc,input){
    if(!editable(input))return false;
    const form=input.form;
    if(form&&typeof form.requestSubmit==='function'){
      const button=form.querySelector('button[type="submit"],input[type="submit"]');if(button&&button.disabled)return false;
      if(button&&typeof button.click==='function')button.click();else form.requestSubmit();return true;
    }
    const scope=area(input);
    if(scope&&typeof scope.querySelectorAll==='function'){
      const button=[...scope.querySelectorAll('button')].find(node=>visible(node)&&!node.disabled&&/^(?:send|submit|enter|pass(?: the puffer)?)[!\s]*$/i.test((node.innerText||node.getAttribute('aria-label')||'').trim()));
      if(button){button.click();return true;}
    }
    for(const type of ['keydown','keypress','keyup'])input.dispatchEvent(new doc.defaultView.KeyboardEvent(type,{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}));
    return true;
  }
  const nextWord=(answers,attempted)=>answers.find(word=>!attempted.has(word))||null;
  const typingRate=delay=>12000/Number(delay); // Five characters per standardized word.
  function createRefillTracker(){
    let category='',nextAllowed=0;const pool=new Set();
    const key=value=>String(value).trim().toLowerCase().replace(/\s+/g,' ');
    return {shouldRefresh(identity,answers,attempted,ready,now=Date.now()){
      if(identity!==category){category=identity;pool.clear();}
      for(const word of answers)pool.add(key(word));
      const tried=new Set([...attempted].map(key));
      const count=[...pool].filter(word=>tried.has(word)).length;
      const remaining=answers.filter(word=>!tried.has(key(word))).length;
      const threshold=pool.size>0&&count>=Math.ceil(pool.size*.6);
      if(!ready||(!threshold&&remaining>=5)||now<nextAllowed)return false;
      nextAllowed=now+15000;return true;
    }};
  }
  // Kept for legacy callers; the controller below can stage words before a turn.
  async function play(doc,word,enabled){const input=findInput(doc);if(!input||input.value||!editable(input)||!myTurn(doc)||!enabled())return false;write(doc,input,word);return enabled()&&myTurn(doc)&&input.value===word&&submit(doc,input);}
  function createController(random=Math.random){
    let category='',current=null,lastEnter=-Infinity,delay=700,nextDelay=700,letterMode=false,letterDelay=120,letterTurnGranted=false;const attempted=new Set();
    const sampleDelay=()=>Math.max(50,Math.round(delay*(.85+.3*random())));
    const sampleLetter=()=>Math.max(1,Math.round(letterDelay*(.85+.3*random())));
    function clearOwned(doc){if(current&&current.input.value===(current.typing?current.typed:current.word))write(doc,current.input,'');current=null;}
    return {
      reset(doc,key){clearOwned(doc);category=key;attempted.clear();lastEnter=-Infinity;letterTurnGranted=false;},
      stop(doc){clearOwned(doc);letterTurnGranted=false;},
      setDelay(value){const number=Number(value);if(Number.isFinite(number)){delay=Math.max(100,Math.min(3000,number));nextDelay=sampleDelay();}},
      setLetterMode(value){letterMode=!!value;if(!letterMode)letterTurnGranted=false;},
      setLetterDelay(value){const number=Number(value);if(Number.isFinite(number))letterDelay=Math.max(20,Math.min(220,number));},
      step(doc,answers,enabled,key,now=Date.now()){
        watch(doc);
        if(key!==category)this.reset(doc,key);
        if(!enabled){this.stop(doc);return 'Auto play off';}
        const input=findInput(doc);if(!input)return 'Cannot find textbox. Click Choose answer box, then click the game textbox.';
        if(!editable(input))return 'Textbox disabled - waiting for the game';
        if(letterMode){
          if(current&&current.submitted&&input.value===''){attempted.add(current.word);current=null;letterTurnGranted=false;}
          if(typeCue(doc))letterTurnGranted=true;
          else if(waitingCue(doc))letterTurnGranted=false;
        }
        if(letterMode&&!letterTurnGranted){
          if(current&&current.submitted&&input.value!==current.word)attempted.add(current.word);
          if(current&&!current.submitted)clearOwned(doc);
          return 'Waiting for the visible Type prompt - physical typing is blocked in the answer box';
        }
        if(current&&current.input!==input){if(current.submitted)attempted.add(current.word);current=null;}
        if(current&&input.value!==(current.typing?current.typed:current.word)){
          if(current.submitted||(current.typing&&current.typed.length>0))attempted.add(current.word);
          current=null;
          if(input.value)return 'Manual text detected - leaving your text alone';
        }
        if(current&&current.submitted){
          const result=feedback(doc,input);
          if(now-lastEnter>=nextDelay&&result.kind==='reject'&&(result.signature!==current.feedback.signature||result.revision>current.feedback.revision)){
            attempted.add(current.word);clearOwned(doc);
          }else if(myTurn(doc)!==current.turnAtSubmit&&!myTurn(doc)&&now-lastEnter>=Math.max(450,nextDelay)){
            attempted.add(current.word);clearOwned(doc);
          }else if(now-lastEnter<nextDelay)return result.kind==='wait'?'Word ready - waiting for your puffer':'Enter sent - watching for acceptance or rejection';
        }
        if(!current){
          if(input.value)return 'Textbox has text - leaving it alone';
          const word=nextWord(answers,attempted);if(!word)return 'Waiting for fresh, untried suggestions';
          current={word,input,submitted:false,feedback:feedback(doc,input),typing:letterMode,typed:'',letters:[...word],letterIndex:0,nextLetterAt:now+sampleLetter()};
          if(letterMode&&doc.visibilityState!=='hidden')input.focus();
          if(!letterMode){write(doc,input,word);current.typed=word;if(input.value!==word){current=null;return 'Game cleared the prepared word - waiting for the textbox';}}
        }
        if(current.typing){
          if(letterMode&&now<current.nextLetterAt)return 'Typing '+current.word+' / '+current.letterIndex+' of '+current.letters.length;
          if(letterMode){current.typed+=current.letters[current.letterIndex++];write(doc,input,current.typed);}else{current.typed=current.word;current.letterIndex=current.letters.length;write(doc,input,current.word);}
          if(input.value!==current.typed){attempted.add(current.word);current=null;return 'Game changed the textbox while typing - preparing next suggestion';}
          if(current.letterIndex<current.letters.length){current.nextLetterAt=now+sampleLetter();return 'Typing '+current.word+' / '+current.letterIndex+' of '+current.letters.length;}
          current.typing=false;current.readyAt=now+20;return 'Word typed - preparing Enter';
        }
        if(current.readyAt&&now<current.readyAt)return 'Word typed - preparing Enter';
        if(now-lastEnter<nextDelay)return 'Next word prepared - waiting for Enter delay';
        current.feedback=feedback(doc,input);current.turnAtSubmit=myTurn(doc);
        if(doc.visibilityState!=='hidden')input.focus();
        if(!submit(doc,input))return 'Word prepared - submit button is disabled';
        lastEnter=now;nextDelay=sampleDelay();current.submitted=true;
        return (current.turnAtSubmit?'Submitted ':'Prepared / trying Enter: ')+current.word;
      },
      get attempted(){return new Set(attempted);},
      get timing(){return {average:delay,next:nextDelay,letterAverage:letterDelay,wpm:typingRate(letterDelay),dueAt:current?(current.typing?current.nextLetterAt:Math.max(Number.isFinite(lastEnter)?lastEnter+nextDelay:0,current.readyAt||0)):null};}
    };
  }
  const api={findInput,pinInput,myTurn,typeCue,installKeyboardGuard,nextWord,feedback,play,createController,createRefillTracker,typingRate};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PufferAutoplay=api;
})(globalThis);
