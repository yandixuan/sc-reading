# SharedMetadataReaderFactoryContextInitializer

出自于boot-autoconfugire里的SPI ApplicationContextInitializer

在[SpringApplication的run方法调用了prepareContext](./SpringApplication#run)方法里会执行`initialize`方法

## 方法

### initialize

```java
@Override
public void initialize(ConfigurableApplicationContext applicationContext) {
    // 在这个地方会塞入 CachingMetadataReaderFactoryPostProcessor这个 BeanFactoryPostProcessor 处理器
    BeanFactoryPostProcessor postProcessor = new CachingMetadataReaderFactoryPostProcessor(applicationContext);
    applicationContext.addBeanFactoryPostProcessor(postProcessor);
}
```

## CachingMetadataReaderFactoryPostProcessor(内部类)

### postProcessBeanDefinitionRegistry

在[AbstractApplicationContext](../context/AbstractApplicationContext#refresh)的`invokeBeanFactoryPostProcessors`会进行调用

```java
@Override
public void postProcessBeanDefinitionRegistry(BeanDefinitionRegistry registry) throws BeansException {
    register(registry);
    configureConfigurationClassPostProcessor(registry);
}
```

### register

生产SharedMetadataReaderFactoryBean，并同时产生一个MetadataReader用于读取类的元数据，然后从容器获取了名为internalConfigurationAnnotationProcessor的BeanDefinition，把上面生成的metadataReaderFactory设置到它的属性中，后续BeanDefinitionReader在完成spring扫描时就会用它来完成一些Bean的元数据解析

```java
private void register(BeanDefinitionRegistry registry) {
    if (!registry.containsBeanDefinition(BEAN_NAME)) {
        BeanDefinition definition = BeanDefinitionBuilder
                .rootBeanDefinition(SharedMetadataReaderFactoryBean.class, SharedMetadataReaderFactoryBean::new)
                .getBeanDefinition();
        registry.registerBeanDefinition(BEAN_NAME, definition);
    }
}

/**
 * 在 AnnotationConfigServletWebServerApplicationContext 实例化的时候
 * 会实例化它的属性reader 即 AnnotatedBeanDefinitionReader
 * AnnotatedBeanDefinitionReader 实例化的时候会调用 AnnotationConfigUtils.registerAnnotationConfigProcessors(this.registry);
 * 即向容器注册：
 * 1: CONFIGURATION_ANNOTATION_PROCESSOR_BEAN_NAME （通过扫描@configuration这个后置处理器实现自动配置）
 * 2: AUTOWIRED_ANNOTATION_PROCESSOR_BEAN_NAME
 * 3: COMMON_ANNOTATION_PROCESSOR_BEAN_NAME
 * 4: PERSISTENCE_ANNOTATION_PROCESSOR_BEAN_NAME
 * 5: EVENT_LISTENER_PROCESSOR_BEAN_NAME
 * 6: EVENT_LISTENER_FACTORY_BEAN_NAME
 * 这几个我们熟知的后置处理器
 */
private void configureConfigurationClassPostProcessor(BeanDefinitionRegistry registry) {
    try {
        configureConfigurationClassPostProcessor(
                registry.getBeanDefinition(AnnotationConfigUtils.CONFIGURATION_ANNOTATION_PROCESSOR_BEAN_NAME));
    }
    catch (NoSuchBeanDefinitionException ex) {
    }
}

private void configureConfigurationClassPostProcessor(BeanDefinition definition) {
    if (definition instanceof AbstractBeanDefinition) {
        configureConfigurationClassPostProcessor((AbstractBeanDefinition) definition);
        return;
    }
    configureConfigurationClassPostProcessor(definition.getPropertyValues());
}

private void configureConfigurationClassPostProcessor(AbstractBeanDefinition definition) {
    Supplier<?> instanceSupplier = definition.getInstanceSupplier();
    if (instanceSupplier != null) {
        definition.setInstanceSupplier(
                new ConfigurationClassPostProcessorCustomizingSupplier(this.context, instanceSupplier));
        return;
    }
    configureConfigurationClassPostProcessor(definition.getPropertyValues());
}

private void configureConfigurationClassPostProcessor(MutablePropertyValues propertyValues) {
    propertyValues.add("metadataReaderFactory", new RuntimeBeanReference(BEAN_NAME));
}
```
