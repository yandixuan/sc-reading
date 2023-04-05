# AspectJAroundAdvice

AspectJ环绕通知

## invoke

```java
@Override
@Nullable
public Object invoke(MethodInvocation mi) throws Throwable {
    if (!(mi instanceof ProxyMethodInvocation)) {
        throw new IllegalStateException("MethodInvocation is not a Spring ProxyMethodInvocation: " + mi);
    }
    ProxyMethodInvocation pmi = (ProxyMethodInvocation) mi;
    // MethodInvocation包装成 MethodInvocationProceedingJoinPoint
    // MethodInvocationProceedingJoinPoint 通过克隆参数，对象达到不可修改,将 ReflectiveMethodInvocation传回Around方法参数 即ProceedingJoinPoint
    // ProceedingJoinPoint.proceed 达到继续执行拦截器链后续方法，因此达到around方法效果
    // AbstractAspectJAdvice#argBinding绑定参数 通过约定将拦截器ReflectiveMethodInvocation传回环绕方法里
    ProceedingJoinPoint pjp = lazyGetProceedingJoinPoint(pmi);
    JoinPointMatch jpm = getJoinPointMatch(pmi);
    return invokeAdviceMethod(pjp, jpm, null, null);
}
```
