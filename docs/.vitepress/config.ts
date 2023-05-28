import { defineConfig } from 'vitepress'
import type { DefaultTheme } from 'vitepress'

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
    },
    footer: {
      message: 'Released under the MIT License.',
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
      link: '/redis/server/main',
    },
  ]
}

function sidebarJdk(): DefaultTheme.SidebarItem[] {
  return [
    {
      text: 'util',
      collapsed: true,
      items: [
        { text: 'ArrayDeque', link: '/java/util/ArrayDeque' },
        { text: 'DualPivotQuicksort', link: '/java/util/DualPivotQuicksort' },
        { text: 'ArrayList', link: '/java/util/ArrayList' },
        { text: 'HashMap', link: '/java/util/HashMap' },
        { text: 'PriorityQueue', link: '/java/util/PriorityQueue' },
        { text: 'TimSort', link: '/java/util/TimSort' },
        { text: 'TreeNode', link: '/java/util/TreeNode' },
      ],
    },
    {
      text: 'concurrent',
      collapsed: true,
      items: [
        { text: 'AbstractExecutorService', link: '/java/util/concurrent/AbstractExecutorService' },
        { text: 'AbstractQueuedSynchronizer', link: '/java/util/concurrent/AbstractQueuedSynchronizer' },
        { text: 'ConcurrentHashMap', link: '/java/util/concurrent/ConcurrentHashMap' },
        { text: 'ExecutorService', link: '/java/util/concurrent/ExecutorService' },
        { text: 'TreeBin', link: '/java/util/concurrent/TreeBin' },
      ],
    },

  ]
}

