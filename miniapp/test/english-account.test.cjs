const assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path')
const {transformSync}=require('../node_modules/esbuild')
const root=path.resolve(__dirname,'../src/pkg-english')
const clone=v=>JSON.parse(JSON.stringify(v))
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
const tick=()=>new Promise(r=>setImmediate(r))
const state=(accountId,version=0,records={},acknowledged={})=>({accountId,version,progress:{version:1,records},acknowledged})
const answer={wordId:'d1-01',mode:'zh-en',correct:false,at:1000}
function setup(initial='A'){
 let account=initial,failStorage=false,getHook=null,postHook=null
 const storage=new Map(),calls=[]
 class ApiError extends Error {constructor(status,message){super(message);this.status=status}}
 const uni={getStorageSync:key=>storage.get(key)||'',setStorageSync:(key,value)=>{if(failStorage)throw Error('quota');storage.set(key,value)},showModal:args=>args.success({confirm:true})}
 const api={me:{get:(url)=>{calls.push({method:'get',url});return getHook?getHook(url):Promise.resolve(state(account))},post:(url,body)=>{calls.push({method:'post',url,body:clone(body)});return postHook?postHook(url,body):Promise.reject(Error('post not configured'))}}}
 const modules={}
 function load(name){
  if(modules[name])return modules[name]
  const m={exports:{}}
  const js=transformSync(fs.readFileSync(path.join(root,name+'.ts'),'utf8'),{loader:'ts',format:'cjs',define:{'import.meta.env.VITE_BACKEND':'"cloud"'}}).code
  new Function('module','exports','require','uni',js)(m,m.exports,x=>x==='vue'?{ref:value=>({value}),computed:fn=>({get value(){return fn()}})}:x==='../utils/request'?{api,ApiError}:load(x.replace('./','')),uni)
  modules[name]=m.exports;return m.exports
 }
 const syncCore=load('sync-core'),core=load('core'),ui=load('use-account-sync').useAccountSync()
 return {ui,storage,calls,core,syncCore,ApiError,setAccount:a=>{account=a},setGet:f=>{getHook=f},setPost:f=>{postHook=f},failStorage:v=>{failStorage=v}}
}
let total=0
async function test(name,fn){await fn();total++;console.log('PASS',name)}
async function main(){
 await test('Late account A open cannot overwrite newer account B',async()=>{
  const h=setup(),a=deferred();let first=true
  h.setGet(()=>{if(first){first=false;return a.promise}return Promise.resolve(state('B'))})
  const old=h.ui.open();await h.ui.open();assert.equal(h.ui.cache.value.accountId,'B')
  a.resolve(state('A'));await old
  assert.equal(h.ui.cache.value.accountId,'B');assert.equal(h.storage.has(h.syncCore.cacheKey('A')),false)
 })
 await test('Close clears visible state and ignores delayed sync response',async()=>{
  const h=setup();await h.ui.open();const reply=deferred();h.setPost(()=>reply.promise)
  assert.equal(h.ui.setAnswer(answer),true);h.ui.finishAnswer();const body=h.calls.find(x=>x.method==='post').body
  h.ui.close();assert.equal(h.ui.ready.value,false);assert.deepEqual(h.ui.progress.value,h.core.emptyProgress());assert.equal(h.ui.exportData(),'')
  reply.resolve(state('A',1,{'d1-01:zh-en':h.core.updateRecord(undefined,false,1000)},{[body.deviceId]:1}));await tick()
  assert.equal(h.ui.cache.value,null)
  const saved=JSON.parse(h.storage.get(h.syncCore.cacheKey('A')));assert.equal(saved.pending.length,1)
 })
 await test('New events during sync survive first acknowledgment and upload next',async()=>{
  const h=setup();await h.ui.open();const first=deferred(),second=deferred();let n=0
  h.setPost(()=>++n===1?first.promise:second.promise)
  h.ui.setAnswer(answer);h.ui.finishAnswer();const one=h.calls.filter(x=>x.method==='post')[0].body
  h.ui.setAnswer({...answer,correct:true,at:2000});h.ui.finishAnswer();assert.equal(h.ui.pendingCount.value,2)
  const r1=h.core.updateRecord(undefined,false,1000)
  first.resolve(state('A',1,{'d1-01:zh-en':r1},{[one.deviceId]:1}));await tick()
  const two=h.calls.filter(x=>x.method==='post')[1].body;assert.deepEqual(two.events.map(e=>e.seq),[2]);assert.equal(h.ui.cache.value.pending.length,1)
  second.resolve(state('A',2,{'d1-01:zh-en':h.core.updateRecord(r1,true,2000)},{[one.deviceId]:2}));await h.ui.sync()
  assert.equal(h.ui.pendingCount.value,0);assert.equal(h.ui.progress.value.records['d1-01:zh-en'].correct,1);assert.equal(h.ui.progress.value.records['d1-01:zh-en'].wrong,1)
 })
 await test('Network failure retains durable pending and retries identical sequence',async()=>{
  const h=setup();await h.ui.open();h.setPost(()=>Promise.reject(Error('offline')))
  h.ui.setAnswer(answer);h.ui.finishAnswer();await h.ui.sync()
  assert.equal(h.ui.cache.value.pending.length,1);const first=h.calls.filter(x=>x.method==='post')[0].body
  await h.ui.sync();const last=h.calls.filter(x=>x.method==='post').at(-1).body
  assert.deepEqual(last,first);assert.equal(JSON.parse(h.storage.get(h.syncCore.cacheKey('A'))).pending.length,1)
 })
 await test('Storage failure rejects answer without mutating visible or durable progress',async()=>{
  const h=setup();await h.ui.open();const before=h.ui.exportData();h.failStorage(true)
  assert.equal(h.ui.setAnswer(answer),false);assert.equal(h.ui.cache.value.draft,undefined);assert.equal(h.ui.pendingCount.value,0)
  assert.deepEqual(h.ui.progress.value,h.core.emptyProgress());assert.ok(h.ui.warning.value)
  assert.equal(JSON.parse(before).cache.nextSeq,h.ui.cache.value.nextSeq)
 })
 await test('Legacy claim binds before request; failed import retries same account/id only',async()=>{
  const h=setup();const legacy={version:1,records:{'d1-01:zh-en':h.core.updateRecord(undefined,false,1000)}}
  h.storage.set(h.core.STORAGE_KEY,JSON.stringify(legacy));await h.ui.open();assert.equal(h.ui.legacyAvailable.value,true)
  h.setPost(()=>Promise.reject(Error('request failed')));assert.equal(await h.ui.importLegacy(),false)
  const claim=JSON.parse(h.storage.get('english-legacy-import-v1'));assert.equal(claim.accountId,'A')
  assert.equal(await h.ui.importLegacy(),false)
  const requests=h.calls.filter(x=>x.url==='/me/english/import');assert.equal(requests.length,2);assert.equal(requests[0].body.importId,requests[1].body.importId)
  h.ui.close();h.setAccount('B');await h.ui.open();assert.equal(h.ui.legacyAvailable.value,false)
  assert.equal(await h.ui.importLegacy(),false);assert.equal(h.calls.filter(x=>x.url==='/me/english/import').length,2)
  assert.equal(h.storage.get(h.core.STORAGE_KEY),JSON.stringify(legacy))
 })
 await test('Unfinished draft cannot be replaced by a new question but permits correction',async()=>{
  const h=setup();await h.ui.open();assert.equal(h.ui.setAnswer(answer),true)
  for(const changed of [{...answer,wordId:'d1-02'},{...answer,mode:'en-zh'},{...answer,at:2000}]) assert.equal(h.ui.setAnswer(changed),false)
  assert.deepEqual(h.ui.cache.value.draft,answer)
  assert.equal(h.ui.setAnswer({...answer,correct:true}),true)
  assert.equal(h.ui.progress.value.records['d1-01:zh-en'].correct,1)
  assert.equal(h.ui.progress.value.records['d1-01:zh-en'].wrong,0)
  assert.equal(h.ui.pendingCount.value,1)
 })
 await test('Identity mismatch during sync hides old account instead of exposing response',async()=>{
  const h=setup();await h.ui.open();h.setGet(()=>Promise.resolve(state('B',1)))
  await h.ui.sync();assert.equal(h.ui.ready.value,false);assert.equal(h.ui.cache.value,null);assert.deepEqual(h.ui.progress.value,h.core.emptyProgress())
 })
 await test('Server conflict is visible and queued events remain durable',async()=>{
  const h=setup();await h.ui.open();h.setPost(()=>Promise.reject(new h.ApiError(409,'sequence gap')))
  h.ui.setAnswer(answer);h.ui.finishAnswer();await h.ui.sync()
  assert.equal(h.ui.cache.value.pending.length,1);assert.ok(h.ui.warning.value.includes('409'));assert.ok(h.ui.warning.value.includes('sequence gap'))
 })
 await test('Completed legacy import remains hidden on a later verified open',async()=>{
  const h=setup();const legacy={version:1,records:{'d1-01:zh-en':h.core.updateRecord(undefined,true,1000)}}
  h.storage.set(h.core.STORAGE_KEY,legacy);await h.ui.open()
  h.setPost(()=>Promise.resolve(state('A',1,legacy.records)))
  assert.equal(await h.ui.importLegacy(),true);await tick();h.ui.close();await tick();await h.ui.open()
  assert.equal(h.ui.legacyAvailable.value,false);assert.equal(JSON.parse(h.storage.get('english-legacy-import-v1')).completed,true)
  assert.equal(await h.ui.importLegacy(),true);assert.equal(h.calls.filter(x=>x.url==='/me/english/import').length,1)
 })
 console.log(`${total} account integration tests passed`)
}
main().catch(e=>{console.error(e);process.exitCode=1})
