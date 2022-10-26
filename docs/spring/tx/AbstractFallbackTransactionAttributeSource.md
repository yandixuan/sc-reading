# AbstractFallbackTransactionAttributeSource

## invokeWithinTransaction

```java
 @Nullable
 protected Object invokeWithinTransaction(Method method, @Nullable Class<?> targetClass,
   final InvocationCallback invocation) throws Throwable {

  // If the transaction attribute is null, the method is non-transactional.
  TransactionAttributeSource tas = getTransactionAttributeSource();
  final TransactionAttribute txAttr = (tas != null ? tas.getTransactionAttribute(method, targetClass) : null);
  final TransactionManager tm = determineTransactionManager(txAttr);
  
  // 对于webflux的兼容
  if (this.reactiveAdapterRegistry != null && tm instanceof ReactiveTransactionManager) {
   boolean isSuspendingFunction = KotlinDetector.isSuspendingFunction(method);
   boolean hasSuspendingFlowReturnType = isSuspendingFunction &&
     COROUTINES_FLOW_CLASS_NAME.equals(new MethodParameter(method, -1).getParameterType().getName());
   if (isSuspendingFunction && !(invocation instanceof CoroutinesInvocationCallback)) {
    throw new IllegalStateException("Coroutines invocation not supported: " + method);
   }
   CoroutinesInvocationCallback corInv = (isSuspendingFunction ? (CoroutinesInvocationCallback) invocation : null);

   ReactiveTransactionSupport txSupport = this.transactionSupportCache.computeIfAbsent(method, key -> {
    Class<?> reactiveType =
      (isSuspendingFunction ? (hasSuspendingFlowReturnType ? Flux.class : Mono.class) : method.getReturnType());
    ReactiveAdapter adapter = this.reactiveAdapterRegistry.getAdapter(reactiveType);
    if (adapter == null) {
     throw new IllegalStateException("Cannot apply reactive transaction to non-reactive return type: " +
       method.getReturnType());
    }
    return new ReactiveTransactionSupport(adapter);
   });

   InvocationCallback callback = invocation;
   if (corInv != null) {
    callback = () -> CoroutinesUtils.invokeSuspendingFunction(method, corInv.getTarget(), corInv.getArguments());
   }
   Object result = txSupport.invokeWithinTransaction(method, targetClass, callback, txAttr, (ReactiveTransactionManager) tm);
   if (corInv != null) {
    Publisher<?> pr = (Publisher<?>) result;
    return (hasSuspendingFlowReturnType ? KotlinDelegate.asFlow(pr) :
      KotlinDelegate.awaitSingleOrNull(pr, corInv.getContinuation()));
   }
   return result;
  }
  // TransactionManager转型成PlatformTransactionManager
  PlatformTransactionManager ptm = asPlatformTransactionManager(tm);
  // 目标方法唯一标识（类.方法，如service.UserServiceImpl.save）
  final String joinpointIdentification = methodIdentification(method, targetClass, txAttr);
  // 如果txAttr为空或者tm 属于非CallbackPreferringPlatformTransactionManager，执行目标增强
  if (txAttr == null || !(ptm instanceof CallbackPreferringPlatformTransactionManager)) {
   // Standard transaction demarcation with getTransaction and commit/rollback calls.
   // 看是否有必要创建一个事务，根据事务传播行为，做出相应的判断
   TransactionInfo txInfo = createTransactionIfNecessary(ptm, txAttr, joinpointIdentification);

   Object retVal;
   try {
    // This is an around advice: Invoke the next interceptor in the chain.
    // This will normally result in a target object being invoked.
    // invocation是最上面匿名内部类里重写的方法，继续驱动下一个拦截器
    // 最终拦截器执行完成后，会执行目标方法
    retVal = invocation.proceedWithInvocation();
   }
   catch (Throwable ex) {
    // target invocation exception
    // 异常回滚
    completeTransactionAfterThrowing(txInfo, ex);
    throw ex;
   }
   finally {
    // 清除信息
    cleanupTransactionInfo(txInfo);
   }

   if (retVal != null && vavrPresent && VavrDelegate.isVavrTry(retVal)) {
    // Set rollback-only in case of Vavr failure matching our rollback rules...
    TransactionStatus status = txInfo.getTransactionStatus();
    if (status != null && txAttr != null) {
     retVal = VavrDelegate.evaluateTryFailure(retVal, txAttr, status);
    }
   }
   // 提交事务
   commitTransactionAfterReturning(txInfo);
   return retVal;
  }

  else {
   Object result;
   final ThrowableHolder throwableHolder = new ThrowableHolder();

   // It's a CallbackPreferringPlatformTransactionManager: pass a TransactionCallback in.
   try {
    result = ((CallbackPreferringPlatformTransactionManager) ptm).execute(txAttr, status -> {
     TransactionInfo txInfo = prepareTransactionInfo(ptm, txAttr, joinpointIdentification, status);
     try {
      Object retVal = invocation.proceedWithInvocation();
      if (retVal != null && vavrPresent && VavrDelegate.isVavrTry(retVal)) {
       // Set rollback-only in case of Vavr failure matching our rollback rules...
       retVal = VavrDelegate.evaluateTryFailure(retVal, txAttr, status);
      }
      return retVal;
     }
     catch (Throwable ex) {
      if (txAttr.rollbackOn(ex)) {
       // A RuntimeException: will lead to a rollback.
       if (ex instanceof RuntimeException) {
        throw (RuntimeException) ex;
       }
       else {
        throw new ThrowableHolderException(ex);
       }
      }
      else {
       // A normal return value: will lead to a commit.
       throwableHolder.throwable = ex;
       return null;
      }
     }
     finally {
      cleanupTransactionInfo(txInfo);
     }
    });
   }
   catch (ThrowableHolderException ex) {
    throw ex.getCause();
   }
   catch (TransactionSystemException ex2) {
    if (throwableHolder.throwable != null) {
     logger.error("Application exception overridden by commit exception", throwableHolder.throwable);
     ex2.initApplicationException(throwableHolder.throwable);
    }
    throw ex2;
   }
   catch (Throwable ex2) {
    if (throwableHolder.throwable != null) {
     logger.error("Application exception overridden by commit exception", throwableHolder.throwable);
    }
    throw ex2;
   }

   // Check result state: It might indicate a Throwable to rethrow.
   if (throwableHolder.throwable != null) {
    throw throwableHolder.throwable;
   }
   return result;
  }
 }
```

