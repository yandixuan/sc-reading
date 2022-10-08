import { defineConfig } from 'vitepress'

export default defineConfig({
  title: '源码阅读',
  description: 'Just playing around.',
  lastUpdated: true,
  cleanUrls: 'without-subfolders',
  themeConfig: {
    nav: nav(),
    sidebar: {
      '/jdk/': sidebarJdk(),
      '/spring/': sidebarSpring(),
    },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2022-present ydx',
    },
  },
  markdown: {
    lineNumbers: true,
  },
})

function nav() {
  return [
    {
      text: 'Jdk',
      activeMatch: '^/jdk/',
      link: '/jdk/collection/ArrayDeque',
    },
    {
      text: 'Spring',
      activeMatch: '^/spring/',
      link: '/spring/boot/SpringApplication',
    },
  ]
}

function sidebarJdk() {
  return [
    {
      text: 'collection',
      collapsible: true,
      items: [
        { text: 'ArrayDeque', link: '/jdk/collection/ArrayDeque' },
        { text: 'ArrayList', link: '/jdk/collection/ArrayList' },
      ],
    },
    {
      text: 'concurrent',
      collapsible: true,
      items: [
        { text: 'AbstractExecutorService', link: '/jdk/concurrent/AbstractExecutorService' },
        { text: 'ExecutorService', link: '/jdk/concurrent/ExecutorService' },
      ],
    },

  ]
}

function sidebarSpring() {
  return [
    {
      text: 'boot',
      collapsible: true,
      items: [
        { text: 'ApplicationContextFactory', link: '/spring/boot/ApplicationContextFactory' },
        { text: 'BeanDefinitionLoader', link: '/spring/boot/BeanDefinitionLoader' },
        { text: 'EventPublishingRunListener', link: '/spring/boot/EventPublishingRunListener' },
        { text: 'LazyInitializationBeanFactoryPostProcessor', link: '/spring/boot/LazyInitializationBeanFactoryPostProcessor' },
        { text: 'ServletWebServerApplicationContext', link: '/spring/boot/ServletWebServerApplicationContext' },
        { text: 'SharedMetadataReaderFactoryContextInitializer', link: '/spring/boot/SharedMetadataReaderFactoryContextInitializer' },
        { text: 'SpringApplication', link: '/spring/boot/SpringApplication' },
        { text: 'SpringFactoriesLoader', link: '/spring/boot/SpringFactoriesLoader' },
      ],
    },
    {
      text: 'context',
      collapsible: true,
      items: [
        { text: 'AbstractApplicationContext', link: '/spring/context/AbstractApplicationContext' },
        { text: 'ConfigurationClassParser', link: '/spring/context/ConfigurationClassParser' },
        { text: 'ConfigurationClassPostProcessor', link: '/spring/context/ConfigurationClassPostProcessor' },
      ],
    },
    {
      text: 'core',
      collapsible: true,
      items: [
        { text: 'MutablePropertySources', link: '/spring/core/MutablePropertySources' },
        { text: 'PropertySource', link: '/spring/core/PropertySource' },
      ],
    },

  ]
}
