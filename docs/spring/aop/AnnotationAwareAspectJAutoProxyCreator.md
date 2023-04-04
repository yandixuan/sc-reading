# AnnotationAwareAspectJAutoProxyCreator

:::tip 注意
AopUtils.APC_PRIORITY_LIST中优先级最高的 aop creator
:::

## initBeanFactory

父类执行完setBeanFactory给了个initBeanFactory的调用时机

执行

```java
@Override
protected void initBeanFactory(ConfigurableListableBeanFactory beanFactory) {
    super.initBeanFactory(beanFactory);
    // 初始化 aspectJAdvisorFactory 即 `ReflectiveAspectJAdvisorFactory`
    if (this.aspectJAdvisorFactory == null) {
        this.aspectJAdvisorFactory = new ReflectiveAspectJAdvisorFactory(beanFactory);
    }
    this.aspectJAdvisorsBuilder =
    new BeanFactoryAspectJAdvisorsBuilderAdapter(beanFactory, this.aspectJAdvisorFactory);
}
```

## findCandidateAdvisors

重写了父类寻找advisor的方法，添加进寻找注解@Aspect 并生成Advisor的功能

通过[`BeanFactoryAspectJAdvisorsBuilderAdapter`](./BeanFactoryAspectJAdvisorsBuilder)

而`BeanFactoryAspectJAdvisorsBuilderAdapter`托管给了[`ReflectiveAspectJAdvisorFactory`](./ReflectiveAspectJAdvisorFactory)

```java
@Override
protected List<Advisor> findCandidateAdvisors() {
    // Add all the Spring advisors found according to superclass rules.
    // 还是调用父类的方法
    List<Advisor> advisors = super.findCandidateAdvisors();
    // Build Advisors for all AspectJ aspects in the bean factory.
    if (this.aspectJAdvisorsBuilder != null) {
        advisors.addAll(this.aspectJAdvisorsBuilder.buildAspectJAdvisors());
    }
    return advisors;
}
```
