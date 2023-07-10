# FeignInvocationHandler

实现了`java.lang.reflect.InvocationHandler`，即动态代理调用处理器

## 构造函数

```c
    /* Target对象
     * Method-具体请求调用逻辑处理的map映射
     */
    FeignInvocationHandler(Target target, Map<Method, MethodHandler> dispatch) {
      this.target = checkNotNull(target, "target");
      this.dispatch = checkNotNull(dispatch, "dispatch for %s", target);
    }
```

## 函数

### invoke

动态代理对象的处理器

```c
    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
      if ("equals".equals(method.getName())) {
        try {
          /*对应feign实例对象equals方法的处理*/
          Object otherHandler =
              args.length > 0 && args[0] != null ? Proxy.getInvocationHandler(args[0]) : null;
          return equals(otherHandler);
        } catch (IllegalArgumentException e) {
          return false;
        }
      } else if ("hashCode".equals(method.getName())) {
        return hashCode();
      } else if ("toString".equals(method.getName())) {
        return toString();
      }
      /*从map寻找method对应的处理逻辑*/
      return dispatch.get(method).invoke(args);
    }
```

<VPLink icon="i-carbon-document" title="invoke" url="./SynchronousMethodHandler#invoke"/>
