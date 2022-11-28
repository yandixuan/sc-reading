# EnvironmentPostProcessorApplicationListener

实现了`SmartApplicationListener`接口

## 构造函数

```java
 /**
  * Create a new {@link EnvironmentPostProcessorApplicationListener} with
  * {@link EnvironmentPostProcessor} classes loaded via {@code spring.factories}.
  */
 public EnvironmentPostProcessorApplicationListener() {
  // 通过SPI加载加载`EnvironmentPostProcessor`的全限定路径字符串
  // 通过`ReflectionEnvironmentPostProcessorsFactory`反射实例化`EnvironmentPostProcessor`
  this(EnvironmentPostProcessorsFactory::fromSpringFactories, new DeferredLogs());
 }

  /**
  * Create a new {@link EnvironmentPostProcessorApplicationListener} with post
  * processors created by the given factory.
  * @param postProcessorsFactory the post processors factory
  */
 public EnvironmentPostProcessorApplicationListener(EnvironmentPostProcessorsFactory postProcessorsFactory) {
  // DeferredLog储存日志信息
  // LoggingApplicationListener还没有执行
  // 这个时候springboot日志系统根本就还没有初始化; 所以在此之前的日志操作都不会有效果
  this((classloader) -> postProcessorsFactory, new DeferredLogs());
 }

  EnvironmentPostProcessorApplicationListener(
   Function<ClassLoader, EnvironmentPostProcessorsFactory> postProcessorsFactory, DeferredLogs deferredLogs) {
  this.postProcessorsFactory = postProcessorsFactory;
  this.deferredLogs = deferredLogs;
 }
```

## 方法

### supportsEventType

[AbstractApplicationEventMulticaster](./context/AbstractApplicationEventMulticaster)

定义了需要监听的事件即：`ApplicationEnvironmentPreparedEvent`,`ApplicationPreparedEvent`,`ApplicationFailedEvent`

```java
 @Override
 public boolean supportsEventType(Class<? extends ApplicationEvent> eventType) {
  return ApplicationEnvironmentPreparedEvent.class.isAssignableFrom(eventType)
    || ApplicationPreparedEvent.class.isAssignableFrom(eventType)
    || ApplicationFailedEvent.class.isAssignableFrom(eventType);
 }
```

### onApplicationEvent

```java
 @Override
 public void onApplicationEvent(ApplicationEvent event) {
  if (event instanceof ApplicationEnvironmentPreparedEvent) {
   onApplicationEnvironmentPreparedEvent((ApplicationEnvironmentPreparedEvent) event);
  }
  if (event instanceof ApplicationPreparedEvent) {
   onApplicationPreparedEvent();
  }
  if (event instanceof ApplicationFailedEvent) {
   onApplicationFailedEvent();
  }
 }
```

### onApplicationEnvironmentPreparedEvent

springboot配置的初始化[ConfigDataEnvironmentPostProcessor](./ConfigDataEnvironmentPostProcessor)就是通过该方法触发

```java
 private void onApplicationEnvironmentPreparedEvent(ApplicationEnvironmentPreparedEvent event) {
  // 获取环境
  ConfigurableEnvironment environment = event.getEnvironment();
  // 获取SpringApplication
  SpringApplication application = event.getSpringApplication();
  // 遍历EnvironmentPostProcessor执行postProcessEnvironment方法
  // 
  for (EnvironmentPostProcessor postProcessor : getEnvironmentPostProcessors(application.getResourceLoader(),
    event.getBootstrapContext())) {
   postProcessor.postProcessEnvironment(environment, application);
  }
 }
```

### getEnvironmentPostProcessors

通过SPI机制，反射实例化EnvironmentPostProcessor（通过@Order排序好的）

```java
 List<EnvironmentPostProcessor> getEnvironmentPostProcessors(ResourceLoader resourceLoader,
   ConfigurableBootstrapContext bootstrapContext) {
  ClassLoader classLoader = (resourceLoader != null) ? resourceLoader.getClassLoader() : null;
  EnvironmentPostProcessorsFactory postProcessorsFactory = this.postProcessorsFactory.apply(classLoader);
  return postProcessorsFactory.getEnvironmentPostProcessors(this.deferredLogs, bootstrapContext);
 }
```
