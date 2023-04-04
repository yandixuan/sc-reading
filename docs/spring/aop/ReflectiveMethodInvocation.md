# ReflectiveMethodInvocation

## 属性

```java
// 代理对象
protected final Object proxy;

// 目标对象
@Nullable
protected final Object target;

// 方法
protected final Method method;

// 方法参数
protected Object[] arguments;

// 目标对象class类型
@Nullable
private final Class<?> targetClass;

/**
 * Lazily initialized map of user-specific attributes for this invocation.
 */ 
@Nullable
private Map<String, Object> userAttributes;

/**
 * List of MethodInterceptor and InterceptorAndDynamicMethodMatcher
 * that need dynamic checks.
 */
// 拦截器 
protected final List<?> interceptorsAndDynamicMethodMatchers;

/**
 * Index from 0 of the current interceptor we're invoking.
 * -1 until we invoke: then the current interceptor.
 */
/** 当前已经执行完的拦截器的位置索引，执行完则执行目标方法 */
private int currentInterceptorIndex = -1;
```

## 构造方法

```java
protected ReflectiveMethodInvocation(
    Object proxy, @Nullable Object target, Method method, @Nullable Object[] arguments,
    @Nullable Class<?> targetClass, List<Object> interceptorsAndDynamicMethodMatchers) {

    this.proxy = proxy;
    this.target = target;
    this.targetClass = targetClass;
    // 通过BridgeMethodResolver由桥接方法获取到实际泛型方法
    this.method = BridgeMethodResolver.findBridgedMethod(method);
    // 主要针对的是可变参数的处理，根据参数类型转成确定的类型
    // 如果arguments里的可变参数类型是object[]，参数是string 那么就将object[]--->string[]
    this.arguments = AopProxyUtils.adaptArgumentsIfNecessary(method, arguments);
    // 赋值拦截器链
    this.interceptorsAndDynamicMethodMatchers = interceptorsAndDynamicMethodMatchers;
}
```

## 方法

### proceed

拦截器链主要的执行方法

```java
@Override
@Nullable
public Object proceed() throws Throwable {
    // We start with an index of -1 and increment early.
    // 如果当前已经执行完的拦截器的位置索引就是最后一个，那么即可执行目标方法
    if (this.currentInterceptorIndex == this.interceptorsAndDynamicMethodMatchers.size() - 1) {
    // 执行目标方法（反射执行）
        return invokeJoinpoint();
    }
    // 按顺序获取拦截器 
    Object interceptorOrInterceptionAdvice =
        this.interceptorsAndDynamicMethodMatchers.get(++this.currentInterceptorIndex);
    // 如果是 InterceptorAndDynamicMethodMatcher 类型，表示 MethodMatcher 在真正的执行时需要做一些检测
    if (interceptorOrInterceptionAdvice instanceof InterceptorAndDynamicMethodMatcher) {
        // Evaluate dynamic method matcher here: static part will already have
        // been evaluated and found to match.
        InterceptorAndDynamicMethodMatcher dm =
            (InterceptorAndDynamicMethodMatcher) interceptorOrInterceptionAdvice;
        Class<?> targetClass = (this.targetClass != null ? this.targetClass : this.method.getDeclaringClass());
        // 通过 MethodMatcher 对目标方法进行匹配
        if (dm.methodMatcher.matches(this.method, targetClass, this.arguments)) {
            // 匹配通过，则执行这个拦截器，并传递当前对象 
            // MethodBeforeAdviceInterceptor
            // AfterReturningAdviceInterceptor
            // ThrowsAdviceInterceptor
            // 由于传递了当前拦截器链对象 那么在这3个拦截器内部执行方法时 在相应的位置执行拦截器链的proceed方法就能达到顺序效果
            return dm.interceptor.invoke(this);
        }
        else {
            // Dynamic matching failed.
            // Skip this interceptor and invoke the next in the chain.
            // 直接跳过这个拦截器 执行下一个拦截器
            return proceed();
        }
    }
    else {
        // It's an interceptor, so we just invoke it: The pointcut will have
        // been evaluated statically before this object was constructed.
        // 否则执行这个拦截器，并传递当前对象
        return ((MethodInterceptor) interceptorOrInterceptionAdvice).invoke(this);
    }
}
```
