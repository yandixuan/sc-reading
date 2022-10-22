# AbstractAutoProxyCreator

它会自动获取spring容器中注册的所有的Advisor类（除了子类中isEligibleAdvisorBean（）方法指定的不满足条件的Advisor除外。），然后自动给spring容器中满足Advisor中pointCut创建代理。

:::tip

实现了 SmartInstantiationAwareBeanPostProcessor 接口为了代理对象发送循环依赖

在 AbstractAutowireCapableBeanFactory L606-614 会添加一个函数式function 从而提前获取到aop的实例 而不是在bean实例化之后去生产代理

:::

## 方法

### postProcessBeforeInstantiation

在bean实例化之前处理一下

```java
 @Override
 public Object postProcessBeforeInstantiation(Class<?> beanClass, String beanName) {
  Object cacheKey = getCacheKey(beanClass, beanName);

  if (!StringUtils.hasLength(beanName) || !this.targetSourcedBeans.contains(beanName)) {
   // 从缓存取一次
   if (this.advisedBeans.containsKey(cacheKey)) {
    return null;
   }
   // 判断当前bean是否是基础类型：是否实现了Advice，Pointcut，Advisor，AopInfrastructureBean这些接口或是否是切面(@Aspect注解)
   // 这些bean是不需要进行代理的
   // 添加进缓存 标志位FALSE
   if (isInfrastructureClass(beanClass) || shouldSkip(beanClass, beanName)) {
    this.advisedBeans.put(cacheKey, Boolean.FALSE);
    return null;
   }
  }

  // Create proxy here if we have a custom TargetSource.
  // Suppresses unnecessary default instantiation of the target bean:
  // The TargetSource will handle target instances in a custom fashion.
  // 这里spring给了个口子 产生 targetSource
  // 尝试通过 TargetSourceCreator 获取targetSource
  TargetSource targetSource = getCustomTargetSource(beanClass, beanName);
  // 如果 targetSource不为空
  if (targetSource != null) {
   // 缓存下 
   if (StringUtils.hasLength(beanName)) {
    this.targetSourcedBeans.add(beanName);
   }
   // 通过子类 AbstractAdvisorAutoProxyCreator#getAdvicesAndAdvisorsForBean 实现
   Object[] specificInterceptors = getAdvicesAndAdvisorsForBean(beanClass, beanName, targetSource);
   Object proxy = createProxy(beanClass, beanName, specificInterceptors, targetSource);
   this.proxyTypes.put(cacheKey, proxy.getClass());
   return proxy;
  }

  return null;
 }
```

### getEarlyBeanReference

提前产生代理类，在有循环依赖的情况下

```java
 @Override
 public Object getEarlyBeanReference(Object bean, String beanName) {
  Object cacheKey = getCacheKey(bean.getClass(), beanName);
  this.earlyProxyReferences.put(cacheKey, bean);
  return wrapIfNecessary(bean, beanName, cacheKey);
 }

```

### postProcessAfterInitialization

在bean实例后处理的钩子，尝试产生代理类

```java
 @Override
 public Object postProcessAfterInitialization(@Nullable Object bean, String beanName) {
  if (bean != null) {
   Object cacheKey = getCacheKey(bean.getClass(), beanName);
   if (this.earlyProxyReferences.remove(cacheKey) != bean) {
    return wrapIfNecessary(bean, beanName, cacheKey);
   }
  }
  return bean;
 }
```

### wrapIfNecessary

```java
 protected Object wrapIfNecessary(Object bean, String beanName, Object cacheKey) {
  // 已经被处理过
  // 判断当前bean是否在targetSourcedBeans缓存中存在（已经处理过），如果存在，则直接返回当前bean
  // postProcessBeforeInstantiation 已经返回了bean实例 这里不需要继续处理了
  if (StringUtils.hasLength(beanName) && this.targetSourcedBeans.contains(beanName)) {
   return bean;
  }
  // 从缓存判断一次 是否需要进行代理
  if (Boolean.FALSE.equals(this.advisedBeans.get(cacheKey))) {
   return bean;
  }
  // 判断当前bean是否是基础类型：是否实现了Advice，Pointcut，Advisor，AopInfrastructureBean这些接口或是否是切面(@Aspect注解)
  // 这些bean是不需要进行代理的
  // 添加进缓存 标志位FALSE
  if (isInfrastructureClass(bean.getClass()) || shouldSkip(bean.getClass(), beanName)) {
   this.advisedBeans.put(cacheKey, Boolean.FALSE);
   return bean;
  }

  // Create proxy if we have advice.
  // 通过beanFactory 获取 advice
  Object[] specificInterceptors = getAdvicesAndAdvisorsForBean(bean.getClass(), beanName, null);
  // 如果存在advice 那么产生代理
  if (specificInterceptors != DO_NOT_PROXY) {
   // 为当前的beanName进行缓存,value为true,说明当前bean存在代理 
   this.advisedBeans.put(cacheKey, Boolean.TRUE);
   // 为bean生成代理
   Object proxy = createProxy(
     bean.getClass(), beanName, specificInterceptors, new SingletonTargetSource(bean));
   // 对相应的beanClass 或者是 FactoryBean name进行缓存
   // 用于 根据 beanName predict 相应的 bean class
   this.proxyTypes.put(cacheKey, proxy.getClass());
   return proxy;
  }
   // 为当前的beanName进行缓存,value为true,说明当前bean不存在代理 
  this.advisedBeans.put(cacheKey, Boolean.FALSE);
  // 返回bean
  return bean;
 }
```

