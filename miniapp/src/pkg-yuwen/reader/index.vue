<script setup lang="ts">
import { reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { api, go, toggleFav } from '@/utils/request'
import ClassicalText, { type Mark } from '@/components/ClassicalText.vue'

const art = ref<any>(null)
const state = ref<'loading' | 'done' | 'error'>('loading')
const hide = ref(false)
const peek = reactive<Record<string, boolean>>({})
const target = ref('')
const sheet = ref<{ sid: string; index: number; mark: Mark; senses: any[] } | null>(null)
let id = 1

async function load() {
  state.value = 'loading'
  try {
    art.value = await api.get('/wenyan/articles/' + id)
    state.value = 'done'
    uni.setNavigationBarTitle({ title: `${art.value.id} / 100` })
    api.me.put('/me/progress', { articleId: id }).catch(() => {})
    if (target.value) {
      setTimeout(() => uni.pageScrollTo({ selector: '#' + target.value, offsetTop: -120, duration: 200 }), 300)
      setTimeout(() => (target.value = ''), 2600)
    }
  } catch { state.value = 'error' }
}
onLoad((o: any) => { id = Number(o?.id) || 1; target.value = o?.s || ''; load() })

async function tapMark(sid: string, mark: Mark, index: number) {
  sheet.value = { sid, index, mark, senses: [] }
  try {
    const e = await api.get('/wenyan/entries/' + encodeURIComponent(mark.word!))
    if (sheet.value?.sid === sid && sheet.value.index === index) {
      sheet.value.senses = e.senses.map((s: any, i: number) => ({ i, meaning: s.meaning, here: s.examples.some((x: any) => x.id === sid && x.sentence_offset === mark.offset) }))
    }
  } catch { /* 义项列表拿不到时，卡片仍显示本句的意思 */ }
}
function hold(s: { id: string }) {
  uni.showActionSheet({ itemList: ['把这一句加入生词本'], success: () => toggleFav('sentence', s.id, false) })
}
const turn = (n: number | null) => n && uni.redirectTo({ url: '/pkg-yuwen/reader/index?id=' + n })
const marksOf = (a: any) => a.sentences.flatMap((s: any) => s.marks)
</script>

<template>
  <view v-if="state === 'loading'" class="wrap"><view class="sk a" /><view v-for="i in 5" :key="i" class="sk" /></view>
  <view v-else-if="state === 'error'" class="state">
    <text class="h">这一篇没有加载出来</text><text class="p">请检查网络后再试一次。</text>
    <button class="btn" @tap="load">重试</button>
  </view>

  <view v-else class="wrap">
    <view class="row top">
      <view class="col grow"><text class="title">{{ art.title }}</text><text class="tr">{{ art.source }}</text></view>
      <text class="link" @tap="hide = !hide">{{ hide ? '显示译文' : '隐藏译文' }}</text>
    </view>

    <view class="col gap12">
      <view v-for="s in art.sentences" :id="s.id" :key="s.id" class="pair" :class="{ target: s.id === target }" @tap="hide && (peek[s.id] = !peek[s.id])" @longpress="hold(s)">
        <ClassicalText :text="s.classical" :marks="s.marks" :active="sheet && sheet.sid === s.id ? sheet.index : -1" @mark="(m, i) => tapMark(s.id, m, i)" />
        <text v-if="!hide || peek[s.id]" class="tr m">{{ s.modern }}</text>
      </view>
    </view>
    <text v-if="hide" class="tr">点任意一句可以单独看它的译文。</text>

    <view v-if="marksOf(art).length" class="col gap8">
      <text class="label">本篇加点字</text>
      <view class="gls">
        <view v-for="(m, i) in marksOf(art)" :key="i" class="g" @tap="go.entry(m.word)"><text class="gw">{{ m.word }}</text>{{ m.gloss }}</view>
      </view>
    </view>
    <text v-if="art.notes" class="tr">{{ art.notes }}</text>

    <view class="row gap12">
      <button class="btn ghost grow" :class="{ off: !art.prev }" @tap="turn(art.prev)">上一篇</button>
      <button class="btn ghost grow" :class="{ off: !art.next }" @tap="turn(art.next)">下一篇</button>
    </view>
  </view>

  <view v-if="sheet" class="mask" @tap="sheet = null" />
  <view v-if="sheet" class="sheet">
    <view class="grip" />
    <view class="row gap12">
      <view class="zi big">{{ sheet.mark.word }}</view>
      <view class="col"><text class="tr">在这一句里的意思</text><text class="mean">{{ sheet.mark.gloss }}</text></view>
    </view>
    <view v-if="sheet.senses.length > 1" class="col gap8">
      <text class="tr">这个字共 {{ sheet.senses.length }} 个义项</text>
      <view class="row gap8 wrapline">
        <text v-for="s in sheet.senses" :key="s.i" class="sp" :style="s.here ? { background: `var(--s${s.i % 8})`, color: '#fff' } : { color: `var(--s${s.i % 8})` }">{{ s.meaning }}{{ s.here ? ' · 本句' : '' }}</text>
      </view>
    </view>
    <view class="row gap12">
      <button class="btn ghost grow" @tap="go.entry(sheet.mark.word!)">看导图</button>
      <button class="btn grow" @tap="toggleFav('word', sheet.mark.word!, false)">加入生词本</button>
    </view>
  </view>
</template>

<style scoped>
.sk { height: 150rpx; border-radius: 20rpx; background: var(--sunk); } .sk.a { height: 90rpx; width: 55%; }
.top { align-items: flex-start; }
.title { font-family: var(--song); font-weight: 900; font-size: 46rpx; line-height: 1.3; }
.pair { display: flex; flex-direction: column; gap: 6rpx; margin: 0 -16rpx; padding: 8rpx 16rpx; border-radius: 20rpx; transition: background 0.6s; }
.pair.target { background: var(--hl); }
.pair :deep(.ex) { font-size: 38rpx; line-height: 2; }
.m { font-size: 28rpx; line-height: 1.6; }
.gls { display: flex; flex-wrap: wrap; gap: 12rpx; }
.g { font-size: 26rpx; border: 1px solid var(--line); border-radius: 12rpx; padding: 6rpx 16rpx; background: var(--surface); }
.gw { font-family: var(--song); color: var(--mark); margin-right: 10rpx; font-weight: 600; }
.off { opacity: 0.35; }
.wrapline { flex-wrap: wrap; }
.mask { position: fixed; inset: 0; background: rgba(17, 23, 27, 0.45); z-index: 10; }
.sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 11; padding: 20rpx 40rpx calc(48rpx + env(safe-area-inset-bottom)); border-radius: 44rpx 44rpx 0 0; background: var(--surface); display: flex; flex-direction: column; gap: 32rpx; }
.grip { align-self: center; width: 80rpx; height: 8rpx; border-radius: 4rpx; background: #c3ccc7; }
.big { width: 124rpx; height: 124rpx; font-size: 64rpx; }
.mean { font-size: 42rpx; font-weight: 600; }
.sp { font-size: 26rpx; padding: 8rpx 22rpx; border-radius: 999rpx; border: 3rpx solid currentColor; }
</style>
