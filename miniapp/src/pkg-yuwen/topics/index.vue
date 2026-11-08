<script setup lang="ts">
import { reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { api, go } from '@/utils/request'
import ClassicalText from '@/components/ClassicalText.vue'

const tabs = [
  { id: 'tongjia', name: '通假字' }, { id: 'huoyong', name: '词类活用' }, { id: 'gujin', name: '古今异义' }, { id: 'modern', name: '今→文' },
]
const type = ref('tongjia')
const cache = reactive<Record<string, any>>({})
const failed = ref(false)

async function pick(t: string) {
  type.value = t
  failed.value = false
  if (cache[t]) return
  try { cache[t] = await api.get('/wenyan/topics/' + t) } catch { failed.value = true }
}
onLoad((o: any) => pick(o?.type || 'tongjia'))

const sent = (id: string) => cache[type.value]?.sentences?.[id]
// 例句里要加着重号的位置
function markOf(text: string, phrase: string, ch: string) {
  const p = text.indexOf(phrase)
  const o = p < 0 ? text.indexOf(ch) : p + Math.max(0, phrase.indexOf(ch))
  return o < 0 ? [] : [{ offset: o, length: ch.length }]
}
</script>

<template>
  <view class="tabs">
    <view v-for="t in tabs" :key="t.id" class="tab" :class="{ on: t.id === type }" @tap="pick(t.id)">{{ t.name }}</view>
  </view>

  <view v-if="failed" class="state"><text class="h">没有加载出来</text><button class="btn" @tap="pick(type)">重试</button></view>
  <view v-else-if="!cache[type]" class="wrap"><view v-for="i in 5" :key="i" class="sk" /></view>

  <view v-else-if="type === 'tongjia'" class="wrap">
    <view v-for="it in cache.tongjia.items" :key="it.char" class="card row gap12 top">
      <view class="pairw"><text class="w">{{ it.char }}</text><text class="to">通</text><text class="w">{{ it.reads_as }}</text></view>
      <view class="col grow gap4">
        <text class="b">{{ it.meaning }}</text>
        <view v-for="x in it.examples" :key="x.sentence" class="col" @tap="go.reader(x.article, x.sentence)">
          <ClassicalText :text="sent(x.sentence).classical" :marks="markOf(sent(x.sentence).classical, x.phrase, it.char)" />
          <text class="ref">{{ x.article }}·{{ sent(x.sentence).title }}</text>
        </view>
      </view>
    </view>
  </view>

  <view v-else-if="type === 'huoyong'" class="wrap">
    <view v-for="(it, i) in cache.huoyong.items" :key="i" class="card col gap4" @tap="go.reader(it.article, it.sentence)">
      <view class="row gap8"><text class="w">{{ it.word }}</text><text class="gl">{{ it.type }}</text><text class="b grow">{{ it.meaning }}</text></view>
      <text class="ex">{{ it.example }}</text>
      <text class="tr">{{ sent(it.sentence).modern }}</text>
      <text class="ref">{{ it.article }}·{{ sent(it.sentence).title }}</text>
    </view>
  </view>

  <view v-else-if="type === 'gujin'" class="wrap">
    <view v-for="(it, i) in cache.gujin.items" :key="i" class="card col gap4" @tap="go.reader(it.article, it.sentence)">
      <view class="row gap8"><text class="w">{{ it.word }}</text><text class="b grow">文中：{{ it.classical_meaning }}</text></view>
      <text class="tr">今天的意思：{{ it.modern_meaning }}</text>
      <ClassicalText :text="it.example" :marks="markOf(it.example, it.word, it.word)" />
      <text class="tr">{{ sent(it.sentence).modern }}</text>
      <text class="ref">{{ it.article }}·{{ sent(it.sentence).title }}</text>
    </view>
  </view>

  <view v-else class="wrap">
    <view class="list">
      <view v-for="it in cache.modern.items" :key="it.modern" class="item">
        <text class="mod">{{ it.modern }}</text>
        <view class="row gap8 wrapline grow">
          <view v-for="c in it.classical" :key="c.word" class="chip" @tap="go.entry(c.word)">{{ c.word }}</view>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.tabs { display: flex; background: var(--surface); border-bottom: 1px solid var(--line); }
.tab { flex: 1; height: 92rpx; display: flex; align-items: center; justify-content: center; font-size: 28rpx; color: var(--muted); border-bottom: 6rpx solid transparent; }
.tab.on { color: var(--accent); font-weight: 600; border-bottom-color: var(--accent); }
.wrap { gap: 20rpx; }
.sk { height: 180rpx; border-radius: 26rpx; background: var(--sunk); }
.top { align-items: flex-start; }
.pairw { display: flex; align-items: baseline; gap: 8rpx; flex-shrink: 0; }
.w { font-family: var(--song); font-weight: 900; font-size: 46rpx; line-height: 1.3; }
.to { font-size: 22rpx; color: var(--muted); }
.b { font-weight: 600; }
.list { background: var(--surface); border: 1px solid var(--line); border-radius: 26rpx; }
.item { display: flex; align-items: center; gap: 24rpx; padding: 16rpx 28rpx; border-bottom: 1px solid var(--sunk); }
.item:last-child { border-bottom: 0; }
.mod { width: 200rpx; flex-shrink: 0; }
.wrapline { flex-wrap: wrap; }
.chip { min-width: 72rpx; height: 72rpx; font-size: 34rpx; }
</style>
