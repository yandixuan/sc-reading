# AnnotationAwareAspectJAutoProxyCreator

:::tip
AopUtils.APC_PRIORITY_LIST中优先级最高的 aop creator
:::

## initBeanFactory

```java
 @Override
 protected void initBeanFactory(ConfigurableListableBeanFactory beanFactory) {
  super.initBeanFactory(beanFactory);
  if (this.aspectJAdvisorFactory == null) {
   this.aspectJAdvisorFactory = new ReflectiveAspectJAdvisorFactory(beanFactory);
  }
  this.aspectJAdvisorsBuilder =
    new BeanFactoryAspectJAdvisorsBuilderAdapter(beanFactory, this.aspectJAdvisorFactory);
 }
```

## findCandidateAdvisors

```java
 @Override
 protected List<Advisor> findCandidateAdvisors() {
  // Add all the Spring advisors found according to superclass rules.
  List<Advisor> advisors = super.findCandidateAdvisors();
  // Build Advisors for all AspectJ aspects in the bean factory.
  if (this.aspectJAdvisorsBuilder != null) {
   advisors.addAll(this.aspectJAdvisorsBuilder.buildAspectJAdvisors());
  }
  return advisors;
 }
```
