import { cpSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

// 把云函数和数据文件一起放进小程序产物，开发者工具里才能右键部署
function copyCloudFunctions(): Plugin {
  return {
    name: 'copy-cloud-functions',
    apply: 'build',
    closeBundle() {
      const out = process.env.UNI_OUTPUT_DIR
      if (process.env.UNI_PLATFORM !== 'mp-weixin' || !out || !existsSync(out)) return
      const dest = resolve(out, 'cloudfunctions')
      cpSync(resolve(__dirname, '../cloud/functions'), dest, { recursive: true })
      cpSync(resolve(__dirname, '../data/文言文字词数据.json'), resolve(dest, 'api/data.json'))
    },
  }
}

export default defineConfig({
  plugins: [uni(), copyCloudFunctions()],
})
