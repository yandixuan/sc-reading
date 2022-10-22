# AspectJAutoProxyRegistrar

继承 ImportBeanDefinitionRegistrar 接口 用于注册beanDefinition

:::tip

EnableAspectJAutoProxy 中@import该类

ConfigurationClassParser 会通过`ConfigurationClassBeanDefinitionReader`会调用 registerBeanDefinitions进行注册beanDefinition
:::

## 方法

### registerBeanDefinitions

```java
 @Override
 public void registerBeanDefinitions(
   AnnotationMetadata importingClassMetadata, BeanDefinitionRegistry registry) {
  
  // 如果必要就注册 AnnotationAwareAspectJAutoProxyCreator beanName为 `AopConfigUtils.AUTO_PROXY_CREATOR_BEAN_NAME`
  // 当然 AnnotationAwareAspectJAutoProxyCreator 是最高优先级的beanClassName
  AopConfigUtils.registerAspectJAnnotationAutoProxyCreatorIfNecessary(registry);

  AnnotationAttributes enableAspectJAutoProxy =
    AnnotationConfigUtils.attributesFor(importingClassMetadata, EnableAspectJAutoProxy.class);
  if (enableAspectJAutoProxy != null) {
   // 优先考虑cglib实现代理 
   if (enableAspectJAutoProxy.getBoolean("proxyTargetClass")) {
    AopConfigUtils.forceAutoProxyCreatorToUseClassProxying(registry);
   }
   // 配置是否暴露代理实例到上下文中去
   if (enableAspectJAutoProxy.getBoolean("exposeProxy")) {
    AopConfigUtils.forceAutoProxyCreatorToExposeProxy(registry);
   }
  }
 }

```
