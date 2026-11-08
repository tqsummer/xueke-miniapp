<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api, go, toast } from '@/utils/request'

const items = ref<{ id: number; q: string; created_at: string }[]>([])
const state = ref<'loading' | 'done' | 'error'>('loading')
const confirming = ref(false)

async function load() {
  try { items.value = (await api.me.get('/me/history')).items; state.value = 'done' } catch { state.value = 'error' }
}
onShow(load)

async function remove(id: number) {
  try { await api.me.del('/me/history?id=' + id); items.value = items.value.filter((i) => i.id !== id) } catch { toast('没有删除成功') }
}
async function clear() {
  confirming.value = false
  try { await api.me.del('/me/history'); items.value = [] } catch { toast('没有清空成功') }
}
const open = (q: string) => ([...q].length === 1 ? go.entry(q) : go.search(q))
const day = (t: string) => { const d = new Date(t); return `${d.getMonth() + 1} 月 ${d.getDate()} 日` }
</script>

<template>
  <view v-if="state === 'error'" class="state"><text class="h">没有加载出来</text><button class="btn" @tap="load">重试</button></view>
  <view v-else-if="state === 'done' && !items.length" class="state">
    <text class="h">还没有搜索记录</text><text class="p">查过的字词会记在这里，最多保留最近 100 条。</text>
    <button class="btn" @tap="go.search()">去搜索</button>
  </view>
  <view v-else class="wrap">
    <view class="row">
      <text class="label grow">最近 {{ items.length }} 条</text>
      <template v-if="confirming">
        <text class="link warn" @tap="clear">确定清空</text><text class="link gapl" @tap="confirming = false">取消</text>
      </template>
      <text v-else class="link" @tap="confirming = true">清空</text>
    </view>
    <view class="list">
      <view v-for="i in items" :key="i.id" class="item">
        <text class="q grow" @tap="open(i.q)">{{ i.q }}</text>
        <text class="tr">{{ day(i.created_at) }}</text>
        <button class="del" :aria-label="'删除 ' + i.q" @tap="remove(i.id)">删除</button>
      </view>
    </view>
  </view>
</template>

<style scoped>
.wrap { gap: 16rpx; }
.list { background: var(--surface); border: 1px solid var(--line); border-radius: 26rpx; }
.item { min-height: 104rpx; display: flex; align-items: center; gap: 20rpx; padding: 0 12rpx 0 32rpx; border-bottom: 1px solid var(--sunk); }
.item:last-child { border-bottom: 0; }
.q { font-family: var(--song); font-weight: 600; font-size: 36rpx; line-height: 104rpx; }
.del { height: 88rpx; padding: 0 20rpx; color: var(--s1); font-size: 28rpx; display: flex; align-items: center; }
.warn { color: var(--s1); } .gapl { margin-left: 32rpx; }
</style>
