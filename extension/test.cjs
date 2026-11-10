const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const reader = require('./reader.js');

function testReader() {
  assert.equal(reader.normalize('NAME a greeting?!'), 'name a greeting');
  assert.equal(reader.selectPrompt([{text: 'Menu', score: 100}, {text: 'Name a greeting', score: 50}, {text: 'Name a valid answer before time runs out', score: 10}]).text, 'Name a greeting');
  assert.equal(reader.selectPrompt([{text: 'Fictional creatures from mythology', score: 60, explicit: true}]).text, 'Fictional creatures from mythology');
  const doc = {defaultView: {getComputedStyle: () => ({visibility: 'visible', display: 'block', opacity: '1'})}};
  function node(text, attrs = {}) {
    return {innerText: text, className: attrs.class || '', id: '', childElementCount: 0, ownerDocument: doc, isConnected: true,
      getAttribute: name => attrs[name] || null, getBoundingClientRect: () => ({width: 300, height: 35}),
      closest(selector) { if (selector.startsWith('#puffer')) return attrs.helper ? this : null; if (selector.startsWith('[data-round-id]')) return attrs['data-round-id'] ? this : null; return null; }};
  }
  let prompt = node('Name a greeting', {class: 'party-prompt', 'data-round-id': 'round1'});
  const used = node('hello', {class: 'used-word', 'data-word': 'hello'});
  const helper = node('Name a different thing', {class: 'question', helper: true});
  doc.querySelectorAll = selector => selector.startsWith('[data-testid*="used"]') ? [used] : [prompt, helper];
  let state = reader.read(doc);
  assert.equal(state.question, 'Name a greeting'); assert.equal(state.categoryId, 'round1::'); assert.deepEqual(state.used, ['hello']);
  prompt = node('Name a farewell', {class: 'party-prompt', 'data-round-id': 'round2'});
  state = reader.read(doc); assert.equal(state.question, 'Name a farewell'); assert.equal(state.categoryId, 'round2::');
  const pinned = node('Characters from a fictional world');
  assert.equal(reader.read(doc, pinned).question, 'Characters from a fictional world');
}
async function testWorker() {
  let listener, fetched; const storage = {};
  const chrome = {runtime: {onMessage: {addListener: fn => listener = fn}}, tabs: {onRemoved: {addListener() {}}}, storage: {session: {
    async set(data) {Object.assign(storage, data);}, async get(key) {return {[key]: storage[key]};}, async remove(key) {delete storage[key];}
  }}};
  const context = {chrome, URL, Map, Number, Error, JSON, AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => {fetched = {url, options}; return {ok: true, json: async () => ({question: 'Name a greeting', answers: ['hello']})};}};
  vm.runInNewContext(fs.readFileSync(require.resolve('./background.js'), 'utf8'), context);
  const sender = {url: 'https://krillion.io/party', frameId: 0, tab: {id: 7}};
  const message = data => new Promise(resolve => listener(data, sender, resolve));
  assert.equal(listener({type: 'sync'}, {...sender, url: 'https://example.com/'}, () => {}), false);
  assert.equal(listener({type: 'sync'}, {...sender, frameId: 1}, () => {}), false);
  assert.equal((await message({type: 'pair', port: 45000, token: 'a'.repeat(64)})).ok, true);
  assert.equal((await message({type: 'sync', data: {question: 'Name a greeting'}})).ok, true);
  assert.equal(fetched.url, 'http://127.0.0.1:45000/sync');
  assert.equal(fetched.options.headers.Authorization, 'Bearer ' + 'a'.repeat(64));
  assert.equal((await message({type: 'pair', port: 80, token: 'a'.repeat(64)})).ok, false);
  assert.equal((await message({type: 'fetch', url: 'https://example.com/'})).ok, false);
}
(async () => {testReader(); await testWorker(); console.log('PASS: DOM prompt/round/played-word reader, helper exclusion, pinned fallback, extension messaging, sender restrictions, fixed authenticated loopback requests.');})().catch(error => {console.error(error);process.exitCode = 1;});
