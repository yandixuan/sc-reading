import type { DefaultTheme } from 'vitepress'
import { defineConfig } from 'vitepress'
import { sidebarJdk, sidebarNetty, sidebarRedis, sidebarSpring } from './configs'

export default defineConfig({
  title: '源码阅读',
  description: 'Just playing around.',
  lastUpdated: true,
  cleanUrls: true,
  themeConfig: {
    nav: nav(),
    outline: [2, 3],
    sidebar: {
      '/java/': sidebarJdk(),
      '/spring/': sidebarSpring(),
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

function nav() {
  return [
    {
      text: 'Jdk',
      activeMatch: '^/jdk/',
      link: '/java/util/ArrayDeque',
    },
    {
      text: 'Spring',
      activeMatch: '^/spring/',
      link: '/spring/boot/SpringApplication',
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
      link: '/feign/ReflectiveFeign/',
    },
  ]
}

function sidebarFeign(): DefaultTheme.SidebarItem[] {
  return [
    {
      text: 'Contract',
      collapsed: true,
      link: '/feign/Contract/',
      items: [
        { text: 'BaseContract', link: '/feign/Contract/BaseContract' },
        { text: 'DeclarativeContract', link: '/feign/Contract/DeclarativeContract' },
        { text: 'Default', link: '/feign/Contract/Default' },
      ],
    },
    {
      text: 'Client',
      collapsed: true,
      link: '/feign/Client/',
      items: [
        { text: 'Default', link: '/feign/Client/Default' },
      ],
    },
    {
      text: '',
      collapsed: false,
      items: [
        { text: 'MethodMetadata', link: '/feign/MethodMetadata' },
      ],
    },
  ]
}
