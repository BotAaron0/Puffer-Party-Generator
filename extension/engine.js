(function(root) {

  'use strict';

  const normalize=x=>String(x||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();

  const scores={'One in a Krillion':100,'Deep Cut':85,Rare:60,Schooler:30,'Too Clever':15,Plankton:10,Unrated:-1};

  const canonical=x=>Object.keys(scores).find(t=>normalize(t)===normalize(x))||'Unrated';

  class Engine {

    constructor(config,persist=()=>{},ai=root.PufferAI){this.config=config;this.persist=persist;this.ai=ai;this.states=new Map();}

    restore(id,saved) {

      const s={id,question:'',identity:'',answers:[],used:[],history:'',rarities:{},paused:false,autoPlay:false,autoPlayRevision:0,status:'Waiting for a category.',batches:0,lastRequest:0,lastBatch:0,retryAt:0,blocked:false,...saved,generating:false,controller:null};

      this.states.set(id,s);return s;

    }

    save(s){const {controller,...plain}=s;Promise.resolve(this.persist(plain)).catch(()=>{});}

    cancel(s){s.controller?.abort();s.controller=null;s.generating=false;}

    remove(id){const s=this.states.get(id);if(s)this.cancel(s);this.states.delete(id);}

    invalidate(){for(const s of this.states.values()){this.cancel(s);s.blocked=false;s.lastRequest=0;s.retryAt=0;s.status='Settings updated. Ready.';this.save(s);}}

    merge(s,items){for(const x of items){const word=String(x.word||'').trim().slice(0,100);if(!word||!normalize(word))continue;let tier=canonical(x.estimatedTier);if(['One in a Krillion','Too Clever'].includes(tier))tier='Unrated';const old=s.answers.find(a=>normalize(a.word)===normalize(word));if(!old)s.answers.push({word,tier});else if(scores[tier]>scores[old.tier])old.tier=tier;}this.save(s);}

    view(s){

      const used=new Set(s.used);let remaining=' '+normalize(s.history)+' ';

      for(const a of [...s.answers].sort((a,b)=>b.word.length-a.word.length)){const token=' '+normalize(a.word)+' ';if(remaining.includes(token)){used.add(normalize(a.word));remaining=remaining.split(token).join(' ');}}

      s.used=[...used];

      const rankedAnswers=s.answers.filter(x=>!used.has(normalize(x.word))).map(x=>{const game=s.rarities[normalize(x.word)];const tier=game||x.tier;return {word:x.word,tier,source:game?'Game':'AI estimate',score:scores[tier]};}).sort((a,b)=>b.score-a.score||Number(b.source==='Game')-Number(a.source==='Game'));

      return {question:s.question,status:s.status,answers:rankedAnswers.map(x=>x.word),rankedAnswers,usedCount:used.size,paused:s.paused,autoPlay:s.autoPlay,autoPlayRevision:s.autoPlayRevision,generating:s.generating,estimated:true,batches:s.batches,requiredExtensionVersion:'3.0.0'};

    }

    async handle(id,type,data){

      const s=this.states.get(id)||this.restore(id);

      if(type==='sync'){

        const question=String(data.question||'').trim().slice(0,2000),identity=normalize(question)+'|'+String(data.categoryId||'').slice(0,200);

        if(identity!==s.identity){this.cancel(s);Object.assign(s,{identity,question,answers:[],used:[],history:'',lastHistory:'',rarities:{},batches:0,blocked:false,retryAt:0,lastRequest:0,lastBatch:0,status:question?'Finding rare answers?':'Waiting for a category.'});}

        for(const word of (Array.isArray(data.used)?data.used:[]).slice(0,300)){const n=normalize(word);if(n&&!s.used.includes(n))s.used.push(n);}

        if(data.history && s.lastHistory!==String(data.history)){s.lastHistory=String(data.history);s.history=(s.history+'\n'+s.lastHistory).slice(-30000);}

        for(const item of (Array.isArray(data.rarities)?data.rarities:[]).slice(0,300))s.rarities[normalize(item.word)]=canonical(item.tier);

        const now=Date.now();

        if(s.question&&!s.paused&&!s.generating&&!s.blocked&&now>=s.retryAt&&(!s.answers.length||(data.continuous&&now-s.lastBatch>=18000&&s.answers.length<120)))this.start(s);

      } else if(type==='autoplay'){s.autoPlay=data.enabled===true;s.autoPlayRevision++;}

      else if(type==='mark'){const word=normalize(data.word);if(word&&!s.used.includes(word))s.used.push(word);}

      else if(type==='reset'){s.used=[];s.history='';}

      else if(type==='pause'){s.paused=!s.paused;if(s.paused)this.cancel(s);s.status=s.paused?'Paused.':'Ready.';}

      else if(type==='retry'){if(s.question&&!s.paused&&!s.generating&&Date.now()-s.lastRequest>=2000){s.blocked=false;s.retryAt=0;this.start(s);}}

      else throw new Error('Unknown operation');

      const result=this.view(s);this.save(s);return result;

    }

    start(s){

      if(s.generating||Date.now()-s.lastRequest<2000)return;

      const controller=new AbortController();s.controller=controller;s.generating=true;s.lastRequest=Date.now();s.status='Finding rare answers?';this.save(s);

      const current=()=>s.controller===controller&&!controller.signal.aborted;

      (async()=>{

        const config=await this.config();

        if(!config.key)throw new this.ai.ServiceError('Add your API key in AI settings (extension icon).');

        const excluded=[...s.answers.map(x=>x.word),...s.used];

        for(let attempt=0;attempt<3;attempt++){

          if(!current())return;

          const timeout=setTimeout(()=>controller.abort(),45000);

          try{

            const before=s.answers.length;

            const result=await this.ai.generate(config,s.question,excluded,items=>{if(current()){this.merge(s,items);s.status='Streaming rare answers?';}},controller.signal);

            if(!current())return;

            this.merge(s,result);s.batches++;s.lastBatch=Date.now();s.retryAt=0;

            s.blocked=s.answers.length===before;s.status=s.blocked?'No new valid suggestions. Retry AI to search again.':'Ready ? rarest first';return;

          }catch(error){

            if(!current())return;

            if(!error.retryable)throw error;

            s.status=error.message+' Automatic retry '+(attempt+1)+'/3.';

            if(attempt===2){s.retryAt=Date.now()+30000;s.lastBatch=0;s.status='AI busy. Cooling down 30 seconds before automatic retry.';return;}

          }finally{clearTimeout(timeout);}

          await new Promise(resolve=>{const timer=setTimeout(resolve,attempt===0?1000:3000);controller.signal.addEventListener('abort',()=>{clearTimeout(timer);resolve();},{once:true});});

        }

      })().catch(error=>{if(current()){s.status=error.message;s.blocked=true;}}).finally(()=>{

        if(s.controller===controller){if(controller.signal.aborted){s.status='AI request timed out. Automatic retry in 30 seconds.';s.retryAt=Date.now()+30000;s.lastBatch=0;}s.generating=false;s.controller=null;this.save(s);}

      });

    }

  }

  const api={Engine,normalize};root.PufferEngine=api;if(typeof module!=='undefined')module.exports=api;

})(globalThis);