function sidebarSpring(): DefaultTheme.SidebarItem[] {
  return [
    {
      text: 'boot',
      collapsed: true,
      items: [
        { text: 'ApplicationContextFactory', link: '/spring/boot/ApplicationContextFactory' },
        { text: 'AutoConfigurationImportSelector', link: '/spring/boot/AutoConfigurationImportSelector' },
        { text: 'BeanDefinitionLoader', link: '/spring/boot/BeanDefinitionLoader' },
        { text: 'ConfigDataEnvironment', link: '/spring/boot/ConfigDataEnvironment' },
        { text: 'ConfigDataEnvironmentPostProcessor', link: '/spring/boot/ConfigDataEnvironmentPostProcessor' },
        { text: 'ConfigDataLocationResolvers', link: '/spring/boot/ConfigDataLocationResolvers' },
        { text: 'EnvironmentPostProcessorApplicationListener', link: '/spring/boot/EnvironmentPostProcessorApplicationListener' },
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
      collapsed: true,
      items: [
        { text: 'AbstractApplicationContext', link: '/spring/context/AbstractApplicationContext' },
        { text: 'AbstractApplicationEventMulticaster', link: '/spring/context/AbstractApplicationEventMulticaster' },
        { text: 'AspectJAutoProxyRegistrar', link: '/spring/context/AspectJAutoProxyRegistrar' },
        { text: 'ConfigurationClassBeanDefinitionReader', link: '/spring/context/ConfigurationClassBeanDefinitionReader' },
        { text: 'ConfigurationClassParser', link: '/spring/context/ConfigurationClassParser' },
        { text: 'ConfigurationClassPostProcessor', link: '/spring/context/ConfigurationClassPostProcessor' },
        { text: 'PostProcessorRegistrationDelegate', link: '/spring/context/PostProcessorRegistrationDelegate' },
        { text: 'SimpleApplicationEventMulticaster', link: '/spring/context/SimpleApplicationEventMulticaster' },
      ],
    },
    {
      text: 'aop',
      collapsed: true,
      items: [
        { text: 'AbstractAdvisorAutoProxyCreator', link: '/spring/aop/AbstractAdvisorAutoProxyCreator' },
        { text: 'AbstractAspectJAdvisorFactory', link: '/spring/aop/AbstractAspectJAdvisorFactory' },
        { text: 'AbstractAutoProxyCreator', link: '/spring/aop/AbstractAutoProxyCreator' },
        { text: 'Advised', link: '/spring/aop/Advised' },
        { text: 'Advisor', link: '/spring/aop/Advisor' },
        { text: 'AnnotationAwareAspectJAutoProxyCreator', link: '/spring/aop/AnnotationAwareAspectJAutoProxyCreator' },
        { text: 'AopProxyUtils', link: '/spring/aop/AopProxyUtils' },
        { text: 'AspectJAroundAdvice', link: '/spring/aop/AspectJAroundAdvice' },
        { text: 'AspectJProxyUtils', link: '/spring/aop/AspectJProxyUtils' },
        { text: 'BeanFactoryAspectJAdvisorsBuilder', link: '/spring/aop/BeanFactoryAspectJAdvisorsBuilder' },
        { text: 'CglibAopProxy', link: '/spring/aop/CglibAopProxy' },
        { text: 'DefaultAopProxyFactory', link: '/spring/aop/DefaultAopProxyFactory' },
        { text: 'DefaultAdvisorChainFactory', link: '/spring/aop/DefaultAdvisorChainFactory' },
        { text: 'JdkDynamicAopProxy', link: '/spring/aop/JdkDynamicAopProxy' },
        { text: 'PointcutAdvisor', link: '/spring/aop/PointcutAdvisor' },
        { text: 'ProxyConfig', link: '/spring/aop/ProxyConfig' },
        { text: 'ReflectiveAspectJAdvisorFactory', link: '/spring/aop/ReflectiveAspectJAdvisorFactory' },
        { text: 'ReflectiveMethodInvocation', link: '/spring/aop/ReflectiveMethodInvocation' },
      ],
    },
    {
      text: 'beans',
      collapsed: true,
      items: [
        { text: 'AbstractAutowireCapableBeanFactory', link: '/spring/beans/AbstractAutowireCapableBeanFactory' },
        { text: 'AbstractBeanDefinition', link: '/spring/beans/AbstractBeanDefinition' },
        { text: 'InstantiationAwareBeanPostProcessor', link: '/spring/beans/InstantiationAwareBeanPostProcessor' },
      ],
    },
    {
      text: 'core',
      collapsed: true,
      items: [
        { text: 'AbstractPropertyResolver', link: '/spring/core/AbstractPropertyResolver' },
        { text: 'MutablePropertySources', link: '/spring/core/MutablePropertySources' },
        { text: 'PropertyPlaceholderHelper', link: '/spring/core/PropertyPlaceholderHelper' },
        { text: 'PropertySource', link: '/spring/core/PropertySource' },
        { text: 'PropertySourcesPropertyResolver', link: '/spring/core/PropertySourcesPropertyResolver' },
      ],
    },
    {
      text: 'tx',
      collapsed: true,
      items: [
        { text: 'AbstractFallbackTransactionAttributeSource', link: '/spring/tx/AbstractFallbackTransactionAttributeSource' },
        { text: 'AbstractPlatformTransactionManager', link: '/spring/tx/AbstractPlatformTransactionManager' },
        { text: 'ProxyTransactionManagementConfiguration', link: '/spring/tx/ProxyTransactionManagementConfiguration' },
        { text: 'TransactionAspectSupport', link: '/spring/tx/TransactionAspectSupport' },
        { text: 'TransactionDefinition', link: '/spring/tx/TransactionDefinition' },
        { text: 'TransactionManagementConfigurationSelector', link: '/spring/tx/TransactionManagementConfigurationSelector' },
        { text: 'TransactionSynchronizationManager', link: '/spring/tx/TransactionSynchronizationManager' },
      ],
    },
    {
      text: 'jdbc',
      collapsed: true,
      items: [
        { text: 'ConnectionHolder', link: '/spring/jdbc/ConnectionHolder' },
        { text: 'DataSourceTransactionManager', link: '/spring/jdbc/DataSourceTransactionManager' },
      ],
    },

  ]
}

function sidebarNetty(): DefaultTheme.SidebarItem[] {
  return [
    {
      text: 'common',
      collapsed: true,
      items: [
        { text: 'AbstractEventExecutor', link: '/netty/common/AbstractEventExecutor' },
        { text: 'AbstractEventExecutorGroup', link: '/netty/common/AbstractEventExecutorGroup' },
        { text: 'DefaultPriorityQueue', link: '/netty/common/DefaultPriorityQueue' },
        { text: 'DefaultPromise', link: '/netty/common/DefaultPromise' },
        { text: 'EventExecutor', link: '/netty/common/EventExecutor' },
        { text: 'EventExecutorGroup', link: '/netty/common/EventExecutorGroup' },
        { text: 'Future', link: '/netty/common/Future' },
        { text: 'MultithreadEventExecutorGroup', link: '/netty/common/MultithreadEventExecutorGroup' },
        { text: 'Promise', link: '/netty/common/Promise' },
        { text: 'SingleThreadEventExecutor', link: '/netty/common/SingleThreadEventExecutor' },
      ],
    },
    {
      text: 'transport',
      collapsed: true,
      items: [
        { text: 'AbstractBootstrap', link: '/netty/transport/AbstractBootstrap' },
        { text: 'AbstractChannel', link: '/netty/transport/AbstractChannel' },
        { text: 'AbstractChannelHandlerContext', link: '/netty/transport/AbstractChannelHandlerContext' },
        { text: 'AbstractEventLoop', link: '/netty/transport/AbstractEventLoop' },
        { text: 'AbstractEventLoopGroup', link: '/netty/transport/AbstractEventLoopGroup' },
        { text: 'AbstractNioChannel', link: '/netty/transport/AbstractNioChannel' },
        { text: 'AbstractNioMessageChannel', link: '/netty/transport/AbstractNioMessageChannel' },
        { text: 'Channel', link: '/netty/transport/Channel' },
        { text: 'ChannelPipeline', link: '/netty/transport/ChannelPipeline' },
        { text: 'DefaultChannelPipeline', link: '/netty/transport/DefaultChannelPipeline' },
        { text: 'EventLoop', link: '/netty/transport/EventLoop' },
        { text: 'EventLoopGroup', link: '/netty/transport/EventLoopGroup' },
        { text: 'NioEventLoop', link: '/netty/transport/NioEventLoop' },
        { text: 'ServerBootstrap', link: '/netty/transport/ServerBootstrap' },
      ],
    },
  ]
}

function sidebarRedis(): DefaultTheme.SidebarItem[] {
  return [
    {
      text: '数据结构',
      collapsed: false,
      items: [
        { text: 'adlist', link: '/redis/adlist' },
        { text: 'sds', link: '/redis/sds' },
      ],
    },
    {
      text: '字典',
      collapsed: false,
      items: [
        { text: 'dict', link: '/redis/dict' },
      ],
    },
    {
      text: '数据类型命令',
      collapsed: false,
      items: [
        { text: 'string', link: '/redis/t_string.md' },
        { text: 'list', link: '/redis/t_list.md' },
        { text: 'set', link: '/redis/t_set.md' },
        { text: 'zset', link: '/redis/t_zset.md' },
        { text: 'hash', link: '/redis/t_hash.md' },
      ],
    },
    {
      text: '服务器',
      collapsed: false,
      items: [
        { text: 'main', link: '/redis/server/main' },
        { text: 'initServer', link: '/redis/server/initServer' },
        { text: 'initListeners', link: '/redis/server/initListeners' },
        { text: 'InitServerLast', link: '/redis/server/InitServerLast' },
        { text: 'call', link: '/redis/server/call' },
      ],
    },
    {
      collapsed: false,
      items: [
        { text: 'ae_epoll', link: '/redis/ae_epoll' },
        { text: 'ae', link: '/redis/ae' },
        { text: 'anet', link: '/redis/anet' },
        { text: 'config', link: '/redis/config' },
        { text: 'connection', link: '/redis/connection' },
        { text: 'evict', link: '/redis/evict' },
        { text: 'networking', link: '/redis/networking' },
        { text: 'server', link: '/redis/server' },
        { text: 'socket', link: '/redis/socket' },
        { text: 'zmalloc', link: '/redis/zmalloc' },
      ],
    },
  ]
}
