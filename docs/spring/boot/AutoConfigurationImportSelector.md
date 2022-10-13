# AutoConfigurationImportSelector

## 方法

### getAutoConfigurationEntry

```java
protected AutoConfigurationEntry getAutoConfigurationEntry(AnnotationMetadata annotationMetadata) {
  if (!isEnabled(annotationMetadata)) {
   return EMPTY_ENTRY;
  }
  // 获取 @EnableAutoConfiguration注解的 exclude 和 excludeName 属性
  AnnotationAttributes attributes = getAttributes(annotationMetadata);
  // 拿到所有的AutoConfiguration 即自动配置类
  List<String> configurations = getCandidateConfigurations(annotationMetadata, attributes);
  // 去除重复的配置项
  configurations = removeDuplicates(configurations);
  // 获取spring.autoconfigure.exclude 配置文件的内容并与exclude 和 excludeName 属性合并到一个集合中
  Set<String> exclusions = getExclusions(annotationMetadata, attributes);
  // exclude 排除一些自动配置类
  checkExcludedClasses(configurations, exclusions);
  // 移除configurations中需要排除的内容
  configurations.removeAll(exclusions);
  //从META-INF/spring-autoconfigure-metadata.properties中找到自动装载的条件，类似于@Conditional注解的作用
  configurations = getConfigurationClassFilter().filter(configurations);
  // 关闭spring监听器中的自动装配事件
  fireAutoConfigurationImportEvents(configurations, exclusions);
  return new AutoConfigurationEntry(configurations, exclusions);
}
```

### getCandidateConfigurations

这个地方就是SpringBoot自动配置加载所有的自动配置类的的地方，从SpringFactoriesLoader cache中拿到所有的AutoConfiguration.class类

```java
protected List<String> getCandidateConfigurations(AnnotationMetadata metadata, AnnotationAttributes attributes) {
  List<String> configurations = new ArrayList<>(
    SpringFactoriesLoader.loadFactoryNames(getSpringFactoriesLoaderFactoryClass(), getBeanClassLoader()));
  ImportCandidates.load(AutoConfiguration.class, getBeanClassLoader()).forEach(configurations::add);
  Assert.notEmpty(configurations,
    "No auto configuration classes found in META-INF/spring.factories nor in META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports. If you "
      + "are using a custom packaging, make sure that file is correct.");
  return configurations;
}
```

## AutoConfigurationGroup(内部类)

### process

这个在[ConfigurationClassParser](../context/ConfigurationClassParser)的`DeferredImportSelectorGrouping`执行process

```java
@Override
public void process(AnnotationMetadata annotationMetadata, DeferredImportSelector deferredImportSelector) {
  Assert.state(deferredImportSelector instanceof AutoConfigurationImportSelector,
    () -> String.format("Only %s implementations are supported, got %s",
      AutoConfigurationImportSelector.class.getSimpleName(),
      deferredImportSelector.getClass().getName()));
  AutoConfigurationEntry autoConfigurationEntry = ((AutoConfigurationImportSelector) deferredImportSelector)
    .getAutoConfigurationEntry(annotationMetadata);
  this.autoConfigurationEntries.add(autoConfigurationEntry);
  for (String importClassName : autoConfigurationEntry.getConfigurations()) {
  this.entries.putIfAbsent(importClassName, annotationMetadata);
  }
}
```
