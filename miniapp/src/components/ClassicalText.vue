<script setup lang="ts">
import { computed } from 'vue'

export interface Mark { offset: number; length: number; word?: string; gloss?: string }

const props = defineProps<{ text: string; marks?: Mark[]; q?: string; active?: number }>()
const emit = defineEmits<{ (e: 'mark', m: Mark, index: number): void }>()

// 先按加点字切段，没有加点字的段再按搜索关键词切
const parts = computed(() => {
  const out: { t: string; mark: number; on: boolean }[] = []
  const plain = (t: string) => {
    const q = props.q
    if (!q || !t.includes(q)) { if (t) out.push({ t, mark: -1, on: false }); return }
    let p = 0
    for (let i = t.indexOf(q); i >= 0; i = t.indexOf(q, p)) {
      if (i > p) out.push({ t: t.slice(p, i), mark: -1, on: false })
      out.push({ t: q, mark: -1, on: true })
      p = i + q.length
    }
    if (p < t.length) out.push({ t: t.slice(p), mark: -1, on: false })
  }
  let pos = 0
  ;(props.marks || []).forEach((m, i) => {
    if (m.offset < pos) return
    plain(props.text.slice(pos, m.offset))
    out.push({ t: props.text.slice(m.offset, m.offset + m.length), mark: i, on: false })
    pos = m.offset + m.length
  })
  plain(props.text.slice(pos))
  return out
})
</script>

<template>
  <text class="ex">
    <text v-for="(p, i) in parts" :key="i"
      :class="p.mark >= 0 ? (p.mark === active ? 'dot sel' : 'dot') : p.on ? 'hl' : ''"
      @tap.stop="p.mark >= 0 && emit('mark', marks![p.mark], p.mark)">{{ p.t }}</text>
  </text>
</template>

<style scoped>
.sel { background: var(--mark); color: #fff; border-radius: 8rpx; -webkit-text-emphasis: none; text-emphasis: none; }
</style>
