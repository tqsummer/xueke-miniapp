const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { transformSync } = require('../node_modules/esbuild')
const root = path.resolve(__dirname, '..')
function load(file) { const code=transformSync(fs.readFileSync(path.join(root,'src/pkg-english',file),'utf8'),{loader:'ts',format:'cjs'}).code; const m={exports:{}};new Function('module','exports','require',code)(m,m.exports,require);return m.exports }
const c=load('core.ts'), {words}=load('words.ts')
let passed=0
function test(name,fn){fn();passed++;console.log('PASS',name)}
test('66 unique words, 33 per day with source metadata',()=>{
 assert.equal(words.length,66);assert.equal(new Set(words.map(w=>w.id)).size,66)
 for(const day of [1,2]) assert.equal(words.filter(w=>w.day===day).length,33)
 for(const w of words){assert.ok(w.acceptedEnglish.length);assert.ok(w.acceptedChinese.length);assert.equal(w.source.page,1);assert.equal(w.day,w.source.day)}
})
test('Every reference answer passes both directions',()=>{
 for(const w of words){for(const a of w.acceptedEnglish)assert.ok(c.judge(w,'zh-en',a),w.english);for(const a of w.acceptedChinese)assert.ok(c.judge(w,'en-zh',a),w.english)}
})
test('English normalization but not misspellings',()=>{
 const able=words[0];assert.ok(c.judge(able,'zh-en','  ABLE  '));assert.ok(!c.judge(able,'zh-en','abel'))
 assert.ok(c.judge(words.find(w=>w.english==="take one's advice"),'zh-en','take one’s advice'))
 assert.ok(!c.judge(words.find(w=>w.english==="take one's advice"),'zh-en','take ones advice'))
})
test('Chinese exact meaning avoids substring false positives',()=>{
 const able=words[0];assert.ok(c.judge(able,'en-zh','能够；有能力'));assert.ok(!c.judge(able,'en-zh','不能够'))
 assert.ok(!c.judge(able,'en-zh','能够;错误'));assert.ok(!c.judge(able,'en-zh','；'));assert.ok(!c.judge(able,'en-zh',''))
})
test('Wrong answers due in 10 minutes and streak resets',()=>{
 const now=1000;const r=c.updateRecord(undefined,false,now);assert.equal(r.due,601000);assert.equal(r.streak,0);assert.equal(r.wrong,1);assert.ok(r.mistake)
})
test('Correct spacing 1/3/7/14/30 days and mistake clears',()=>{
 const now=1000;let r=c.updateRecord(undefined,false,now)
 for(const days of [1,3,7,14,30,30]){r=c.updateRecord(r,true,now);assert.equal(r.due,now+days*86400000);assert.equal(r.mistake,false)}
 assert.equal(r.wrong,1);assert.equal(r.correct,6)
})
test('Mode/day isolation, unseen words not due',()=>{
 const p=c.emptyProgress();const w=words[0];p.records[c.keyOf(w.id,'zh-en')]=c.updateRecord(undefined,false,1000)
 assert.equal(c.selectWords(words,1,'zh-en','mistakes',p,1000).length,1)
 assert.equal(c.selectWords(words,1,'en-zh','mistakes',p,1000).length,0)
 assert.equal(c.selectWords(words,2,'zh-en','mistakes',p,1000).length,0)
 assert.equal(c.selectWords(words,1,'zh-en','due',p,600999).length,0)
 assert.equal(c.selectWords(words,1,'zh-en','due',p,601000).length,1)
})
test('JSON round-trip and corrupt records rejected',()=>{
 const p=c.emptyProgress();p.records.x=c.updateRecord(undefined,true,1)
 assert.deepEqual(c.parseProgress(JSON.stringify(p)),p);assert.deepEqual(c.parseProgress(''),c.emptyProgress())
 for(const bad of ['not json',{version:2,records:{}},{version:1,records:{x:{}}}])assert.throws(()=>c.parseProgress(bad))
})
test('Shuffle does not mutate or drop words',()=>{
 const ids=[1,2,3,4];const out=c.shuffle(ids,()=>0);assert.deepEqual(ids,[1,2,3,4]);assert.deepEqual([...out].sort(),ids)
})
test('Self-correction replaces mistaken attempt rather than double-counting',()=>{
 const before=c.updateRecord(undefined,true,1000);const wrong=c.updateRecord(before,false,2000);const fixed=c.updateRecord(before,true,2000)
 assert.equal(wrong.wrong,1);assert.equal(fixed.wrong,0);assert.equal(fixed.correct,2)
})
test('Chinese route preserved, English separate subpackage and storage',()=>{
 const pages=JSON.parse(fs.readFileSync(path.join(root,'src/pages.json'),'utf8'))
 const backup=fs.readdirSync(path.join(root,'../docs')).filter(x=>x.startsWith('english-backup-')).sort().pop()
 const original=JSON.parse(fs.readFileSync(path.join(root,'../docs',backup,'pages.json'),'utf8'))
 assert.deepEqual(pages.pages,original.pages);assert.deepEqual(pages.tabBar,original.tabBar)
 assert.deepEqual(pages.subPackages.filter(p=>p.root!=='pkg-english'),original.subPackages)
 assert.equal(pages.subPackages.filter(p=>p.root==='pkg-english').length,1)
 const home=fs.readFileSync(path.join(root,'src/pages/home/index.vue'),'utf8')
 assert.ok(home.includes("if (m.id === 'wenyan') uni.navigateTo({ url: '/pkg-yuwen/wenyan/index' })"))
 assert.ok(home.includes("current.value === 'yingyu' && m.id === 'english-practice'"))
 assert.ok(!home.includes('english-entry'));assert.ok(c.STORAGE_KEY.startsWith('english-'))
})
console.log(passed+' tests passed')
