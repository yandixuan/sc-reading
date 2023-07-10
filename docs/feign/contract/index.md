# Contract

用于定义 `Feign` 客户端的契约，它描述了如何将接口方法映射到远程服务的请求。

```java
/**
 * Defines what annotations and values are valid on interfaces.
 */
public interface Contract {

    /**
     * Called to parse the methods in the class that are linked to HTTP requests.
     *
     * @param targetType {@link feign.Target#type() type} of the Feign interface.
     */
    /* 从给定接口即 targetType 中解析出 MethodMetadata */
    List<MethodMetadata> parseAndValidateMetadata(Class<?> targetType);

    abstract class BaseContract implements Contract {
        // ...省略
    }

    class Default extends DeclarativeContract {
        // ...省略
    }
}

```

- <VPLink inline-block icon="i-carbon-document" title="BaseContract" url="./BaseContract"/>
- <VPLink inline-block icon="i-carbon-document" title="DeclarativeContract" url="./DeclarativeContract"/>
- <VPLink inline-block icon="i-carbon-document" title="Default" url="./Default"/>
