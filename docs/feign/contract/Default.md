# Default

`feign`声明式客户端契约默认实现，继承[`DeclarativeContract`](./DeclarativeContract.md)

## 构造函数

比较直接，初始化时，通过父类提供的注册方法，注册函数式处理逻辑

[相关注解](https://github.com/OpenFeign/feign#interface-annotations)

```java
    public Default() {
      /* 解析@Headers注解 */
      super.registerClassAnnotation(Headers.class, (header, data) -> {
        final String[] headersOnType = header.value();
        checkState(headersOnType.length > 0, "Headers annotation was empty on type %s.",
            data.configKey());
        /* 转map */    
        final Map<String, Collection<String>> headers = toMap(headersOnType);
        /* 合并headers */
        headers.putAll(data.template().headers());
        /* 重新设置 */
        data.template().headers(null); // to clear
        data.template().headers(headers);
      });
      /* 解析@RequestLine注解 */
      super.registerMethodAnnotation(RequestLine.class, (ann, data) -> {
        final String requestLine = ann.value();
        checkState(emptyToNull(requestLine) != null,
            "RequestLine annotation was empty on method %s.", data.configKey());
        /* 正则匹配 */
        final Matcher requestLineMatcher = REQUEST_LINE_PATTERN.matcher(requestLine);
        if (!requestLineMatcher.find()) {
          throw new IllegalStateException(String.format(
              "RequestLine annotation didn't start with an HTTP verb on method %s",
              data.configKey()));
        } else {
          /* ^([A-Z]+)[ ]*(.*)$ 
           * group(1): 请求动作即 GET,PUT等必须大写
           * group(2): 请求url模板
           */
          data.template().method(HttpMethod.valueOf(requestLineMatcher.group(1)));
          data.template().uri(requestLineMatcher.group(2));
        }
        /* 斜线转义的解码 */
        data.template().decodeSlash(ann.decodeSlash());
        /* url参数的编码 */
        data.template()
            .collectionFormat(ann.collectionFormat());
      });
      /* 解析@Body注解 */
      super.registerMethodAnnotation(Body.class, (ann, data) -> {
        final String body = ann.value();
        checkState(emptyToNull(body) != null, "Body annotation was empty on method %s.",
            data.configKey());
        /* 如果字符串不包含参数占位符 */
        if (body.indexOf('{') == -1) {
          data.template().body(body);
        } else {
          data.template().bodyTemplate(body);
        }
      });
      /* 解析@Headers注解 */
      super.registerMethodAnnotation(Headers.class, (header, data) -> {
        final String[] headersOnMethod = header.value();
        checkState(headersOnMethod.length > 0, "Headers annotation was empty on method %s.",
            data.configKey());
        data.template().headers(toMap(headersOnMethod));
      });
      /* 解析@Param注解 */
      super.registerParameterAnnotation(Param.class, (paramAnnotation, data, paramIndex) -> {
        final String annotationName = paramAnnotation.value();
        final Parameter parameter = data.method().getParameters()[paramIndex];
        final String name;
        // 获取name
        if (emptyToNull(annotationName) == null && parameter.isNamePresent()) {
          name = parameter.getName();
        } else {
          name = annotationName;
        }
        checkState(emptyToNull(name) != null, "Param annotation was empty on param %s.",
            paramIndex);
        /* 存入参数索引-参数名称的映射map中 */    
        nameParam(data, name, paramIndex);
        final Class<? extends Param.Expander> expander = paramAnnotation.expander();
        /* expander就是告诉你如何将对象转成string，默认就是Object.toString()，故所以不需要添加 */
        if (expander != Param.ToStringExpander.class) {
          data.indexToExpanderClass().put(paramIndex, expander);
        }
        /* 如果uri、query、headers中模板占位符中的参数名集合中不包括改名字
         * 则改参数是表单参数 */
        if (!data.template().hasRequestVariable(name)) {
          data.formParams().add(name);
        }
      });
      /* 解析@QueryMap注解 */
      super.registerParameterAnnotation(QueryMap.class, (queryMap, data, paramIndex) -> {
        checkState(data.queryMapIndex() == null,
            "QueryMap annotation was present on multiple parameters.");
        data.queryMapIndex(paramIndex);
      });
      /* 解析@HeaderMap注解 
       * 将参数绑定到请求的header中去 */
      super.registerParameterAnnotation(HeaderMap.class, (queryMap, data, paramIndex) -> {
        checkState(data.headerMapIndex() == null,
            "HeaderMap annotation was present on multiple parameters.");
        data.headerMapIndex(paramIndex);
      });
    }
```
