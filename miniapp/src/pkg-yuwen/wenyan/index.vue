<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { api, go } from '@/utils/request'

const hot = ref<{ word: string; count: number }[]>([])
const failed = ref(false)
async function load() {
  failed.value = false
  try { hot.value = (await api.get('/wenyan/hot')).words } catch { failed.value = true }
}
onLoad(load)

const links = [
  { title: '100 篇原文对译', sub: '一句原文一句翻译，可隐藏译文自测', url: '/pkg-yuwen/articles/index' },
  { title: '通假字 · 词类活用 · 古今异义', sub: '三类容易丢分的字，带例句', url: '/pkg-yuwen/topics/index?type=tongjia' },
  { title: '现代文 → 文言对照', sub: '「如果」可以是 若、苟、使', url: '/pkg-yuwen/topics/index?type=modern' },
]
const open = (url: string) => uni.navigateTo({ url })
</script>

<template>
  <view class="wrap">
    <view class="searchbox" @tap="go.search('', 'wenyan')">
      <text class="lens">⌕</text><text>只在文言文里搜</text>
    </view>

    <view class="col gap8">
      <text class="label">最常考的字 · 数字是出现次数</text>
      <view v-if="failed" class="row gap12"><text class="tr">没有加载出来</text><text class="link" @tap="load">重试</text></view>
      <view v-else class="hot">
        <view v-for="h in hot" :key="h.word" class="h" @tap="go.entry(h.word)">
          <text class="w">{{ h.word }}</text><text class="n">{{ h.count }}</text>
        </view>
      </view>
    </view>

    <view class="col gap8">
      <view v-for="l in links" :key="l.url" class="card row gap12" @tap="open(l.url)">
        <view class="col grow"><text class="t">{{ l.title }}</text><text class="tr">{{ l.sub }}</text></view>
        <text class="arrow">›</text>
      </view>
    </view>
  </view>
</template>

<style scoped>
.lens { font-size: 40rpx; color: var(--accent); }
.hot { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 16rpx; }
.h { height: 116rpx; display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: 20rpx; background: var(--surface); border: 1px solid var(--line); }
.w { font-family: var(--song); font-weight: 900; font-size: 42rpx; line-height: 1.2; }
.n { font-size: 22rpx; color: var(--muted); }
.t { font-size: 32rpx; font-weight: 600; }
.arrow { font-size: 44rpx; color: var(--muted); }
</style>
