import type { DefaultTheme } from 'vitepress'

import { defineConfig } from 'vitepress'
import { sidebarFeign, sidebarJdk, sidebarNetty, sidebarRedis, sidebarSpring, springBoot } from './configs'

export default defineConfig({
  title: 'My Blog',
  description: 'Just playing around.',
  lastUpdated: true,
  cleanUrls: true,
  themeConfig: {
    nav: nav(),
    outline: [2, 3],
    sidebar: {
      '/java/': sidebarJdk(),
      '/spring/': sidebarSpring(),
      '/spring-boot/': springBoot(),
      '/netty': sidebarNetty(),
      '/redis': sidebarRedis(),
      '/feign': sidebarFeign(),
    },
    footer: {
      message: 'powered by <a href="https://vitepress.dev/">VitePress</a>',
      copyright: 'Copyright © 2022-present ydx',
    },
  },
  markdown: {
    anchor: {
      // (生成有效url的自定义函数)https://github.com/valeriangalliat/markdown-it-anchor#permalinks
      slugify: s => String(s).trim(),
    },
  },
})

function nav(): DefaultTheme.NavItem[] {
  return [
    {
      text: '后端',
      items: [
        {
          text: 'Jdk',
          activeMatch: '^/jdk/',
          link: '/java/util/ArrayDeque',
        },
        // out-date
        {
          text: 'Spring',
          activeMatch: '^/spring/',
          link: '/spring/boot/SpringApplication',
        },
        {
          text: 'SpringBoot',
          activeMatch: '^/spring-boot/',
          link: '/spring-boot/启动流程',
        },
        {
          text: 'Netty',
          activeMatch: '^/netty/',
          link: '/netty/common/EventExecutorGroup',
        },
        {
          text: 'Redis',
          activeMatch: '^/redis/',
          link: '/redis/server/',
        },
        {
          text: 'Feign',
          activeMatch: '^/feign/',
          link: '/feign/',
        },
      ],
    },
  ]
}
