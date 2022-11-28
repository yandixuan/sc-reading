# ConfigDataEnvironment

## 属性

```java
 /**
  * Property used override the imported locations.
  */
 // spring.config.location 设置后，只读取这个文件配置内容，不再读取其他地址的配置文件 
 static final String LOCATION_PROPERTY = "spring.config.location";

 /**
  * Property used to provide additional locations to import.
  */
 // 外部配置文件
 static final String ADDITIONAL_LOCATION_PROPERTY = "spring.config.additional-location";

 /**
  * Property used to provide additional locations to import.
  */
 // 导入文件的方式来加载配置参数 
 static final String IMPORT_PROPERTY = "spring.config.import";

 /**
  * Property used to determine what action to take when a
  * {@code ConfigDataNotFoundAction} is thrown.
  * @see ConfigDataNotFoundAction
  */
 // 通过该策略来控制`ConfigDataNotFoundAction`异常出现时的具体动作
 static final String ON_NOT_FOUND_PROPERTY = "spring.config.on-not-found";

 /**
  * Default search locations used if not {@link #LOCATION_PROPERTY} is found.
  */
 static final ConfigDataLocation[] DEFAULT_SEARCH_LOCATIONS;
 static {
  // 静态代码块初始化SpringBoot外部配置位置
  List<ConfigDataLocation> locations = new ArrayList<>();
  // 如果要指定位置，但不介意它是否始终存在，则可以使用optional:前缀
  // 1.classpath下及classpath的config目录下
  // 2.jar目录下及jar包目录下config及子目录
  locations.add(ConfigDataLocation.of("optional:classpath:/;optional:classpath:/config/"));
  locations.add(ConfigDataLocation.of("optional:file:./;optional:file:./config/;optional:file:./config/*/"));
  // 赋值
  DEFAULT_SEARCH_LOCATIONS = locations.toArray(new ConfigDataLocation[0]);
 }
 // 空路径
 private static final ConfigDataLocation[] EMPTY_LOCATIONS = new ConfigDataLocation[0];
 // 创建ConfigDataLocation[].class类的`Bindable`对象
 private static final Bindable<ConfigDataLocation[]> CONFIG_DATA_LOCATION_ARRAY = Bindable
   .of(ConfigDataLocation[].class);
 // List<String>的`Bindable`对象
 private static final Bindable<List<String>> STRING_LIST = Bindable.listOf(String.class);
 
 private static final BinderOption[] ALLOW_INACTIVE_BINDING = {};

 private static final BinderOption[] DENY_INACTIVE_BINDING = { BinderOption.FAIL_ON_BIND_TO_INACTIVE_SOURCE };

 private final DeferredLogFactory logFactory;

 private final Log logger;

 private final ConfigDataNotFoundAction notFoundAction;

 private final ConfigurableBootstrapContext bootstrapContext;

 private final ConfigurableEnvironment environment;

 private final ConfigDataLocationResolvers resolvers;

 private final Collection<String> additionalProfiles;

 private final ConfigDataEnvironmentUpdateListener environmentUpdateListener;

 private final ConfigDataLoaders loaders;

 private final ConfigDataEnvironmentContributors contributors;
```
