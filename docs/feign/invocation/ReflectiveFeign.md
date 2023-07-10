# ReflectiveFeign

## 构造函数

- contract：一个 Contract 对象，用于定义 Feign 客户端的契约。它描述了如何将接口方法映射到远程服务的请求。
- methodHandlerFactory：一个 `MethodHandler.Factory<C>` 对象，用于创建方法处理器。方法处理器负责将接口方法调用转换为对远程服务的请求，并处理响应。
- invocationHandlerFactory：一个 InvocationHandlerFactory 对象，用于创建调用处理器。调用处理器负责实际执行远程请求，并返回结果。
- defaultContextSupplier：一个 `AsyncContextSupplier<C>` 对象，用于提供默认的异步上下文。异步上下文是一种管理异步调用的机制，它可以跟踪和传递上下文信息，如请求头、认证信息等。

```c
  ReflectiveFeign(
      Contract contract,
      MethodHandler.Factory<C> methodHandlerFactory,
      InvocationHandlerFactory invocationHandlerFactory,
      AsyncContextSupplier<C> defaultContextSupplier) {
    this.targetToHandlersByName = new ParseHandlersByName<C>(contract, methodHandlerFactory);
    this.factory = invocationHandlerFactory;
    this.defaultContextSupplier = defaultContextSupplier;
  }
```

## 函数

### newInstance

`feign`创建动态代理

通过InvocationHandlerFactory为interface创建

接口方法的调用委托给

<VPLink icon="i-carbon-document" title="ParseHandlersByName" url="./ParseHandlersByName"/>

```c
  public <T> T newInstance(Target<T> target, C requestContext) {
    /* 目标规范中的方法返回类型符合异步调用的要求，即要么是同步调用（不返回 CompletableFuture），要么是异步调用（返回 CompletableFuture，并且泛型参数不包含通配符）*/
    TargetSpecificationVerifier.verify(target);
    /* 解析method上的注解元信息，生成MethodHandler，形成method-MethodHandler的map映射 */
    Map<Method, MethodHandler> methodToHandler =
        targetToHandlersByName.apply(target, requestContext);
    /* 动态代理的调用处理程序创建，由工厂类产生 */
    InvocationHandler handler = factory.create(target, methodToHandler);
    /* 为接口创建动态代理类 */
    T proxy = (T) Proxy.newProxyInstance(target.type().getClassLoader(),
        new Class<?>[] {target.type()}, handler);
    /* 对接口的default method调用的拦截 */
    for (MethodHandler methodHandler : methodToHandler.values()) {
      if (methodHandler instanceof DefaultMethodHandler) {
        ((DefaultMethodHandler) methodHandler).bindTo(proxy);
      }
    }

    return proxy;
  }
```
