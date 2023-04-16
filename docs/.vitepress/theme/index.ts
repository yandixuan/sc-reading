import type { EnhanceAppContext } from 'vitepress'
import { watch } from 'vue'
import Theme from 'vitepress/theme'
import './rainbow.css'
import './vars.css'
import 'uno.css'

let homePageStyle: HTMLStyleElement | undefined

export default {
  ...Theme,
  enhanceApp({ router }: EnhanceAppContext) {
    if (typeof window === 'undefined')
      return

    watch(
      () => router.route.data.relativePath,
      () => updateHomePageStyle(location.pathname === '/'),
      { immediate: true },
    )
  },
}

// Speed up the rainbow animation on home page
function updateHomePageStyle(value: boolean) {
  if (value) {
    if (homePageStyle)
      return

    homePageStyle = document.createElement('style')
    homePageStyle.innerHTML = `
    :root {
      animation: rainbow 12s linear infinite;
    }`
    document.body.appendChild(homePageStyle)
  }
  else {
    if (!homePageStyle)
      return

    homePageStyle.remove()
    homePageStyle = undefined
  }
}
