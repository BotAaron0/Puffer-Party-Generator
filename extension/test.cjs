const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const reader = require('./reader.js');
const autoplay = require('./autoplay.js');
async function testAutoplay(){
  assert.equal(autoplay.nextWord(['rare','common'],new Set(['rare'])),'common');
  let submitted=false;let turnText='Your turn!';
  class Input {get value(){return this._value||'';}set value(value){this._value=value;}}
  const input=new Input();
  const doc={defaultView:{HTMLInputElement:Input,Event:class{},KeyboardEvent:class{},getComputedStyle:()=>({display:'block',visibility:'visible'})}};
  Object.assign(input,{ownerDocument:doc,tagName:'INPUT',placeholder:'Type your answer',id:'',className:'',disabled:false,readOnly:false,getAttribute:()=>null,closest:()=>null,getBoundingClientRect:()=>({width:200,height:30}),dispatchEvent(){},focus(){},form:{querySelector:()=>null,requestSubmit(){submitted=true;}}});
  const marker={ownerDocument:doc,childElementCount:0,get innerText(){return turnText;},closest:()=>null,getBoundingClientRect:()=>({width:200,height:30})};
  doc.querySelectorAll=selector=>selector.startsWith('input')?[input]:selector.startsWith('[data-is-my-turn')?[]:[marker];
  assert.equal(await autoplay.play(doc,'hi',()=>true),true);assert.equal(submitted,true);assert.equal(input.value,'hi');
  submitted=false;assert.equal(await autoplay.play(doc,'hello',()=>true),false);assert.equal(submitted,false);
  input.value='';turnText='Waiting for another player';assert.equal(await autoplay.play(doc,'hi',()=>true),false);
  turnText='Your turn!';assert.equal(await autoplay.play(doc,'hi',()=>false),false);
}
function testAutoplayController(){
  let turn='Waiting for another player',submits=0,showError=false,errorText='Invalid answer',clearOnSubmit=false;
  class Input {get value(){return this._value||'';}set value(value){this._value=value;}}
  const events={},input=new Input(),doc={defaultView:{HTMLInputElement:Input,Event:class{},KeyboardEvent:class{},getComputedStyle:()=>({display:'block',visibility:'visible'})},addEventListener(type,handler){(events[type]??=[]).push(handler);}};
  const common={ownerDocument:doc,closest:()=>null,getBoundingClientRect:()=>({width:300,height:30})};
  const error={...common,className:'error shake',get innerText(){return errorText;}};
  const form={querySelector:()=>null,querySelectorAll:selector=>selector==='button'?[]:showError?[error]:[],contains:node=>node===input||node===error,requestSubmit(){submits++;if(clearOnSubmit)input.value='';}};
  Object.assign(input,common,{tagName:'INPUT',placeholder:'Type here',id:'',className:'',isConnected:true,getAttribute:()=>null,dispatchEvent(){},focus(){},form});
  const marker={...common,childElementCount:0,get innerText(){return turn;}};
  doc.querySelectorAll=selector=>selector.startsWith('input')?[input]:selector.startsWith('[data-is-my-turn')?[]:[marker];
  const controller=autoplay.createController(),words=['salutations','hello','hi','good morning'];
  controller.step(doc,words,true,'round1',0);assert.equal(input.value,'salutations','Did not prepare before turn');assert.equal(submits,1);
  controller.step(doc,words,true,'round1',100);assert.equal(submits,1,'Enter storm while waiting');
  turn='Your puffer, type in the textbox';assert.equal(autoplay.myTurn(doc),true);controller.step(doc,words,true,'round1',300);assert.equal(submits,2,'Did not submit as puffer arrived');
  showError=true;controller.step(doc,words,true,'round1',600);assert.equal(input.value,'hello','Did not advance after rejection');assert.equal(submits,3);assert.ok(controller.attempted.has('salutations'));
  for(const handler of events.animationstart||[])handler({animationName:'shake',target:error});
  controller.step(doc,words,true,'round1',900);assert.equal(input.value,'hi','Repeated identical shake not detected');
  showError=false;clearOnSubmit=true;controller.step(doc,words,true,'round1',1800);controller.step(doc,words,true,'round1',1810);assert.equal(input.value,'good morning','Input clear did not prepare next turn');
  controller.stop(doc);assert.equal(input.value,'','Stop did not clear owned staged text');
  input.value='my manual answer';controller.step(doc,words,true,'round2',2200);assert.equal(input.value,'my manual answer','Overwrote manual text');
  input.value='';showError=false;clearOnSubmit=false;turn='Waiting for another player';controller.step(doc,words,true,'round3',3000);
  showError=true;errorText='Not your turn';controller.step(doc,words,true,'round3',4300);assert.equal(input.value,'salutations','Not-your-turn feedback discarded a valid staged word');
}

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
  const used = node('hello', {class: 'used-word', 'data-word': 'hello','data-tier':'Deep Cut'});
  const helper = node('Name a different thing', {class: 'question', helper: true});
  doc.querySelectorAll = selector => selector.startsWith('[data-testid*="used"]')||selector.startsWith('[data-word][data-tier]') ? [used] : [prompt, helper];
  let state = reader.read(doc);
  assert.equal(state.question, 'Name a greeting'); assert.equal(state.categoryId, 'round1::'); assert.deepEqual(state.used, ['hello']);
  assert.deepEqual(state.rarities,[{word:'hello',tier:'Deep Cut'}]);
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
async function testPanel(){
  class Node {
    constructor(tag){this.tagName=tag;this.children=[];this.style={setProperty(){}};this.dataset={};this.hidden=false;this.className='';this.text='';}
    set textContent(value){this.text=value;this.children=[];}get textContent(){return this.text+this.children.map(x=>x.textContent).join('');}
    append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}
    attachShadow(){this.shadow=new Node('shadow');return this.shadow;}
    addEventListener(){}getBoundingClientRect(){return {left:0,top:0};}setPointerCapture(){}
  }
  const body=new Node('body');const listeners={};let loop;
  let state={question:'Name a greeting',status:'Ready',answers:['salutations','hello'],rankedAnswers:[{word:'salutations',tier:'Deep Cut',source:'Game'},{word:'hello',tier:'Schooler',source:'AI estimate'}],usedCount:0,paused:false,autoPlay:false,autoPlayRevision:0};
  const window={};window.top=window;
  const context={window,document:{readyState:'complete',visibilityState:'visible',body,createElement:tag=>new Node(tag),addEventListener(type,handler){(listeners[type]??=[]).push(handler);}},location:{hash:'',pathname:'/party',search:''},history:{replaceState(){}},
    chrome:{runtime:{async sendMessage(message){if(message.type==='autoplay')state={...state,autoPlay:message.data.enabled,autoPlayRevision:state.autoPlayRevision+1};return {ok:true,data:{...state}};}}},
    PufferReader:{read:()=>({question:'Name a greeting',categoryId:'round',used:[],history:''}),normalize:reader.normalize},PufferAutoplay:{myTurn:()=>false,createController:()=>({step:()=> 'Waiting for turn',stop(){},reset(){}})},
    MutationObserver:class {observe(){}},setInterval:fn=>{loop=fn;},setTimeout:fn=>fn(),innerWidth:1600,innerHeight:1000,navigator:{clipboard:{async writeText(){}}}};
  vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('./panel-style.js'),'utf8'),context);vm.runInContext(fs.readFileSync(require.resolve('./content.js'),'utf8'),context);
  await loop();
  const panel=body.children[0].shadow.children.find(x=>x.className==='panel');
  const slime=panel.children.find(x=>x.className==='slime');assert.ok(slime,'Slime button missing');assert.equal(panel.children.indexOf(slime),1,'Slime button is below the answer list');
  const find=(node,predicate)=>predicate(node)?node:node.children.map(child=>find(child,predicate)).find(Boolean);
  assert.ok(find(panel,x=>x.text==='PUFFER v2.2.1 / LIVE'));
  assert.ok(find(panel,x=>x.className==='tier game'&&x.text==='GAME / Deep Cut'));
  await slime.onclick();assert.equal(slime.textContent,'SLIME THEM OUT / ON');
  const collapse=find(panel,x=>x.title==='Collapse panel');collapse.onclick();assert.equal(panel.children.find(x=>x.className==='body').hidden,true);assert.equal(slime.hidden,false,'Slime disappeared when collapsed');
  await slime.onclick();assert.equal(slime.textContent,'SLIME THEM OUT / OFF');
}
(async () => {testReader();await testWorker();await testAutoplay();testAutoplayController();await testPanel();console.log('PASS: your-puffer detection, pre-turn staging, bounded Enter, immediate rejection advance, repeated shake detection, next-turn preparation, manual text preservation, stop, not-your-turn handling; DOM/worker/panel checks.');})().catch(error => {console.error(error);process.exitCode = 1;});
