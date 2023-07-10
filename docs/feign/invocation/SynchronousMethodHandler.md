# SynchronousMethodHandler

## 函数

### invoke

[在`FeignInvocationHandler`的`invoke`方法中被调用](./FeignInvocationHandler#invoke)中调用

```java
  @Override
  public Object invoke(Object[] argv) throws Throwable {
    /* 创建RequestTemplate并解析完参数，拿到本次请求相关的所以http信息 */
    RequestTemplate template = buildTemplateFromArgs.create(argv);
    Options options = findOptions(argv);
    /* 重试器对象深拷贝 */
    Retryer retryer = this.retryer.clone();
    while (true) {
      try {
        /* 请求并且解码response */
        return executeAndDecode(template, options);
      } catch (RetryableException e) {
        try {
          retryer.continueOrPropagate(e);
        } catch (RetryableException th) {
          Throwable cause = th.getCause();
          if (propagationPolicy == UNWRAP && cause != null) {
            throw cause;
          } else {
            throw th;
          }
        }
        if (logLevel != Logger.Level.NONE) {
          logger.logRetry(metadata.configKey(), logLevel);
        }
        continue;
      }
    }
  }
```

### executeAndDecode

<VPLink icon="i-carbon-code" title="client.execute" url="../client/Default#execute"/>
<VPLink icon="i-carbon-code" title="responseHandler.handleResponse" url="../client/Default#execute"/>

```java
  Object executeAndDecode(RequestTemplate template, Options options) throws Throwable { 
    /* 遍历请求拦截器集合，请求前修改请求 */
    Request request = targetRequest(template);

    if (logLevel != Logger.Level.NONE) {
      logger.logRequest(metadata.configKey(), logLevel, request);
    }

    Response response;
    long start = System.nanoTime();
    try {
      /* 执行请求并获得response */
      response = client.execute(request, options);
      // ensure the request is set. TODO: remove in Feign 12
      // 保证request要塞入进去，深拷贝一次response对象
      response = response.toBuilder()
          .request(request)
          .requestTemplate(template)
          .build();
    } catch (IOException e) {
      if (logLevel != Logger.Level.NONE) {
        logger.logIOException(metadata.configKey(), logLevel, e, elapsedTime(start));
      }
      throw errorExecuting(request, e);
    }

    long elapsedTime = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);
    // 处理response
    return responseHandler.handleResponse(
        metadata.configKey(), response, metadata.returnType(), elapsedTime);
  }
```
