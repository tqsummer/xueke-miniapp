<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'
import { initBackend, login } from '@/utils/request'

onLaunch(() => {
  initBackend()
  // 静默登录：不弹任何授权框，失败也不影响浏览和搜索
  login().catch(() => {})
})
</script>

<style>
page {
  --bg: #f1f4f1; --surface: #fbfcfa; --sunk: #e4e9e5; --ink: #1b2630; --muted: #55636d; --line: #d5dcd8;
  --accent: #1d6a86; --mark: #b5371f; --hl: #f3e3a6;
  --s0: #1d6a86; --s1: #a83f28; --s2: #226650; --s3: #7a5c08; --s4: #6a4391; --s5: #85502e; --s6: #41547e; --s7: #9a3a61;
  --t0: #dcebf0; --t1: #f5e1db; --t2: #ddeee7; --t3: #f2e9cc; --t4: #eadff3; --t5: #f0e3d8; --t6: #dfe5f1; --t7: #f4dde7;
  --kai: 'Kaiti SC', 'STKaiti', 'KaiTi', serif;
  --song: 'Noto Serif SC', 'Songti SC', 'STSong', 'SimSun', serif;
  background: var(--bg); color: var(--ink); font-size: 30rpx; line-height: 1.6;
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
view, text, input, button, scroll-view { box-sizing: border-box; }
button { margin: 0; padding: 0; background: none; border-radius: 0; font-size: inherit; line-height: inherit; color: inherit; text-align: inherit; }
button::after { border: 0; }

.wrap { padding: 32rpx; display: flex; flex-direction: column; gap: 40rpx; }
.label { font-size: 24rpx; color: var(--muted); letter-spacing: 2rpx; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 26rpx; padding: 24rpx 28rpx; }
.col { display: flex; flex-direction: column; }
.row { display: flex; align-items: center; }
.gap8 { gap: 16rpx; } .gap4 { gap: 8rpx; } .gap12 { gap: 24rpx; }
.grow { flex: 1; min-width: 0; }
.ex { font-family: var(--kai); font-size: 36rpx; line-height: 1.9; }
.tr { font-size: 26rpx; color: var(--muted); line-height: 1.55; }
.ref { font-size: 24rpx; color: var(--accent); }
.gl { font-size: 22rpx; background: var(--sunk); border-radius: 8rpx; padding: 2rpx 14rpx; }
.dot { color: var(--mark); font-weight: 700; -webkit-text-emphasis: filled dot var(--mark); text-emphasis: filled dot var(--mark); -webkit-text-emphasis-position: under right; text-emphasis-position: under right; }
.hl { background: var(--hl); }
.zi { width: 96rpx; height: 96rpx; flex-shrink: 0; border-radius: 50%; background: var(--ink); color: var(--surface); display: flex; align-items: center; justify-content: center; font-family: var(--song); font-weight: 900; font-size: 48rpx; }
.chip { min-width: 88rpx; height: 88rpx; padding: 0 22rpx; display: flex; align-items: center; justify-content: center; border-radius: 20rpx; background: var(--surface); border: 1px solid var(--line); font-family: var(--song); font-weight: 600; font-size: 38rpx; }
.chip.text { font-family: inherit; font-weight: 400; font-size: 30rpx; }
.btn { height: 92rpx; padding: 0 48rpx; display: flex; align-items: center; justify-content: center; border-radius: 24rpx; background: var(--accent); color: #fff; font-size: 32rpx; font-weight: 600; }
.btn.ghost { background: none; border: 3rpx solid var(--accent); color: var(--accent); }
.link { color: var(--accent); font-size: 28rpx; min-height: 88rpx; display: flex; align-items: center; }
.state { padding: 120rpx 56rpx; display: flex; flex-direction: column; gap: 28rpx; align-items: flex-start; }
.state .h { font-family: var(--song); font-weight: 900; font-size: 44rpx; line-height: 1.4; }
.state .p { color: var(--muted); line-height: 1.7; }
.searchbox { height: 100rpx; display: flex; align-items: center; gap: 16rpx; padding: 0 32rpx; border-radius: 28rpx; background: var(--surface); border: 3rpx solid var(--accent); color: var(--muted); font-size: 32rpx; }
.seg { display: flex; padding: 8rpx; border-radius: 24rpx; background: var(--sunk); }
.seg .i { flex: 1; height: 76rpx; display: flex; align-items: center; justify-content: center; border-radius: 18rpx; color: var(--muted); }
.seg .i.on { background: var(--surface); color: var(--ink); font-weight: 600; }
</style>
