# SpringApplication

## 方法

### run

Springboot 主方法启动流程
  
```java  
public ConfigurableApplicationContext run(String... args)  {
  // 获取系统时间
  long startTime = System.nanoTime();
  // springboot启动的上下文
  DefaultBootstrapContext bootstrapContext = createBootstrapContext();
  // ConfigurableApplicationContext 继承了spring的最高容器类 ApplicationContext
  // springboot启动使用该容器
  ConfigurableApplicationContext context = null;
  // java headless
  configureHeadlessProperty();
  // 获取
  SpringApplicationRunListeners listeners = getRunListeners(args);
  listeners.starting(bootstrapContext, this.mainApplicationClass);
  try {
   ApplicationArguments applicationArguments = new DefaultApplicationArguments(args);
   ConfigurableEnvironment environment = prepareEnvironment(listeners, bootstrapContext, applicationArguments);
   configureIgnoreBeanInfo(environment);
   Banner printedBanner = printBanner(environment);
   context = createApplicationContext();
   context.setApplicationStartup(this.applicationStartup);
   prepareContext(bootstrapContext, context, environment, listeners, applicationArguments, printedBanner);
   refreshContext(context);
   afterRefresh(context, applicationArguments);
   Duration timeTakenToStartup = Duration.ofNanos(System.nanoTime() - startTime);
   if (this.logStartupInfo) {
    new StartupInfoLogger(this.mainApplicationClass).logStarted(getApplicationLog(), timeTakenToStartup);
   }
   listeners.started(context, timeTakenToStartup);
   callRunners(context, applicationArguments);
  }
  catch (Throwable ex) {
   handleRunFailure(context, ex, listeners);
   throw new IllegalStateException(ex);
  }
  try {
   Duration timeTakenToReady = Duration.ofNanos(System.nanoTime() - startTime);
   listeners.ready(context, timeTakenToReady);
  }
  catch (Throwable ex) {
   handleRunFailure(context, ex, null);
   throw new IllegalStateException(ex);
  }
  return context;
}
```

### getRunListeners

SpringApplicationRunListeners 里面封装了spring 容器 starting、environmentPrepared等各种时间的信息记录

SpringApplicationRunListener 的构造函数入参是SpringApplication,args

```java
private SpringApplicationRunListeners getRunListeners(String[] args) {
  Class<?>[] types = new Class<?>[] { SpringApplication.class, String[].class };
  // 所以传入的是参数类型和参数
  // 将实例化的SpringApplicationRunListener 塞入 SpringApplicationRunListeners中相当于是个容器
  return new SpringApplicationRunListeners(logger,
    getSpringFactoriesInstances(SpringApplicationRunListener.class, types, this, args),
    this.applicationStartup);
 }
```

### getSpringFactoriesInstances

```java
private <T> Collection<T> getSpringFactoriesInstances(Class<T> type, Class<?>[] parameterTypes, Object... args) {
  // 获取classLoader
  ClassLoader classLoader = getClassLoader();
  // Use names and ensure unique to protect against duplicates
  // 根据类型和classLoader加载SPI的全限定路径
  Set<String> names = new LinkedHashSet<>(SpringFactoriesLoader.loadFactoryNames(type, classLoader));
  // 实例化返回对象List
  List<T> instances = createSpringFactoriesInstances(type, parameterTypes, classLoader, args, names);
  AnnotationAwareOrderComparator.sort(instances);
  return instances;
 }
```

### createSpringFactoriesInstances

实例化SpringBoot SPI的类

```java
private <T> List<T> createSpringFactoriesInstances(Class<T> type, Class<?>[] parameterTypes,
   ClassLoader classLoader, Object[] args, Set<String> names) {
  // 根据传进来的类的全限定路径 确定List长度  
  List<T> instances = new ArrayList<>(names.size());
  for (String name : names) {
   try {
    // 加载class对象
    Class<?> instanceClass = ClassUtils.forName(name, classLoader);
    Assert.isAssignable(type, instanceClass);
    // 反射获取构造器
    Constructor<?> constructor = instanceClass.getDeclaredConstructor(parameterTypes);
    // 通过构造器实例化对象
    T instance = (T) BeanUtils.instantiateClass(constructor, args);
    instances.add(instance);
   }
   catch (Throwable ex) {
    throw new IllegalArgumentException("Cannot instantiate " + type + " : " + name, ex);
   }
  }
  return instances;
 }
```
