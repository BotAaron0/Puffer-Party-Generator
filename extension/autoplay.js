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
    return false;
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
    if(Observer&&doc.body)new Observer(records=>{for(const record of records){const node=record.target;if(/shake|reject|invalid|error/i.test(String(node.className))||node.getAttribute?.('aria-invalid')==='true')bump(node);}}).observe(doc.body,{attributes:true,subtree:true,attributeFilter:['class','aria-invalid','data-error']});
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
  // Kept for legacy callers; the controller below can stage words before a turn.
  async function play(doc,word,enabled){const input=findInput(doc);if(!input||input.value||!editable(input)||!myTurn(doc)||!enabled())return false;write(doc,input,word);return enabled()&&myTurn(doc)&&input.value===word&&submit(doc,input);}
  function createController(){
    let category='',current=null,lastEnter=-Infinity;const attempted=new Set();
    function clearOwned(doc){if(current&&current.input.value===current.word)write(doc,current.input,'');current=null;}
    return {
      reset(doc,key){clearOwned(doc);category=key;attempted.clear();lastEnter=-Infinity;},
      stop(doc){clearOwned(doc);},
      step(doc,answers,enabled,key,now=Date.now()){
        watch(doc);
        if(key!==category)this.reset(doc,key);
        if(!enabled){this.stop(doc);return 'Auto play off';}
        const input=findInput(doc);if(!input)return 'Cannot find textbox. Click Choose answer box, then click the game textbox.';
        if(!editable(input))return 'Textbox disabled - waiting for the game';
        if(current&&current.input!==input){if(current.submitted)attempted.add(current.word);current=null;}
        if(current&&input.value!==current.word){
          if(current.submitted)attempted.add(current.word);
          current=null;
          if(input.value)return 'Manual text detected - leaving your text alone';
        }
        if(current&&current.submitted){
          const result=feedback(doc,input);
          if(result.kind==='reject'&&(result.signature!==current.feedback.signature||result.revision>current.feedback.revision)){
            attempted.add(current.word);clearOwned(doc);
          }else if(myTurn(doc)!==current.turnAtSubmit&&!myTurn(doc)&&now-lastEnter>450){
            attempted.add(current.word);clearOwned(doc);
          }else if(!(myTurn(doc)&&!current.turnAtSubmit)&&now-lastEnter<(myTurn(doc)?700:1200))return result.kind==='wait'?'Word ready - waiting for your puffer':'Enter sent - watching for acceptance or rejection';
        }
        if(!current){
          if(input.value)return 'Textbox has text - leaving it alone';
          const word=nextWord(answers,attempted);if(!word)return 'Waiting for fresh, untried suggestions';
          current={word,input,submitted:false,feedback:feedback(doc,input)};
          write(doc,input,word);
          if(input.value!==word){current=null;return 'Game cleared the prepared word - waiting for the textbox';}
        }
        if(now-lastEnter<200)return 'Next word prepared';
        current.feedback=feedback(doc,input);current.turnAtSubmit=myTurn(doc);
        input.focus();
        if(!submit(doc,input))return 'Word prepared - submit button is disabled';
        lastEnter=now;current.submitted=true;
        return (current.turnAtSubmit?'Submitted ':'Prepared / trying Enter: ')+current.word;
      },
      get attempted(){return new Set(attempted);}
    };
  }
  const api={findInput,pinInput,myTurn,nextWord,feedback,play,createController};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PufferAutoplay=api;
})(globalThis);
