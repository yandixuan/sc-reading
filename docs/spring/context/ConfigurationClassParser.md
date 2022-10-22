# ConfigurationClassParser

## 方法

### parse

```java
public void parse(Set<BeanDefinitionHolder> configCandidates) {
  // 根据beanDefinition类型去进行处理
  // 即: AnnotatedBeanDefinition,AbstractBeanDefinition
  for (BeanDefinitionHolder holder : configCandidates) {
   BeanDefinition bd = holder.getBeanDefinition();
   try {
    if (bd instanceof AnnotatedBeanDefinition) {
     parse(((AnnotatedBeanDefinition) bd).getMetadata(), holder.getBeanName());
    }
    else if (bd instanceof AbstractBeanDefinition && ((AbstractBeanDefinition) bd).hasBeanClass()) {
     parse(((AbstractBeanDefinition) bd).getBeanClass(), holder.getBeanName());
    }
    else {
     parse(bd.getBeanClassName(), holder.getBeanName());
    }
   }
   catch (BeanDefinitionStoreException ex) {
    throw ex;
   }
   catch (Throwable ex) {
    throw new BeanDefinitionStoreException(
      "Failed to parse configuration class [" + bd.getBeanClassName() + "]", ex);
   }
  }
  // 当所有的@configuration类解析完了之后
  this.deferredImportSelectorHandler.process();
}


// 对于上面的三个分支，最终调用 processConfigurationClass这个方法

protected final void parse(@Nullable String className, String beanName) throws IOException {
  Assert.notNull(className, "No bean class name for configuration class bean definition");
  MetadataReader reader = this.metadataReaderFactory.getMetadataReader(className);
  // 最终通过不同的参数封装成 ConfigurationClass这个对象
  processConfigurationClass(new ConfigurationClass(reader, beanName), DEFAULT_EXCLUSION_FILTER);
}

protected final void parse(Class<?> clazz, String beanName) throws IOException {
  processConfigurationClass(new ConfigurationClass(clazz, beanName), DEFAULT_EXCLUSION_FILTER);
}

protected final void parse(AnnotationMetadata metadata, String beanName) throws IOException {
  processConfigurationClass(new ConfigurationClass(metadata, beanName), DEFAULT_EXCLUSION_FILTER);
}
```

### processConfigurationClass

```java
protected void processConfigurationClass(ConfigurationClass configClass, Predicate<String> filter) throws IOException {
  // 先通过conditionEvaluator条件计算器判断是否跳过当前解析
  if (this.conditionEvaluator.shouldSkip(configClass.getMetadata(), ConfigurationPhase.PARSE_CONFIGURATION)) {
   return;
  }

  // 从缓存中取一次
  ConfigurationClass existingClass = this.configurationClasses.get(configClass);
  // 如果之前缓存了的
  if (existingClass != null) {
   // 判断是不是被其他的class importedBy
   if (configClass.isImported()) {
    if (existingClass.isImported()) {
     // 如果重复并且是Imported进来的，那么合并 
     existingClass.mergeImportedBy(configClass);
    }
    // Otherwise ignore new imported config class; existing non-imported class overrides it.
    return;
   }
   else {
    // Explicit bean definition found, probably replacing an import.
    // Let's remove the old one and go with the new one.
    this.configurationClasses.remove(configClass);
    this.knownSuperclasses.values().removeIf(configClass::equals);
   }
  }

  // Recursively process the configuration class and its superclass hierarchy.
  // 将配置类处理为SourceClass，简单的包装，会递归查找父类，不重要
  SourceClass sourceClass = asSourceClass(configClass, filter);
  do {
   // 解析配置类，主要是解析各种注解，并会循环查找父类
   sourceClass = doProcessConfigurationClass(configClass, sourceClass, filter);
  }
  while (sourceClass != null);
  // 缓存一下
  this.configurationClasses.put(configClass, configClass);
}
```

### doProcessConfigurationClass

