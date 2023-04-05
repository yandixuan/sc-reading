# SpringApplication

## 属性

```java
    // 生产ApplicationContext的工厂
    private ApplicationContextFactory applicationContextFactory = ApplicationContextFactory.DEFAULT;
```

## 构造器

```java
public SpringApplication(ResourceLoader resourceLoader, Class<?>... primarySources) {
    this.resourceLoader = resourceLoader;
    Assert.notNull(primarySources, "PrimarySources must not be null");
    this.primarySources = new LinkedHashSet<>(Arrays.asList(primarySources));
    this.webApplicationType = WebApplicationType.deduceFromClasspath();
    this.bootstrapRegistryInitializers = new ArrayList<>(
            getSpringFactoriesInstances(BootstrapRegistryInitializer.class));
    // 这个地方会 从SPI加载 ApplicationContextInitializer，ApplicationListener
    setInitializers((Collection) getSpringFactoriesInstances(ApplicationContextInitializer.class));
    setListeners((Collection) getSpringFactoriesInstances(ApplicationListener.class));
    this.mainApplicationClass = deduceMainApplicationClass();
}
```

## 方法

### run

Springboot 主方法启动流程
  
```java  
public ConfigurableApplicationContext run(String... args)  {
    // 获取系统时间
    long startTime = System.nanoTime();
    // springboot启动的上下文
    // 对于boot来说有2种
    // 1.AnnotationConfigServletWebServerApplicationContext
    // 2.AnnotationConfigReactiveWebServerApplicationContext
    DefaultBootstrapContext bootstrapContext = createBootstrapContext();
    // ConfigurableApplicationContext 继承了spring的最高容器类 ApplicationContext
    // springboot启动使用该容器
    ConfigurableApplicationContext context = null;
    // java headless
    configureHeadlessProperty();
    // 获取 SpringApplicationRunListeners 收集 SpringApplicationRunListener 集合
    SpringApplicationRunListeners listeners = getRunListeners(args);
    // SpringBoot准备开始启动，发布staring事件
    // 可以SPI添加SpringApplicationRunListener实现类
    listeners.starting(bootstrapContext, this.mainApplicationClass);
    try {
        // 将main方法的参数 封装成 ApplicationArguments
        ApplicationArguments applicationArguments = new DefaultApplicationArguments(args);
        // 准备环境
        ConfigurableEnvironment environment = prepareEnvironment(listeners, bootstrapContext, applicationArguments);
        configureIgnoreBeanInfo(environment);
        // 打印banner
        Banner printedBanner = printBanner(environment);
        // 创建applicationContext
        context = createApplicationContext();
        // 设置 度量标准以诊断启动缓慢
        context.setApplicationStartup(this.applicationStartup);
        // 准备上下文
        prepareContext(bootstrapContext, context, environment, listeners, applicationArguments, printedBanner);
        // 刷新上下文
        refreshContext(context);
        // 空实现
        afterRefresh(context, applicationArguments);
        // 记录结束时间
        Duration timeTakenToStartup = Duration.ofNanos(System.nanoTime() - startTime);
        if (this.logStartupInfo) {
            new StartupInfoLogger(this.mainApplicationClass).logStarted(getApplicationLog(), timeTakenToStartup);
        }
        // 触发started事件
        listeners.started(context, timeTakenToStartup);
        // 循环调用 实现了2类ApplicationRunner、CommandLineRunner接口的bean的 run方法
        callRunners(context, applicationArguments);
    }
    catch (Throwable ex) {
        handleRunFailure(context, ex, listeners);
        throw new IllegalStateException(ex);
    }
    try {
        Duration timeTakenToReady = Duration.ofNanos(System.nanoTime() - startTime);
        // 触发ready事件
        // 打印Spring容器启动耗时
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

### prepareEnvironment

准备Spring应用环境

```java
private ConfigurableEnvironment prepareEnvironment(SpringApplicationRunListeners listeners,
        DefaultBootstrapContext bootstrapContext, ApplicationArguments applicationArguments) {
    // Create and configure the environment
    // 创建环境
    ConfigurableEnvironment environment = getOrCreateEnvironment();
    // 配置springApplicationCommandLineArgs、defaultProperties、Profiles
    configureEnvironment(environment, applicationArguments.getSourceArgs());
    // 添加configurationProperties属性
    /**
    * 将environment的PropertySource列表封装到 `ConfigurationPropertySourcesPropertySource`(source是`SpringConfigurationPropertySources`)
    * SpringConfigurationPropertySources实现了`ConfigurationPropertySource`的迭代器
    * 在`SpringConfigurationPropertySources`遍历的时候会忽略自身，而去遍历其他的PropertySource
    */
    ConfigurationPropertySources.attach(environment);
    // 发布environmentPrepared事件
    listeners.environmentPrepared(bootstrapContext, environment);
    // 将defaultProperties属性移到最后面，因为是默认，所有在后面兜底
    DefaultPropertiesPropertySource.moveToEnd(environment);
    Assert.state(!environment.containsProperty("spring.main.environment-prefix"),
            "Environment prefix cannot be set via properties.");
    bindToSpringApplication(environment);
    if (!this.isCustomEnvironment) {
        EnvironmentConverter environmentConverter = new EnvironmentConverter(getClassLoader());
        environment = environmentConverter.convertEnvironmentIfNecessary(environment, deduceEnvironmentClass());
    }
    // 就是此处，把上述解析的所有配置文件PropertySources，添加到key为configurationProperties的PropertySource对象中，并添加到PropertySources的第一个元素中
    ConfigurationPropertySources.attach(environment);
    return environment;
}
```

```java
private ConfigurableEnvironment getOrCreateEnvironment() {
    if (this.environment != null) {
        return this.environment;
    }
    // 根据webApplicationType的类型准备不同的环境实现类
    switch (this.webApplicationType) {
        case SERVLET:
            return new ApplicationServletEnvironment();
        case REACTIVE:
            return new ApplicationReactiveWebEnvironment();
        default:
            return new ApplicationEnvironment();
    }
}
```

### configureEnvironment

配置spring环境

```java
protected void configureEnvironment(ConfigurableEnvironment environment, String[] args) {
    if (this.addConversionService) {
        // 配置转换服务 比如string转各种类型
        environment.setConversionService(new ApplicationConversionService());
    }
    configurePropertySources(environment, args);
    // 配置应用环境 这里是个空方法
    configureProfiles(environment, args);
}