## getTransactionAttribute

```java
 @Override
 @Nullable
 public TransactionAttribute getTransactionAttribute(Method method, @Nullable Class<?> targetClass) {
  // 如果方法是Object的方法
  if (method.getDeclaringClass() == Object.class) {
   return null;
  }

  // First, see if we have a cached value.
  // 先将method、targetClass封装成MethodClassKey对象 这里一个方法+对象class为一个key
  Object cacheKey = getCacheKey(method, targetClass);
  // 去缓存里找
  TransactionAttribute cached = this.attributeCache.get(cacheKey);
  if (cached != null) {
   // Value will either be canonical value indicating there is no transaction attribute,
   // or an actual transaction attribute.
   // 如果缓存的key对应的值是 `NULL_TRANSACTION_ATTRIBUTE` 返回null
   if (cached == NULL_TRANSACTION_ATTRIBUTE) {
    return null;
   }
   else {
    // 返回事务信息
    return cached;
   }
  }
  else {
   // We need to work it out.
   // 如果在缓存中没找到我们需要解析出来
   TransactionAttribute txAttr = computeTransactionAttribute(method, targetClass);
   // Put it in the cache.
   if (txAttr == null) {
    this.attributeCache.put(cacheKey, NULL_TRANSACTION_ATTRIBUTE);
   }
   else {
    // 获取方法的全限定路径
    String methodIdentification = ClassUtils.getQualifiedMethodName(method, targetClass);
    if (txAttr instanceof DefaultTransactionAttribute) {
     DefaultTransactionAttribute dta = (DefaultTransactionAttribute) txAttr;
     dta.setDescriptor(methodIdentification);
     dta.resolveAttributeStrings(this.embeddedValueResolver);
    }
    if (logger.isTraceEnabled()) {
     logger.trace("Adding transactional method '" + methodIdentification + "' with attribute: " + txAttr);
    }
    // 放入缓存
    this.attributeCache.put(cacheKey, txAttr);
   }
   return txAttr;
  }
 }
```

## computeTransactionAttribute

