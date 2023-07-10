# BaseContract

抽象模板定义解析出`MethodMetadata`的核心方法，提供子类实现方法满足不同场景。

## 函数

### [parseAndValidateMetadata](./index#parseandvalidatemetadata)

解析给定接口所有相关方法的[元数据](../MethodMetadata)

:::tip 解析逻辑交由子类实现

- <VPLink inline-block icon="i-carbon-code" title="processAnnotationOnClass" url="#processAnnotationOnClass"/>
- <VPLink inline-block icon="i-carbon-code" title="processAnnotationOnMethod" url="#processAnnotationOnMethod"/>
- <VPLink inline-block icon="i-carbon-code" title="processAnnotationsOnParameter" url="#processAnnotationsOnParameter"/>

:::

以下方法由子类自行实现

```java
    /* 实现了Contract接口方法 */
    @Override
    public List<MethodMetadata> parseAndValidateMetadata(Class<?> targetType) {
      /* 参数化类型接口不支持 */
      checkState(targetType.getTypeParameters().length == 0, "Parameterized types unsupported: %s",
          targetType.getSimpleName());
      /* 检查目标类型是否只有一个接口（单继承） */    
      checkState(targetType.getInterfaces().length <= 1, "Only single inheritance supported: %s",
          targetType.getSimpleName());
      /* configKey-方法元数据的映射 */
      final Map<String, MethodMetadata> result = new LinkedHashMap<String, MethodMetadata>();
      /* 遍历接口定义的所有方法 */
      for (final Method method : targetType.getMethods()) {
        /* 跳过Object类中声明的方法、静态方法和默认方法 */
        if (method.getDeclaringClass() == Object.class ||
            (method.getModifiers() & Modifier.STATIC) != 0 ||
            Util.isDefault(method)) {
          continue;
        }
        /* 解析和验证当前方法的元数据，交由重载方法执行 */
        final MethodMetadata metadata = parseAndValidateMetadata(targetType, method);
        /* 检查结果中是否已经存在相同配置键的元数据 */
        if (result.containsKey(metadata.configKey())) {
          /* 获取已存在的元数据 */
          MethodMetadata existingMetadata = result.get(metadata.configKey());
          /* 获取已存在元数据的返回类型和当前方法的返回类型 */
          Type existingReturnType = existingMetadata.returnType();
          Type overridingReturnType = metadata.returnType();
          /* 解析返回类型，以便找到更具体的类型 */
          Type resolvedType = Types.resolveReturnType(existingReturnType, overridingReturnType);
          /* 如果解析后的返回类型与当前方法的返回类型一致，则用当前方法的元数据替换已存在的元数据 */
          if (resolvedType.equals(overridingReturnType)) {
            result.put(metadata.configKey(), metadata);
          }
          continue;
        }
        /* 存入映射表 */
        result.put(metadata.configKey(), metadata);
      }
      /* 返回values集合 */
      return new ArrayList<>(result.values());
    }

    @Deprecated
    public MethodMetadata parseAndValidateMetadata(Method method) {
      return parseAndValidateMetadata(method.getDeclaringClass(), method);
    }

    protected MethodMetadata parseAndValidateMetadata(Class<?> targetType, Method method) {
      /* new一个新的MethodMetadata对象 */
      final MethodMetadata data = new MethodMetadata();
      /* 接口类型 */
      data.targetType(targetType);
      /* java.lang.reflect.Method */
      data.method(method);
      /* 返回类型 */
      data.returnType(
          Types.resolve(targetType, targetType, method.getGenericReturnType()));
      /* configKey */    
      data.configKey(Feign.configKey(targetType, method));
      if (AlwaysEncodeBodyContract.class.isAssignableFrom(this.getClass())) {
        /* TODO: */
        data.alwaysEncodeBody(true);
      }
      /* 解析父类接口的注解 */
      if (targetType.getInterfaces().length == 1) {
        processAnnotationOnClass(data, targetType.getInterfaces()[0]);
      }
      /* 解析当前接口上的注解 */
      processAnnotationOnClass(data, targetType);

      /* 解析方法上的注解 */
      for (final Annotation methodAnnotation : method.getAnnotations()) {
        processAnnotationOnMethod(data, methodAnnotation, method);
      }
      if (data.isIgnored()) {
        return data;
      }
      /* 解析完class，method的注解能确定http的请求动作类型 */
      checkState(data.template().method() != null,
          "Method %s not annotated with HTTP method type (ex. GET, POST)%s",
          data.configKey(), data.warnings());
      /* 获取所有参数类型 */
      final Class<?>[] parameterTypes = method.getParameterTypes();
      /* 获取所有的泛型参数 */
      final Type[] genericParameterTypes = method.getGenericParameterTypes();
      /* 获取方法参数上的所有注解 */
      final Annotation[][] parameterAnnotations = method.getParameterAnnotations();
      /* 参数个数（包括无注解的） */
      final int count = parameterAnnotations.length;
      for (int i = 0; i < count; i++) {
        boolean isHttpAnnotation = false;
        if (parameterAnnotations[i] != null) {
          /* 尝试解析http相关的参数注解，默认返回false 
           * isHttpAnnotation TODO:
           */
          isHttpAnnotation = processAnnotationsOnParameter(data, parameterAnnotations[i], i);
        }
        /* 对参数进行忽略 */
        if (isHttpAnnotation) {
          data.ignoreParamater(i);
        }

        if ("kotlin.coroutines.Continuation".equals(parameterTypes[i].getName())) {
          data.ignoreParamater(i);
        }
        /* 设置URI index */
        if (parameterTypes[i] == URI.class) {
          data.urlIndex(i);
        } else if (!isHttpAnnotation
            /* 没有 HTTP 注解 且 参数类型不是Request.Options 或其子类 */
            && !Request.Options.class.isAssignableFrom(parameterTypes[i])) {
          /* 如果参数在之前已经处理过（已经被标记为已处理）*/
          if (data.isAlreadyProcessed(i)) {
            /* 不能同时使用表单参数和请求体参数 */
            checkState(data.formParams().isEmpty() || data.bodyIndex() == null,
                "Body parameters cannot be used with form parameters.%s", data.warnings());
          } else if (!data.alwaysEncodeBody()) {
            /* 如果参数没有注解，且 alwaysEncodeBody==false
             * 认定为body  
             * 表单参数和body参数不能共存
             * body参数只能有一个，多了抛就异常
             */ 
            checkState(data.formParams().isEmpty(),
                "Body parameters cannot be used with form parameters.%s", data.warnings());
            checkState(data.bodyIndex() == null,
                "Method has too many Body parameters: %s%s", method, data.warnings());
            /* body参数的索引 */
            data.bodyIndex(i);
             /* 解析body参数的类型
              * https://github.com/OpenFeign/feign/pull/246
              * 可以单继承接口，可能接口参数是泛型参数，所以这里需要进行处理 而不是直接使用 method.getGenericParameterTypes()[i] */
            data.bodyType(
                Types.resolve(targetType, targetType, genericParameterTypes[i]));
          }
        }
      }

      if (data.headerMapIndex() != null) {
        // check header map parameter for map type
        /* 参数类型为Map或子类 */
        if (Map.class.isAssignableFrom(parameterTypes[data.headerMapIndex()])) {
          /* 对参数类型检查，保证是Map的实现类，同时key必须为string */
          checkMapKeys("HeaderMap", genericParameterTypes[data.headerMapIndex()]);
        }
      }

      if (data.queryMapIndex() != null) {
        /* 参数类型为Map或子类 */
        if (Map.class.isAssignableFrom(parameterTypes[data.queryMapIndex()])) {
          /* 对参数类型检查，保证是Map的实现类，同时key必须为string */
          checkMapKeys("QueryMap", genericParameterTypes[data.queryMapIndex()]);
        }
      }

      return data;
    }
```

### processAnnotationOnClass

解析类上的注解

```java
    protected abstract void processAnnotationOnClass(MethodMetadata data, Class<?> clz);
```

### processAnnotationOnMethod

解析方法上的注解

```java
    protected abstract void processAnnotationOnMethod(MethodMetadata data,
                                                      Annotation annotation,
                                                      Method method);
```

### processAnnotationsOnParameter

解析参数上的注解

```java
    protected abstract boolean processAnnotationsOnParameter(MethodMetadata data,
                                                             Annotation[] annotations,
                                                             int paramIndex);
```
