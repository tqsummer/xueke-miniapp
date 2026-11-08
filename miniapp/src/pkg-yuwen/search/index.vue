<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { api, dec, enc, go, splitHl } from '@/utils/request'
import ClassicalText from '@/components/ClassicalText.vue'

const q = ref('')
const module = ref('')
const modules = ref<{ id: string; name: string; online: boolean }[]>([])
const result = ref<any>(null)
const state = ref<'idle' | 'loading' | 'done' | 'error'>('idle')
const expanded = ref(false)
const history = ref<string[]>([])
const hot = ref<{ word: string }[]>([])
let timer: any = 0
let seq = 0

const wy = computed(() => result.value?.results?.find((r: any) => r.id === 'wenyan'))
const empty = computed(() => state.value === 'done' && !(result.value?.results || []).some((r: any) => r.total > 0))
const chars = computed(() => [...new Set([...q.value.trim()])].slice(0, 6))

onLoad((o: any) => {
  module.value = o?.module || ''
  q.value = dec(o?.q)
  if (q.value) run()
  api.get('/wenyan/hot').then((r) => (hot.value = r.words)).catch(() => {})
  api.me.get('/me/history?limit=10').then((r) => (history.value = r.items.map((i: any) => i.q))).catch(() => {})
  api.get('/subjects').then((r) => (modules.value = r.subjects.find((s: any) => s.id === 'yuwen')?.modules || [])).catch(() => {})
})

function onInput(e: any) {
  q.value = e.detail.value
  expanded.value = false
  clearTimeout(timer)
  timer = setTimeout(run, 300)
}
async function run() {
  const kw = q.value.trim()
  if (!kw) { state.value = 'idle'; result.value = null; return }
  const my = ++seq
  state.value = 'loading'
  try {
    const r = await api.get(`/search?subject=yuwen&module=${module.value}&q=${enc(kw)}&limit=${expanded.value ? 50 : 5}`)
    if (my !== seq) return
    result.value = r
    state.value = 'done'
  } catch { if (my === seq) state.value = 'error' }
}
function set(v: string) { q.value = v; expanded.value = false; run() }
function pickModule(m: { id: string; online: boolean } | null) {
  if (m && !m.online) return
  module.value = m?.id || ''
  run()
}
function expand() { expanded.value = true; run() }
function remember() { api.me.post('/me/history', { q: q.value.trim() }).catch(() => {}) }
function openEntry(word: string, sense?: number) { remember(); go.entry(word, sense) }
function openSentence(s: { article: number; id: string }) { remember(); go.reader(s.article, s.id) }
</script>

