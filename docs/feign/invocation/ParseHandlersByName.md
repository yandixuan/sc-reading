# ParseHandlersByName

根据目标规范 `target` 和请求上下文 `requestContext`，通过调用 `targetToHandlersByName` 的 `apply` 方法来获取一个 `Method` 到 `MethodHandler` 的映射关系的 `Map`

## 构造函数

```c
    ParseHandlersByName(
        Contract contract,
        // 处理类生产工厂
        MethodHandler.Factory<C> factory) {
      this.contract = contract;
      this.factory = factory;
    }
```

## 函数

### apply

`spring-cloud-openfeign`就是通过`SpringMvcContract`继承`Contract.BaseContract`去解析`springMvc`注解规则，使用`springMvc`注解体系，通过`feign`去完成请求调用逻辑

<VPLink icon="i-carbon-document" title="ParseHandlersByName" url="./ParseHandlersByName"/>

```java
    public Map<Method, MethodHandler> apply(Target target, C requestContext) {
      /* 创建一个空的 LinkedHashMap 对象，用于存储映射关系 */
      final Map<Method, MethodHandler> result = new LinkedHashMap<>();
      /* 通过客户端契约解析接口方法与实际请求之间的映射规则和约定 */
      final List<MethodMetadata> metadataList = contract.parseAndValidateMetadata(target.type());
      /* 如果method的类为java.lang.Object则跳过 */
      for (MethodMetadata md : metadataList) {
        final Method method = md.method();
        if (method.getDeclaringClass() == Object.class) {
          continue;
        }
        /* 为method创建请求调用处理器 */
        final MethodHandler handler = createMethodHandler(target, md, requestContext);
        /* 放入映射表 */
        result.put(method, handler);
      }

      for (Method method : target.type().getMethods()) {
        if (Util.isDefault(method)) {
          final MethodHandler handler = new DefaultMethodHandler(method);
          result.put(method, handler);
        }
      }

      return result;
    }
```
