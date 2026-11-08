<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api, toast } from '@/utils/request'

const profile = ref<{ nickname: string | null; favorites: number; history: number } | null>(null)
// 头像只存在本机：上传到服务器需要文件存储，首版不做
const avatar = ref<string>(uni.getStorageSync('avatar') || '')
const failed = ref(false)

async function load() {
  failed.value = false
  try { profile.value = await api.me.get('/me/profile') } catch { failed.value = true }
}
onShow(load)

function onAvatar(e: any) {
  avatar.value = e.detail.avatarUrl
  uni.setStorageSync('avatar', avatar.value)
}
async function onNick(e: any) {
  const nickname = String(e.detail.value || '').trim()
  if (!nickname || nickname === profile.value?.nickname) return
  try { await api.me.put('/me/profile', { nickname }); profile.value!.nickname = nickname; toast('昵称已保存') } catch { toast('昵称没有保存成功') }
}
const open = (url: string) => uni.navigateTo({ url })
const toVocab = () => uni.switchTab({ url: '/pages/vocab/index' })
</script>

<template>
  <view class="wrap">
    <view class="card row gap12 who">
      <!-- #ifdef MP-WEIXIN -->
      <button class="avatar" open-type="chooseAvatar" aria-label="设置头像" @chooseavatar="onAvatar">
        <image v-if="avatar" class="img" :src="avatar" mode="aspectFill" /><text v-else>头像</text>
      </button>
      <!-- #endif -->
      <!-- #ifndef MP-WEIXIN -->
      <view class="avatar"><text>头像</text></view>
      <!-- #endif -->
      <view class="col grow">
        <input class="nick" type="nickname" placeholder="点击设置昵称" :value="profile?.nickname || ''" @blur="onNick" />
        <text class="tr">头像和昵称可以不填，不影响使用</text>
      </view>
    </view>

    <view v-if="failed" class="row gap12"><text class="tr">登录失败，个人数据暂时看不到</text><text class="link" @tap="load">重试</text></view>
    <view v-else class="nums">
      <view class="card col" @tap="toVocab"><text class="n">{{ profile?.favorites ?? '–' }}</text><text class="tr">生词本</text></view>
      <view class="card col" @tap="open('/pages/me/history')"><text class="n">{{ profile?.history ?? '–' }}</text><text class="tr">查过的字词</text></view>
    </view>

    <view class="list">
      <view class="item" @tap="open('/pages/me/history')"><text class="grow">搜索历史</text><text class="arrow">›</text></view>
      <view class="item" @tap="open('/pages/me/about')"><text class="grow">关于与隐私说明</text><text class="tr">v1.0.0</text><text class="arrow">›</text></view>
    </view>
  </view>
</template>

<style scoped>
.wrap { gap: 32rpx; }
.who { padding: 36rpx; }
.avatar { width: 120rpx; height: 120rpx; flex-shrink: 0; border-radius: 50%; background: var(--sunk); color: var(--muted); font-size: 26rpx; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.img { width: 120rpx; height: 120rpx; }
.nick { height: 64rpx; font-size: 34rpx; font-weight: 600; }
.nums { display: flex; gap: 24rpx; } .nums .card { flex: 1; }
.n { font-size: 52rpx; font-weight: 600; color: var(--accent); font-variant-numeric: tabular-nums; line-height: 1.3; }
.list { background: var(--surface); border: 1px solid var(--line); border-radius: 26rpx; }
.item { height: 108rpx; display: flex; align-items: center; gap: 12rpx; padding: 0 32rpx; font-size: 32rpx; border-bottom: 1px solid var(--sunk); }
.item:last-child { border-bottom: 0; }
.arrow { font-size: 44rpx; color: var(--muted); }
</style>
