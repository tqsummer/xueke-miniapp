<script setup lang="ts">
import { reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { ApiError, api, dec, enc, go, toggleFav } from '@/utils/request'
import ClassicalText from '@/components/ClassicalText.vue'

const word = ref('')
const entry = ref<any>(null)
const state = ref<'loading' | 'done' | 'missing' | 'error'>('loading')
const fav = ref(false)
const open = reactive<Record<number, boolean>>({})
const favSent = reactive<Record<string, boolean>>({})
let focusSense = 0

async function load() {
  state.value = 'loading'
  try {
    entry.value = await api.get('/wenyan/entries/' + enc(word.value))
    state.value = 'done'
    uni.setNavigationBarTitle({ title: word.value + ' · 一字多义' })
    api.me.get(`/me/favorites/check?kind=word&ref=${enc(word.value)}`).then((r) => (fav.value = r.favorited)).catch(() => {})
    api.me.post('/me/history', { q: word.value }).catch(() => {})
    if (focusSense) { open[focusSense] = true; setTimeout(() => jump(focusSense), 300) }
  } catch (e) {
    state.value = e instanceof ApiError && e.status === 404 ? 'missing' : 'error'
  }
}
onLoad((o: any) => { word.value = dec(o?.word); focusSense = Number(o?.sense) || 0; load() })

const jump = (id: number) => uni.pageScrollTo({ selector: '#sense-' + id, duration: 200 })
const shown = (s: any) => (open[s.id] || s.examples.length <= 4 ? s.examples : s.examples.slice(0, 4))
async function star() { fav.value = await toggleFav('word', word.value, fav.value) }
async function starSentence(id: string) { favSent[id] = await toggleFav('sentence', id, !!favSent[id]) }
</script>

<template>
  <view v-if="state === 'loading'" class="wrap"><view class="sk a" /><view class="sk" /><view class="sk" /></view>

  <view v-else-if="state === 'missing'" class="state">
    <text class="h">「{{ word }}」还没有收录</text>
    <text class="p">它不是这 100 篇里的加点字，不过原文里可能出现过。</text>
    <button class="btn" @tap="go.search(word, 'wenyan')">看看包含它的句子</button>
  </view>

  <view v-else-if="state === 'error'" class="state">
    <text class="h">没有加载出来</text><text class="p">请检查网络后再试一次。</text>
    <button class="btn" @tap="load">重试</button>
  </view>

  <view v-else>
    <view class="head">
      <view class="big">{{ entry.word }}</view>
      <view class="col grow"><text class="cnt">{{ entry.count }} 处 · {{ entry.senses.length }} 个义项</text><text class="tr">点出处可以跳到原文那一句</text></view>
      <button class="star" :class="{ on: fav }" :aria-label="fav ? '从生词本移除' : '加入生词本'" @tap="star">{{ fav ? '★' : '☆' }}</button>
    </view>

    <view class="pills">
      <view v-for="(s, i) in entry.senses" :key="s.id" class="pill" :style="{ background: `var(--s${i % 8})` }" @tap="jump(s.id)">{{ s.meaning }} {{ s.examples.length }}</view>
    </view>

    <view class="tree">
      <view v-for="(s, i) in entry.senses" :id="'sense-' + s.id" :key="s.id" class="branch">
        <view class="node">
          <view class="knob" :style="{ background: `var(--s${i % 8})` }" />
          <view class="sense" :style="{ background: `var(--t${i % 8})`, borderColor: `var(--s${i % 8})` }">
            <text class="sm">{{ s.meaning }}</text>
            <text v-if="s.pos || s.hint" class="sp" :style="{ color: `var(--s${i % 8})` }">{{ [s.pos, s.hint].filter(Boolean).join(' · ') }}</text>
          </view>
        </view>
        <view v-for="(x, j) in shown(s)" :key="j" class="card col gap4">
          <ClassicalText :text="x.snippet" :marks="[{ offset: x.snippet_offset, length: entry.length }]" />
          <text class="tr">{{ x.modern }}</text>
          <view class="row gap8 meta">
            <text class="gl">此处：{{ x.gloss }}</text>
            <text class="ref grow" @tap="go.reader(x.article, x.id)">{{ x.article }}·{{ x.title }}</text>
            <button class="sstar" :class="{ on: favSent[x.id] }" :aria-label="favSent[x.id] ? '移除这一句' : '收藏这一句'" @tap="starSentence(x.id)">{{ favSent[x.id] ? '★' : '☆' }}</button>
          </view>
        </view>
        <text v-if="s.examples.length > 4 && !open[s.id]" class="link" @tap="open[s.id] = true">展开其余 {{ s.examples.length - 4 }} 条</text>
      </view>
    </view>
  </view>
</template>

<style scoped>
.sk { height: 180rpx; border-radius: 26rpx; background: var(--sunk); } .sk.a { height: 150rpx; width: 60%; }
.head { display: flex; align-items: center; gap: 32rpx; padding: 40rpx 40rpx 28rpx; }
.big { width: 148rpx; height: 148rpx; flex-shrink: 0; border-radius: 50%; background: var(--ink); color: var(--surface); display: flex; align-items: center; justify-content: center; font-family: var(--song); font-weight: 900; font-size: 76rpx; }
.cnt { font-size: 36rpx; font-weight: 600; }
.star { width: 92rpx; height: 92rpx; border-radius: 50%; border: 3rpx solid var(--accent); background: var(--surface); color: var(--accent); font-size: 48rpx; display: flex; align-items: center; justify-content: center; }
.star.on { background: var(--accent); color: #fff; }
.pills { display: flex; flex-wrap: wrap; gap: 16rpx; padding: 0 40rpx 32rpx; }
.pill { font-size: 26rpx; padding: 10rpx 24rpx; border-radius: 999rpx; color: #fff; }
.tree { margin: 0 40rpx 60rpx 56rpx; padding-left: 40rpx; border-left: 4rpx solid #c3ccc7; display: flex; flex-direction: column; gap: 44rpx; }
.branch { display: flex; flex-direction: column; gap: 16rpx; }
.node { margin-left: -62rpx; display: flex; align-items: center; gap: 20rpx; }
.knob { width: 40rpx; height: 40rpx; flex-shrink: 0; border-radius: 50%; border: 6rpx solid var(--bg); }
.sense { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4rpx 16rpx; padding: 12rpx 24rpx; border-radius: 20rpx; border: 3rpx solid; }
.sm { font-size: 34rpx; font-weight: 600; } .sp { font-size: 24rpx; }
.meta { min-height: 72rpx; }
.sstar { width: 72rpx; height: 72rpx; font-size: 40rpx; color: var(--muted); display: flex; align-items: center; justify-content: center; }
.sstar.on { color: var(--accent); }
</style>
