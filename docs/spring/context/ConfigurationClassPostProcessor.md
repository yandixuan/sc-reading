# ConfigurationClassPostProcessor

## 方法

### postProcessBeanDefinitionRegistry

```java
@Override
public void postProcessBeanDefinitionRegistry(BeanDefinitionRegistry registry) {
  int registryId = System.identityHashCode(registry);
  // 对同一个容器防止重复调用
  if (this.registriesPostProcessed.contains(registryId)) {
   throw new IllegalStateException(
     "postProcessBeanDefinitionRegistry already called on this post-processor against " + registry);
  }
  if (this.factoriesPostProcessed.contains(registryId)) {
   throw new IllegalStateException(
     "postProcessBeanFactory already called on this post-processor against " + registry);
  }
  this.registriesPostProcessed.add(registryId);

  processConfigBeanDefinitions(registry);
}
```

### processConfigBeanDefinitions

```java
public void processConfigBeanDefinitions(BeanDefinitionRegistry registry) {
  List<BeanDefinitionHolder> configCandidates = new ArrayList<>();
  String[] candidateNames = registry.getBeanDefinitionNames();

  for (String beanName : candidateNames) {
   BeanDefinition beanDef = registry.getBeanDefinition(beanName);
   if (beanDef.getAttribute(ConfigurationClassUtils.CONFIGURATION_CLASS_ATTRIBUTE) != null) {
    if (logger.isDebugEnabled()) {
     logger.debug("Bean definition has already been processed as a configuration class: " + beanDef);
    }
   }
   // springboot 将 primary class注册成 AnnotatedGenericBeanDefinition
   else if (ConfigurationClassUtils.checkConfigurationClassCandidate(beanDef, this.metadataReaderFactory)) {
    //检查这个bean是不是一个配置类，是则加入候选者集合
    //判断的逻辑很简单，就是看是不是有以下注解
    /**
     * 1.Configuration
     * 2.Component
     * 3.ComponentScan
     * 4.Import
     * 5.ImportResource
     */
    configCandidates.add(new BeanDefinitionHolder(beanDef, beanName));
   }
  }

  // Return immediately if no @Configuration classes were found
  // 如果没有@Configuration注解的class就退出 这个类就是来处理@Configuration的class的
  if (configCandidates.isEmpty()) {
   return;
  }

  // Sort by previously determined @Order value, if applicable
  // 排序
  configCandidates.sort((bd1, bd2) -> {
   int i1 = ConfigurationClassUtils.getOrder(bd1.getBeanDefinition());
   int i2 = ConfigurationClassUtils.getOrder(bd2.getBeanDefinition());
   return Integer.compare(i1, i2);
  });

  // Detect any custom bean name generation strategy supplied through the enclosing application context
  SingletonBeanRegistry sbr = null;
  if (registry instanceof SingletonBeanRegistry) {
   sbr = (SingletonBeanRegistry) registry;
   if (!this.localBeanNameGeneratorSet) {
    BeanNameGenerator generator = (BeanNameGenerator) sbr.getSingleton(
      AnnotationConfigUtils.CONFIGURATION_BEAN_NAME_GENERATOR);
    if (generator != null) {
     this.componentScanBeanNameGenerator = generator;
     this.importBeanNameGenerator = generator;
    }
   }
  }
  
  if (this.environment == null) {
   this.environment = new StandardEnvironment();
  }

  // Parse each @Configuration class
  // 创建ConfigurationClassParser去解析每个 @Configuration class
  ConfigurationClassParser parser = new ConfigurationClassParser(
    this.metadataReaderFactory, this.problemReporter, this.environment,
    this.resourceLoader, this.componentScanBeanNameGenerator, registry);

  Set<BeanDefinitionHolder> candidates = new LinkedHashSet<>(configCandidates);
  Set<ConfigurationClass> alreadyParsed = new HashSet<>(configCandidates.size());
  do {
   StartupStep processConfig = this.applicationStartup.start("spring.context.config-classes.parse");
  /**
   * 用解析器解析配置类，把解析到的bean注册为BeanDefinition，
   * 会循环解析直到候选者集合为空，因为可能不断会有配置类被解析出来
   */
   parser.parse(candidates);
   parser.validate();

   Set<ConfigurationClass> configClasses = new LinkedHashSet<>(parser.getConfigurationClasses());
   configClasses.removeAll(alreadyParsed);

   // Read the model and create bean definitions based on its content
   if (this.reader == null) {
    this.reader = new ConfigurationClassBeanDefinitionReader(
      registry, this.sourceExtractor, this.resourceLoader, this.environment,
      this.importBeanNameGenerator, parser.getImportRegistry());
   }
   this.reader.loadBeanDefinitions(configClasses);
   alreadyParsed.addAll(configClasses);
   processConfig.tag("classCount", () -> String.valueOf(configClasses.size())).end();

   candidates.clear();
   if (registry.getBeanDefinitionCount() > candidateNames.length) {
    String[] newCandidateNames = registry.getBeanDefinitionNames();
    Set<String> oldCandidateNames = new HashSet<>(Arrays.asList(candidateNames));
    Set<String> alreadyParsedClasses = new HashSet<>();
    for (ConfigurationClass configurationClass : alreadyParsed) {
     alreadyParsedClasses.add(configurationClass.getMetadata().getClassName());
    }
    for (String candidateName : newCandidateNames) {
     if (!oldCandidateNames.contains(candidateName)) {
      BeanDefinition bd = registry.getBeanDefinition(candidateName);
      if (ConfigurationClassUtils.checkConfigurationClassCandidate(bd, this.metadataReaderFactory) &&
        !alreadyParsedClasses.contains(bd.getBeanClassName())) {
       candidates.add(new BeanDefinitionHolder(bd, candidateName));
      }
     }
    }
    candidateNames = newCandidateNames;
   }
  }
  while (!candidates.isEmpty());

  // Register the ImportRegistry as a bean in order to support ImportAware @Configuration classes
  if (sbr != null && !sbr.containsSingleton(IMPORT_REGISTRY_BEAN_NAME)) {
   sbr.registerSingleton(IMPORT_REGISTRY_BEAN_NAME, parser.getImportRegistry());
  }

  if (this.metadataReaderFactory instanceof CachingMetadataReaderFactory) {
   // Clear cache in externally provided MetadataReaderFactory; this is a no-op
   // for a shared cache since it'll be cleared by the ApplicationContext.
   ((CachingMetadataReaderFactory) this.metadataReaderFactory).clearCache();
  }
}

```
