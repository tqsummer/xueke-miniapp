'use strict'
const {createHash}=require('node:crypto')
const WORD_IDS=new Set(require('./english-word-ids.json'))
const MAX_BYTES=900000, MAX_NUMBER=1000000000, MAX_TIME=8640000000000000
const accountId=openid=>createHash('sha256').update('english:'+openid).digest('hex').slice(0,32)
const fail=(status,error)=>{const e=new Error(error);e.status=status;throw e}
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const integer=(v,max=MAX_NUMBER)=>Number.isSafeInteger(v)&&v>=0&&v<=max
const keys=(o,allowed)=>object(o)&&Object.keys(o).every(k=>allowed.includes(k))
const identifier=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v)
const initial=()=>({version:0,progress:{version:1,records:{}},acknowledged:{},receipts:{},imports:[]})
const state=(id,d)=>({accountId:id,version:d.version,progress:d.progress,acknowledged:d.acknowledged})
function checked(d){if(Buffer.byteLength(JSON.stringify(d),'utf8')>MAX_BYTES)fail(413,'学习记录达到容量限制');return d}
function recordKey(k){const i=k.lastIndexOf(':');return WORD_IDS.has(k.slice(0,i))&&['zh-en','en-zh'].includes(k.slice(i+1))}
function validRecord(v){return keys(v,['correct','wrong','streak','due','last','mistake'])&&['correct','wrong','streak','due','last','mistake'].every(k=>Object.hasOwn(v,k))&&integer(v.correct)&&integer(v.wrong)&&integer(v.streak,5)&&integer(v.due,MAX_TIME)&&integer(v.last,MAX_TIME)&&typeof v.mistake==='boolean'}
function update(old,correct,now){const streak=correct?Math.min((old?.streak||0)+1,5):0;const n={correct:(old?.correct||0)+Number(correct),wrong:(old?.wrong||0)+Number(!correct),streak,due:now+(correct?[1,3,7,14,30][streak-1]*86400000:600000),last:now,mistake:!correct};if(!validRecord(n))fail(413,'学习计数达到限制');return n}
const fingerprint=e=>createHash('sha256').update(JSON.stringify([e.seq,e.wordId,e.mode,e.correct,e.at])).digest('hex').slice(0,16)
function createEnglishApi(store,clock=Date.now){return async function({openid,method,path,body={}}){try{
 if(typeof openid!=='string'||!openid)fail(401,'登录已失效')
 const id=accountId(openid)
 if(method==='GET'&&path==='/me/english/state')return {status:200,data:state(id,(await store.read(id))||initial())}
 if(method!=='POST'||!['/me/english/sync','/me/english/import'].includes(path))fail(404,'没有这个接口')
 if(!object(body)||body.accountId!==id)fail(403,'账号已变化，请重新载入')
 if(Buffer.byteLength(JSON.stringify(body),'utf8')>MAX_BYTES)fail(413,'请求过大')
 let next
 if(path==='/me/english/sync'){
  if(!keys(body,['accountId','deviceId','events'])||!identifier(body.deviceId)||!Array.isArray(body.events)||body.events.length>50)fail(400,'同步参数不合法')
  const events=body.events,device=body.deviceId
  for(let i=0;i<events.length;i++){const e=events[i];if(!keys(e,['seq','wordId','mode','correct','at'])||!integer(e.seq)||e.seq<1||!WORD_IDS.has(e.wordId)||!['zh-en','en-zh'].includes(e.mode)||typeof e.correct!=='boolean'||!integer(e.at,MAX_TIME))fail(400,'答题事件不合法');if(i&&e.seq!==events[i-1].seq+1)fail(409,'事件序号不连续')}
  const now=clock()
  next=await store.transact(id,previous=>{const d=previous||initial();let ack=d.acknowledged[device]||0;let changed=false
   if(!Object.hasOwn(d.acknowledged,device)&&Object.keys(d.acknowledged).length>=100)fail(409,'设备数量达到限制')
   const receipts=d.receipts[device]||[]
   for(const e of events){const hash=fingerprint(e)
    if(e.seq<=ack){const receipt=receipts.find(x=>x[0]===e.seq);if(receipt&&receipt[1]!==hash)fail(409,'已确认事件内容冲突');continue}
    if(e.seq!==ack+1)fail(409,'事件序号有缺口，请补发')
    const key=e.wordId+':'+e.mode,old=d.progress.records[key];const at=Math.max(old?.last||0,Math.min(e.at,now));d.progress.records[key]=update(old,e.correct,at)
    ack=e.seq;receipts.push([ack,hash]);if(receipts.length>50)receipts.shift();changed=true
   }
   if(changed){d.acknowledged[device]=ack;d.receipts[device]=receipts;d.version++;if(d.version>MAX_NUMBER)fail(413,'版本达到限制')}
   return checked(d)
  })
 }else{
  if(!keys(body,['accountId','importId','progress'])||!identifier(body.importId)||!keys(body.progress,['version','records'])||body.progress.version!==1||!object(body.progress.records))fail(400,'导入参数不合法')
  const entries=Object.entries(body.progress.records);if(entries.length>WORD_IDS.size*2)fail(400,'导入记录过多')
  for(const [k,v] of entries)if(!recordKey(k)||!validRecord(v))fail(400,'导入记录不合法')
  const now=clock()
  next=await store.transact(id,previous=>{const d=previous||initial();if(d.imports.includes(body.importId))return d;if(d.imports.length>=100)fail(409,'导入次数达到限制')
   for(const [k,v] of entries)if(!Object.hasOwn(d.progress.records,k))d.progress.records[k]={...v,last:Math.min(v.last,now),due:Math.min(v.due,now+30*86400000)}
   d.imports.push(body.importId);d.version++;if(d.version>MAX_NUMBER)fail(413,'版本达到限制');return checked(d)
  })
 }
 return {status:200,data:state(id,next)}
 }catch(e){if(e.status)return {status:e.status,data:{error:e.message}};throw e}}}
module.exports={createEnglishApi,accountId,MAX_BYTES}
