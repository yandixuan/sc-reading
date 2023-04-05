# JdkDynamicAopProxy

:::tip 注意
实现了AopProxy 通过getProxy产生代理对象

JDK 动态代理类，实现了 InvocationHandler 接口
:::

## 构造方法

[AopProxyUtils.completeProxiedInterfaces](./AopProxyUtils.md#completeProxiedInterfaces)

```java
public JdkDynamicAopProxy(AdvisedSupport config) throws AopConfigException {
    Assert.notNull(config, "AdvisedSupport must not be null");
    if (config.getAdvisorCount() == 0 && config.getTargetSource() == AdvisedSupport.EMPTY_TARGET_SOURCE) {
        throw new AopConfigException("No advisors and no TargetSource specified");
    }
    this.advised = config;
    this.proxiedInterfaces = AopProxyUtils.completeProxiedInterfaces(this.advised, true);
    // 接口是否定义了 equals和hashcode方法 正常是没有的，定义了生成的代理以定义的为准
    // 判断代理的接口中的方法是否 有equals、hashCode方法 如果有打上标志位
    findDefinedEqualsAndHashCodeMethods(this.proxiedInterfaces);
}
```

## 方法

### getProxy

AopProxy的接口方法，即获取单例实例

```java
@Override
public Object getProxy() {
    return getProxy(ClassUtils.getDefaultClassLoader());
}

@Override
public Object getProxy(@Nullable ClassLoader classLoader) {
    if (logger.isTraceEnabled()) {
        logger.trace("Creating JDK dynamic proxy: " + this.advised.getTargetSource());
    }
    // jdk动态代理，因为当前类实现了 InvocationHandler 所以this就是动态代理实现类
    return Proxy.newProxyInstance(classLoader, this.proxiedInterfaces, this);
}
```

### invoke

aop jdk动态代理核心方法

[拦截器链执行流程](./ReflectiveMethodInvocation)

```java
public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
    Object oldProxy = null;
    // 通过threadLocal暴露proxy实例
    boolean setProxyContext = false;
    // 通过配置获取 TargetSource 对象
    // advised配置中的target对象都是被 SingletonTargetSource包裹了一层
    TargetSource targetSource = this.advised.targetSource;
    Object target = null;
    try {
        // “通常情况” Spring AOP 不会对 equals、hashCode 方法进行拦截增强，所以此处做了处理
        // equalsDefined 为 false（表示自己没有定义过 eequals 方法），那就交给代理去比较
        // hashCode 同理，只要你自己没有实现过此方法，那就交给代理
        // 需要注意的是：这里统一指的是，如果接口上有此方法，但是你自己并没有实现 equals 和 hashCode 方法，那就走 AOP 这里的实现
        // 如果接口上没有定义此方法，只是实现类里自己 @Override 了 HashCode，那是无效的，就是普通执行
        if (!this.equalsDefined && AopUtils.isEqualsMethod(method)) {
            // The target does not implement the equals(Object) method itself.
            return equals(args[0]);
        }
        else if (!this.hashCodeDefined && AopUtils.isHashCodeMethod(method)) {
            // The target does not implement the hashCode() method itself.
            return hashCode();
        }
        // DecoratingProxy 接口中只有 getDecoratedClass 方法
        // 通过 AopProxyUtils.ultimateTargetClass方法分析advised去找到目标类
        else if (method.getDeclaringClass() == DecoratingProxy.class) {
            // There is only getDecoratedClass() declared -> dispatch to proxy config.
            return AopProxyUtils.ultimateTargetClass(this.advised);
        }
        // 如果实现了Advised接口,通过反射调用 Advised的方法
        else if (!this.advised.opaque && method.getDeclaringClass().isInterface() &&
            method.getDeclaringClass().isAssignableFrom(Advised.class)) {
            // Service invocations on ProxyConfig with the proxy config...
            return AopUtils.invokeJoinpointUsingReflection(this.advised, method, args);
        }
        // 返回值
        Object retVal;
        // 是否暴露代理对象，如果暴露就把当前代理对象放到AopContext上下文中，
        // 这样在本线程的其他地方也可以获取到代理对象了。
        if (this.advised.exposeProxy) {
            // Make invocation available if necessary.
            oldProxy = AopContext.setCurrentProxy(proxy);
            setProxyContext = true;
        }
        // Get as late as possible to minimize the time we "own" the target,
        // in case it comes from a pool.
        // 通过目标源获取目标对象 
        target = targetSource.getTarget();
        Class<?> targetClass = (target != null ? target.getClass() : null);
        // Get the interception chain for this method.
        // 获取作用在这个方法上的所有拦截器链
        List<Object> chain = this.advised.getInterceptorsAndDynamicInterceptionAdvice(method, targetClass);
        // Check whether we have any advice. If we don't, we can fall back on direct
        // reflective invocation of the target, and avoid creating a MethodInvocation.
        // 拦截器为空，直接调用切点方法
        if (chain.isEmpty()) {
            // We can skip creating a MethodInvocation: just invoke the target directly
            // Note that the final invoker must be an InvokerInterceptor so we know it does
            // nothing but a reflective operation on the target, and no hot swapping or fancy proxying.
            // 参数适配处理
            Object[] argsToUse = AopProxyUtils.adaptArgumentsIfNecessary(method, args);
            // 执行目标方法（反射），并获取返回结果
            retVal = AopUtils.invokeJoinpointUsingReflection(target, method, argsToUse);
        }
        else {
            // We need to create a method invocation...
            // 将拦截器统一封装成ReflectiveMethodInvocation
            MethodInvocation invocation =
                    new ReflectiveMethodInvocation(proxy, target, method, args, targetClass, chain);
            // Proceed to the joinpoint through the interceptor chain.
            // 执行ReflectiveMethodInvocation 的反射方法
            retVal = invocation.proceed();
        }
        // Massage return value if necessary.
        // 获取方法返回结果的类型
        Class<?> returnType = method.getReturnType();
        // 如果需要返回代理对象
        // 返回值就是当前目标对象
        // 返回值类型不是 Object 类型
        // 返回值类型就是代理对象的类型
        if (retVal != null && retVal == target &&
                returnType != Object.class && returnType.isInstance(proxy) &&
                !RawTargetAccess.class.isAssignableFrom(method.getDeclaringClass())) {
            // Special case: it returned "this" and the return type of the method
            // is type-compatible. Note that we can't help if the target sets
            // a reference to itself in another returned object.
            // 将当前代理对象作为返回结果
            retVal = proxy;
        }
        // 如果返回值类型为原始类型（基本类型，不能为空）且方法的返回类型不是 Void，如果返回值为空则抛出异常
        else if (retVal == null && returnType != Void.TYPE && returnType.isPrimitive()) {
            throw new AopInvocationException(
                    "Null return value from advice does not match primitive return type for: " + method);
        }
        return retVal;
    }
    finally {
        if (target != null && !targetSource.isStatic()) {
            // Must have come from TargetSource.
            // 那么需要释放当前获取到的目标对象，通常情况下我们的单例 Bean 对应的都是 SingletonTargetSource，不需要释放
            targetSource.releaseTarget(target);
        }
        if (setProxyContext) {
            // Restore old proxy.
            // 如果暴露了当前代理对象，则需要将之前的代理对象重新设置到 ThreadLocal 中
            AopContext.setCurrentProxy(oldProxy);
        }
    }
}
```
