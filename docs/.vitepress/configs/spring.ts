import type { DefaultTheme } from 'vitepress'

export function sidebarSpring(): DefaultTheme.SidebarItem[] {
  return [
    {
      text: '',
      collapsed: true,
      items: [
        { text: 'EnableAsync', link: '/spring/EnableAsync' },
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

export function springBoot(): DefaultTheme.SidebarItem[] {
  return [
    {
      text: 'SpringBoot',
      items: [
        { text: '启动流程', link: '/spring-boot/启动流程' },
        { text: '自动配置', link: '/spring-boot/自动配置' },
        { text: '配置加载', link: '/spring-boot/配置加载' },
      ],
    },
  ]
}
