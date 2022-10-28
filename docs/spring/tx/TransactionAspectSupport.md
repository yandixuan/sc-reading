# TransactionAspectSupport

```java
 @Nullable
 protected Object invokeWithinTransaction(Method method, @Nullable Class<?> targetClass,
   final InvocationCallback invocation) throws Throwable {

  // If the transaction attribute is null, the method is non-transactional.
  // 获取 AnnotationTransactionAttributeSource
  TransactionAttributeSource tas = getTransactionAttributeSource();
  // 获取class、mehtod获取@Transactional注解
  final TransactionAttribute txAttr = (tas != null ? tas.getTransactionAttribute(method, targetClass) : null);
  final TransactionManager tm = determineTransactionManager(txAttr);

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

  PlatformTransactionManager ptm = asPlatformTransactionManager(tm);
  final String joinpointIdentification = methodIdentification(method, targetClass, txAttr);

  if (txAttr == null || !(ptm instanceof CallbackPreferringPlatformTransactionManager)) {
   // Standard transaction demarcation with getTransaction and commit/rollback calls.
   TransactionInfo txInfo = createTransactionIfNecessary(ptm, txAttr, joinpointIdentification);

   Object retVal;
   try {
    // This is an around advice: Invoke the next interceptor in the chain.
    // This will normally result in a target object being invoked.
    retVal = invocation.proceedWithInvocation();
   }
   catch (Throwable ex) {
    // target invocation exception
    completeTransactionAfterThrowing(txInfo, ex);
    throw ex;
   }
   finally {
    cleanupTransactionInfo(txInfo);
   }

   if (retVal != null && vavrPresent && VavrDelegate.isVavrTry(retVal)) {
    // Set rollback-only in case of Vavr failure matching our rollback rules...
    TransactionStatus status = txInfo.getTransactionStatus();
    if (status != null && txAttr != null) {
     retVal = VavrDelegate.evaluateTryFailure(retVal, txAttr, status);
    }
   }

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

## completeTransactionAfterThrowing

```java
 /**
  * Handle a throwable, completing the transaction.
  * We may commit or roll back, depending on the configuration.
  * @param txInfo information about the current transaction
  * @param ex throwable encountered
  */
 protected void completeTransactionAfterThrowing(@Nullable TransactionInfo txInfo, Throwable ex) {
  // 但是调用这个方法的位置 txInfo必不为空 我不知道为啥要标记@Nullable
  // 当抛出异常时，先判断当前是否存在事务，这是基础依据
  if (txInfo != null && txInfo.getTransactionStatus() != null) {
   if (logger.isTraceEnabled()) {
    logger.trace("Completing transaction for [" + txInfo.getJoinpointIdentification() +
      "] after exception: " + ex);
   }
   /*
    * 如果事务属性不为null，并且通过事物属性的rollbackOn方法判断出当前的异常需要进行回滚，那么就进行回滚
    * 声明式事务一般都是这个逻辑
    */
   if (txInfo.transactionAttribute != null && txInfo.transactionAttribute.rollbackOn(ex)) {
    try {
     // 那么通过事务管理器执行rollback回滚操作 
     txInfo.getTransactionManager().rollback(txInfo.getTransactionStatus());
    }
    catch (TransactionSystemException ex2) {
     logger.error("Application exception overridden by rollback exception", ex);
     ex2.initApplicationException(ex);
     throw ex2;
    }
    catch (RuntimeException | Error ex2) {
     logger.error("Application exception overridden by rollback exception", ex);
     throw ex2;
    }
   }
   else {
    // We don't roll back on this exception.
    // Will still roll back if TransactionStatus.isRollbackOnly() is true.
    try {
     // 如果不是指定的异常那么就通过事务管理器提交事务 
     txInfo.getTransactionManager().commit(txInfo.getTransactionStatus());
    }
    catch (TransactionSystemException ex2) {
     logger.error("Application exception overridden by commit exception", ex);
     ex2.initApplicationException(ex);
     throw ex2;
    }
    catch (RuntimeException | Error ex2) {
     logger.error("Application exception overridden by commit exception", ex);
     throw ex2;
    }
   }
  }
 }
```

## cleanupTransactionInfo

当前事务已经完成了，恢复旧的TransactionInfo与当前事务的绑定

```java
 /**
  * Reset the TransactionInfo ThreadLocal.
  * <p>Call this in all cases: exception or normal return!
  * @param txInfo information about the current transaction (may be {@code null})
  */
 protected void cleanupTransactionInfo(@Nullable TransactionInfo txInfo) {
  if (txInfo != null) {
   txInfo.restoreThreadLocalStatus();
  }
 }
```

## commitTransactionAfterReturning

```java
 /**
  * Execute after successful completion of call, but not after an exception was handled.
  * Do nothing if we didn't create a transaction.
  * @param txInfo information about the current transaction
  */
 protected void commitTransactionAfterReturning(@Nullable TransactionInfo txInfo) {
  if (txInfo != null && txInfo.getTransactionStatus() != null) {
   if (logger.isTraceEnabled()) {
    logger.trace("Completing transaction for [" + txInfo.getJoinpointIdentification() + "]");
   }
   // 通过事务管理器提交事务
   txInfo.getTransactionManager().commit(txInfo.getTransactionStatus());
  }
 }
```