### getAdvicesAndAdvisorsForBean

:::tip
子类实现
:::

### createProxy

```java
 protected Object createProxy(Class<?> beanClass, @Nullable String beanName,
   @Nullable Object[] specificInterceptors, TargetSource targetSource) {

  if (this.beanFactory instanceof ConfigurableListableBeanFactory) {
   AutoProxyUtils.exposeTargetClass((ConfigurableListableBeanFactory) this.beanFactory, beanName, beanClass);
  }
  
  // 创建代理工厂
  ProxyFactory proxyFactory = new ProxyFactory();
  // copy aop配置
  proxyFactory.copyFrom(this);
  // proxyTargetClass==true
  if (proxyFactory.isProxyTargetClass()) {
   // Explicit handling of JDK proxy targets and lambdas (for introduction advice scenarios)
   // cglib设置interfaces 
   // 生成代理的时候，会调用AopProxyUtils.completeProxiedInterfaces 都会执行该方法 我觉得是重复执行了
   if (Proxy.isProxyClass(beanClass) || ClassUtils.isLambdaClass(beanClass)) {
    // Must allow for introductions; can't just set interfaces to the proxy's interfaces only.
    for (Class<?> ifc : beanClass.getInterfaces()) {
     proxyFactory.addInterface(ifc);
    }
   }
  }
  // 其实就是判断他有没有PRESERVE_TARGET_CLASS_ATTRIBUTE属性，有的话就要设置ProxyTargetClass=true
  else {
   // No proxyTargetClass flag enforced, let's apply our default checks...
   if (shouldProxyTargetClass(beanClass, beanName)) {
    proxyFactory.setProxyTargetClass(true);
   }
   else {
    // 否则使用jdk动态代理并为其代理配置添加接口
    evaluateProxyInterfaces(beanClass, proxyFactory);
   }
  }
  // 建造advisor通知器数组
  Advisor[] advisors = buildAdvisors(beanName, specificInterceptors);
  proxyFactory.addAdvisors(advisors);
  // 设置target
  proxyFactory.setTargetSource(targetSource);
  // 空方法子类可以覆盖实现
  customizeProxyFactory(proxyFactory);
  // 是否冰冻配置
  proxyFactory.setFrozen(this.freezeProxy);
  if (advisorsPreFiltered()) {
   proxyFactory.setPreFiltered(true);
  }

  // Use original ClassLoader if bean class not locally loaded in overriding class loader
  ClassLoader classLoader = getProxyClassLoader();
  if (classLoader instanceof SmartClassLoader && classLoader != beanClass.getClassLoader()) {
   classLoader = ((SmartClassLoader) classLoader).getOriginalClassLoader();
  }
  // 通过 proxyFactory 产生 代理实例
  return proxyFactory.getProxy(classLoader);
 }

```

### buildAdvisors

```java
 protected Advisor[] buildAdvisors(@Nullable String beanName, @Nullable Object[] specificInterceptors) {
  // Handle prototypes correctly...
  // 从this.interceptorNames取出bean 不是Advisor就适配器包装下
  Advisor[] commonInterceptors = resolveInterceptorNames();

  List<Object> allInterceptors = new ArrayList<>();
  if (specificInterceptors != null) {
   if (specificInterceptors.length > 0) {
    // specificInterceptors may equal PROXY_WITHOUT_ADDITIONAL_INTERCEPTORS
    allInterceptors.addAll(Arrays.asList(specificInterceptors));
   }
   if (commonInterceptors.length > 0) {
    // 从 allInterceptors 头部开始塞入 `commonInterceptors`
    if (this.applyCommonInterceptorsFirst) {
     allInterceptors.addAll(0, Arrays.asList(commonInterceptors));
    }
    else {
     allInterceptors.addAll(Arrays.asList(commonInterceptors));
    }
   }
  }
  if (logger.isTraceEnabled()) {
   int nrOfCommonInterceptors = commonInterceptors.length;
   int nrOfSpecificInterceptors = (specificInterceptors != null ? specificInterceptors.length : 0);
   logger.trace("Creating implicit proxy for bean '" + beanName + "' with " + nrOfCommonInterceptors +
     " common interceptors and " + nrOfSpecificInterceptors + " specific interceptors");
  }

  Advisor[] advisors = new Advisor[allInterceptors.size()];
  for (int i = 0; i < allInterceptors.size(); i++) {
   advisors[i] = this.advisorAdapterRegistry.wrap(allInterceptors.get(i));
  }
  return advisors;
 }
```
