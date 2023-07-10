# MethodMetadata

方法元数据

## 属性

```java
  private static final long serialVersionUID = 1L;
  /* 标识方法的key，接口名加方法签名：GitHub#contributors(String,String) */
  private String configKey;
  /* 接口方法返回类型 */
  private transient Type returnType;
  /* URL 参数在方法参数列表中的索引 */
  private Integer urlIndex;
  /* 请求体参数在方法参数列表中的索引 */
  private Integer bodyIndex;
  /* 头部映射参数在方法参数列表中的索引 */
  private Integer headerMapIndex;
  /* 查询映射参数在方法参数列表中的索引 */
  private Integer queryMapIndex;
  /* TODO:// 将参数打包编码成body https://github.com/OpenFeign/feign/pull/1459 */
  private boolean alwaysEncodeBody;
  /* 请求体的类型 */
  private transient Type bodyType;
  /* 请求模板对象 */
  private final RequestTemplate template = new RequestTemplate();
  /* 表单参数列表，存储表单参数的名称 */
  private final List<String> formParams = new ArrayList<String>();
  /* 参数索引-参数名称的映射 */
  private final Map<Integer, Collection<String>> indexToName =
      new LinkedHashMap<Integer, Collection<String>>();
  /* 参数索引到扩展器类的映射，用于存储参数索引与对应的扩展器类之间的关系 */
  private final Map<Integer, Class<? extends Expander>> indexToExpanderClass =
      new LinkedHashMap<Integer, Class<? extends Expander>>();
  /* 参数索引到编码标志的映射，用于判断参数是否需要编码，@Param中的encoded属性 */
  private final Map<Integer, Boolean> indexToEncoded = new LinkedHashMap<Integer, Boolean>();
  /* 参数索引到扩展器对象的映射，允许时添加
   * https://github.com/OpenFeign/feign/pull/343
   */
  private transient Map<Integer, Expander> indexToExpander;
  /* 需要忽略的参数 */
  private BitSet parameterToIgnore = new BitSet();
  /* 是否忽略该方法 */
  private boolean ignored;
  /* 需要代理的接口类型 */
  private transient Class<?> targetType;
  /* 接口对应的方法 */
  private transient Method method;
  /* 生产元数据过程中产生的警告 */
  private transient final List<String> warnings = new ArrayList<>();
```

## 函数

### isAlreadyProcessed

判断索引`index`处的参数是否被处理过了

```c
  /**
   * @param index
   * @return true if the parameter {@code index} was already consumed by a any
   *         {@link MethodMetadata} holder
   */
  public boolean isAlreadyProcessed(Integer index) {
    return index.equals(urlIndex)
        || index.equals(bodyIndex)
        || index.equals(headerMapIndex)
        || index.equals(queryMapIndex)
        || indexToName.containsKey(index)
        || indexToExpanderClass.containsKey(index)
        || indexToEncoded.containsKey(index)
        || (indexToExpander != null && indexToExpander.containsKey(index))
        || parameterToIgnore.get(index);
  }
```
