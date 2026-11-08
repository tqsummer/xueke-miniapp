<script setup lang="ts">
import { computed, ref, onUnmounted } from 'vue'
import { onShow, onHide } from '@dcloudio/uni-app'
import { words } from './words'
import type { Word } from './words'
import { emptyProgress, parseProgress, STORAGE_KEY, keyOf, judge, updateRecord, selectWords, shuffle } from './core'
import type { Mode, Progress, RecordItem } from './core'
const day = ref(1)
const mode = ref<Mode>('zh-en')
const progress = ref<Progress>(emptyProgress())
const storageWarning = ref('')
const canSave = ref(true)
const queue = ref<Word[]>([])
const index = ref(0)
const active = ref(false)
const finished = ref(false)
const answer = ref('')
const feedback = ref<'correct'|'wrong'|''>('')
const score = ref(0)
const now = ref(Date.now())
const before = ref<RecordItem>()
const current = computed(() => queue.value[index.value])
const counts = computed(() => ({
 all: selectWords(words,day.value,mode.value,'all',progress.value,now.value).length,
 mistakes: selectWords(words,day.value,mode.value,'mistakes',progress.value,now.value).length,
 due: selectWords(words,day.value,mode.value,'due',progress.value,now.value).length
}))
function load() {
 now.value = Date.now()
 try { progress.value = parseProgress(uni.getStorageSync(STORAGE_KEY)); canSave.value = true; storageWarning.value = '' }
 catch { canSave.value = false; storageWarning.value = '本机记录暂时无法读取。可以练习，但不会覆盖旧记录；请先导出备份。' }
}
onShow(load)
function persist() {
 if (!canSave.value) return
 try { uni.setStorageSync(STORAGE_KEY, progress.value); storageWarning.value = '' }
 catch { storageWarning.value = '保存失败，本次进度只在页面内保留。请检查设备存储空间。' }
}
function start(kind: 'all'|'mistakes'|'due') {
 now.value = Date.now()
 const list = selectWords(words,day.value,mode.value,kind,progress.value,now.value)
 if (!list.length) return uni.showToast({ title: kind === 'due' ? '暂无到期复习' : '这个范围没有错词', icon: 'none' })
 stopAudio(); queue.value = shuffle(list); index.value=0; score.value=0; answer.value='';feedback.value='';finished.value=false;active.value=true
}
function submit() {
 if (feedback.value || !current.value) return
 if (!answer.value.trim()) return uni.showToast({title:'先输入答案',icon:'none'})
 const key = keyOf(current.value.id, mode.value)
 before.value = progress.value.records[key] ? {...progress.value.records[key]} : undefined
 const correct = judge(current.value,mode.value,answer.value)
 progress.value.records[key] = updateRecord(before.value, correct, Date.now())
 feedback.value = correct ? 'correct' : 'wrong'
 if (correct) score.value++
 persist()
}
function selfCorrect() {
 if (feedback.value !== 'wrong' || mode.value !== 'en-zh') return
 uni.showModal({title:'确认释义正确？',content:'只在你的表达与参考释义等价时使用。将按本次答对记录，不会改变词库标准答案。',
 success: r => {
  if (!r.confirm || feedback.value !== 'wrong') return
  progress.value.records[keyOf(current.value.id,mode.value)] = updateRecord(before.value,true,Date.now())
  feedback.value='correct';score.value++;persist()
 }})
}
function next() {
 if (!feedback.value) return
 stopAudio()
 if (index.value + 1 >= queue.value.length) {finished.value=true;active.value=false;now.value=Date.now();return}
 index.value++;answer.value='';feedback.value=''
}
function leave() {
 if (!active.value) { finished.value=false; return }
 uni.showModal({title:'结束这次练习？',content:'已提交的答案会保留，未完成的题目不会计错。',success:r=>{if(r.confirm){stopAudio();active.value=false;finished.value=false;now.value=Date.now()}}})
}
let audio: ReturnType<typeof uni.createInnerAudioContext> | undefined
function stopAudio() { if (audio) audio.stop() }
function speak() {
 if (!current.value) return
 stopAudio()
 if (!audio) {
  audio = uni.createInnerAudioContext()
  audio.onError(() => uni.showToast({title:'发音播放失败，请重试',icon:'none'}))
 }
 audio.src = '/static/english/' + current.value.id + '.mp3'
 audio.play()
}
onHide(stopAudio)
onUnmounted(() => { if (audio) { audio.stop(); audio.destroy(); audio = undefined } })
function exportRecords() {
 const raw = canSave.value ? JSON.stringify(progress.value) : String(uni.getStorageSync(STORAGE_KEY))
 uni.setClipboardData({data:raw,success:()=>uni.showToast({title:'记录已复制，请另存备份',icon:'none'}),fail:()=>uni.showToast({title:'无法复制记录',icon:'none'})})
}
const grammar = ref(-1)
const grammarAnswer = ref('')
const grammarResult = ref('')
const lessons = [
 {title:'一般现在时 · 第三人称单数',question:'She ___ (agree) with me.',answer:'agrees',explanation:'主语 She 是第三人称单数，一般现在时动词加 -s：agrees。'},
 {title:'一般过去时',question:'They ___ (add) some water yesterday.',answer:'added',explanation:'yesterday 表示过去；add 的过去式是 added。'},
 {title:'be able to + 动词原形',question:'He is able to ___ (act) well.',answer:'act',explanation:'be able to 后用动词原形，不用 acts 或 acting。'},
 {title:'现在完成时',question:'She has already ___ (achieve) her goal.',answer:'achieved',explanation:'现在完成时用 have/has + 过去分词。achieve 的过去分词为 achieved。'}
]
function checkGrammar() {
 if (!grammarAnswer.value.trim()) return
 grammarResult.value = grammarAnswer.value.trim().toLowerCase() === lessons[grammar.value].answer ? '答对了' : '再看看解析'
}
</script>