<template>
  <view class="bar">
    <input class="inp" type="text" confirm-type="search" :value="q" :focus="!q" placeholder="输入文言字词，或现代文说法" @input="onInput" @confirm="run" />
    <text v-if="q" class="clear" @tap="set('')">清除</text>
  </view>
  <scroll-view scroll-x class="mods">
    <view class="mrow">
      <view class="m" :class="{ on: !module }" @tap="pickModule(null)">全部</view>
      <view v-for="m in modules" :key="m.id" class="m" :class="{ on: module === m.id, off: !m.online }" @tap="pickModule(m)">{{ m.name }}</view>
    </view>
  </scroll-view>

  <view v-if="state === 'idle'" class="wrap">
    <view v-if="history.length" class="col gap8">
      <text class="label">最近查过</text>
      <view class="row gap8 wrapline"><view v-for="h in history" :key="h" class="chip text" @tap="set(h)">{{ h }}</view></view>
    </view>
    <view class="col gap8">
      <text class="label">最常考的字</text>
      <view class="row gap8 wrapline"><view v-for="h in hot" :key="h.word" class="chip" @tap="go.entry(h.word)">{{ h.word }}</view></view>
    </view>
  </view>

  <view v-else-if="state === 'error'" class="state">
    <text class="h">没有搜出来</text><text class="p">网络好像不太稳定，请再试一次。</text>
    <button class="btn" @tap="run">重试</button>
  </view>

  <view v-else-if="empty" class="state">
    <text class="h">这 100 篇里没有找到「{{ q.trim() }}」</text>
    <text class="p">换一个更短的词试试，例如只输入其中一个字。也可以输入现代文说法。</text>
    <view v-if="chars.length > 1" class="col gap8">
      <text class="label">拆开来查</text>
      <view class="row gap8 wrapline"><view v-for="c in chars" :key="c" class="chip" @tap="set(c)">{{ c }}</view></view>
    </view>
  </view>

  <view v-else-if="wy" class="wrap" :class="{ dim: state === 'loading' }">
    <view v-if="wy.groups.words.length" class="col gap8">
      <text class="label">重点字词 · {{ wy.groups.words.length }} 条</text>
      <view v-for="w in wy.groups.words" :key="w.word" class="card row gap12" @tap="openEntry(w.word)">
        <view class="zi">{{ w.word }}</view>
        <view class="col grow"><text>{{ w.summary }}</text><text class="tr">{{ w.count }} 处 · {{ w.senses }} 个义项</text></view>
      </view>
    </view>

    <view v-if="wy.groups.articles.length" class="col gap8">
      <text class="label">篇目 · {{ wy.groups.articles.length }} 条</text>
      <view v-for="a in wy.groups.articles" :key="a.id" class="card col" @tap="go.reader(a.id)">
        <text class="at">{{ a.id }}　{{ a.title }}</text><text class="tr">{{ a.source }}</text>
      </view>
    </view>

    <view v-if="wy.groups.modern.total" class="col gap8">
      <text class="label">现代文 → 文言 · {{ wy.groups.modern.total }} 条</text>
      <view v-for="m in wy.groups.modern.items" :key="m.sense_id" class="card row gap12 top" @tap="openEntry(m.word, m.sense_id)">
        <text class="mw">{{ m.word }}</text>
        <view class="col grow gap4">
          <view class="row"><text class="tag"><text v-for="(p, i) in splitHl(m.meaning, q.trim())" :key="i" :class="{ hl: p.on }">{{ p.t }}</text></text></view>
          <ClassicalText :text="m.snippet" :marks="[{ offset: m.snippet_offset, length: m.word.length }]" />
          <text class="tr"><text v-for="(p, i) in splitHl(m.modern, q.trim())" :key="i" :class="{ hl: p.on }">{{ p.t }}</text></text>
        </view>
      </view>
    </view>

    <view v-if="wy.groups.classical.total" class="col gap8">
      <text class="label">原文句子 · {{ wy.groups.classical.total }} 条</text>
      <view v-for="s in wy.groups.classical.items" :key="s.id" class="card col gap4" @tap="openSentence(s)">
        <ClassicalText :text="s.classical" :q="q.trim()" />
        <text class="tr">{{ s.modern }}</text>
        <text class="ref">{{ s.article }}·{{ s.title }}</text>
      </view>
    </view>

    <view v-if="wy.groups.translation.total" class="col gap8">
      <text class="label">译文句子 · {{ wy.groups.translation.total }} 条</text>
      <view v-for="s in wy.groups.translation.items" :key="s.id" class="card col gap4" @tap="openSentence(s)">
        <text><text v-for="(p, i) in splitHl(s.modern, q.trim())" :key="i" :class="{ hl: p.on }">{{ p.t }}</text></text>
        <text class="ex sub">{{ s.classical }}</text>
        <text class="ref">{{ s.article }}·{{ s.title }}</text>
      </view>
    </view>

    <text v-if="!expanded && (wy.groups.classical.total > 5 || wy.groups.translation.total > 5 || wy.groups.modern.total > 5)" class="link" @tap="expand">展开全部结果</text>
  </view>
</template>

<style scoped>
.bar { display: flex; align-items: center; gap: 16rpx; padding: 16rpx 24rpx; background: var(--surface); }
.inp { flex: 1; height: 88rpx; padding: 0 28rpx; border-radius: 24rpx; border: 3rpx solid var(--accent); background: var(--bg); font-size: 34rpx; }
.clear { color: var(--accent); font-size: 28rpx; padding: 20rpx 8rpx; }
.mods { background: var(--surface); border-bottom: 1px solid var(--line); white-space: nowrap; }
.mrow { display: inline-flex; gap: 16rpx; padding: 8rpx 24rpx 20rpx; }
.m { height: 68rpx; padding: 0 28rpx; display: flex; align-items: center; border-radius: 999rpx; border: 1px solid #c3ccc7; font-size: 28rpx; }
.m.on { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.m.off { border-style: dashed; color: #6b7780; }
.wrapline { flex-wrap: wrap; }
.dim { opacity: 0.6; }
.top { align-items: flex-start; }
.mw { font-family: var(--song); font-weight: 900; font-size: 46rpx; line-height: 1.3; }
.tag { font-size: 24rpx; padding: 2rpx 16rpx; border-radius: 12rpx; border: 1px solid var(--accent); color: var(--accent); }
.at { font-family: var(--song); font-weight: 600; font-size: 32rpx; }
.sub { font-size: 32rpx; color: var(--muted); line-height: 1.6; }
</style>
