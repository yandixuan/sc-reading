# SpringFactoriesLoader

springboot SPI加载类

## 属性

```java

// SpringBoot SPI文件位置
public static final String FACTORIES_RESOURCE_LOCATION = "META-INF/spring.factories";

// 缓存
static final Map<ClassLoader, Map<String, List<String>>> cache = new ConcurrentReferenceHashMap<>();

// 日志
private static final Log logger = LogFactory.getLog(SpringFactoriesLoader.class);
```

## 构造器

无法初始化

```java
private SpringFactoriesLoader() {
}
```

## 方法

### loadFactories

```java
// 根据factoryType 从SPI中加载相应的配置类 比如 SpringApplicationRunListener.class
public static <T> List<T> loadFactories(Class<T> factoryType, @Nullable ClassLoader classLoader) {
  Assert.notNull(factoryType, "'factoryType' must not be null");
  ClassLoader classLoaderToUse = classLoader;
  if (classLoaderToUse == null) {
   // 如果传入的classLoader为空，那么就使用当前类的classLoader
   classLoaderToUse = SpringFactoriesLoader.class.getClassLoader();
  }
  // 调用真正的加载SPI的方法
  List<String> factoryImplementationNames = loadFactoryNames(factoryType, classLoaderToUse);
  if (logger.isTraceEnabled()) {
   logger.trace("Loaded [" + factoryType.getName() + "] names: " + factoryImplementationNames);
  }
  List<T> result = new ArrayList<>(factoryImplementationNames.size());
  for (String factoryImplementationName : factoryImplementationNames) {
   result.add(instantiateFactory(factoryImplementationName, factoryType, classLoaderToUse));
  }
  AnnotationAwareOrderComparator.sort(result);
  return result;
 }
```

### loadFactoryNames

```java
public static List<String> loadFactoryNames(Class<?> factoryType, @Nullable ClassLoader classLoader) {
  ClassLoader classLoaderToUse = classLoader;
  if (classLoaderToUse == null) {
   // 如果传入的classLoader为空，那么就使用当前类的classLoader
   classLoaderToUse = SpringFactoriesLoader.class.getClassLoader();
  }
  // 获取要从SPI加载的类的权限定路径
  String factoryTypeName = factoryType.getName();
  return loadSpringFactories(classLoaderToUse).getOrDefault(factoryTypeName, Collections.emptyList());
 }
```

### loadSpringFactories

SpringBoot加载SPI的真正实现方法

```java
private static Map<String, List<String>> loadSpringFactories(ClassLoader classLoader) {
  // 尝试加载缓存 毕竟IO还是很耗时间的
  Map<String, List<String>> result = cache.get(classLoader);
  if (result != null) {
   return result;
  }
  // 初始化Map
  result = new HashMap<>();
  try {
   // 从类加载路径加载 SPI 文件（也包含第三方包）
   Enumeration<URL> urls = classLoader.getResources(FACTORIES_RESOURCE_LOCATION);
   // 遍历
   while (urls.hasMoreElements()) {
    URL url = urls.nextElement();
    UrlResource resource = new UrlResource(url);
    // SPI 内容其实就是K-V形式
    Properties properties = PropertiesLoaderUtils.loadProperties(resource);
    for (Map.Entry<?, ?> entry : properties.entrySet()) {
     // 获取key的名称
     String factoryTypeName = ((String) entry.getKey()).trim();
     // 逗号字符串转成数组
     String[] factoryImplementationNames =
       StringUtils.commaDelimitedListToStringArray((String) entry.getValue());
     // 对数组做循环
     for (String factoryImplementationName : factoryImplementationNames) {
      // 将classLoader-> SpringBoot配置类放入Map
      result.computeIfAbsent(factoryTypeName, key -> new ArrayList<>())
        .add(factoryImplementationName.trim());
     }
    }
   }
   
   // Replace all lists with unmodifiable lists containing unique elements
   // 将result里的List里的内容进行distinct唯一处理，并且转成不可变集合
   result.replaceAll((factoryType, implementations) -> implementations.stream().distinct()
     .collect(Collectors.collectingAndThen(Collectors.toList(), Collections::unmodifiableList)));
   cache.put(classLoader, result);
  }
  catch (IOException ex) {
   throw new IllegalArgumentException("Unable to load factories from location [" +
     FACTORIES_RESOURCE_LOCATION + "]", ex);
  }
  return result;
 }
```
