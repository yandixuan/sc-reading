# Client

用于定义 `Feign` 客户端发送请求的动作，可以集成第三方http客户端，如`Okhttp`、`JDK11内置的java.net.http.HttpClient`、`Apache HttpClient`等

```java
/**
 * Submits HTTP {@link Request requests}. Implementations are expected to be thread-safe.
 */
public interface Client {

  /**
   * Executes a request against its {@link Request#url() url} and returns a response.
   *
   * @param request safe to replay.
   * @param options options to apply to this request.
   * @return connected response, {@link Response.Body} is absent or unread.
   * @throws IOException on a network error connecting to {@link Request#url()}.
   */
  Response execute(Request request, Options options) throws IOException;
  /* 通过HttpURLConnection实现 */
  class Default implements Client{
      // ...省略
  }
  /* 代理 */
  class Proxied extends Default{
      // ...省略
  }
}

```

- <VPLink icon="i-carbon-document" title="Default" url="./Default"/>
