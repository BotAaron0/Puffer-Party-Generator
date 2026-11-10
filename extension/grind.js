(function(root){
  'use strict';
  function available(node){const rect=node.getBoundingClientRect(),style=node.ownerDocument.defaultView.getComputedStyle(node);return rect.width>0&&rect.height>0&&style.display!=='none'&&style.visibility!=='hidden'&&!node.disabled&&node.getAttribute('aria-disabled')!=='true'&&!node.closest('#puffer-companion-root,[aria-hidden="true"]');}
  function findJoinNext(doc){
    for(const node of doc.querySelectorAll('button,[role="button"],a')){
      if(!available(node))continue;
      const text=(node.innerText||node.getAttribute('aria-label')||node.getAttribute('title')||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
      if(!/^join next(?: game| match)?$/.test(text))continue;
      if(node.tagName==='A'){try{if(new URL(node.href,doc.location.href).origin!==doc.location.origin)continue;}catch{continue;}}
      return node;
    }return null;
  }
  function createController(){let lastClick=-Infinity;return {step(doc,enabled,now=Date.now()){
    if(!enabled)return false;const button=findJoinNext(doc);if(!button||now-lastClick<5000)return false;
    lastClick=now;button.click();return true;
  }};}
  const api={findJoinNext,createController};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PufferGrind=api;
})(globalThis);
