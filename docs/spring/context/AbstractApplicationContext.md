# AbstractApplicationContext

## 方法

### refresh

```java
public void refresh() throws BeansException, IllegalStateException {
  synchronized (this.startupShutdownMonitor) {
   StartupStep contextRefresh = this.applicationStartup.start("spring.context.refresh");
   // Prepare this context for refreshing.
   // 1. 准备刷新上下文方法,用于设置准备刷新前的一些参数:
   //  程序启动标志位/上下文拓展资源加载/上下文环境准备情况验证/监听器监听事件容器初始化准备
   prepareRefresh();

   // Tell the subclass to refresh the internal bean factory.
   // 2. 获取BeanFactory,内部调用refreshBeanFactory()和getBeanFactory()均由子类实现
   //  告知子类刷新Bean工厂(设置序列号ID--> 参考GenericApplicationContext)
   ConfigurableListableBeanFactory beanFactory = obtainFreshBeanFactory();

   // Prepare the bean factory for use in this context.
   // 3. 初始化Bean工厂,设置基础属性: ClassLoader、SPEL(SPring表达式)解析器、属性编辑器(自定义属性覆盖默认属性)、
   //  添加系统BeanPostProcessor`ResourceEditorRegistrar(初始化前执行一些Aware即invokeAwareInterfaces方法)`、
   //  忽略一些系统级接口装配依赖、注入一些不能自动创建的Bean依赖(Bean工厂,ResourceLoader(加载资源文件),事件发布类,上下文)、
   //  加系统BeanPostProcessor`ApplicationListenerDetector(Bean初始化后执行,判断是否是单例监听器加到上下文中)`、
   //  加入AspectJ静态代理支持、系统环境Bean检查注册
   prepareBeanFactory(beanFactory);

   try {
    // Allows post-processing of the bean factory in context subclasses.
    postProcessBeanFactory(beanFactory);

    StartupStep beanPostProcess = this.applicationStartup.start("spring.context.beans.post-process");
    // Invoke factory processors registered as beans in the context.
    // 执行BeanFactory后置处理
    invokeBeanFactoryPostProcessors(beanFactory);

    // Register bean processors that intercept bean creation.
    registerBeanPostProcessors(beanFactory);
    beanPostProcess.end();

    // Initialize message source for this context.
    initMessageSource();

    // Initialize event multicaster for this context.
    initApplicationEventMulticaster();

    // Initialize other special beans in specific context subclasses.
    onRefresh();

    // Check for listener beans and register them.
    registerListeners();

    // Instantiate all remaining (non-lazy-init) singletons.
    finishBeanFactoryInitialization(beanFactory);

    // Last step: publish corresponding event.
    finishRefresh();
   }

   catch (BeansException ex) {
    if (logger.isWarnEnabled()) {
     logger.warn("Exception encountered during context initialization - " +
       "cancelling refresh attempt: " + ex);
    }

    // Destroy already created singletons to avoid dangling resources.
    destroyBeans();

    // Reset 'active' flag.
    cancelRefresh(ex);

    // Propagate exception to caller.
    throw ex;
   }

   finally {
    // Reset common introspection caches in Spring's core, since we
    // might not ever need metadata for singleton beans anymore...
    resetCommonCaches();
    contextRefresh.end();
   }
  }
}

```

### prepareBeanFactory

