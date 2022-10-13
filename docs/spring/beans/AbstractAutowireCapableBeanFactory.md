# AbstractAutowireCapableBeanFactory

## 方法

spring 创建bean的方法

### createBean

```java

@Override
protected Object createBean(String beanName, RootBeanDefinition mbd, @Nullable Object[] args)
   throws BeanCreationException {

  if (logger.isTraceEnabled()) {
   logger.trace("Creating instance of bean '" + beanName + "'");
  }
  RootBeanDefinition mbdToUse = mbd;

  // Make sure bean class is actually resolved at this point, and
  // clone the bean definition in case of a dynamically resolved Class
  // which cannot be stored in the shared merged bean definition.
  Class<?> resolvedClass = resolveBeanClass(mbd, beanName);
  if (resolvedClass != null && !mbd.hasBeanClass() && mbd.getBeanClassName() != null) {
   mbdToUse = new RootBeanDefinition(mbd);
   mbdToUse.setBeanClass(resolvedClass);
  }

  // Prepare method overrides.
  try {
   mbdToUse.prepareMethodOverrides();
  }
  catch (BeanDefinitionValidationException ex) {
   throw new BeanDefinitionStoreException(mbdToUse.getResourceDescription(),
     beanName, "Validation of method overrides failed", ex);
  }

  try {
   // Give BeanPostProcessors a chance to return a proxy instead of the target bean instance.
   // 这个地方给个钩子
   // 1: InstantiationAwareBeanPostProcessor的 postProcessBeforeInstantiation （实例化前）
   // 2: 所有BeanPostProcessor 的 postProcessAfterInitialization （spring初始化后）
   // 如果能返回，不执行后续的doCreateBean方法了
   Object bean = resolveBeforeInstantiation(beanName, mbdToUse);
   if (bean != null) {
    return bean;
   }
  }
  catch (Throwable ex) {
   throw new BeanCreationException(mbdToUse.getResourceDescription(), beanName,
     "BeanPostProcessor before instantiation of bean failed", ex);
  }

  try {
   Object beanInstance = doCreateBean(beanName, mbdToUse, args);
   if (logger.isTraceEnabled()) {
    logger.trace("Finished creating instance of bean '" + beanName + "'");
   }
   return beanInstance;
  }
  catch (BeanCreationException | ImplicitlyAppearedSingletonException ex) {
   // A previously detected exception with proper bean creation context already,
   // or illegal singleton state to be communicated up to DefaultSingletonBeanRegistry.
   throw ex;
  }
  catch (Throwable ex) {
   throw new BeanCreationException(
     mbdToUse.getResourceDescription(), beanName, "Unexpected exception during bean creation", ex);
  }
}

```

### doCreateBean

实例化+初始化