```java
 @Nullable
 protected TransactionAttribute computeTransactionAttribute(Method method, @Nullable Class<?> targetClass) {
  // Don't allow non-public methods, as configured.
  // allowPublicMethodsOnly==true 且 方法不是public 返回null即不支持事务
  if (allowPublicMethodsOnly() && !Modifier.isPublic(method.getModifiers())) {
   return null;
  }

  // The method may be on an interface, but we need attributes from the target class.
  // If the target class is null, the method will be unchanged.
  // SpringAOP代理分为JDK动态代理和CGLIB
  // 获取委托类上的方法
  Method specificMethod = AopUtils.getMostSpecificMethod(method, targetClass);

  // First try is the method in the target class.
  // 从委托类的method上获取 TransactionAttribute信息
  // AnnotationTransactionAttributeSource 有3种解析支持
  // JtaTransactionAnnotationParser,Ejb3TransactionAnnotationParser,SpringTransactionAnnotationParser
  // SpringTransactionAnnotationParser 返回 RuleBasedTransactionAttribute
  TransactionAttribute txAttr = findTransactionAttribute(specificMethod);
  if (txAttr != null) {
   return txAttr;
  }

  // Second try is the transaction attribute on the target class.
  // 尝试从委托类上获取注解信息
  txAttr = findTransactionAttribute(specificMethod.getDeclaringClass());
  if (txAttr != null && ClassUtils.isUserLevelMethod(method)) {
   return txAttr;
  }

  // 尝试从JDK的方法或者类上寻找事务注解信息（JDK动态代理）
  if (specificMethod != method) {
   // Fallback is to look at the original method.
   txAttr = findTransactionAttribute(method);
   if (txAttr != null) {
    return txAttr;
   }
   // Last fallback is the class of the original method.
   txAttr = findTransactionAttribute(method.getDeclaringClass());
   if (txAttr != null && ClassUtils.isUserLevelMethod(method)) {
    return txAttr;
   }
  }

  return null;
 }

```

## determineTransactionManager

决定事务管理器

```java
 @Nullable
 protected TransactionManager determineTransactionManager(@Nullable TransactionAttribute txAttr) {
  // Do not attempt to lookup tx manager if no tx attributes are set
  if (txAttr == null || this.beanFactory == null) {
   // 如果不存在注解信息或beanFactory为null 直接获取 transactionManager（可能为空）  
   return getTransactionManager();
  }
  // 注解上value获取匹配beanName的bean
  // 最终都是从beanFactory获取事务管理器
  String qualifier = txAttr.getQualifier();
  if (StringUtils.hasText(qualifier)) {
   return determineQualifiedTransactionManager(this.beanFactory, qualifier);
  }
  else if (StringUtils.hasText(this.transactionManagerBeanName)) {
   return determineQualifiedTransactionManager(this.beanFactory, this.transactionManagerBeanName);
  }
  else {
   TransactionManager defaultTransactionManager = getTransactionManager();
   if (defaultTransactionManager == null) {
    defaultTransactionManager = this.transactionManagerCache.get(DEFAULT_TRANSACTION_MANAGER_KEY);
    if (defaultTransactionManager == null) {
     defaultTransactionManager = this.beanFactory.getBean(TransactionManager.class);
     this.transactionManagerCache.putIfAbsent(
       DEFAULT_TRANSACTION_MANAGER_KEY, defaultTransactionManager);
    }
   }
   return defaultTransactionManager;
  }
 }
```

## createTransactionIfNecessary

[获取事务状态对象](./AbstractPlatformTransactionManager#gettransaction)

```java
 protected TransactionInfo createTransactionIfNecessary(@Nullable PlatformTransactionManager tm,
   @Nullable TransactionAttribute txAttr, final String joinpointIdentification) {

  // If no name specified, apply method identification as transaction name.
  // 如果事务名称为null，就提供方法标识为事务名称
  if (txAttr != null && txAttr.getName() == null) {
   txAttr = new DelegatingTransactionAttribute(txAttr) {
    @Override
    public String getName() {
     return joinpointIdentification;
    }
   };
  }
  // 事务状态对象
  TransactionStatus status = null;
  if (txAttr != null) {
   if (tm != null) {
     // 获取事务状态对象
    status = tm.getTransaction(txAttr);
   }
   else {
    if (logger.isDebugEnabled()) {
     logger.debug("Skipping transactional joinpoint [" + joinpointIdentification +
       "] because no transaction manager has been configured");
    }
   }
  }
  // 将这些参数包装成事务信息对象
  // 同时将当前事务信息绑定到当前线程上下文
  return prepareTransactionInfo(tm, txAttr, joinpointIdentification, status);
 }
```