```java
protected void prepareBeanFactory(ConfigurableListableBeanFactory beanFactory) {
  // Tell the internal bean factory to use the context's class loader etc.
  beanFactory.setBeanClassLoader(getClassLoader());
  if (!shouldIgnoreSpel) {
   // 添加bean表达式解释器，为了能够让我们的beanFactory去解析bean表达式
   beanFactory.setBeanExpressionResolver(new StandardBeanExpressionResolver(beanFactory.getBeanClassLoader()));
  }
  // spring内部的属性编辑器、既读取配置文件
  beanFactory.addPropertyEditorRegistrar(new ResourceEditorRegistrar(this, getEnvironment()));

  // Configure the bean factory with context callbacks.
  // 为beanFactory配置一些回调，这些在bean实例化过程中会被触发
  beanFactory.addBeanPostProcessor(new ApplicationContextAwareProcessor(this));
  // 跳过以下6个属性的自动注入
  // 因为在ApplicationContextAwareProcessor后置处理器中通过setter注入
  beanFactory.ignoreDependencyInterface(EnvironmentAware.class);
  beanFactory.ignoreDependencyInterface(EmbeddedValueResolverAware.class);
  beanFactory.ignoreDependencyInterface(ResourceLoaderAware.class);
  beanFactory.ignoreDependencyInterface(ApplicationEventPublisherAware.class);
  beanFactory.ignoreDependencyInterface(MessageSourceAware.class);
  beanFactory.ignoreDependencyInterface(ApplicationContextAware.class);
  beanFactory.ignoreDependencyInterface(ApplicationStartupAware.class);

  // BeanFactory interface not registered as resolvable type in a plain factory.
  // MessageSource registered (and found for autowiring) as a bean.
  // 注册四个特殊的bean
  // 注入BeanFactory类型的bean时,使用当前容器获取的beanFactory
  // 当前对象实现了 ResourceLoader、ApplicationEventPublisher、ApplicationContext接口所以用当前this对象即可
  beanFactory.registerResolvableDependency(BeanFactory.class, beanFactory);
  beanFactory.registerResolvableDependency(ResourceLoader.class, this);
  beanFactory.registerResolvableDependency(ApplicationEventPublisher.class, this);
  beanFactory.registerResolvableDependency(ApplicationContext.class, this);

  // Register early post-processor for detecting inner beans as ApplicationListeners.
  beanFactory.addBeanPostProcessor(new ApplicationListenerDetector(this));

  // Detect a LoadTimeWeaver and prepare for weaving, if found.
  if (!NativeDetector.inNativeImage() && beanFactory.containsBean(LOAD_TIME_WEAVER_BEAN_NAME)) {
   beanFactory.addBeanPostProcessor(new LoadTimeWeaverAwareProcessor(beanFactory));
   // Set a temporary ClassLoader for type matching.
   beanFactory.setTempClassLoader(new ContextTypeMatchClassLoader(beanFactory.getBeanClassLoader()));
  }

  // Register default environment beans.
  // 如果没有定义 "environment" 这个 bean，那么 Spring 会 "手动" 注册一个
  if (!beanFactory.containsLocalBean(ENVIRONMENT_BEAN_NAME)) {
   beanFactory.registerSingleton(ENVIRONMENT_BEAN_NAME, getEnvironment());
  }
  // 如果没有定义 "systemProperties" 这个 bean，那么 Spring 会 "手动" 注册一个
  if (!beanFactory.containsLocalBean(SYSTEM_PROPERTIES_BEAN_NAME)) {
   beanFactory.registerSingleton(SYSTEM_PROPERTIES_BEAN_NAME, getEnvironment().getSystemProperties());
  }
  // 如果没有定义 "systemEnvironment" 这个 bean，那么 Spring 会 "手动" 注册一个
  if (!beanFactory.containsLocalBean(SYSTEM_ENVIRONMENT_BEAN_NAME)) {
   beanFactory.registerSingleton(SYSTEM_ENVIRONMENT_BEAN_NAME, getEnvironment().getSystemEnvironment());
  }
  // 如果没有定义 "applicationStartup" 这个 bean，那么 Spring 会 "手动" 注册一个
  if (!beanFactory.containsLocalBean(APPLICATION_STARTUP_BEAN_NAME)) {
   beanFactory.registerSingleton(APPLICATION_STARTUP_BEAN_NAME, getApplicationStartup());
  }
}
```

### postProcessBeanFactory

空实现

[ServletWebServerApplicationContext](../boot/ServletWebServerApplicationContext#postprocessbeanfactory)

### invokeBeanFactoryPostProcessors

[PostProcessorRegistrationDelegate](./PostProcessorRegistrationDelegate#invokebeanfactorypostprocessors)

```java
protected void invokeBeanFactoryPostProcessors(ConfigurableListableBeanFactory beanFactory) {
  PostProcessorRegistrationDelegate.invokeBeanFactoryPostProcessors(beanFactory, getBeanFactoryPostProcessors());

  // Detect a LoadTimeWeaver and prepare for weaving, if found in the meantime
  // (e.g. through an @Bean method registered by ConfigurationClassPostProcessor)
  if (!NativeDetector.inNativeImage() && beanFactory.getTempClassLoader() == null && beanFactory.containsBean(LOAD_TIME_WEAVER_BEAN_NAME)) {
   beanFactory.addBeanPostProcessor(new LoadTimeWeaverAwareProcessor(beanFactory));
   beanFactory.setTempClassLoader(new ContextTypeMatchClassLoader(beanFactory.getBeanClassLoader()));
  }
}
```

### registerBeanPostProcessors

```java

```