<template>
 <view class="wrap english">
  <view class="top"><text class="eyebrow">英语 · 基础练习</text><text class="heading">每天一点，记得更牢</text></view>
  <view v-if="storageWarning" class="warning">{{ storageWarning }}</view>
  <template v-if="!active && !finished">
   <view class="card col gap8">
    <text class="title">选择学习范围</text>
    <view class="seg"><view v-for="d in [1,2,0]" :key="d" class="i" :class="{on:day===d}" @tap="day=d">{{ d ? 'Day '+d : '两天一起' }}</view></view>
    <view class="seg"><view class="i" :class="{on:mode==='zh-en'}" @tap="mode='zh-en'">中文 → 英文</view><view class="i" :class="{on:mode==='en-zh'}" @tap="mode='en-zh'">英文 → 中文</view></view>
    <text class="tr">{{ counts.all }} 个词条 · {{ counts.mistakes }} 个错词 · {{ counts.due }} 个到期</text>
    <button class="btn" @tap="start('all')">开始默写</button>
    <view class="actions"><button class="btn ghost" @tap="start('mistakes')">错词再练</button><button class="btn ghost" @tap="start('due')">到期复习</button></view>
    <text class="tr">答错 10 分钟后复习；连续答对按 1 / 3 / 7 / 14 / 30 天安排。两个方向分开记录，也可随时重复练习。</text>
   </view>
   <view class="card col gap8">
    <text class="title">语法小练习</text><text class="tr">4 道补充练习，不来自 PDF；本版暂不记录语法进度。</text>
    <view class="lesson" v-for="(g,i) in lessons" :key="g.title" @tap="grammar=i;grammarAnswer='';grammarResult=''">{{ g.title }} ›</view>
    <template v-if="grammar>=0"><text class="question">{{ lessons[grammar].question }}</text>
     <input class="answer" v-model="grammarAnswer" placeholder="填写空缺动词" @confirm="checkGrammar" />
     <button class="btn" @tap="checkGrammar">检查</button>
     <view v-if="grammarResult" class="feedback"><text>{{ grammarResult }} · {{ lessons[grammar].answer }}</text><text class="tr">{{ lessons[grammar].explanation }}</text></view>
    </template>
   </view>
   <view class="card col gap8"><text class="title">词库与记录说明</text>
    <text class="tr">66 个词条来自你提供的两份《中考词汇默写》PDF 第 1 页，合并多词性并补入未编号的 along。PDF 元数据为 2019 年，本版不是当前上海官方完整考纲。</text>
    <text class="tr">中文方向写一个正确释义即可；若系统未收录你的同义表达，可核对后手动标记答对。英文不区分大小写，专名请养成正确大写习惯。</text>
    <text class="tr">记录只保存在本设备，不随微信账号同步。清理缓存、换设备或卸载可能丢失。进入本页即可练习，无需等待后端登录。</text>
    <text class="tr">发音为离线美式合成语音，非真人录音。原资料音标存在错误，暂不展示。</text>
    <button class="link" @tap="exportRecords">复制学习记录备份</button>
   </view>
  </template>
  <template v-if="active && current">
   <view class="row"><text class="tr grow">{{ index+1 }} / {{ queue.length }} · Day {{ current.day }}</text><button class="link" @tap="leave">结束练习</button></view>
   <view class="card col gap8">
    <text class="eyebrow">{{ mode==='zh-en' ? '看中文，默写英文' : '看英文，写一个中文释义' }}</text>
    <text class="question">{{ mode==='zh-en' ? current.meaning : current.english }}</text>
    <text v-if="mode==='zh-en' && current.english.includes(' ')" class="tr">短语题，可用 sb. / one's 等占位表达。</text>
    <button v-if="mode==='en-zh' || feedback" class="link" @tap="speak">▶ 听发音</button>
    <input class="answer" v-model="answer" :disabled="!!feedback" :placeholder="mode==='zh-en' ? '输入英文单词或短语' : '输入一个释义'" :maxlength="200" confirm-type="done" @confirm="submit" />
    <button v-if="!feedback" class="btn" @tap="submit">提交答案</button>
    <view v-else class="feedback" :class="{wrong:feedback==='wrong'}">
     <text class="title">{{ feedback==='correct' ? '答对了' : '这次记入错词' }}</text>
     <text class="solution">{{ current.english }}</text><text>{{ current.meaning }}</text>
     <text v-if="current.note" class="tr">{{ current.note }}</text>
     <text class="tr">本词：Day {{ current.source.day }}，原资料第 {{ current.source.page }} 页。</text>
     <button v-if="feedback==='wrong' && mode==='en-zh'" class="link" @tap="selfCorrect">我的表达也正确</button>
    </view>
    <button v-if="feedback" class="btn" @tap="next">{{ index+1===queue.length ? '查看本轮结果' : '下一个' }}</button>
   </view>
  </template>
  <view v-if="finished" class="card col gap8">
   <text class="heading">这一轮完成了</text><text class="question">{{ score }} / {{ queue.length }}</text>
   <text class="tr">本轮答对 {{ score }} 个。答错的词已经进入当前方向的错词本；已提交的答案会安排复习。</text>
   <button class="btn" @tap="finished=false;start('mistakes')">再练错词</button><button class="btn ghost" @tap="finished=false">返回学习首页</button>
  </view>
 </view>
