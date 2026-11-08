<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api, go } from '@/utils/request'

const tab = ref<'words' | 'sentences'>('words')
const data = ref<{ words: any[]; sentences: any[] }>({ words: [], sentences: [] })
const state = ref<'loading' | 'done' | 'error'>('loading')
const undo = ref<{ kind: 'word' | 'sentence'; ref: string; label: string } | null>(null)
let timer: any = 0

async function load() {
  try { data.value = await api.me.get('/me/favorites'); state.value = 'done' } catch { state.value = 'error' }
}
onShow(load)

async function remove(kind: 'word' | 'sentence', ref: string, label: string) {
  try {
    await api.me.del('/me/favorites', { kind, ref })
    undo.value = { kind, ref, label }
    clearTimeout(timer)
    timer = setTimeout(() => (undo.value = null), 3000)
    load()
  } catch { uni.showToast({ title: '没有删除成功，请稍后再试', icon: 'none' }) }
}
async function restore() {
  const u = undo.value
  if (!u) return
  undo.value = null
  await api.me.post('/me/favorites', { kind: u.kind, ref: u.ref }).catch(() => {})
  load()
}
const day = (t: string) => { const d = new Date(t); return `${d.getMonth() + 1} 月 ${d.getDate()} 日加入` }
</script>

<template>
  <view v-if="state === 'error'" class="state">
    <text class="h">登录失败，暂时看不到生词本</text><text class="p">请检查网络后再试一次。</text>
    <button class="btn" @tap="load">重试</button>
  </view>

  <view v-else-if="state === 'done' && !data.words.length && !data.sentences.length" class="state">
    <view class="ring">☆</view>
    <text class="h">还没有生词</text>
    <text class="p">查字的时候点右上角的星形，这个字就会出现在这里。原文里长按一句话，也能把句子收进来。</text>
    <button class="btn" @tap="go.search()">去搜索</button>
  </view>

  <view v-else class="wrap">
    <view class="seg">
      <view class="i" :class="{ on: tab === 'words' }" @tap="tab = 'words'">字词 {{ data.words.length }}</view>
      <view class="i" :class="{ on: tab === 'sentences' }" @tap="tab = 'sentences'">句子 {{ data.sentences.length }}</view>
    </view>

    <view v-if="state === 'loading'" class="col gap8"><view v-for="i in 4" :key="i" class="sk" /></view>

    <view v-else-if="tab === 'words'" class="col gap8">
      <text v-if="!data.words.length" class="tr">还没有收藏字词。</text>
      <view v-for="w in data.words" :key="w.word" class="card row gap12">
        <view class="zi" @tap="go.entry(w.word)">{{ w.word }}</view>
        <view class="col grow" @tap="go.entry(w.word)"><text>{{ w.summary }}</text><text class="tr">{{ day(w.created_at) }} · {{ w.count }} 处</text></view>
        <button class="del" @tap="remove('word', w.word, w.word)">删除</button>
      </view>
    </view>

    <view v-else class="col gap8">
      <text v-if="!data.sentences.length" class="tr">还没有收藏句子。</text>
      <view v-for="s in data.sentences" :key="s.id" class="card col gap4">
        <view class="col gap4" @tap="go.reader(s.article, s.id)">
          <text class="ex">{{ s.classical }}</text><text class="tr">{{ s.modern }}</text>
        </view>
        <view class="row"><text class="ref grow" @tap="go.reader(s.article, s.id)">{{ s.article }}·{{ s.title }}</text><button class="del" @tap="remove('sentence', s.id, '这一句')">删除</button></view>
      </view>
    </view>
  </view>

  <view v-if="undo" class="snack">
    <text class="grow">已删除「{{ undo.label }}」</text>
    <button class="undo" @tap="restore">撤销</button>
  </view>
</template>

<style scoped>
.wrap { gap: 28rpx; }
.sk { height: 140rpx; border-radius: 26rpx; background: var(--sunk); }
.ring { width: 140rpx; height: 140rpx; border-radius: 50%; border: 4rpx dashed #9ba8a1; color: var(--muted); display: flex; align-items: center; justify-content: center; font-size: 64rpx; }
.del { height: 88rpx; padding: 0 16rpx; color: var(--s1); font-size: 28rpx; display: flex; align-items: center; flex-shrink: 0; }
.snack { position: fixed; left: 32rpx; right: 32rpx; bottom: 32rpx; height: 96rpx; padding: 0 12rpx 0 32rpx; display: flex; align-items: center; border-radius: 24rpx; background: var(--ink); color: var(--surface); font-size: 28rpx; }
.undo { height: 88rpx; padding: 0 24rpx; color: #9fd3e6; font-weight: 600; display: flex; align-items: center; }
</style>
