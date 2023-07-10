# Feign

主要流程:

![feign](/feign.png)

通过`Feign$Builder`(内部类)建造者模式构建请求所需对象，通过[`ReflectiveFeign`](./invocation/)创建动态代理实例。

```java
    public Feign build() {
      super.enrich();

      final ResponseHandler responseHandler =
          new ResponseHandler(logLevel, logger, decoder, errorDecoder,
              dismiss404, closeAfterDecode, responseInterceptor);
      MethodHandler.Factory<Object> methodHandlerFactory =
          new SynchronousMethodHandler.Factory(client, retryer, requestInterceptors,
              responseHandler, logger, logLevel, propagationPolicy,
              new RequestTemplateFactoryResolver(encoder, queryMapEncoder),
              options);
      return new ReflectiveFeign<>(contract, methodHandlerFactory, invocationHandlerFactory,
          () -> null);
    }
```