</template>
<style scoped>
.english{max-width:1000rpx;margin:0 auto;gap:28rpx}.top{display:flex;flex-direction:column;gap:10rpx}.eyebrow{font-size:24rpx;color:var(--accent);font-weight:700}.heading{font-size:44rpx;font-weight:800;line-height:1.3}.title{font-size:32rpx;font-weight:700}.question{font-size:42rpx;font-weight:600;line-height:1.5;overflow-wrap:anywhere}.answer{background:#fff;border:2rpx solid var(--line);border-radius:16rpx;min-height:104rpx;height:104rpx;padding:0 24rpx;font-size:32rpx;width:100%}.feedback{display:flex;flex-direction:column;gap:12rpx;background:#e7f2e9;padding:24rpx;border-radius:20rpx}.feedback.wrong{background:#fff0e8}.solution{font-size:38rpx;font-weight:700;overflow-wrap:anywhere}.warning{background:#fff0ce;padding:20rpx;border-radius:16rpx;font-size:26rpx}.actions{display:flex;gap:16rpx}.actions .btn{flex:1;padding:0 12rpx;font-size:28rpx}.lesson{padding:18rpx 0;border-bottom:1rpx solid var(--line);color:var(--accent)}.seg .i{font-size:28rpx}.card{gap:22rpx}
</style>
