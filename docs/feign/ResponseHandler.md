# ResponseHandler

## 函数

### handleResponse

```java
  public Object handleResponse(String configKey,
                               Response response,
                               Type returnType,
                               long elapsedTime)
      throws Exception {
    try {
      /* 打印日志 */
      response = logAndRebufferResponseIfNeeded(configKey, response, elapsedTime);
      /* 检查returnType是否为Response.class。如果是，则调用disconnectResponseBodyIfNeeded方法，断开响应体连接并返回响应对象。 */
      if (returnType == Response.class) {
        return disconnectResponseBodyIfNeeded(response);
      }
      /* 检查响应的状态码是否在 200 到 299 之间（表示成功），或者是否为 404（表示资源未找到）
       * 并且配置为忽略 404 错误（dismiss404 为真）且returnType不是无返回类型 */
      final boolean shouldDecodeResponseBody = (response.status() >= 200 && response.status() < 300)
          || (response.status() == 404 && dismiss404 && !isVoidType(returnType));
      /* 如果不满足这些条件，则抛出一个解码错误（decodeError） */
      if (!shouldDecodeResponseBody) {
        throw decodeError(configKey, response);
      }
      /* 调用decode方法对响应进行解码，并返回解码后的结果 */
      return decode(response, returnType);
    } catch (final IOException e) {
      if (logLevel != Level.NONE) {
        logger.logIOException(configKey, logLevel, e, elapsedTime);
      }
      throw errorReading(response.request(), response, e);
    }
  }
```

### decode

响应解码

```java
  private Object decode(Response response, Type type) throws IOException {
    /* 检查type是否是无返回类型（void）。如果是，说明不需要对响应进行解码，直接关闭响应体连接并返回null */
    if (isVoidType(type)) {
      ensureClosed(response.body());
      return null;
    }

    try {
      /* 在拦截器中使用decoder进行响应解码，当然我可以覆盖feign提供的默认responseInterceptor */
      final Object result = responseInterceptor.aroundDecode(
          new InvocationContext(decoder, type, response));
      /* 如果设置了closeAfterDecode标志（关闭解码后的连接），则确保关闭响应体连接 */
      if (closeAfterDecode) {
        ensureClosed(response.body());
      }
      return result;
    } catch (Exception e) {
      /* 如果在处理过程中抛出异常，确保关闭响应体连接，并将异常重新抛出 */
      ensureClosed(response.body());
      throw e;
    }
  }
```
