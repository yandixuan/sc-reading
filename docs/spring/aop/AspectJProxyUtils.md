# AspectJProxyUtils

## makeAdvisorChainAspectJCapableIfNecessary

```java
public static boolean makeAdvisorChainAspectJCapableIfNecessary(List<Advisor> advisors) {
    // Don't add advisors to an empty list; may indicate that proxying is just not required
    if (!advisors.isEmpty()) {
        // 是否找到 AspectJAdvice标志 
        boolean foundAspectJAdvice = false;
        // 遍历通知器
        for (Advisor advisor : advisors) {
            // Be careful not to get the Advice without a guard, as this might eagerly
            // instantiate a non-singleton AspectJ aspect...
            // 如果找到了，设置标志为true
            if (isAspectJAdvice(advisor)) {
                foundAspectJAdvice = true;
                break;
            }
        }
        // 有的话，向advisors的0号位置，即第一个位置，添加一个DefaultPointcutAdvisor（ExposeInvocationInterceptor拦截器）
        // ExposeInvocationInterceptor将当前methodInvocation暴露到ThreadLocal中供使用
        if (foundAspectJAdvice && !advisors.contains(ExposeInvocationInterceptor.ADVISOR)) {
            advisors.add(0, ExposeInvocationInterceptor.ADVISOR);
            return true;
        }
    }
    return false;
}
```

## isAspectJAdvice

1. InstantiationModelAwarePointcutAdvisor类型的advisor
2. advisor的advice是 AbstractAspectJAdvice 类型
3. advisor是PointcutAdvisor类型但是切点是 AspectJExpressionPointcut类型

```java
private static boolean isAspectJAdvice(Advisor advisor) {
    return (advisor instanceof InstantiationModelAwarePointcutAdvisor ||
            advisor.getAdvice() instanceof AbstractAspectJAdvice ||
            (advisor instanceof PointcutAdvisor &&
                    ((PointcutAdvisor) advisor).getPointcut() instanceof AspectJExpressionPointcut));
}
``
