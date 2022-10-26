# TransactionInterceptor

继承[`TransactionAspectSupport`](./TransactionAspectSupport)

## invoke

aop拦截器核心方法

invokeWithinTransaction由父类`TransactionAspectSupport`实现

```java
 @Override
 @Nullable
 public Object invoke(MethodInvocation invocation) throws Throwable {
  // Work out the target class: may be {@code null}.
  // The TransactionAttributeSource should be passed the target class
  // as well as the method, which may be from an interface.
  // 获取target的class类型
  Class<?> targetClass = (invocation.getThis() != null ? AopUtils.getTargetClass(invocation.getThis()) : null);

  // Adapt to TransactionAspectSupport's invokeWithinTransaction...
  return invokeWithinTransaction(invocation.getMethod(), targetClass, new CoroutinesInvocationCallback() {
   @Override
   @Nullable
   public Object proceedWithInvocation() throws Throwable {
    return invocation.proceed();
   }
   @Override
   public Object getTarget() {
    return invocation.getThis();
   }
   @Override
   public Object[] getArguments() {
    return invocation.getArguments();
   }
  });
 }
```