```java
protected Object doCreateBean(String beanName, RootBeanDefinition mbd, @Nullable Object[] args)
   throws BeanCreationException {

  // Instantiate the bean.
  BeanWrapper instanceWrapper = null;
  if (mbd.isSingleton()) {
   instanceWrapper = this.factoryBeanInstanceCache.remove(beanName);
  }
  if (instanceWrapper == null) {
   instanceWrapper = createBeanInstance(beanName, mbd, args);
  }
  Object bean = instanceWrapper.getWrappedInstance();
  Class<?> beanType = instanceWrapper.getWrappedClass();
  if (beanType != NullBean.class) {
   mbd.resolvedTargetType = beanType;
  }

  // Allow post-processors to modify the merged bean definition.
  synchronized (mbd.postProcessingLock) {
   if (!mbd.postProcessed) {
    try {
     // 调用属性合并后置处理器, 进行属性合并
     // 这里会进行 一些注解 的扫描
     // CommonAnnotationBeanPostProcessor -> @PostConstruct @PreDestroy @Resource
     // AutowiredAnnotationBeanPostProcessor -> @Autowired @Value 
     applyMergedBeanDefinitionPostProcessors(mbd, beanType, beanName);
    }
    catch (Throwable ex) {
     throw new BeanCreationException(mbd.getResourceDescription(), beanName,
       "Post-processing of merged bean definition failed", ex);
    }
    mbd.postProcessed = true;
   }
  }

  // Eagerly cache singletons to be able to resolve circular references
  // even when triggered by lifecycle interfaces like BeanFactoryAware.
  boolean earlySingletonExposure = (mbd.isSingleton() && this.allowCircularReferences &&
    isSingletonCurrentlyInCreation(beanName));
  if (earlySingletonExposure) {
   if (logger.isTraceEnabled()) {
    logger.trace("Eagerly caching bean '" + beanName +
      "' to allow for resolving potential circular references");
   }
   addSingletonFactory(beanName, () -> getEarlyBeanReference(beanName, mbd, bean));
  }

  // Initialize the bean instance.
  Object exposedObject = bean;
  try {
   populateBean(beanName, mbd, instanceWrapper);
   exposedObject = initializeBean(beanName, exposedObject, mbd);
  }
  catch (Throwable ex) {
   if (ex instanceof BeanCreationException && beanName.equals(((BeanCreationException) ex).getBeanName())) {
    throw (BeanCreationException) ex;
   }
   else {
    throw new BeanCreationException(
      mbd.getResourceDescription(), beanName, "Initialization of bean failed", ex);
   }
  }

  if (earlySingletonExposure) {
   Object earlySingletonReference = getSingleton(beanName, false);
   if (earlySingletonReference != null) {
    if (exposedObject == bean) {
     exposedObject = earlySingletonReference;
    }
    else if (!this.allowRawInjectionDespiteWrapping && hasDependentBean(beanName)) {
     String[] dependentBeans = getDependentBeans(beanName);
     Set<String> actualDependentBeans = new LinkedHashSet<>(dependentBeans.length);
     for (String dependentBean : dependentBeans) {
      if (!removeSingletonIfCreatedForTypeCheckOnly(dependentBean)) {
       actualDependentBeans.add(dependentBean);
      }
     }
     if (!actualDependentBeans.isEmpty()) {
      throw new BeanCurrentlyInCreationException(beanName,
        "Bean with name '" + beanName + "' has been injected into other beans [" +
        StringUtils.collectionToCommaDelimitedString(actualDependentBeans) +
        "] in its raw version as part of a circular reference, but has eventually been " +
        "wrapped. This means that said other beans do not use the final version of the " +
        "bean. This is often the result of over-eager type matching - consider using " +
        "'getBeanNamesForType' with the 'allowEagerInit' flag turned off, for example.");
     }
    }
   }
  }

  // Register bean as disposable.
  try {
   registerDisposableBeanIfNecessary(beanName, bean, mbd);
  }
  catch (BeanDefinitionValidationException ex) {·
   throw new BeanCreationException(
     mbd.getResourceDescription(), beanName, "Invalid destruction signature", ex);
  }

  return exposedObject;
}

```

### populateBean

bean的属性填充

