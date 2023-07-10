# InvocationHandlerFactory

动态代理处理器生产者抽象

```java
public interface InvocationHandlerFactory {
  /* 生产动态代理调用处理器  
   * target: 请求对象包含地址信息等
   * dispatch: 方法与相应的请求执行逻辑映射
   */
  InvocationHandler create(Target target, Map<Method, MethodHandler> dispatch);

  /* 定义处理器调用动作 */
  interface MethodHandler {

    Object invoke(Object[] argv) throws Throwable;
    /* 子接口，生产MethodHandler工厂类 */
    interface Factory<C> {
      MethodHandler create(Target<?> target,
                           MethodMetadata md,
                           C requestContext);
    }
  }
  /* 动态代理调用处理器生产工厂的默认实现 */
  static final class Default implements InvocationHandlerFactory {

    @Override
    public InvocationHandler create(Target target, Map<Method, MethodHandler> dispatch) {
      return new ReflectiveFeign.FeignInvocationHandler(target, dispatch);
    }
  }
}
```

feign通过[`ReflectiveFeign`](./ReflectiveFeign)产生动态代理实例，通过[`ReflectiveFeign.FeignInvocationHandler`](./FeignInvocationHandler)产生动态代理处理器，通过[ParseHandlersByName#apply](./ParseHandlersByName#apply)方法解析注解时会生产Method-MethodHandler的映射map提供给动态代理的`InvocationHandler`使用，这个MethodHandler实例在feign中默认实现是[SynchronousMethodHandler](./SynchronousMethodHandler)

通过Proxy对象执行Http请求，则会触发Method相应的[`invoke`](./SynchronousMethodHandler#invoke)方法，根据[`MethodMetadata`](./MethodMetadata)根据规则选择合适的分支生产相应的`RequestTemplate`即本次Http所包含信息的对象，再通过[`Client`](../client/)执行本次请求获得本次Response，再由[`ResponseHandler`](../ResponseHandler)解码本次响应即完成本次请求流程。
