# DefaultAdvisorChainFactory

## getInterceptorsAndDynamicInterceptionAdvice

[参考](https://www.cnblogs.com/lifullmoon/p/14654883.html)

获取方法增强拦截器链

:::tip 注意
引入增强（Introduction Advice）的概念：一个Java类，没有实现A接口，在不修改Java类的情况下，使其具备A接口的功能。
:::

```java
@Override
public List<Object> getInterceptorsAndDynamicInterceptionAdvice(
    Advised config, Method method, @Nullable Class<?> targetClass) {
    // This is somewhat tricky... We have to process introductions first,
    // but we need to preserve order in the ultimate list.
    AdvisorAdapterRegistry registry = GlobalAdvisorAdapterRegistry.getInstance();
    // 从aop配置中获取 Advisor数组包含 advice和pointCut
    Advisor[] advisors = config.getAdvisors();
    List<Object> interceptorList = new ArrayList<>(advisors.length);
    // 获取目标的class类型
    Class<?> actualClass = (targetClass != null ? targetClass : method.getDeclaringClass());
    Boolean hasIntroductions = null;
    // 遍历上一步获取到的 Advisor 们
    // 筛选出哪些 Advisor 需要处理当前被拦截的 `method`，并获取对应的 MethodInterceptor（Advice，如果不是方法拦截器则会包装成对应的 MethodInterceptor）
    for (Advisor advisor : advisors) {
      // 对于 PointcutAdvisor 和 IntroductionAdvisor 处理稍微有点不同，因为前者多了一个 Pointcut，需要通过它的 MethodMatcher 对方法进行匹配，其他的差不多  
      // IntroductionAdvisor 和 PointcutAdvisor接口不同，它仅有一个类过滤器ClassFilter 而没有 MethodMatcher，这是因为 `引介切面 的切点是类级别的，而 Pointcut 的切点是方法级别的（细粒度更细，所以更加常用）
      // AspectJExpressionPointcut 就是 IntroductionAwareMethodMatcher 的实现类
      if (advisor instanceof PointcutAdvisor) {
          // Add it conditionally.
          PointcutAdvisor pointcutAdvisor = (PointcutAdvisor) advisor;
          // AdvisedSupport 是否已经过滤过目标对象的类型
          // 调用 Pointcut 的 ClassFilter 对目标对象的类型进行匹配  
          if (config.isPreFiltered() || pointcutAdvisor.getPointcut().getClassFilter().matches(actualClass)) {
              // 获取 Pointcut 的 MethodMatcher 方法匹配器对该方法进行匹配
              MethodMatcher mm = pointcutAdvisor.getPointcut().getMethodMatcher();
              // 匹配标志
              boolean match;
              if (mm instanceof IntroductionAwareMethodMatcher) {
                  if (hasIntroductions == null) {
                      // 提升效率
                      // 判断advisor集合里 是否有 IntroductionAdvisor 匹配了目标类的class
                      hasIntroductions = hasMatchingIntroductions(advisors, actualClass);
                  }
                  match = ((IntroductionAwareMethodMatcher) mm).matches(method, actualClass, hasIntroductions);
              }
              else {
                  // 如果是 PointcutAdvisor 类型，则需要对目标对象的类型和被拦截的方法进行匹配 
                  match = mm.matches(method, actualClass);
              }
              if (match) {
                  //从 Advisor 中获取 Advice，并包装成 MethodInterceptor 拦截器对象（如果不是的话）
                  MethodInterceptor[] interceptors = registry.getInterceptors(advisor);
                  // 若 MethodMatcher 的 `isRuntime()` 返回 `true`，则表明 MethodMatcher 要在运行时做一些检测
                  if (mm.isRuntime()) {
                      // Creating a new object instance in the getInterceptors() method
                      // isn't a problem as we normally cache created chains.
                      for (MethodInterceptor interceptor : interceptors) {
                          // 将上面获取到的 MethodInterceptor 和 MethodMatcher 包装成一个对象，并添加至 `interceptorList`
                          interceptorList.add(new InterceptorAndDynamicMethodMatcher(interceptor, mm));
                      }
                  }
                  // 否则，直接将 MethodInterceptor 们添加至 `interceptorList`
                  else {
                      interceptorList.addAll(Arrays.asList(interceptors));
                  }
              }
          }
      }
      // 如果是 IntroductionAdvisor 类型，则需要对目标对象的类型进行匹配
      else if (advisor instanceof IntroductionAdvisor) {
          IntroductionAdvisor ia = (IntroductionAdvisor) advisor;
          // 判断这个 IntroductionAdvisor 是否匹配目标对象的类型，无法匹配则跳过
          // 是否已经过滤过目标对象的类型
          // 调用 Pointcut 的 ClassFilter 对目标对象的类型进行匹配
          if (config.isPreFiltered() || ia.getClassFilter().matches(actualClass)) {
              // 从 Advisor 中获取 Advice，并包装成 MethodInterceptor 拦截器对象（如果不是的话）
              Interceptor[] interceptors = registry.getInterceptors(advisor);
              // 直接将 MethodInterceptor 们添加至 `interceptorList`
              interceptorList.addAll(Arrays.asList(interceptors));
          }
      }
      //  不需要对目标对象的类型和被拦截的方法进行匹配
      else {
          Interceptor[] interceptors = registry.getInterceptors(advisor);
          interceptorList.addAll(Arrays.asList(interceptors));
      }
    }
    // 因为 Advisor 是排好序的，所以这里的 `interceptorList` 是有序的
    return interceptorList;
}
```