```java
protected void populateBean(String beanName, RootBeanDefinition mbd, @Nullable BeanWrapper bw) {
  if (bw == null) {
   if (mbd.hasPropertyValues()) {
    throw new BeanCreationException(
      mbd.getResourceDescription(), beanName, "Cannot apply property values to null instance");
   }
   else {
    // Skip property population phase for null instance.
    return;
   }
  }

  // Give any InstantiationAwareBeanPostProcessors the opportunity to modify the
  // state of the bean before properties are set. This can be used, for example,
  // to support styles of field injection.
  if (!mbd.isSynthetic() && hasInstantiationAwareBeanPostProcessors()) {
   // 在填充bean属性开始的时候给了个InstantiationAwareBeanPostProcessor的钩子
   // 如果 postProcessAfterInstantiation 返回false 就不继续往下执行了
   for (InstantiationAwareBeanPostProcessor bp : getBeanPostProcessorCache().instantiationAware) {
    if (!bp.postProcessAfterInstantiation(bw.getWrappedInstance(), beanName)) {
     return;
    }
   }
  }

  PropertyValues pvs = (mbd.hasPropertyValues() ? mbd.getPropertyValues() : null);

  int resolvedAutowireMode = mbd.getResolvedAutowireMode();
  if (resolvedAutowireMode == AUTOWIRE_BY_NAME || resolvedAutowireMode == AUTOWIRE_BY_TYPE) {
   MutablePropertyValues newPvs = new MutablePropertyValues(pvs);
   // Add property values based on autowire by name if applicable.
   if (resolvedAutowireMode == AUTOWIRE_BY_NAME) {
    autowireByName(beanName, mbd, bw, newPvs);
   }
   // Add property values based on autowire by type if applicable.
   if (resolvedAutowireMode == AUTOWIRE_BY_TYPE) {
    autowireByType(beanName, mbd, bw, newPvs);
   }
   pvs = newPvs;
  }

  boolean hasInstAwareBpps = hasInstantiationAwareBeanPostProcessors();
  boolean needsDepCheck = (mbd.getDependencyCheck() != AbstractBeanDefinition.DEPENDENCY_CHECK_NONE);

  PropertyDescriptor[] filteredPds = null;
  if (hasInstAwareBpps) {
   if (pvs == null) {
    pvs = mbd.getPropertyValues();
   }
   // InstantiationAwareBeanPostProcessor的钩子执行 postProcessProperties方法进行属性填充
   for (InstantiationAwareBeanPostProcessor bp : getBeanPostProcessorCache().instantiationAware) {
    PropertyValues pvsToUse = bp.postProcessProperties(pvs, bw.getWrappedInstance(), beanName);
    if (pvsToUse == null) {
     if (filteredPds == null) {
      filteredPds = filterPropertyDescriptorsForDependencyCheck(bw, mbd.allowCaching);
     }
     pvsToUse = bp.postProcessPropertyValues(pvs, filteredPds, bw.getWrappedInstance(), beanName);
     if (pvsToUse == null) {
      return;
     }
    }
    pvs = pvsToUse;
   }
  }
  if (needsDepCheck) {
   if (filteredPds == null) {
    filteredPds = filterPropertyDescriptorsForDependencyCheck(bw, mbd.allowCaching);
   }
   checkDependencies(beanName, mbd, filteredPds, pvs);
  }

  if (pvs != null) {
   // 这个才是bean属性进行填充属性的地方 
   applyPropertyValues(beanName, mbd, bw, pvs);
  }
}

```

### initializeBean

bean的初始化

```java
protected Object initializeBean(String beanName, Object bean, @Nullable RootBeanDefinition mbd) {
  if (System.getSecurityManager() != null) {
   AccessController.doPrivileged((PrivilegedAction<Object>) () -> {
    invokeAwareMethods(beanName, bean);
    return null;
   }, getAccessControlContext());
  }
  else {
   invokeAwareMethods(beanName, bean);
  }

  Object wrappedBean = bean;
  if (mbd == null || !mbd.isSynthetic()) {
   // 所有BeanPostProcessor 的 postProcessBeforeInitialization钩子
   wrappedBean = applyBeanPostProcessorsBeforeInitialization(wrappedBean, beanName);
  }

  try {
   // 执行 InitializingBean 的 afterPropertiesSet 方法 
   invokeInitMethods(beanName, wrappedBean, mbd);
  }
  catch (Throwable ex) {
   throw new BeanCreationException(
     (mbd != null ? mbd.getResourceDescription() : null),
     beanName, "Invocation of init method failed", ex);
  }
  if (mbd == null || !mbd.isSynthetic()) {
   // 所有BeanPostProcessor 的 postProcessAfterInitialization钩子 
   wrappedBean = applyBeanPostProcessorsAfterInitialization(wrappedBean, beanName);
  }

  return wrappedBean;
}
```
