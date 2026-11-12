const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const AI=require('./ai-client.js');
const {Engine}=require('./engine.js');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
  let request;
  const original=global.fetch;
  const text=JSON.stringify({answers:[{word:'salutations',estimatedTier:'Deep Cut'}]});
  global.fetch=async(url,options)=>{request={url,options};return new Response('data: '+JSON.stringify({candidates:[{content:{parts:[{text}]}}]})+'\n\n');};
  const key='test-key';let partial=[];
  const result=await AI.generate({provider:'Gemini',model:'test-model',key},'Name a greeting',[],items=>partial=items,new AbortController().signal);
  assert.equal(result[0].word,'salutations');assert.equal(partial.length,1);assert.equal(request.options.headers['x-goog-api-key'],key);assert.ok(!request.url.includes(key));
  global.fetch=async()=>new Response('data: '+JSON.stringify({candidates:[{content:{parts:[{text:text.slice(0,-2)}]}}]})+'\n\n');
  await assert.rejects(()=>AI.generate({provider:'Gemini',model:'test',key},'q',[],()=>{},new AbortController().signal),e=>e.retryable===true);
  for(const [status,error,expected] of [
    [400,{status:'INVALID_ARGUMENT',message:'Unknown name thinkingLevel at generationConfig'},/request rejected.*thinkingLevel/],
    [400,{status:'INVALID_ARGUMENT',message:'API key not valid.',details:[{reason:'API_KEY_INVALID'}]},/API key rejected/],
    [403,{status:'PERMISSION_DENIED',message:'Requests from this referrer are blocked.',details:[{reason:'API_KEY_HTTP_REFERRER_BLOCKED'}]},/restrictions blocked/],
    [403,{status:'PERMISSION_DENIED',message:'API disabled.',details:[{reason:'SERVICE_DISABLED'}]},/API is disabled/],
    [404,{status:'NOT_FOUND',message:'Model test not found.'},/Model unavailable/]
  ]){
    const err=await AI.responseError(Response.json({error},{status}),{provider:'Gemini',key});assert.match(err.message,expected);assert.match(err.message,new RegExp('HTTP '+status));assert.equal(err.retryable,false);
  }
  const safe=await AI.responseError(Response.json({error:{message:'Invalid credential '+key+' AIzaFakeSecret0000000000000'}},{status:400}),{provider:'Gemini',key});assert.ok(!safe.message.includes(key));assert.ok(!safe.message.includes('AIzaFakeSecret'));
  global.fetch=async()=>new Response('{}',{status:503});await assert.rejects(()=>AI.generate({provider:'Gemini',model:'test',key},'q',[],()=>{},new AbortController().signal),e=>e.retryable===true);
  global.fetch=async()=>new Response('{}',{status:429});await assert.rejects(()=>AI.generate({provider:'Gemini',model:'test',key},'q',[],()=>{},new AbortController().signal),e=>e.retryable===false);
  global.fetch=async(url,options)=>{request={url,options};return Response.json({status:'completed',output:[{content:[{type:'output_text',text}]}]});};
  await AI.generate({provider:'OpenAI',model:'test',key},'q',[],()=>{},new AbortController().signal);assert.equal(request.options.headers.Authorization,'Bearer '+key);assert.equal(request.url,'https://api.openai.com/v1/responses');global.fetch=original;
  let saved;
  const mockAI={ServiceError:AI.ServiceError,generate:async()=>[{word:'hello',estimatedTier:'Schooler'},{word:'salutations',estimatedTier:'Deep Cut'},{word:'hiya',estimatedTier:'One in a Krillion'}]};
  const engine=new Engine(async()=>({key}),s=>{saved=JSON.parse(JSON.stringify(s));},mockAI);
  await engine.handle(1,'sync',{question:'Name a greeting',categoryId:'round1'});await flush();
  let state=await engine.handle(1,'sync',{question:'Name a greeting',categoryId:'round1',used:['salutations'],rarities:[{word:'hello',tier:'One in a Krillion'}]});
  assert.equal(state.answers[0],'hello');assert.equal(state.rankedAnswers[0].source,'Game');assert.ok(!state.answers.includes('salutations'));assert.equal(state.rankedAnswers.find(x=>x.word==='hiya').tier,'Unrated');assert.ok(!JSON.stringify(state).includes(key));
  await engine.handle(2,'sync',{question:'Name a greeting',categoryId:'round1'});await flush();assert.ok(engine.view(engine.states.get(2)).answers.includes('salutations'),'Per-tab used words leaked');
  await engine.handle(1,'sync',{question:'Name a greeting',categoryId:'round2'});await flush();assert.ok(engine.view(engine.states.get(1)).answers.includes('salutations'),'Used words survived category change');
  const resumed=new Engine(async()=>({key}),()=>{},mockAI);resumed.restore(saved.id,saved);assert.equal(resumed.view(resumed.states.get(saved.id)).question,saved.question);
  const missing=new Engine(async()=>({}),()=>{},mockAI);await missing.handle(1,'sync',{question:'Q'});await flush();assert.match(missing.view(missing.states.get(1)).status,/API key/);
  let listener;const session={},local={};const storage=object=>({get:async key=>({[key]:object[key]}),set:async data=>Object.assign(object,data),remove:async key=>{delete object[key];}});
  const chrome={runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:fn=>listener=fn},onConnect:{addListener(){}}},tabs:{onRemoved:{addListener(){}}},storage:{session:storage(session),local:storage(local)}};
  vm.runInNewContext(fs.readFileSync(require.resolve('./background.js'),'utf8'),{chrome,importScripts(){},PufferAI:mockAI,PufferEngine:{Engine},URL,Map,Error,Number,AbortController,setTimeout,clearTimeout});
  const sender={id:'test',tab:{id:99},url:'chrome-extension://test/popup.html'};const message=(data,from=sender)=>new Promise(resolve=>listener(data,from,resolve));
  assert.equal((await message({type:'settings-save',data:{provider:'Gemini',model:'test',key,remember:true}})).ok,true);assert.equal(local.aiConfig.key,key);
  assert.match((await message({type:'settings-test'})).data.message,/connection successful/);
  const page={url:'https://krillion.io/party',frameId:0,tab:{id:7}};
  assert.equal((await message({type:'settings-load'},page)).ok,false,'Game page could read key');
  assert.equal((await message({type:'settings-save',data:{provider:'Gemini',model:'test',key,remember:false}})).ok,true);assert.equal(local.aiConfig,undefined);assert.equal(session.aiConfig.key,key);
  console.log('PASS: direct Gemini/OpenAI requests, streaming without STOP, partial-stream/503/quota handling, ranking, category/tab isolation, session restore, missing-key guidance and credential access boundaries.');
})().catch(error=>{console.error(error);process.exitCode=1;});
