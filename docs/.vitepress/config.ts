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
      '/netty': sidebarNetty(),
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
    {
      text: 'Netty',
      activeMatch: '^/netty/',
      link: '/netty/common/EventExecutorGroup',
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
        { text: 'AutoConfigurationImportSelector', link: '/spring/boot/AutoConfigurationImportSelector' },
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
        { text: 'AspectJAutoProxyRegistrar', link: '/spring/context/AspectJAutoProxyRegistrar' },
        { text: 'ConfigurationClassParser', link: '/spring/context/ConfigurationClassParser' },
        { text: 'ConfigurationClassPostProcessor', link: '/spring/context/ConfigurationClassPostProcessor' },
      ],
    },
    {
      text: 'aop',
      collapsible: true,
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
      collapsible: true,
      items: [
        { text: 'AbstractAutowireCapableBeanFactory', link: '/spring/beans/AbstractAutowireCapableBeanFactory' },
        { text: 'AbstractBeanDefinition', link: '/spring/beans/AbstractBeanDefinition' },
        { text: 'InstantiationAwareBeanPostProcessor', link: '/spring/beans/InstantiationAwareBeanPostProcessor' },
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
    {
      text: 'tx',
      collapsible: true,
      items: [
        { text: 'ProxyTransactionManagementConfiguration', link: '/spring/tx/ProxyTransactionManagementConfiguration' },
        { text: 'AbstractPlatformTransactionManager', link: '/spring/tx/AbstractPlatformTransactionManager' },
        { text: 'TransactionAspectSupport', link: '/spring/tx/TransactionAspectSupport' },
        { text: 'TransactionDefinition', link: '/spring/tx/TransactionDefinition' },
        { text: 'TransactionManagementConfigurationSelector', link: '/spring/tx/TransactionManagementConfigurationSelector' },
        { text: 'TransactionSynchronizationManager', link: '/spring/tx/TransactionSynchronizationManager' },
      ],
    },
    {
      text: 'jdbc',
      collapsible: true,
      items: [
        { text: 'ConnectionHolder', link: '/spring/jdbc/ConnectionHolder' },
        { text: 'DataSourceTransactionManager', link: '/spring/jdbc/DataSourceTransactionManager' },
      ],
    },

  ]
}

function sidebarNetty() {
  return [
    {
      text: 'common',
      collapsible: true,
      items: [
        { text: 'AbstractEventExecutor', link: '/netty/common/AbstractEventExecutor' },
        { text: 'AbstractEventExecutorGroup', link: '/netty/common/AbstractEventExecutorGroup' },
        { text: 'DefaultPriorityQueue', link: '/netty/common/DefaultPriorityQueue' },
        { text: 'DefaultPromise', link: '/netty/common/DefaultPromise' },
        { text: 'EventExecutor', link: '/netty/common/EventExecutor' },
        { text: 'EventExecutorGroup', link: '/netty/common/EventExecutorGroup' },
        { text: 'MultithreadEventExecutorGroup', link: '/netty/common/MultithreadEventExecutorGroup' },
      ],
    },
    {
      text: 'transport',
      collapsible: true,
      items: [
        { text: 'AbstractEventLoop', link: '/netty/transport/AbstractEventLoop' },
        { text: 'AbstractEventLoopGroup', link: '/netty/transport/AbstractEventLoopGroup' },
        { text: 'EventLoop', link: '/netty/transport/EventLoop' },
        { text: 'EventLoopGroup', link: '/netty/transport/EventLoopGroup' },
      ],
    },
  ]
}
