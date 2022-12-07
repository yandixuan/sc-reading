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
 // 延迟日志工厂
 private final DeferredLogFactory logFactory;
 // 日志
 private final Log logger;
 // 配置文件未找到动作
 private final ConfigDataNotFoundAction notFoundAction;

 private final ConfigurableBootstrapContext bootstrapContext;
 // Spring的environment对象
 private final ConfigurableEnvironment environment;
 // 配置数据位置解析器
 private final ConfigDataLocationResolvers resolvers;
 
 private final Collection<String> additionalProfiles;

 private final ConfigDataEnvironmentUpdateListener environmentUpdateListener;
 
 private final ConfigDataLoaders loaders;
 // 属性值提供器
 private final ConfigDataEnvironmentContributors contributors;
```

## 构造函数

```java
 /**
  * Create a new {@link ConfigDataEnvironment} instance.
  * @param logFactory the deferred log factory
  * @param bootstrapContext the bootstrap context
  * @param environment the Spring {@link Environment}.
  * @param resourceLoader {@link ResourceLoader} to load resource locations
  * @param additionalProfiles any additional profiles to activate
  * @param environmentUpdateListener optional
  * {@link ConfigDataEnvironmentUpdateListener} that can be used to track
  * {@link Environment} updates.
  */
 ConfigDataEnvironment(DeferredLogFactory logFactory, ConfigurableBootstrapContext bootstrapContext,
   ConfigurableEnvironment environment, ResourceLoader resourceLoader, Collection<String> additionalProfiles,
   ConfigDataEnvironmentUpdateListener environmentUpdateListener) {
  // 获取binder实例对象  
  Binder binder = Binder.get(environment);
  // 获取`spring.config.use-legacy-processing`属性，绑定错误则报错
  UseLegacyConfigProcessingException.throwIfRequested(binder);
  // 延时日志工厂
  this.logFactory = logFactory;
  // 延时日志
  this.logger = logFactory.getLog(getClass());
  // 绑定属性`spring.config.on-not-found`到`ConfigDataNotFoundAction`对象，默认值为`ConfigDataNotFoundAction.FAIL`
  this.notFoundAction = binder.bind(ON_NOT_FOUND_PROPERTY, ConfigDataNotFoundAction.class)
    .orElse(ConfigDataNotFoundAction.FAIL);
  // 赋值
  this.bootstrapContext = bootstrapContext;
  this.environment = environment;
  // 通过SPI加载`ConfigDataLocationResolver`实例即外部配置解析器
  this.resolvers = createConfigDataLocationResolvers(logFactory, bootstrapContext, binder, resourceLoader);
  this.additionalProfiles = additionalProfiles;
  this.environmentUpdateListener = (environmentUpdateListener != null) ? environmentUpdateListener
    : ConfigDataEnvironmentUpdateListener.NONE;
  // 通过SPI加载`ConfigDataLoader`通过resource加载`ConfigData`
  this.loaders = new ConfigDataLoaders(logFactory, bootstrapContext, resourceLoader.getClassLoader());
  this.contributors = createContributors(binder);
 }
```

## 方法

### ConfigDataLocationResolvers

```java
 protected ConfigDataLocationResolvers createConfigDataLocationResolvers(DeferredLogFactory logFactory,
   ConfigurableBootstrapContext bootstrapContext, Binder binder, ResourceLoader resourceLoader) {
  return new ConfigDataLocationResolvers(logFactory, bootstrapContext, binder, resourceLoader);
 }
