(function(root) {
  'use strict';
  function visible(node) {const rect=node.getBoundingClientRect();const style=node.ownerDocument.defaultView.getComputedStyle(node);return rect.width>0&&rect.height>0&&style.display!=='none'&&style.visibility!=='hidden'&&!node.closest('#puffer-companion-root,[aria-hidden="true"]');}
  function findInput(doc) {
    return [...doc.querySelectorAll('input:not([type]),input[type="text"],input[type="search"],textarea')].filter(node=>{
      const label=[node.placeholder,node.id,node.className,node.getAttribute('aria-label'),node.getAttribute('data-testid')].join(' ');
      return visible(node)&&!node.disabled&&!node.readOnly&&node.getAttribute('aria-disabled')!=='true'&&/answer|word|guess/i.test(label)&&!/username|nickname|room.?code|search/i.test(label);
    })[0]||null;
  }
  function myTurn(doc) {
    for(const node of doc.querySelectorAll('[data-is-my-turn="true"],[data-your-turn="true"],[class*="your-turn"],[class*="yourTurn"]'))if(visible(node))return true;
    for(const node of doc.querySelectorAll('h1,h2,h3,p,span,strong,div'))if(node.childElementCount<=1&&visible(node)&&/^(?:it['’]?s\s+)?your turn(?:[!.:]|\s+to\s|$)/i.test((node.innerText||'').trim()))return true;
    return false;
  }
  const nextWord=(answers,attempted)=>answers.find(word=>!attempted.has(word))||null;
  async function play(doc,word,stillEnabled) {
    const input=findInput(doc);if(!input||input.value||!myTurn(doc)||!stillEnabled())return false;
    const view=doc.defaultView;
    const prototype=input.tagName==='TEXTAREA'?view.HTMLTextAreaElement.prototype:view.HTMLInputElement.prototype;
    const setter=Object.getOwnPropertyDescriptor(prototype,'value').set;
    input.focus();let typed='';
    for(const letter of word){
      if(!stillEnabled()||!myTurn(doc)||input.disabled||input.value!==typed){if(input.value===typed){setter.call(input,'');input.dispatchEvent(new view.Event('input',{bubbles:true}));}return false;}
      typed+=letter;setter.call(input,typed);input.dispatchEvent(new view.Event('input',{bubbles:true}));
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    if(!stillEnabled()||!myTurn(doc)||input.value!==word)return false;
    input.dispatchEvent(new view.Event('change',{bubbles:true}));
    const form=input.form;
    if(form&&typeof form.requestSubmit==='function'){
      const submit=form.querySelector('button[type="submit"],input[type="submit"]');
      if(submit&&submit.disabled)return false;
      form.requestSubmit(submit||undefined);
    }else{
      input.dispatchEvent(new view.KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}));
      input.dispatchEvent(new view.KeyboardEvent('keyup',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true}));
    }
    return true;
  }
  const api={findInput,myTurn,nextWord,play};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PufferAutoplay=api;
})(globalThis);
