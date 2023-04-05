# ConfigDataLocationResolvers

## 属性

```java
    // 配置文件地址解析器
    private final List<ConfigDataLocationResolver<?>> resolvers;
```

## 构造函数

```java
/**
 * Create a new {@link ConfigDataLocationResolvers} instance.
 * @param logFactory a {@link DeferredLogFactory} used to inject {@link Log} instances
 * @param bootstrapContext the bootstrap context
 * @param binder a binder providing values from the initial {@link Environment}
 * @param resourceLoader {@link ResourceLoader} to load resource locations
 */
ConfigDataLocationResolvers(DeferredLogFactory logFactory, ConfigurableBootstrapContext bootstrapContext,
        Binder binder, ResourceLoader resourceLoader) {
    // SPI加载并实例化`ConfigDataLocationResolver`类
    this(logFactory, bootstrapContext, binder, resourceLoader, SpringFactoriesLoader
            .loadFactoryNames(ConfigDataLocationResolver.class, resourceLoader.getClassLoader()));
}

/**
 * Create a new {@link ConfigDataLocationResolvers} instance.
 * @param logFactory a {@link DeferredLogFactory} used to inject {@link Log} instances
 * @param bootstrapContext the bootstrap context
 * @param binder {@link Binder} providing values from the initial {@link Environment}
 * @param resourceLoader {@link ResourceLoader} to load resource locations
 * @param names the {@link ConfigDataLocationResolver} class names
 */
ConfigDataLocationResolvers(DeferredLogFactory logFactory, ConfigurableBootstrapContext bootstrapContext,
        Binder binder, ResourceLoader resourceLoader, List<String> names) {
    // 实例化`ConfigDataLocationResolver`提供可选的构造参数
    Instantiator<ConfigDataLocationResolver<?>> instantiator = new Instantiator<>(ConfigDataLocationResolver.class,
            (availableParameters) -> {
                availableParameters.add(Log.class, logFactory::getLog);
                availableParameters.add(DeferredLogFactory.class, logFactory);
                availableParameters.add(Binder.class, binder);
                availableParameters.add(ResourceLoader.class, resourceLoader);
                availableParameters.add(ConfigurableBootstrapContext.class, bootstrapContext);
                availableParameters.add(BootstrapContext.class, bootstrapContext);
                availableParameters.add(BootstrapRegistry.class, bootstrapContext);
            });
    // 保证`StandardConfigDataLocationResolver`处于最后添加  
    this.resolvers = reorder(instantiator.instantiate(resourceLoader.getClassLoader(), names));
}
```

## 方法

### reorder

```java
private List<ConfigDataLocationResolver<?>> reorder(List<ConfigDataLocationResolver<?>> resolvers) {
    List<ConfigDataLocationResolver<?>> reordered = new ArrayList<>(resolvers.size());
    StandardConfigDataLocationResolver resourceResolver = null;
    for (ConfigDataLocationResolver<?> resolver : resolvers) {
        if (resolver instanceof StandardConfigDataLocationResolver) {
            resourceResolver = (StandardConfigDataLocationResolver) resolver;
        }
        else {
            reordered.add(resolver);
        }
    }
    // 保证`StandardConfigDataLocationResolver`最后添加
    if (resourceResolver != null) {
        reordered.add(resourceResolver);
    }
    // 返回不可变集合
    return Collections.unmodifiableList(reordered);
}
```

### resolve

```java
List<ConfigDataResolutionResult> resolve(ConfigDataLocationResolverContext context, ConfigDataLocation location,
        Profiles profiles) {
    // location为null则返回空集合
    if (location == null) {
        return Collections.emptyList();
    }
    // 遍历resolvers
    for (ConfigDataLocationResolver<?> resolver : getResolvers()) {
        // 判断该resolver是否能够解析该路径 
        if (resolver.isResolvable(context, location)) {
            // 解析
            return resolve(resolver, context, location, profiles);
        }
    }
    throw new UnsupportedConfigDataLocationException(location);
}

private List<ConfigDataResolutionResult> resolve(ConfigDataLocationResolver<?> resolver,
        ConfigDataLocationResolverContext context, ConfigDataLocation location, Profiles profiles) {
    // 将解析的具体动作封装成java8函数式方法
    // 交给下一个resolve方法
    List<ConfigDataResolutionResult> resolved = resolve(location, false, () -> resolver.resolve(context, location));
    // 如果环境为空则直接返回解析结果
    if (profiles == null) {
        return resolved;
    }
    // 根据环境解析相应的路径配置
    List<ConfigDataResolutionResult> profileSpecific = resolve(location, true,
            () -> resolver.resolveProfileSpecific(context, location, profiles));
    // 合并`resolved`,`profileSpecific`的结果进行返回
    return merge(resolved, profileSpecific);
}

private List<ConfigDataResolutionResult> resolve(ConfigDataLocation location, boolean profileSpecific,
        Supplier<List<? extends ConfigDataResource>> resolveAction) {
    /**
    * SPI加载`ConfigDataLocationResolver`实现类
    * 例如StandardConfigDataLocationResolver则是SpringBoot内置的加载`application`配置文件的类(通过`propertySourceLoaders`实现对不同文件后缀的加载，由相应 `ConfigDataLoader`完成对资源的转换，读取到propertyResource列表)
    * NacosConfigDataLocationResolver则是通过实现接口`ConfigDataLocationResolver`完成对配置中心配置的location的解析读取再转交给`NacosConfigDataLoader`读取 propertyResource列表继而完成第三方import的配置的加载
    */
    List<ConfigDataResource> resources = nonNullList(resolveAction.get());
    List<ConfigDataResolutionResult> resolved = new ArrayList<>(resources.size());
    for (ConfigDataResource resource : resources) {
        resolved.add(new ConfigDataResolutionResult(location, resource, profileSpecific));
    }
    return resolved;
}
```