```java
protected final SourceClass doProcessConfigurationClass(
   ConfigurationClass configClass, SourceClass sourceClass, Predicate<String> filter)
   throws IOException {
  // 首先解析Component注解
  if (configClass.getMetadata().isAnnotated(Component.class.getName())) {
   // Recursively process any member (nested) classes first
   // 主要是递归解析那些是配置类的内部类
   processMemberClasses(configClass, sourceClass, filter);
  }

  // Process any @PropertySource annotations
  // 解析@PropertySource注解
  for (AnnotationAttributes propertySource : AnnotationConfigUtils.attributesForRepeatable(
    sourceClass.getMetadata(), PropertySources.class,
    org.springframework.context.annotation.PropertySource.class)) {
   if (this.environment instanceof ConfigurableEnvironment) {
    processPropertySource(propertySource);
   }
   else {
    logger.info("Ignoring @PropertySource annotation on [" + sourceClass.getMetadata().getClassName() +
      "]. Reason: Environment must implement ConfigurableEnvironment");
   }
  }

  // Process any @ComponentScan annotations
  // 解析@ComponentScan，ComponentScans注解，这个注解最为复杂
  Set<AnnotationAttributes> componentScans = AnnotationConfigUtils.attributesForRepeatable(
    sourceClass.getMetadata(), ComponentScans.class, ComponentScan.class);
  if (!componentScans.isEmpty() &&
    !this.conditionEvaluator.shouldSkip(sourceClass.getMetadata(), ConfigurationPhase.REGISTER_BEAN)) {
   for (AnnotationAttributes componentScan : componentScans) {
    // The config class is annotated with @ComponentScan -> perform the scan immediately
    Set<BeanDefinitionHolder> scannedBeanDefinitions =
      this.componentScanParser.parse(componentScan, sourceClass.getMetadata().getClassName());
    // Check the set of scanned definitions for any further config classes and parse recursively if needed
    for (BeanDefinitionHolder holder : scannedBeanDefinitions) {
     BeanDefinition bdCand = holder.getBeanDefinition().getOriginatingBeanDefinition();
     if (bdCand == null) {
      bdCand = holder.getBeanDefinition();
     }
     if (ConfigurationClassUtils.checkConfigurationClassCandidate(bdCand, this.metadataReaderFactory)) {
      parse(bdCand.getBeanClassName(), holder.getBeanName());
     }
    }
   }
  }

  // Process any @Import annotations
  // 解析Import注解
  // springboot 最终会通过AnnotationTypeMappings.forAnnotationType(type) 拿到所有的注解
  processImports(configClass, sourceClass, getImports(sourceClass), filter, true);

  // Process any @ImportResource annotations
  // Spring 通过ASM 拿到主类上的注解 从而去拿到所有的注解
  // 解析ImportResource注解，这个主要是兼容spring的xml配置文件，现在基本不用了
  AnnotationAttributes importResource =
    AnnotationConfigUtils.attributesFor(sourceClass.getMetadata(), ImportResource.class);
  if (importResource != null) {
   String[] resources = importResource.getStringArray("locations");
   Class<? extends BeanDefinitionReader> readerClass = importResource.getClass("reader");
   for (String resource : resources) {
    String resolvedResource = this.environment.resolveRequiredPlaceholders(resource);
    configClass.addImportedResource(resolvedResource, readerClass);
   }
  }

  // Process individual @Bean methods
  // 解析@Bean注解
  Set<MethodMetadata> beanMethods = retrieveBeanMethodMetadata(sourceClass);
  for (MethodMetadata methodMetadata : beanMethods) {
   configClass.addBeanMethod(new BeanMethod(methodMetadata, configClass));
  }

  // Process default methods on interfaces
  // 处理接口上的默认方法，会递归解析上面的@Bean注解
  processInterfaces(configClass, sourceClass);

  // Process superclass, if any
  // 解析父类，如果有父类的话，返回父类，上层会递归进来执行
  if (sourceClass.getMetadata().hasSuperClass()) {
   String superclass = sourceClass.getMetadata().getSuperClassName();
   if (superclass != null && !superclass.startsWith("java") &&
     !this.knownSuperclasses.containsKey(superclass)) {
    this.knownSuperclasses.put(superclass, configClass);
    // Superclass found, return its annotation metadata and recurse
    return sourceClass.getSuperClass();
   }
  }

  // No superclass -> processing is complete
  return null;
}

```

