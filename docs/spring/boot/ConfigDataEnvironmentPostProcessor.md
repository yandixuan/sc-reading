# ConfigDataEnvironmentPostProcessor

## 属性

```java
 /**
  * The default order for the processor.
  */
 // 排序号 
 public static final int ORDER = Ordered.HIGHEST_PRECEDENCE + 10;

 /**
  * Property used to determine what action to take when a
  * {@code ConfigDataLocationNotFoundException} is thrown.
  * @see ConfigDataNotFoundAction
  */
 public static final String ON_LOCATION_NOT_FOUND_PROPERTY = ConfigDataEnvironment.ON_NOT_FOUND_PROPERTY;

 private final DeferredLogFactory logFactory;
 // 延时日志 
 private final Log logger;
 // 一种引导上下文，可用于存储创建成本较高或需要共享的对象（也可使用BootstrapContext或BootstrapRegistry）
 private final ConfigurableBootstrapContext bootstrapContext;
 
 private final ConfigDataEnvironmentUpdateListener environmentUpdateListener;
```

## 构造方法

```java
 public ConfigDataEnvironmentPostProcessor(DeferredLogFactory logFactory,
   ConfigurableBootstrapContext bootstrapContext) {
  this(logFactory, bootstrapContext, null);
 }

 public ConfigDataEnvironmentPostProcessor(DeferredLogFactory logFactory,
   ConfigurableBootstrapContext bootstrapContext,
   ConfigDataEnvironmentUpdateListener environmentUpdateListener) {
  this.logFactory = logFactory;
  this.logger = logFactory.getLog(getClass());
  this.bootstrapContext = bootstrapContext;
  this.environmentUpdateListener = environmentUpdateListener;
 }
```

## 方法

### postProcessEnvironment

[EnvironmentPostProcessorApplicationListener](./EnvironmentPostProcessorApplicationListener.md)会通过`SpringBoot`的SPI机制加载该`ConfigDataEnvironmentPostProcessor`并执行`postProcessEnvironment`方法初始化外部配置

```java
 @Override
 public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
  postProcessEnvironment(environment, application.getResourceLoader(), application.getAdditionalProfiles());
 }

 void postProcessEnvironment(ConfigurableEnvironment environment, ResourceLoader resourceLoader,
   Collection<String> additionalProfiles) {
  try {
   this.logger.trace("Post-processing environment to add config data");
   // `resourceLoader`为null则new一个`DefaultResourceLoader`
   resourceLoader = (resourceLoader != null) ? resourceLoader : new DefaultResourceLoader();
   // 封装`ConfigDataEnvironment`调用`processAndApply`方法加载外部配置
   getConfigDataEnvironment(environment, resourceLoader, additionalProfiles).processAndApply();
  }
  catch (UseLegacyConfigProcessingException ex) {
   this.logger.debug(LogMessage.format("Switching to legacy config file processing [%s]",
     ex.getConfigurationProperty()));
   configureAdditionalProfiles(environment, additionalProfiles);
   postProcessUsingLegacyApplicationListener(environment, resourceLoader);
  }
 }
```

### getConfigDataEnvironment

[ConfigDataEnvironment](./ConfigDataEnvironment)

```java
 ConfigDataEnvironment getConfigDataEnvironment(ConfigurableEnvironment environment, ResourceLoader resourceLoader,
   Collection<String> additionalProfiles) {
  return new ConfigDataEnvironment(this.logFactory, this.bootstrapContext, environment, resourceLoader,
    additionalProfiles, this.environmentUpdateListener);
 }
```
