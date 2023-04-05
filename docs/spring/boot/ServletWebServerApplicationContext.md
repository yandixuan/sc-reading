# ServletWebServerApplicationContext

## 方法

### postProcessBeanFactory

```java
protected void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) {
    beanFactory.addBeanPostProcessor(new WebApplicationContextServletContextAwareProcessor(this));
    beanFactory.ignoreDependencyInterface(ServletContextAware.class);
    // 最主要是最后这步,为BeanFactory注册了request、session的web域
    // 并注册了ServletRequest、ServletResponse、HttpSession、WebRequest到容器中
    registerWebApplicationScopes();
}
```

### onRefresh

### getSelfInitializer

### selfInitialize
