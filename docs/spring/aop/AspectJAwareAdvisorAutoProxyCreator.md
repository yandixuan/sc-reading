# AspectJAwareAdvisorAutoProxyCreator

:::tip
AspectJAwareAdvisorAutoProxyCreator是在解析< aop:config/>AOP标签时注册的一个bean定义，专门用于创建代理对象，实现AOP的核心功能
:::

## 方法

### extendAdvisors

```java
@Override
protected void extendAdvisors(List<Advisor> candidateAdvisors) {
    // 主要是在拦截器链的首部添加一个暴露MethodInvacation到上下文中的拦截器
    AspectJProxyUtils.makeAdvisorChainAspectJCapableIfNecessary(candidateAdvisors);
}
```

### sortAdvisors

```java
@Override
protected List<Advisor> sortAdvisors(List<Advisor> advisors) {
    List<PartiallyComparableAdvisorHolder> partiallyComparableAdvisors = new ArrayList<>(advisors.size());
    for (Advisor advisor : advisors) {
        partiallyComparableAdvisors.add(
                // 主要看DEFAULT_PRECEDENCE_COMPARATOR它的排序规则
                new PartiallyComparableAdvisorHolder(advisor, DEFAULT_PRECEDENCE_COMPARATOR));
    }
    List<PartiallyComparableAdvisorHolder> sorted = PartialOrder.sort(partiallyComparableAdvisors);
    if (sorted != null) {
        List<Advisor> result = new ArrayList<>(advisors.size());
        for (PartiallyComparableAdvisorHolder pcAdvisor : sorted) {
            result.add(pcAdvisor.getAdvisor());
        }
        return result;
    }
    else {
        return super.sortAdvisors(advisors);
    }
}
```

### shouldSkip

```java
@Override
protected boolean shouldSkip(Class<?> beanClass, String beanName) {
    // TODO: Consider optimization by caching the list of the aspect names
    // advisor是AspectJPointcutAdvisor类型 且 AspectJPointcutAdvisor的切面名称是beanName
    // 可以跳过代理 否则 使用父类的 shouldSkip 来判断是否需要代理
    List<Advisor> candidateAdvisors = findCandidateAdvisors();
    for (Advisor advisor : candidateAdvisors) {
        if (advisor instanceof AspectJPointcutAdvisor &&
                ((AspectJPointcutAdvisor) advisor).getAspectName().equals(beanName)) {
            return true;
        }
    }
    return super.shouldSkip(beanClass, beanName);
}
```
