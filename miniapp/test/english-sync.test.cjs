const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {transformSync} = require('../node_modules/esbuild')
const base=path.resolve(__dirname,'../src/pkg-english')
function load(name) { const m={exports:{}};new Function('module','exports','require',transformSync(fs.readFileSync(path.join(base,name+'.ts'),'utf8'),{loader:'ts',format:'cjs'}).code)(m,m.exports,x=>load(x.replace('./',''))); return m.exports }
const s=load('sync-core'),c=load('core')
const event={wordId:'d1-01',mode:'zh-en',correct:false,at:1000}
const fresh=()=>s.createCache('account-a','device-a')
const record=(p)=>p.records['d1-01:zh-en']
let count=0
function test(name,fn){fn();count++;console.log('PASS',name)}
test('Account cache keys and parse isolate two accounts',()=>{
 assert.notEqual(s.cacheKey('account-a'),s.cacheKey('account-b'))
 assert.throws(()=>s.parseCache(fresh(),'account-b'))
 assert.throws(()=>s.parseCache(fresh()))
 assert.equal(s.parseCache(JSON.stringify(fresh()),'account-a').accountId,'account-a')
})
test('Reject mismatching server identity even stale response',()=>{
 const a=fresh();assert.throws(()=>s.mergeState(a,{...a.server,accountId:'account-b'}))
 assert.throws(()=>s.createCache('account-a','device-a',{...a.server,accountId:'account-b'}))
})
test('Draft correction does not double count and sequence allocated only on finalize',()=>{
 const a=fresh(),b=s.setDraft(a,event),d=s.setDraft(b,{...event,correct:true})
 assert.equal(record(s.projectProgress(b)).wrong,1)
 const r=record(s.projectProgress(d));assert.equal(r.wrong,0);assert.equal(r.correct,1)
 assert.equal(d.nextSeq,1);assert.equal(d.pending.length,0)
 const e=s.finalizeDraft(d);assert.equal(e.nextSeq,2);assert.equal(e.pending.length,1);assert.equal(e.draft,undefined)
 assert.equal(record(s.projectProgress(e)).correct,1)
 assert.deepEqual(s.finalizeDraft(e),e);assert.equal(a.draft,undefined)
 assert.deepEqual(s.projectProgress(s.setDraft(b,null)),c.emptyProgress())
})
test('Retry sends stable events and acknowledgment clears only acknowledged prefix',()=>{
 let a=s.finalizeDraft(s.setDraft(fresh(),event));a=s.finalizeDraft(s.setDraft(a,{...event,correct:true,at:2000}))
 const before=JSON.stringify(a);assert.deepEqual(s.nextBatch(a),s.nextBatch(a));assert.equal(JSON.stringify(a),before)
 const first=c.updateRecord(undefined,false,1000)
 const b=s.mergeState(a,{accountId:'account-a',version:1,progress:{version:1,records:{'d1-01:zh-en':first}},acknowledged:{'device-a':1}})
 assert.equal(b.pending.length,1);assert.equal(b.pending[0].seq,2);assert.equal(b.nextSeq,3)
 assert.equal(record(s.projectProgress(b)).wrong,1);assert.equal(record(s.projectProgress(b)).correct,1)
 const done=s.mergeState(b,{accountId:'account-a',version:2,progress:s.projectProgress(b),acknowledged:{'device-a':2}})
 assert.equal(done.pending.length,0);assert.deepEqual(s.projectProgress(done),s.projectProgress(b))
 assert.equal(a.pending.length,2)
})
test('Failed network and batch mutation cannot lose local queue',()=>{
 const a=s.finalizeDraft(s.setDraft(fresh(),event));const body=s.nextBatch(a)
 body.events[0].correct=true;body.events.length=0
 assert.equal(a.pending.length,1);assert.equal(a.pending[0].correct,false)
 assert.deepEqual(s.parseCache(JSON.stringify(a),'account-a'),a)
})
test('Overlapping server responses cannot roll state back or clear new draft',()=>{
 let a=s.finalizeDraft(s.setDraft(fresh(),event))
 a=s.mergeState(a,{accountId:'account-a',version:3,progress:s.projectProgress(a),acknowledged:{'device-a':1}})
 a=s.setDraft(a,{...event,correct:true,at:2000})
 const b=s.mergeState(a,{...fresh().server,version:2})
 assert.deepEqual(a,b)
 assert.throws(()=>s.mergeState(a,{...fresh().server,version:4}))
 assert.throws(()=>s.mergeState(a,{...a.server,version:4,acknowledged:{'device-a':2}}))
})
test('Strict cache schema rejects malformed events, gaps, unsafe keys and counters',()=>{
 for(const wrong of [null,{},[],{...fresh(),unknown:1},{...fresh(),nextSeq:2},{...fresh(),pending:[{...event,seq:2}]},{...fresh(),draft:{...event,correct:'false'}},{...fresh(),draft:{...event,at:-1}},{...fresh(),draft:{...event,wordId:'__proto__'}},{...fresh(),draft:{...event,mode:'other'}}]) assert.throws(()=>s.parseCache(wrong,'account-a'))
 assert.throws(()=>s.parseCache({...fresh(),server:{...fresh().server,progress:{version:1,records:{bad:{}}}}},'account-a'))
 assert.throws(()=>s.cacheKey(''))
})
test('Initial acknowledged device sequence continues and other-device state projects',()=>{
 const server={accountId:'account-a',version:9,progress:{version:1,records:{'d1-01:zh-en':c.updateRecord(undefined,true,1000)}},acknowledged:{'device-a':8,'device-b':3}}
 const a=s.createCache('account-a','device-a',server)
 assert.equal(a.nextSeq,9)
 const b=s.finalizeDraft(s.setDraft(a,{...event,correct:true,at:2000}))
 assert.equal(b.pending[0].seq,9);assert.equal(record(s.projectProgress(b)).correct,2)
 assert.equal(server.progress.records['d1-01:zh-en'].correct,1)
})
test('Queue and batch caps enforce bounded storage and upload',()=>{
 let a=fresh();a.pending=Array.from({length:s.MAX_PENDING},(_,i)=>({...event,seq:i+1}));a.nextSeq=s.MAX_PENDING+1
 assert.equal(s.nextBatch(a).events.length,50)
 assert.throws(()=>s.nextBatch(a,51));assert.throws(()=>s.finalizeDraft(s.setDraft(a,event)))
 assert.throws(()=>s.parseCache({...a,pending:[...a.pending,{...event,seq:a.nextSeq}],nextSeq:a.nextSeq+1},'account-a'))
})
console.log(`${count} sync tests passed`)
