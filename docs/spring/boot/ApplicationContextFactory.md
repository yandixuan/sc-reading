# ApplicationContextFactory

函数式接口 ApplicationContextFactory 工厂类

```java
    // 创建 ConfigurableApplicationContext
    ConfigurableApplicationContext create(WebApplicationType webApplicationType);

```

## 实现

其实就是去SPI的文件去找ApplicationContextFactory的实现类 如下

```text
org.springframework.boot.ApplicationContextFactory=\
org.springframework.boot.web.reactive.context.AnnotationConfigReactiveWebServerApplicationContext.Factory,\
org.springframework.boot.web.servlet.context.AnnotationConfigServletWebServerApplicationContext.Factory
```

```java
ApplicationContextFactory DEFAULT = (webApplicationType) -> {
    try {
        // SpringFactoriesLoader 是存在缓存的 所以直接去取 ApplicationContextFactory的实现类 去生产ApplicationContext
        for (ApplicationContextFactory candidate : SpringFactoriesLoader
                .loadFactories(ApplicationContextFactory.class, ApplicationContextFactory.class.getClassLoader())) {
            ConfigurableApplicationContext context = candidate.create(webApplicationType);
            if (context != null) {
                return context;
            }
        }
        //  fallback
        return new AnnotationConfigApplicationContext();
    }
    catch (Exception ex) {
        throw new IllegalStateException("Unable create a default ApplicationContext instance, "
                + "you may need a custom ApplicationContextFactory", ex);
    }
};
```

## 方法

提供2个静态方法用于直接产生 ApplicationContextFactory

```java
static ApplicationContextFactory ofContextClass(Class<? extends ConfigurableApplicationContext> contextClass) {
    return of(() -> BeanUtils.instantiateClass(contextClass));
}

static ApplicationContextFactory of(Supplier<ConfigurableApplicationContext> supplier) {
    return (webApplicationType) -> supplier.get();
}
```
