<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api, go } from '@/utils/request'

const list = ref<{ id: number; title: string; source: string; mark_count: number }[]>([])
const filter = ref('')
const last = ref(0)
const state = ref<'loading' | 'done' | 'error'>('loading')

async function load() {
  state.value = 'loading'
  try { list.value = (await api.get('/wenyan/articles')).articles; state.value = 'done' } catch { state.value = 'error' }
}
onShow(() => {
  if (!list.value.length) load()
  api.me.get('/me/recent').then((r) => (last.value = r.lastRead?.articleId || 0)).catch(() => {})
})
const onFilter = (e: any) => (filter.value = e.detail.value)
const shown = computed(() => {
  const k = filter.value.trim()
  return k ? list.value.filter((a) => a.title.includes(k) || a.source.includes(k)) : list.value
})
</script>

<template>
  <view class="wrap">
    <input class="inp" type="text" placeholder="按篇名或出处筛选，如 吕蒙" :value="filter" @input="onFilter" />

    <view v-if="state === 'error'" class="state">
      <text class="h">没有加载出来</text><button class="btn" @tap="load">重试</button>
    </view>
    <view v-else-if="state === 'loading'" class="col gap8"><view v-for="i in 8" :key="i" class="sk" /></view>
    <text v-else-if="!shown.length" class="tr">没有篇名或出处包含「{{ filter.trim() }}」的文章。</text>

    <view v-else class="list">
      <view v-for="a in shown" :key="a.id" class="item" @tap="go.reader(a.id)">
        <text class="no">{{ a.id }}</text>
        <view class="col grow"><text class="t">{{ a.title }}</text><text class="tr">{{ a.source }} · {{ a.mark_count }} 个加点字</text></view>
        <text v-if="a.id === last" class="last">上次读到</text>
      </view>
    </view>
  </view>
</template>

<style scoped>
.wrap { gap: 24rpx; }
.inp { height: 88rpx; padding: 0 28rpx; border-radius: 24rpx; border: 1px solid #c3ccc7; background: var(--surface); }
.sk { height: 108rpx; border-radius: 20rpx; background: var(--sunk); }
.list { background: var(--surface); border: 1px solid var(--line); border-radius: 26rpx; }
.item { display: flex; align-items: center; gap: 24rpx; padding: 22rpx 28rpx; border-bottom: 1px solid var(--sunk); }
.item:last-child { border-bottom: 0; }
.no { width: 56rpx; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
.t { font-family: var(--song); font-weight: 600; font-size: 34rpx; }
.last { font-size: 22rpx; padding: 4rpx 16rpx; border-radius: 12rpx; background: var(--t0); color: #145066; flex-shrink: 0; }
</style>