### processImports

```java
private void processImports(ConfigurationClass configClass, SourceClass currentSourceClass,
   Collection<SourceClass> importCandidates, Predicate<String> exclusionFilter,
   boolean checkForCircularImports) {

  if (importCandidates.isEmpty()) {
   return;
  }

  if (checkForCircularImports && isChainedImportOnStack(configClass)) {
   this.problemReporter.error(new CircularImportProblem(configClass, this.importStack));
  }
  else {
   this.importStack.push(configClass);
   try {
    for (SourceClass candidate : importCandidates) {
     if (candidate.isAssignable(ImportSelector.class)) {
      // Candidate class is an ImportSelector -> delegate to it to determine imports
      Class<?> candidateClass = candidate.loadClass();
      ImportSelector selector = ParserStrategyUtils.instantiateClass(candidateClass, ImportSelector.class,
        this.environment, this.resourceLoader, this.registry);
      Predicate<String> selectorFilter = selector.getExclusionFilter();
      if (selectorFilter != null) {
       exclusionFilter = exclusionFilter.or(selectorFilter);
      }
      // 如果是继承了 DeferredImportSelector 接口
      // 我们的springboot自动配置类 AutoConfigurationImportSelector 就继承了 DeferredImportSelector接口
      if (selector instanceof DeferredImportSelector) {
       // 延迟引入，在所有的@Configuration处理完毕后处理，在作为@Conditional条件@Import时特别有用 
       this.deferredImportSelectorHandler.handle(configClass, (DeferredImportSelector) selector);
      }
      else {
       String[] importClassNames = selector.selectImports(currentSourceClass.getMetadata());
       Collection<SourceClass> importSourceClasses = asSourceClasses(importClassNames, exclusionFilter);
       processImports(configClass, currentSourceClass, importSourceClasses, exclusionFilter, false);
      }
     }
     // 如果继承ImportBeanDefinitionRegistrar接口，主要是作为在处理@Configuration的过程中添加BD，需要在BD级别自定义一个Bean时有用
     else if (candidate.isAssignable(ImportBeanDefinitionRegistrar.class)) {
      // Candidate class is an ImportBeanDefinitionRegistrar ->
      // delegate to it to register additional bean definitions
      Class<?> candidateClass = candidate.loadClass();
      // 实例化 ImportBeanDefinitionRegistrar 的实现类
      ImportBeanDefinitionRegistrar registrar =
        ParserStrategyUtils.instantiateClass(candidateClass, ImportBeanDefinitionRegistrar.class,
          this.environment, this.resourceLoader, this.registry);
      // 添加进 configClass的importBeanDefinitionRegistrars 这个Map中
      configClass.addImportBeanDefinitionRegistrar(registrar, currentSourceClass.getMetadata());
     }
     else {
      // Candidate class not an ImportSelector or ImportBeanDefinitionRegistrar ->
      // process it as an @Configuration class
      this.importStack.registerImport(
        currentSourceClass.getMetadata(), candidate.getMetadata().getClassName());
      processConfigurationClass(candidate.asConfigClass(configClass), exclusionFilter);
     }
    }
   }
   catch (BeanDefinitionStoreException ex) {
    throw ex;
   }
   catch (Throwable ex) {
    throw new BeanDefinitionStoreException(
      "Failed to process import candidates for configuration class [" +
      configClass.getMetadata().getClassName() + "]", ex);
   }
   finally {
    this.importStack.pop();
   }
  }
}
```