```

### configurePropertySources

设置环境的配置文件源

```java
protected void configurePropertySources(ConfigurableEnvironment environment, String[] args) {
        MutablePropertySources sources = environment.getPropertySources();
    if (!CollectionUtils.isEmpty(this.defaultProperties)) {
        // SpringBoot启动前可以设置配置，所以这里进行一次增加或者合并
        DefaultPropertiesPropertySource.addOrMerge(this.defaultProperties, sources);
    }
    if (this.addCommandLineProperties && args.length > 0) {
        // 将java启动的参数也配置进spring的环境配置中
        String name = CommandLinePropertySource.COMMAND_LINE_PROPERTY_SOURCE_NAME;
        if (sources.contains(name)) {
            PropertySource<?> source = sources.get(name);
            CompositePropertySource composite = new CompositePropertySource(name);
            composite.addPropertySource(
                    new SimpleCommandLinePropertySource("springApplicationCommandLineArgs", args));
            composite.addPropertySource(source);
            sources.replace(name, composite);
        }
        else {
            sources.addFirst(new SimpleCommandLinePropertySource(args));
        }
    }
}
```

### createApplicationContext

```java
protected ConfigurableApplicationContext createApplicationContext() {
    // 根据webApplicationType 创建对应的AnnotationApplicationContext servlet or webFlux
    return this.applicationContextFactory.create(this.webApplicationType);
}
```

### prepareContext

```java
private void prepareContext(DefaultBootstrapContext bootstrapContext, ConfigurableApplicationContext context,
        ConfigurableEnvironment environment, SpringApplicationRunListeners listeners,
        ApplicationArguments applicationArguments, Banner printedBanner) {
    // 赋值环境  
    context.setEnvironment(environment);
    // 设置ApplicationContext
    postProcessApplicationContext(context);
    // 触发ApplicationContextInitializer 初始化方法 可以对 ApplicationContext 进行设置
    // SpringApplication 就有添加 ApplicationContextInitializer 的方法
    applyInitializers(context);
    // 触发 contextPrepared 事件
    listeners.contextPrepared(context);
    // 触发BootstrapContextClosedEvent事件 说明 ApplicationContext has been prepared
    bootstrapContext.close(context);
    if (this.logStartupInfo) {
        logStartupInfo(context.getParent() == null);
        // 打印当前激活环境信息
        logStartupProfileInfo(context);
    }
    // Add boot specific singleton beans
    // 获取beanFactory
    ConfigurableListableBeanFactory beanFactory = context.getBeanFactory();
    // 注册单例 applicationArguments
    beanFactory.registerSingleton("springApplicationArguments", applicationArguments);
    if (printedBanner != null) {
        // 注册单例 Banner
        beanFactory.registerSingleton("springBootBanner", printedBanner);
    }
    if (beanFactory instanceof AbstractAutowireCapableBeanFactory) {
          //设置是否允许循环依赖
          ((AbstractAutowireCapableBeanFactory) beanFactory).setAllowCircularReferences(this.allowCircularReferences);
      if (beanFactory instanceof DefaultListableBeanFactory) {
          // 设置bean覆盖 默认是不允许循环依赖使用的 即false
          ((DefaultListableBeanFactory) beanFactory)
                  .setAllowBeanDefinitionOverriding(this.allowBeanDefinitionOverriding);
      }
    }
    if (this.lazyInitialization) {
        context.addBeanFactoryPostProcessor(new LazyInitializationBeanFactoryPostProcessor());
    }
    context.addBeanFactoryPostProcessor(new PropertySourceOrderingBeanFactoryPostProcessor(context));
    // Load the sources
    // source can be: a class name, package name, or an XML resource location.
    // 拿到所有的source 即主类 因为我们要根据主类去扫描主类的路径下的所有类
    Set<Object> sources = getAllSources();
    Assert.notEmpty(sources, "Sources must not be empty");
    // 将source注册成bean
    load(context, sources.toArray(new Object[0]));
    // 触发 contextLoaded 事件
    listeners.contextLoaded(context);
}
```

### postProcessApplicationContext

设置ApplicationContext 所需的一些东西

```java
protected void postProcessApplicationContext(ConfigurableApplicationContext context) {
    // 如果beanName生产者为空 那么就注册一个
    if (this.beanNameGenerator != null) {
        context.getBeanFactory().registerSingleton(AnnotationConfigUtils.CONFIGURATION_BEAN_NAME_GENERATOR,
                this.beanNameGenerator);
    }
    if (this.resourceLoader != null) {
        // applicationContext设置 resourceLoader
        if (context instanceof GenericApplicationContext) {
            ((GenericApplicationContext) context).setResourceLoader(this.resourceLoader);
        }
        // 设置classLoader
        if (context instanceof DefaultResourceLoader) {
            ((DefaultResourceLoader) context).setClassLoader(this.resourceLoader.getClassLoader());
        }
    }
    // 设置类型转换服务
    if (this.addConversionService) {
        context.getBeanFactory().setConversionService(context.getEnvironment().getConversionService());
    }
}
```

### load

```java
protected void load(ApplicationContext context, Object[] sources) {
    if (logger.isDebugEnabled()) {
        logger.debug("Loading source " + StringUtils.arrayToCommaDelimitedString(sources));
    }
    BeanDefinitionLoader loader = createBeanDefinitionLoader(getBeanDefinitionRegistry(context), sources);
    if (this.beanNameGenerator != null) {
        loader.setBeanNameGenerator(this.beanNameGenerator);
    }
    if (this.resourceLoader != null) {
        loader.setResourceLoader(this.resourceLoader);
    }
    if (this.environment != null) {
        loader.setEnvironment(this.environment);
    }
    loader.load();
}
```

### getBeanDefinitionRegistry

```java
private BeanDefinitionRegistry getBeanDefinitionRegistry(ApplicationContext context) {
    if (context instanceof BeanDefinitionRegistry) {
        return (BeanDefinitionRegistry) context;
    }
    // boot applicationContext 基本都是继承 AbstractApplicationContext
    // ConfigurableListableBeanFactory 的默认实现是 DefaultListableBeanFactory 实现了 BeanDefinitionRegistry接口
    // 拥有了注册bean定义信息的能力
    if (context instanceof AbstractApplicationContext) {
        return (BeanDefinitionRegistry) ((AbstractApplicationContext) context).getBeanFactory();
    }
    throw new IllegalStateException("Could not locate BeanDefinitionRegistry");
}
```
