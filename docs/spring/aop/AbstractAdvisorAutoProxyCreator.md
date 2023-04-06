# AbstractAdvisorAutoProxyCreator

继承 [`AbstractAutoProxyCreator`](./AbstractAutoProxyCreator)

:::tip 注意
顾名思义就是针对的Advisor的自动代理创建
:::

## 方法

在 `AbstractApplicationContext.refresh` 执行到L567(registerBeanPostProcessors(beanFactory))会从容器取一次 aop的bean

拿到初始化后的bean容器自然会执行相应的Aware接口 即 `setBeanFactory`方法

### setBeanFactory

覆写了

```java
@Override
public void setBeanFactory(BeanFactory beanFactory) {
    super.setBeanFactory(beanFactory);
    if (!(beanFactory instanceof ConfigurableListableBeanFactory)) {
        throw new IllegalArgumentException(
              "AdvisorAutoProxyCreator requires a ConfigurableListableBeanFactory: " + beanFactory);
    }
    initBeanFactory((ConfigurableListableBeanFactory) beanFactory);
}
```

### initBeanFactory

实例化 BeanFactoryAdvisorRetrievalHelperAdapter对象来去找Advisor

```java
protected void initBeanFactory(ConfigurableListableBeanFactory beanFactory) {
    this.advisorRetrievalHelper = new BeanFactoryAdvisorRetrievalHelperAdapter(beanFactory);
}

```

### getAdvicesAndAdvisorsForBean

实现父类的方法`获取容器中的Advisor`

```java
@Override
@Nullable
protected Object[] getAdvicesAndAdvisorsForBean(
    Class<?> beanClass, String beanName, @Nullable TargetSource targetSource) {

    List<Advisor> advisors = findEligibleAdvisors(beanClass, beanName);
    // advisors为空说明不需要代理
    if (advisors.isEmpty()) {
        return DO_NOT_PROXY;
    }
    // 返回数组
    return advisors.toArray();
}
```

### findEligibleAdvisors

寻找合法的Advisor

```java
protected List<Advisor> findEligibleAdvisors(Class<?> beanClass, String beanName) {
    // 通过 BeanFactoryAdvisorRetrievalHelperAdapter.findAdvisorBeans去找到所有的Advisor通知器
    List<Advisor> candidateAdvisors = findCandidateAdvisors();
    // 找到匹配当前bean的增强器
    List<Advisor> eligibleAdvisors = findAdvisorsThatCanApply(candidateAdvisors, beanClass, beanName);
    // 交给子类去实现
    extendAdvisors(eligibleAdvisors);
    // 不为空,由 `AnnotationAwareOrderComparator`去进行排序
    if (!eligibleAdvisors.isEmpty()) {
        eligibleAdvisors = sortAdvisors(eligibleAdvisors);
    }
    return eligibleAdvisors;
}

```
