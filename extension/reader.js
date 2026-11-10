(function (root) {
  'use strict';
  const normalize = text => String(text || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const promptPattern = /^(?:name\b|give\b|list\b|identify\b|what\b|which\b|an? (?:english word|word|country|animal|city|type|kind)\b)/i;
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  function visible(element) {
    if (!element || element.closest('#puffer-companion-root,[aria-hidden="true"],script,style,nav,footer')) return false;
    const rect = element.getBoundingClientRect();
    const style = element.ownerDocument.defaultView.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
  }
  function selectPrompt(candidates) {
    return candidates.filter(item => item.text.length >= 8 && item.text.length <= 350 && (promptPattern.test(item.text) || (item.explicit && !/^(?:waiting|loading|how to play|question|category|prompt)\s*[.!…:]?$/i.test(item.text))))
      .sort((a, b) => b.score - a.score || a.text.length - b.text.length)[0] || null;
  }
  function read(doc, pinned) {
    const options = [], seen = new Set();
    const consider = (element, score) => {
      if (!visible(element) || seen.has(element)) return;
      seen.add(element); const text = clean(element.innerText || element.textContent);
      const semantic = /question|prompt|category/i.test(String(element.className) + ' ' + element.id + ' ' + element.getAttribute('data-testid'));
      options.push({element, text, explicit: semantic, score: score + (semantic ? 25 : 0) + (promptPattern.test(text) ? 70 : 0)});
    };
    if (pinned && pinned.isConnected && visible(pinned)) {
      const text = clean(pinned.innerText || pinned.textContent);
      if (text.length >= 4 && text.length <= 350) options.push({element: pinned, text, score: 1000});
    }
    for (const node of doc.querySelectorAll('[data-testid*="question"],[data-testid*="prompt"],[class*="prompt"],[class*="question"],[id*="prompt"],[id*="question"],h1,h2,h3,p')) consider(node, 35);
    for (const node of doc.querySelectorAll('span,div')) if (node.childElementCount <= 1) consider(node, 10);
    const picked = options.find(item => item.score === 1000) || selectPrompt(options);
    let question = picked ? picked.text : '';
    // Scope round identity to the prompt itself or its nearest explicit round container.
    const round = picked && picked.element.closest('[data-round-id],[data-category-id],[data-question-id]');
    const categoryId = round ? ['data-round-id', 'data-category-id', 'data-question-id'].map(key => round.getAttribute(key) || '').join(':') : '';
    const history = [], used = new Set();
    for (const node of doc.querySelectorAll('[data-testid*="used"],[data-testid*="played"],[class*="used"],[class*="played"],[class*="history"],[class*="History"],[class*="accepted"],[class*="answer-chip"],[class*="answerChip"],[class*="answer-word"],[class*="answerWord"],[id*="used"],[id*="played"],[id*="history"],[role="log"],[data-word]')) {
      if (!visible(node) || node.closest('[data-accepted="false"],.rejected,.invalid')) continue;
      const text = clean(node.innerText || node.textContent); if (!text || text === question) continue;
      const exact = node.getAttribute('data-word') || node.getAttribute('data-answer');
      if (exact && exact.length <= 100) used.add(exact.trim());
      else history.push(text);
    }
    return {question, categoryId, used: [...used].slice(0, 300), history: history.join('\n').slice(0, 15000)};
  }
  const api = {read, normalize, selectPrompt};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PufferReader = api;
})(globalThis);
