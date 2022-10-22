# ConfigurationClassBeanDefinitionReader

## 方法

### loadBeanDefinitionsForConfigurationClass

```java
 private void loadBeanDefinitionsForConfigurationClass(
   ConfigurationClass configClass, TrackedConditionEvaluator trackedConditionEvaluator) {

  if (trackedConditionEvaluator.shouldSkip(configClass)) {
   String beanName = configClass.getBeanName();
   if (StringUtils.hasLength(beanName) && this.registry.containsBeanDefinition(beanName)) {
    this.registry.removeBeanDefinition(beanName);
   }
   this.importRegistry.removeImportingClass(configClass.getMetadata().getClassName());
   return;
  }

  if (configClass.isImported()) {
   registerBeanDefinitionForImportedConfigurationClass(configClass);
  }
  for (BeanMethod beanMethod : configClass.getBeanMethods()) {
   loadBeanDefinitionsForBeanMethod(beanMethod);
  }

  loadBeanDefinitionsFromImportedResources(configClass.getImportedResources());
  // 根据configClass解析出来的 ImportBeanDefinitionRegistrar实例 加载beanDefinition
  loadBeanDefinitionsFromRegistrars(configClass.getImportBeanDefinitionRegistrars());
 }
```
