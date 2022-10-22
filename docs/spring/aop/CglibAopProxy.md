# CglibAopProxy

基于cglib产生proxy代理类

[参考](https://www.jianshu.com/p/ab6d54c31ff1)

## 方法

### getProxy

通过cglib继承class产生代理类

```java
 @Override
 public Object getProxy(@Nullable ClassLoader classLoader) {
  if (logger.isTraceEnabled()) {
   logger.trace("Creating CGLIB proxy: " + this.advised.getTargetSource());
  }

  try {
   // 获取代理目标类的class类型 
   Class<?> rootClass = this.advised.getTargetClass();
   Assert.state(rootClass != null, "Target class must be available for creating a CGLIB proxy");

   Class<?> proxySuperClass = rootClass;
   // 如果targetClass本身就是cglib的代理类
   if (rootClass.getName().contains(ClassUtils.CGLIB_CLASS_SEPARATOR)) {
    // 获取父类
    proxySuperClass = rootClass.getSuperclass();
    // 获取父类的接口并加接口加入aop配置advised中
    Class<?>[] additionalInterfaces = rootClass.getInterfaces();
    for (Class<?> additionalInterface : additionalInterfaces) {
     this.advised.addInterface(additionalInterface);
    }
   }
   // 打印出不能代理的方法名，CGLIB 是使用继承实现的，所以final , static 的方法不能被增强
   // Validate the class, writing log messages as necessary.
   validateClassIfNecessary(proxySuperClass, classLoader);

   // Configure CGLIB Enhancer...
   // 创建并配置 Enhancer，  Enhancer 是CGLIB 主要的操作类
   Enhancer enhancer = createEnhancer();
   if (classLoader != null) {
    enhancer.setClassLoader(classLoader);
    if (classLoader instanceof SmartClassLoader &&
      ((SmartClassLoader) classLoader).isClassReloadable(proxySuperClass)) {
     enhancer.setUseCache(false);
    }
   }
   // 设置父类
   enhancer.setSuperclass(proxySuperClass);
   // 设置接口
   enhancer.setInterfaces(AopProxyUtils.completeProxiedInterfaces(this.advised));
   // 设置 CGLIB 代理类的命名策略
   enhancer.setNamingPolicy(SpringNamingPolicy.INSTANCE);
   // 设置 CGLIB 代理类字节码的默认生成策略
   enhancer.setStrategy(new ClassLoaderAwareGeneratorStrategy(classLoader));
   // 获取代理的回调方法集合
   Callback[] callbacks = getCallbacks(rootClass);
   // 获取拦截器的所有类型
   // 用于注入进enhancer
   Class<?>[] types = new Class<?>[callbacks.length];
   for (int x = 0; x < types.length; x++) {
    types[x] = callbacks[x].getClass();
   }
   // fixedInterceptorMap only populated at this point, after getCallbacks call above
   // CallbackFilter中的return值为被代理类的各个方法在回调数组Callback[]中的位置索引
   // 一个 method 只能被一个 Callback 增强处理
   // 存在超过一个 Callback 的情况下，就需要设置 CallbackFilter，用来分配一个 method 由哪个 Callback 增强处理
   enhancer.setCallbackFilter(new ProxyCallbackFilter(
     this.advised.getConfigurationOnlyCopy(), this.fixedInterceptorMap, this.fixedInterceptorOffset));
   enhancer.setCallbackTypes(types);

   // Generate the proxy class and create a proxy instance.
   // 使用enhancer生成代理对象
   return createProxyClassAndInstance(enhancer, callbacks);
  }
  catch (CodeGenerationException | IllegalArgumentException ex) {
   throw new AopConfigException("Could not generate CGLIB subclass of " + this.advised.getTargetClass() +
     ": Common causes of this problem include using a final class or a non-visible class",
     ex);
  }
  catch (Throwable ex) {
   // TargetSource.getTarget() failed
   throw new AopConfigException("Unexpected AOP exception", ex);
  }
 }

```

### validateClassIfNecessary

```java
 private void doValidateClass(Class<?> proxySuperClass, @Nullable ClassLoader proxyClassLoader, Set<Class<?>> ifcs) {
  // 父类不是Object.class
  if (proxySuperClass != Object.class) {
   // 反射获取method数组 
   Method[] methods = proxySuperClass.getDeclaredMethods();
   for (Method method : methods) {
    // 获取方法修饰符
    int mod = method.getModifiers();
    // 非静态方法 且 不是私有方法
    if (!Modifier.isStatic(mod) && !Modifier.isPrivate(mod)) {
     // 如果是final方法
     if (Modifier.isFinal(mod)) {
      // 如果该方法时接口里的方法  
      if (logger.isInfoEnabled() && implementsInterface(method, ifcs)) {
       logger.info("Unable to proxy interface-implementing method [" + method + "] because " +
         "it is marked as final: Consider using interface-based JDK proxies instead!");
      }
      // 打印final方法无法被cglib增强
      if (logger.isDebugEnabled()) {
       logger.debug("Final method [" + method + "] cannot get proxied via CGLIB: " +
         "Calls to this method will NOT be routed to the target instance and " +
         "might lead to NPEs against uninitialized fields in the proxy instance.");
      }
     }
     // 方法非public
     // 方法非protected
     // proxyClassLoader是空
     // 传入的类加载器与父类的类加载器不是同有个 
     // 打印日志 无法增强方法
     else if (logger.isDebugEnabled() && !Modifier.isPublic(mod) && !Modifier.isProtected(mod) &&
       proxyClassLoader != null && proxySuperClass.getClassLoader() != proxyClassLoader) {
      logger.debug("Method [" + method + "] is package-visible across different ClassLoaders " +
        "and cannot get proxied via CGLIB: Declare this method as public or protected " +
        "if you need to support invocations through the proxy.");
     }
    }
   }
   // 继续像上找父类并验证
   doValidateClass(proxySuperClass.getSuperclass(), proxyClassLoader, ifcs);
  }
 }
```

### getCallbacks

```java
 private Callback[] getCallbacks(Class<?> rootClass) throws Exception {
  // Parameters used for optimization choices...
  // 是否暴露代理类
  boolean exposeProxy = this.advised.isExposeProxy();
  // 是否被冻结
  boolean isFrozen = this.advised.isFrozen();
  // 是否静态类，这里的静态并非指静态类，而是每次调用返回的实例都是否是不可变的
  // 如单例模式的bean就是静态，而多例模式下的bean就不是静态
  boolean isStatic = this.advised.getTargetSource().isStatic();

  // Choose an "aop" interceptor (used for AOP calls).
  // 将拦截器封装在DynamicAdvisedInterceptor中
  Callback aopInterceptor = new DynamicAdvisedInterceptor(this.advised);

  // Choose a "straight to target" interceptor. (used for calls that are
  // unadvised but can return this). May be required to expose the proxy.
  Callback targetInterceptor;
  if (exposeProxy) {
   targetInterceptor = (isStatic ?
     new StaticUnadvisedExposedInterceptor(this.advised.getTargetSource().getTarget()) :
     // 动态的target 就封装在targetSource对象里
     new DynamicUnadvisedExposedInterceptor(this.advised.getTargetSource()));
  }
  else {
   targetInterceptor = (isStatic ?
     new StaticUnadvisedInterceptor(this.advised.getTargetSource().getTarget()) :
     new DynamicUnadvisedInterceptor(this.advised.getTargetSource()));
  }

  // Choose a "direct to target" dispatcher (used for
  // unadvised calls to static targets that cannot return this).
  Callback targetDispatcher = (isStatic ?
    new StaticDispatcher(this.advised.getTargetSource().getTarget()) : new SerializableNoOp());

  Callback[] mainCallbacks = new Callback[] {
    // 进行 AOP 代理的通用拦截器
    aopInterceptor,  // for normal advice
    // 执行目标方法的拦截器
    targetInterceptor,  // invoke target without considering advice, if optimized
    // 不需要增强的方法
    new SerializableNoOp(),  // no override for methods mapped to this
    // 目标对象调度器，用于获取目标对象
    targetDispatcher, 
    // 通过 advised 直接调用 Advised 接口的方法
    this.advisedDispatcher,
    // 专门用来处理 equals 方法的拦截器，和 JdkDynamicAopProxy 类似
    new EqualsInterceptor(this.advised),
    // 专门用来处理 equals 方法的拦截器，和 JdkDynamicAopProxy 类似
    new HashCodeInterceptor(this.advised)
  };

  Callback[] callbacks;

  // If the target is a static one and the advice chain is frozen,
  // then we can make some optimizations by sending the AOP calls
  // direct to the target using the fixed chain for that method.
  /*
   * 如果目标对象不需要每次都创建，且当前 AdvisedSupport 配置管理器被冻结了，性能优化，可暂时忽略
   * 那么在创建代理对象的时候，就可以先将目标对象的每个方法对应的方法调用器解析出来，该过程有点性能损耗，这样在代理对象执行方法的时候性能有所提升
   * 不过由于这里会解析出许多方法调用器，会占有一定的内存，以空间换时间
   */
  if (isStatic && isFrozen) {
   Method[] methods = rootClass.getMethods();
   Callback[] fixedCallbacks = new Callback[methods.length];
   this.fixedInterceptorMap = CollectionUtils.newHashMap(methods.length);
   // TODO: small memory optimization here (can skip creation for methods with no advice)
   // cglib代理还提供了一个优化机制，如果isFrozen为true，那么将创建一个固定的拦截链 FixedChainStaticTargetInterceptor，因为此时无法调
   // 用Advised接口的方法增加或者删除Advice，拦截链不会发生改变，因此之后调用方法时将不会每次都进行拦截链的获取。当然，之前在分析jdk代理时发现Spring也对拦截链进行了缓存，不过如果调用了Advised接口中的增加删除advice时，会将此缓存将会被移除，下一次调用将会重新获取拦截链。
   for (int x = 0; x < methods.length; x++) {
    Method method = methods[x];
    List<Object> chain = this.advised.getInterceptorsAndDynamicInterceptionAdvice(method, rootClass);
    fixedCallbacks[x] = new FixedChainStaticTargetInterceptor(
      chain, this.advised.getTargetSource().getTarget(), this.advised.getTargetClass());
    this.fixedInterceptorMap.put(method, x);
   }

   // Now copy both the callbacks from mainCallbacks
   // and fixedCallbacks into the callbacks array.
   // 现在从mainCallbacks复制两个回调并将fixedCallbacks放入callbacks数组中
   callbacks = new Callback[mainCallbacks.length + fixedCallbacks.length];
   System.arraycopy(mainCallbacks, 0, callbacks, 0, mainCallbacks.length);
   System.arraycopy(fixedCallbacks, 0, callbacks, mainCallbacks.length, fixedCallbacks.length);
   // mainCallbacks长度后面的callback都是 method的相应的callback 不会再变化了
   this.fixedInterceptorOffset = mainCallbacks.length;
  }
  else {
   callbacks = mainCallbacks;
  }
  return callbacks;
 }
```

## DynamicAdvisedInterceptor

### intercept

拦截器的主要执行方法

```java
  @Override
  @Nullable
  public Object intercept(Object proxy, Method method, Object[] args, MethodProxy methodProxy) throws Throwable {
   Object oldProxy = null;
   boolean setProxyContext = false;
   Object target = null;
   // 获取targetSource
   TargetSource targetSource = this.advised.getTargetSource();
   try {
    // 是否暴露代理实例
    if (this.advised.exposeProxy) {
     // Make invocation available if necessary.
     oldProxy = AopContext.setCurrentProxy(proxy);
     setProxyContext = true;
    }
    // Get as late as possible to minimize the time we "own" the target, in case it comes from a pool...
    target = targetSource.getTarget();
    Class<?> targetClass = (target != null ? target.getClass() : null);
    // 获取拦截器链
    List<Object> chain = this.advised.getInterceptorsAndDynamicInterceptionAdvice(method, targetClass);
    // 返回值
    Object retVal;
    // Check whether we only have one InvokerInterceptor: that is,
    // no real advice, but just reflective invocation of the target.
    // public方法
    // 不是Object.class的方法
    // 不是equals、toString、hashCode方法
    if (chain.isEmpty() && CglibMethodInvocation.isMethodProxyCompatible(method)) {
     // We can skip creating a MethodInvocation: just invoke the target directly.
     // Note that the final invoker must be an InvokerInterceptor, so we know
     // it does nothing but a reflective operation on the target, and no hot
     // swapping or fancy proxying.
     // 参数类型适配
     Object[] argsToUse = AopProxyUtils.adaptArgumentsIfNecessary(method, args);
     // 调用原方法
     retVal = invokeMethod(target, method, argsToUse, methodProxy);
    }
    else {
     // 进入拦截器链中执行方法
     // We need to create a method invocation...
     retVal = new CglibMethodInvocation(proxy, target, method, args, targetClass, chain, methodProxy).proceed();
    }
    // 对返回结果进行处理
    retVal = processReturnType(proxy, target, method, retVal);
    return retVal;
   }
   finally {
    if (target != null && !targetSource.isStatic()) {
     targetSource.releaseTarget(target);
    }
    if (setProxyContext) {
     // Restore old proxy.
     AopContext.setCurrentProxy(oldProxy);
    }
   }
  }
```

## CglibMethodInvocation

[该方法继承了 ReflectiveMethodInvocation](./ReflectiveMethodInvocation)

### invokeJoinpoint

对方法进行了覆盖,cglib通过mehtodProxy调用原方法

```java
  @Override
  protected Object invokeJoinpoint() throws Throwable {
   if (this.methodProxy != null) {
    try {
     return this.methodProxy.invoke(this.target, this.arguments);
    }
    catch (CodeGenerationException ex) {
     logFastClassGenerationFailure(this.method);
    }
   }
   return super.invokeJoinpoint();
  }

```

### proceed

没有重写proceed()方法，因此获取代理对象后的执行逻辑与jdk动态代理方式完全一样

```java
@Override
@Nullable
public Object proceed() throws Throwable {
 try {
  return super.proceed();
 }
 catch (RuntimeException ex) {
  throw ex;
 }
 catch (Exception ex) {
  if (ReflectionUtils.declaresException(getMethod(), ex.getClass()) ||
    KotlinDetector.isKotlinType(getMethod().getDeclaringClass())) {
   // Propagate original exception if declared on the target method
   // (with callers expecting it). Always propagate it for Kotlin code
   // since checked exceptions do not have to be explicitly declared there.
   throw ex;
  }
  else {
   // Checked exception thrown in the interceptor but not declared on the
   // target method signature -> apply an UndeclaredThrowableException,
   // aligned with standard JDK dynamic proxy behavior.
   throw new UndeclaredThrowableException(ex);
  }
 }
}

```

## ProxyCallbackFilter

当enhancer设置了callback数组,那么必须设置 CallbackFilter

### accept

返回值决定了使用callback对应的下标类

```java
@Override
public int accept(Method method) {
 // finalize 方法不需要代理类重写 
 if (AopUtils.isFinalizeMethod(method)) {
  logger.trace("Found finalize() method - using NO_OVERRIDE");
  // 不增强
  return NO_OVERRIDE;
 }
 // 是否非透明化处理（是否不暴露aop配置）
 // !this.advised.isOpaque() ==true 即暴露aop配置
 // Advised 接口的方法由 AdvisedDispatcher 增强处理，即直接调用 advised 中的对应方法
 if (!this.advised.isOpaque() && method.getDeclaringClass().isInterface() &&
   method.getDeclaringClass().isAssignableFrom(Advised.class)) {
  if (logger.isTraceEnabled()) {
   logger.trace("Method is declared on Advised interface: " + method);
  }
  // 调用advised的接口方法
  return DISPATCH_ADVISED;
 }
 // We must always proxy equals, to direct calls to this.
 // equals 方法由 EqualsInterceptor 代理
 if (AopUtils.isEqualsMethod(method)) {
  if (logger.isTraceEnabled()) {
   logger.trace("Found 'equals' method: " + method);
  }
  // 调用代理类的equals
  return INVOKE_EQUALS;
 }
 // We must always calculate hashCode based on the proxy.
 // hashCode 方法由 HashCodeInterceptor 代理
 if (AopUtils.isHashCodeMethod(method)) {
  if (logger.isTraceEnabled()) {
   logger.trace("Found 'hashCode' method: " + method);
  }
  // 调用代理类的hashCode
  return INVOKE_HASHCODE;
 }
 Class<?> targetClass = this.advised.getTargetClass();
 // Proxy is not yet available, but that shouldn't matter.
 List<?> chain = this.advised.getInterceptorsAndDynamicInterceptionAdvice(method, targetClass);
 // chain 不为空，表示当前 method 需要被增强处理
 boolean haveAdvice = !chain.isEmpty();
 boolean exposeProxy = this.advised.isExposeProxy();
 boolean isStatic = this.advised.getTargetSource().isStatic();
 boolean isFrozen = this.advised.isFrozen();
 if (haveAdvice || !isFrozen) {
  // If exposing the proxy, then AOP_PROXY must be used.
  // 如果公开代理，让其在整个拦截器责任链中可见，则必须使用 AOP_PROXY，即 DynamicAdvisedInterceptor
  if (exposeProxy) {
   if (logger.isTraceEnabled()) {
    logger.trace("Must expose proxy on advised method: " + method);
   }
   return AOP_PROXY;
  }
  // Check to see if we have fixed interceptor to serve this method.
  // Else use the AOP_PROXY.
  // 检查我们是否有固定拦截器来增强当前 method。
  if (isStatic && isFrozen && this.fixedInterceptorMap.containsKey(method)) {
   if (logger.isTraceEnabled()) {
    logger.trace("Method has advice and optimizations are enabled: " + method);
   }
   // We know that we are optimizing so we can use the FixedStaticChainInterceptors.
   int index = this.fixedInterceptorMap.get(method);
   return (index + this.fixedInterceptorOffset);
  }
  else {
   if (logger.isTraceEnabled()) {
    logger.trace("Unable to apply any optimizations to advised method: " + method);
   }
   // 否则使用 AOP_PROXY，即 DynamicAdvisedInterceptor
   return AOP_PROXY;
  }
 }
 else {
  // See if the return type of the method is outside the class hierarchy of the target type.
  // If so we know it never needs to have return type massage and can use a dispatcher.
  // If the proxy is being exposed, then must use the interceptor the correct one is already
  // configured. If the target is not static, then we cannot use a dispatcher because the
  // target needs to be explicitly released after the invocation.
  // 如果需要暴露代理对象，或者 target 对象是可变的，则通过 StaticUnadvisedExposedInterceptor 代理
  if (exposeProxy || !isStatic) {
   return INVOKE_TARGET;
  }
  Class<?> returnType = method.getReturnType();
  // 如果当前方法的返回类型是目标对象的类型，则通过 StaticUnadvisedExposedInterceptor 代理
  if (targetClass != null && returnType.isAssignableFrom(targetClass)) {
   if (logger.isTraceEnabled()) {
    logger.trace("Method return type is assignable from target type and " +
      "may therefore return 'this' - using INVOKE_TARGET: " + method);
   }
   return INVOKE_TARGET;
  }
  else {
   if (logger.isTraceEnabled()) {
    logger.trace("Method return type ensures 'this' cannot be returned - " +
      "using DISPATCH_TARGET: " + method);
   }
   // 否则，通过 StaticDispatcher 进行代理
   return DISPATCH_TARGET;
  }
 }
}
```