```

### createContributors

创建默认的属性值提供器

```java
 private ConfigDataEnvironmentContributors createContributors(Binder binder) {
  this.logger.trace("Building config data environment contributors");
  // 获取属性值来源
  MutablePropertySources propertySources = this.environment.getPropertySources();
  // 结果集
  List<ConfigDataEnvironmentContributor> contributors = new ArrayList<>(propertySources.size() + 10);
  // 默认的属性值来源
  PropertySource<?> defaultPropertySource = null;
  for (PropertySource<?> propertySource : propertySources) {
   // 匹配`defaultProperties`的属性源
   if (DefaultPropertiesPropertySource.hasMatchingName(propertySource)) {
    defaultPropertySource = propertySource;
   }
   else {
    // 将其他属性源封装成`ConfigDataEnvironmentContributor`
    this.logger.trace(LogMessage.format("Creating wrapped config data contributor for '%s'",
      propertySource.getName()));
    contributors.add(ConfigDataEnvironmentContributor.ofExisting(propertySource));
   }
  }
  // 添加外部配置文件的属性源提供器
  contributors.addAll(getInitialImportContributors(binder));
  // 如果有默认的属性源则添加到最后面
  if (defaultPropertySource != null) {
   this.logger.trace("Creating wrapped config data contributor for default property source");
   contributors.add(ConfigDataEnvironmentContributor.ofExisting(defaultPropertySource));
  }
  return createContributors(contributors);
 }
```

### getInitialImportContributors

```java
 private List<ConfigDataEnvironmentContributor> getInitialImportContributors(Binder binder) {
  List<ConfigDataEnvironmentContributor> initialContributors = new ArrayList<>();
  // 添加 `spring.config.import` 指定的资源（这个时候还没加载application.yml文件）
  addInitialImportContributors(initialContributors, bindLocations(binder, IMPORT_PROPERTY, EMPTY_LOCATIONS));
  // 添加 `spring.config.additional-location` 指定的资源
  addInitialImportContributors(initialContributors,
    bindLocations(binder, ADDITIONAL_LOCATION_PROPERTY, EMPTY_LOCATIONS));
  // 添加 `spring.config.location` 指定的资源
  // （会覆盖默认属性加载的地方：classpath:/, classpath:/config/, file:./, file:./config/, file:./config/*/）  
  addInitialImportContributors(initialContributors,
    bindLocations(binder, LOCATION_PROPERTY, DEFAULT_SEARCH_LOCATIONS));
  return initialContributors;
 }
```

### processAndApply

处理及应用

[ConfigDataLocationResolvers](./ConfigDataLocationResolvers)

```java
 /**
  * Process all contributions and apply any newly imported property sources to the
  * {@link Environment}.
  */
 void processAndApply() {
  // 创建 ConfigDataImporter
  ConfigDataImporter importer = new ConfigDataImporter(this.logFactory, this.notFoundAction, this.resolvers,
    this.loaders);
  // 绑定 contributors
  registerBootstrapBinder(this.contributors, null, DENY_INACTIVE_BINDING);
  // 处理 Kind.INITIAL_IMPORT的资源（即spring.config.import、classpath:/, classpath:/config/, file:./, file:./config/, file:./config/*/）这些位置的资源，重新绑定 contributors
  // 最终是交由`ConfigDataLocationResolvers`这个类去解析对应地址的配置文件
  ConfigDataEnvironmentContributors contributors = processInitial(this.contributors, importer);
  ConfigDataActivationContext activationContext = createActivationContext(
    contributors.getBinder(null, BinderOption.FAIL_ON_BIND_TO_INACTIVE_SOURCE));
  // 导入无 profile `application.yaml` 的资源，重新绑定 contributors
  // 那么下次Binder就能获取到application.yml中定义激活的环境（当然commandLine中的args参数优先级最高）
  contributors = processWithoutProfiles(contributors, importer, activationContext);
  // 载入profiles到绑定的上下文中
  activationContext = withProfiles(contributors, activationContext);
  // 导入激活 profile `application-[active].yaml` 的资源，重新绑定 contributors
  contributors = processWithProfiles(contributors, importer, activationContext);
  // 应用到环境中
  applyToEnvironment(contributors, activationContext, importer.getLoadedLocations(),
    importer.getOptionalLocations());
 }
```
