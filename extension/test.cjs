const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const reader = require('./reader.js');
const autoplay = require('./autoplay.js');
const grindApi=require('./grind.js');
function testGrindJoining(){
  let clicks=0,enabled=true,text='Join next';
  const doc={defaultView:{getComputedStyle:()=>({display:'block',visibility:'visible'})}};
  const button={ownerDocument:doc,tagName:'BUTTON',get disabled(){return !enabled;},get innerText(){return text;},getAttribute:()=>null,closest:()=>null,getBoundingClientRect:()=>({width:140,height:30}),click(){clicks++;}};
  doc.querySelectorAll=()=>[button];const controller=grindApi.createController();
  assert.equal(controller.step(doc,false,0),false);assert.equal(controller.step(doc,true,0),true);assert.equal(clicks,1);
  assert.equal(controller.step(doc,true,100),false,'Repeated join clicks');assert.equal(controller.step(doc,true,5000),true);
  enabled=false;assert.equal(controller.step(doc,true,10000),false);enabled=true;text='Join lobby';assert.equal(controller.step(doc,true,10000),false,'Clicked unrelated Join button');
  text='Join next game →';assert.equal(controller.step(doc,true,10000),true);
}
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
  const controller=autoplay.createController(()=>.5),words=['salutations','hello','hi','good morning'];
  controller.setDelay(300);
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
  controller.stop(doc);input.value='';showError=false;turn='Your puffer';controller.setDelay(1000);controller.step(doc,words,true,'round4',5000);const before=submits;
  showError=true;errorText='Invalid answer';controller.step(doc,words,true,'round4',5500);assert.equal(submits,before,'Slider delay ignored after rejection');assert.equal(input.value,'salutations');
  controller.step(doc,words,true,'round4',6000);assert.equal(submits,before+1);assert.equal(input.value,'hello');
  controller.stop(doc);input.value='';showError=false;clearOnSubmit=false;
  const letters=autoplay.createController(()=>.5);letters.setLetterMode(true);letters.setLetterDelay(120);const initial=submits;
  turn='Waiting for another player';letters.step(doc,['hello'],true,'letters',9800);assert.equal(input.value,'');assert.equal(letters.timing.dueAt,null,'Prepared letters before the Type cue');
  turn='Your puffer';input.placeholder='Answer';letters.step(doc,['hello'],true,'letters',9900);assert.equal(input.value,'');assert.equal(letters.timing.dueAt,null,'Your puffer without Type incorrectly started letters');
  turn='Your puffer—TYPE!';assert.equal(autoplay.typeCue(doc),true);
  assert.equal(letters.timing.wpm,100);letters.step(doc,['hello'],true,'letters',10000);assert.equal(input.value,'');
  letters.step(doc,['hello'],true,'letters',10119);assert.equal(input.value,'','Typed before letter delay');
  letters.step(doc,['hello'],true,'letters',10120);assert.equal(input.value,'h');
  letters.step(doc,['hello'],true,'letters',10240);assert.equal(input.value,'he');
  turn='Answer';letters.step(doc,['hello'],true,'letters',10360);assert.equal(input.value,'hel','Disappearing Type hint interrupted an already confirmed word');turn='Type';
  letters.step(doc,['hello'],true,'letters',10480);assert.equal(input.value,'hell');
  letters.step(doc,['hello'],true,'letters',10600);assert.equal(input.value,'hello');assert.equal(submits,initial,'Submitted a partial word');
  letters.step(doc,['hello'],true,'letters',10620);assert.equal(submits,initial+1);
  letters.reset(doc,'cancel');letters.step(doc,['hello'],true,'cancel',11000);letters.step(doc,['hello'],true,'cancel',11120);assert.equal(input.value,'h');turn='Waiting for another player';letters.step(doc,['hello'],true,'cancel',11130);assert.equal(input.value,'','Typing continued after Type cue disappeared');letters.stop(doc);assert.equal(input.value,'','Stop left a partial word');
  letters.step(doc,['hello'],false,'cancel',11240);assert.equal(input.value,'');
  turn='Type in the textbox';let jitter=0;const varying=autoplay.createController(()=>jitter);varying.setLetterMode(true);varying.setLetterDelay(120);varying.step(doc,['hello'],true,'varying',12000);assert.equal(varying.timing.dueAt,12102);
  jitter=1;varying.step(doc,['hello'],true,'varying',12102);assert.equal(varying.timing.dueAt,12240,'Letter timing does not vary by ±15%');
  input.value='manual';varying.step(doc,['hello'],true,'varying',12240);assert.equal(input.value,'manual','Typing overwrote manual edits');
  input.value='';doc.visibilityState='hidden';let backgroundFocus=0;input.focus=()=>backgroundFocus++;autoplay.createController().step(doc,['hi'],true,'background',13000);assert.equal(backgroundFocus,0,'Background Autofill stole focus');
}
function testKeyboardGuard(){
  const handlers={},input={ownerDocument:null,placeholder:'Answer',id:'',className:'',getAttribute:()=>null,closest:()=>null,getBoundingClientRect:()=>({width:200,height:30})};
  let enabled=true;
  const doc={body:{},activeElement:input,defaultView:{getComputedStyle:()=>({display:'block',visibility:'visible'}),addEventListener(type,handler){handlers[type]=handler;},removeEventListener(){}},querySelectorAll:()=>[input]};input.ownerDocument=doc;
  autoplay.installKeyboardGuard(doc,()=>enabled);
  const event=(type,key,target=input,trusted=true,extra={})=>({type,key,target,isTrusted:trusted,prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra});
  const key=event('keydown','a');handlers.keydown(key);assert.ok(key.prevented&&key.stopped,'Physical letters not blocked');
  const enter=event('keydown','Enter');handlers.keydown(enter);assert.equal(enter.prevented,true,'Physical Enter not blocked');
  const synthetic=event('keydown','Enter',input,false);handlers.keydown(synthetic);assert.equal(synthetic.prevented,false,'Blocked extension-generated Enter');
  const escape=event('keydown','Escape');handlers.keydown(escape);assert.equal(escape.prevented,false,'Blocked emergency Escape');
  const shortcut=event('keydown','l',input,true,{ctrlKey:true});handlers.keydown(shortcut);assert.equal(shortcut.prevented,false,'Blocked browser shortcut');
  const elsewhere=event('keydown','a',{});handlers.keydown(elsewhere);assert.equal(elsewhere.prevented,false,'Blocked typing outside game textbox');
  const before=event('beforeinput','');handlers.beforeinput(before);assert.equal(before.prevented,true,'Physical input mutation not blocked');
  enabled=false;const restored=event('keydown','a');handlers.keydown(restored);assert.equal(restored.prevented,false,'Keyboard not restored when mode off');
}
function testPufferTypePrompt(){
  const doc={defaultView:{getComputedStyle:()=>({display:'block',visibility:'visible'})}};
  const node=(text,children=0)=>({ownerDocument:doc,innerText:text,childElementCount:children,closest:()=>null,getBoundingClientRect:()=>({width:240,height:30})});
  let nodes=[];doc.querySelectorAll=selector=>selector.startsWith('input')?[]:nodes;
  for(const text of ['Your puffer- type!','YOUR PUFFER — TYPE!','🐡 Your puffer – Type!','It’s your puffer: type now','Your turn — type!']){
    nodes=[node('Waiting for another player'),node(text,2)];assert.equal(autoplay.typeCue(doc),true,'Failed split/dashed prompt: '+text);
  }
  for(const text of ['Not your puffer — type when ready','Waiting for your puffer, type later',"Alex’s puffer — type!"]){nodes=[node(text)];assert.equal(autoplay.typeCue(doc),false,'Accepted someone else/waiting prompt: '+text);}
}
function testAutoRefresh(){
  const tracker=autoplay.createRefillTracker(),words=Array.from({length:10},(_,i)=>'word'+i);
  assert.equal(tracker.shouldRefresh('round',words,new Set(words.slice(0,5)),true,0),false,'Refreshed below 60%');
  assert.equal(tracker.shouldRefresh('round',words,new Set(words.slice(0,6)),true,10),true,'Did not refresh at 60%');
  assert.equal(tracker.shouldRefresh('round',words,new Set(words),true,20),false,'Refresh storm');
  assert.equal(tracker.shouldRefresh('round',words,new Set(words),true,15010),true,'Exhausted list never retries after cooldown');
  const fresh=Array.from({length:6},(_,i)=>'fresh'+i);assert.equal(tracker.shouldRefresh('next',fresh,new Set(words),true,60000),false,'Category retained old progress');
  assert.equal(tracker.shouldRefresh('next',fresh,new Set(fresh),false,60001),false,'Refreshed while paused/busy');
  const low=autoplay.createRefillTracker();assert.equal(low.shouldRefresh('low',['a','b','c','d','e'],new Set(),true,0),false,'Refilled at exactly five');assert.equal(low.shouldRefresh('low',['a','b','c','d'],new Set(),true,10),true,'No refill below five unused');assert.equal(low.shouldRefresh('low',['a','b','c','d'],new Set(),true,20),false,'Low-water refill storm');
}
function testRandomDelay(){
  const values=[0,.25,.5,.75,1];let i=0;
  const controller=autoplay.createController(()=>values[i++%values.length]);
  const samples=values.map(()=>{controller.setDelay(1000);return controller.timing.next;});
  assert.deepEqual(samples,[850,925,1000,1075,1150]);
  assert.equal(samples.reduce((a,b)=>a+b,0)/samples.length,1000,'Random delay is not centered on slider');
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
  let portListener,pulse,tabSetting,cleared=0;
  const chrome = {runtime: {onMessage: {addListener: fn => listener = fn},onConnect:{addListener:fn=>portListener=fn}}, tabs: {onRemoved: {addListener() {}},get:async()=>({autoDiscardable:true}),update:async(id,setting)=>{tabSetting=setting.autoDiscardable;}}, storage: {session: {
    async set(data) {Object.assign(storage, data);}, async get(key) {return {[key]: storage[key]};}, async remove(key) {delete storage[key];}
  }}};
  const context = {chrome, URL, Map, Number, Error, JSON, AbortController, setTimeout, clearTimeout,setInterval:fn=>{pulse=fn;return 1;},clearInterval(){cleared++;},
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
  assert.equal((await message({type:'grind',data:{enabled:true}})).data.enabled,true);assert.equal(tabSetting,false);
  let sent=0;const port={name:'puffer-grind',sender,onDisconnect:{addListener(){}},postMessage(data){if(data.type==='grind-pulse')sent++;},disconnect(){}};portListener(port);await new Promise(resolve=>setImmediate(resolve));assert.ok(pulse);pulse();assert.ok(sent>0,'Background grind pulse missing');
  assert.equal((await message({type:'grind',data:{enabled:false}})).data.enabled,false);assert.equal(tabSetting,true,'Tab discard setting not restored');assert.ok(cleared>0,'Background pulse continued after Grind stopped');
}
async function testPanel(){
  class Node {
    constructor(tag){this.tagName=tag;this.children=[];this.style={setProperty(name,value){this[name]=value;}};this.dataset={};this.hidden=false;this.className='';this.text='';}
    set textContent(value){this.text=value;this.children=[];}get textContent(){return this.text+this.children.map(x=>x.textContent).join('');}
    append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}
    attachShadow(){this.shadow=new Node('shadow');return this.shadow;}
    setAttribute(name,value){this[name]=value;}addEventListener(){}getBoundingClientRect(){return {left:0,top:0};}setPointerCapture(){}
  }
  const body=new Node('body');const listeners={};let loop,savedDelay,savedLetterDelay,savedLetterMode,steps=0;
  let state={question:'Name a greeting',status:'Ready',answers:['salutations','hello'],rankedAnswers:[{word:'salutations',tier:'Deep Cut',source:'Game'},{word:'hello',tier:'Schooler',source:'AI estimate'}],usedCount:0,paused:false,autoPlay:false,autoPlayRevision:0};
  const window={};window.top=window;
  const context={window,document:{readyState:'complete',visibilityState:'visible',body,createElement:tag=>new Node(tag),addEventListener(type,handler){(listeners[type]??=[]).push(handler);}},location:{hash:'',pathname:'/party',search:''},history:{replaceState(){}},
    chrome:{runtime:{async sendMessage(message){if(message.type==='grind-state')return {ok:true,data:{enabled:false}};if(message.type==='grind')return {ok:true,data:{enabled:message.data.enabled}};if(message.type==='autoplay')state={...state,autoPlay:message.data.enabled,autoPlayRevision:state.autoPlayRevision+1};return {ok:true,data:{...state}};},connect(){return {onMessage:{addListener(){}},onDisconnect:{addListener(){}},disconnect(){}};}}},
    PufferReader:{read:()=>({question:'Name a greeting',categoryId:'round',used:[],history:''}),normalize:reader.normalize},PufferGrind:{createController:()=>({step:()=>false})},PufferAutoplay:{myTurn:()=>false,installKeyboardGuard(){},typingRate:autoplay.typingRate,createRefillTracker:autoplay.createRefillTracker,createController:()=>({step(){steps++;return 'Waiting for turn';},stop(){},reset(){},setDelay(value){savedDelay=value;},setLetterMode(value){savedLetterMode=value;},setLetterDelay(value){savedLetterDelay=value;}})},
    MutationObserver:class {observe(){}},setInterval:fn=>{loop=fn;},setTimeout:fn=>fn(),innerWidth:1600,innerHeight:1000,navigator:{clipboard:{async writeText(){}}}};
  vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('./panel-style.js'),'utf8'),context);vm.runInContext(fs.readFileSync(require.resolve('./content.js'),'utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));
  await loop();
  const panel=body.children[0].shadow.children.find(x=>x.className==='panel');
  const slime=panel.children.find(x=>x.className==='slime');assert.ok(slime,'Slime button missing');assert.equal(panel.children.indexOf(slime),1,'Slime button is below the answer list');
  const find=(node,predicate)=>predicate(node)?node:node.children.map(child=>find(child,predicate)).find(Boolean);
  assert.ok(find(panel,x=>x.text==='PUFFER v2.3 / GRIND'));
  assert.ok(find(panel,x=>x.text==='Retry AI'),'Manual Retry AI button missing');
  assert.ok(find(panel,x=>x.className==='tier game'&&x.text==='GAME / Deep Cut'));
  const slider=find(panel,x=>x.type==='range');assert.ok(slider);slider.value='1500';slider.oninput();assert.equal(savedDelay,1500,'Enter slider did not update controller');
  const letterSlider=find(panel,x=>x.type==='range'&&x.min==='20');assert.ok(letterSlider);assert.equal((Number(letterSlider.min)+Number(letterSlider.max))/2,Number(letterSlider.value));assert.equal(autoplay.typingRate(letterSlider.value),100,'Slider midpoint is not exactly 100 WPM');assert.equal(letterSlider.disabled,true);
  const letterButton=find(panel,x=>x.text==='Letter by letter');letterButton.onclick();assert.equal(savedLetterMode,true);assert.equal(savedLetterDelay,120);assert.equal(letterSlider.disabled,false);letterSlider.value='200';letterSlider.oninput();assert.equal(savedLetterDelay,200);
  await slime.onclick();assert.equal(slime.textContent,'Autofill');assert.equal(slime['aria-pressed'],'true');
  const collapse=find(panel,x=>x.title==='Collapse panel');collapse.onclick();assert.equal(panel.children.find(x=>x.className==='body').hidden,true);assert.equal(slime.hidden,true);assert.equal(collapse.textContent,'+');assert.equal(body.children[0].style.width,'36px','Collapsed panel is not a tiny box');collapse.onclick();assert.equal(slime.hidden,false);assert.equal(body.children[0].style.width,'340px');
  await slime.onclick();assert.equal(slime.textContent,'Autofill');assert.equal(slime['aria-pressed'],'false');
  const grind=find(panel,x=>x.text==='Grind mode');await grind.onclick();assert.equal(grind['aria-pressed'],'true');context.document.visibilityState='hidden';const priorSteps=steps;await loop();assert.ok(steps>priorSteps,'Grind did not run on a hidden tab');await grind.onclick();assert.equal(grind['aria-pressed'],'false');
}
(async () => {testReader();await testWorker();await testAutoplay();testAutoplayController();testAutoRefresh();testRandomDelay();testKeyboardGuard();testPufferTypePrompt();testGrindJoining();await testPanel();console.log('PASS: Join next matching/cooldown, Grind background pulse/discard-setting restoration, hidden-tab Autofill, fewer-than-five refill; existing turn/typing/keyboard/AI-worker/panel checks.');})().catch(error => {console.error(error);process.exitCode = 1;});
