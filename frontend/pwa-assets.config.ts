import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Generates the app icons from public/favicon.svg: npx pwa-assets-generator
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    // Fill the padding of maskable/Apple icons with the app background instead of white.
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#0c0a1d' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#0c0a1d' } },
  },
  images: ['public/favicon.svg'],
})
