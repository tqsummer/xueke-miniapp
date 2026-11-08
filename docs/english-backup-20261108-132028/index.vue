<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api, go, toast } from '@/utils/request'

interface Module { id: string; name: string; glyph: string; intro: string; online: boolean }
interface Subject { id: string; name: string; online: boolean; modules: Module[] }

const subjects = ref<Subject[]>([])
const current = ref<string>(uni.getStorageSync('subject') || 'yuwen')
const failed = ref(false)
const recent = ref<{ lastRead: { articleId: number; title: string } | null; words: string[] }>({ lastRead: null, words: [] })

const subject = computed(() => subjects.value.find((s) => s.id === current.value))
const online = computed(() => (subject.value?.modules || []).filter((m) => m.online))
const coming = computed(() => (subject.value?.modules || []).filter((m) => !m.online))

async function load() {
  failed.value = false
  try {
    subjects.value = (await api.get('/subjects')).subjects
    if (!subject.value?.online) current.value = subjects.value.find((s) => s.online)?.id || 'yuwen'
  } catch { failed.value = true }
}
async function loadRecent() {
  try { recent.value = await api.me.get('/me/recent') } catch { /* 没登录成功时不显示这一块 */ }
}
onShow(() => { if (!subjects.value.length) load(); loadRecent() })

function pick(s: Subject) {
  if (!s.online) return toast(s.name + '正在准备中')
  current.value = s.id
  uni.setStorageSync('subject', s.id)
  api.me.put('/me/profile', { lastSubject: s.id }).catch(() => {})
}
function open(m: Module) {
  if (!m.online) return toast(m.name + '正在准备中')
  if (m.id === 'wenyan') uni.navigateTo({ url: '/pkg-yuwen/wenyan/index' })
}
</script>

<template>
  <view class="subjects">
    <view v-for="s in subjects" :key="s.id" class="s" :class="{ on: s.id === current, off: !s.online }" @tap="pick(s)">{{ s.name }}</view>
  </view>

  <view v-if="failed" class="state">
    <text class="h">内容没有加载出来</text>
    <text class="p">请检查网络后再试一次。</text>
    <button class="btn" @tap="load">重试</button>
  </view>

  <view v-else class="wrap">
    <view class="searchbox" @tap="go.search()">
      <text class="lens">⌕</text>
      <text>在{{ subject?.name || '语文' }}里搜：字、词、句子</text>
    </view>

    <view class="mods">
      <view v-for="m in online" :key="m.id" class="mod live" :class="{ wide: online.length === 1 }" @tap="open(m)">
        <view class="glyph">{{ m.glyph }}</view>
        <view class="col grow">
          <text class="name">{{ m.name }}</text>
          <text class="intro">{{ m.intro }}</text>
        </view>
        <text class="arrow">›</text>
      </view>
      <view v-for="m in coming" :key="m.id" class="mod" @tap="open(m)">
        <text class="g2">{{ m.glyph }}</text>
        <text class="name">{{ m.name }}</text>
        <text class="intro">即将上线</text>
      </view>
    </view>

    <view v-if="recent.lastRead || recent.words.length" class="col gap8">
      <text class="label">继续学习</text>
      <view v-if="recent.lastRead" class="card row gap12" @tap="go.reader(recent.lastRead.articleId)">
        <view class="col grow">
          <text class="title">{{ recent.lastRead.title }}</text>
          <text class="tr">文言文 · 第 {{ recent.lastRead.articleId }} 篇 · 上次读到</text>
        </view>
        <text class="arrow dim">›</text>
      </view>
      <view class="row gap8 wrapline">
        <view v-for="w in recent.words" :key="w" class="chip" :class="{ text: w.length > 1 }" @tap="w.length > 1 ? go.search(w) : go.entry(w)">{{ w }}</view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.subjects { display: flex; align-items: flex-end; gap: 8rpx; padding: 8rpx 24rpx 0; background: var(--surface); border-bottom: 1px solid var(--line); }
.s { height: 88rpx; padding: 0 20rpx; display: flex; align-items: center; color: var(--muted); font-size: 32rpx; border-bottom: 6rpx solid transparent; }
.s.on { color: var(--ink); font-family: var(--song); font-weight: 900; font-size: 42rpx; border-bottom-color: var(--accent); }
.s.off { color: #6b7780; }
.lens { font-size: 40rpx; color: var(--accent); }
.mods { display: flex; flex-wrap: wrap; gap: 24rpx; }
.mod { width: calc(50% - 12rpx); padding: 28rpx; border-radius: 30rpx; background: var(--sunk); color: var(--muted); display: flex; flex-direction: column; gap: 8rpx; }
.mod .g2 { font-family: var(--song); font-weight: 900; font-size: 46rpx; }
.mod .name { font-size: 32rpx; font-weight: 600; }
.mod .intro { font-size: 24rpx; }
.mod.live { flex-direction: row; align-items: center; gap: 28rpx; background: var(--accent); color: #fff; }
.mod.live.wide { width: 100%; padding: 34rpx; }
.mod.live .name { font-size: 38rpx; }
.glyph { width: 108rpx; height: 108rpx; flex-shrink: 0; border-radius: 50%; background: #fff; color: var(--accent); display: flex; align-items: center; justify-content: center; font-family: var(--song); font-weight: 900; font-size: 54rpx; }
.arrow { font-size: 48rpx; } .arrow.dim { color: var(--muted); }
.title { font-family: var(--song); font-weight: 600; font-size: 34rpx; }
.wrapline { flex-wrap: wrap; }
</style>
