# AbstractAdvisorAutoProxyCreator

继承 [`AbstractAutoProxyCreator`](./AbstractAutoProxyCreator)

:::tip
顾名思义就是针对的Advisor的自动代理创建
:::

## 方法

在`ConfigurationClassParser`的L590 处理 ImportBeanDefinitionRegistrar 类实例化的时候会调用 ParserStrategyUtils.instantiateClass 来实例化方法，同时执行spring的Aware方法

该方法实现了 BeanFactoryAware 所以会接下来执行 initBeanFactory

### setBeanFactory

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
