# AopProxyUtils

apo工具类

## completeProxiedInterfaces

:::tip
advised: aop配置

decoratingProxy: 是否添加DecoratingProxy接口
:::

```java
static Class<?>[] completeProxiedInterfaces(AdvisedSupport advised, boolean decoratingProxy) {
 // 从配置获取要代理的接口 
 Class<?>[] specifiedInterfaces = advised.getProxiedInterfaces();
 // 如果接口数量为0
 if (specifiedInterfaces.length == 0) {
  // No user-specified interfaces: check whether target class is an interface.
  // 获取代理目标的class
  Class<?> targetClass = advised.getTargetClass();
  if (targetClass != null) {
   // 如果 targetClass 为接口 即添加进去
   if (targetClass.isInterface()) {
    advised.setInterfaces(targetClass);
   }
   // 如果 targetClass 是代理类 或者 是lambda表达式
   else if (Proxy.isProxyClass(targetClass) || ClassUtils.isLambdaClass(targetClass)) {
    // 直接获取其接口 添加进advised配置中
    advised.setInterfaces(targetClass.getInterfaces());
   }
   // 赋值
   specifiedInterfaces = advised.getProxiedInterfaces();
  }
 }
 // 数组长度要再+3
 List<Class<?>> proxiedInterfaces = new ArrayList<>(specifiedInterfaces.length + 3);
 for (Class<?> ifc : specifiedInterfaces) {
  // Only non-sealed interfaces are actually eligible for JDK proxying (on JDK 17)
  // 判断jdk17 密封类 如果不是密封类就加入接口
  if (isSealedMethod == null || Boolean.FALSE.equals(ReflectionUtils.invokeMethod(isSealedMethod, ifc))) {
   proxiedInterfaces.add(ifc);
  }
 }
 // proxiedInterfaces 添加 SpringProxy 接口
 if (!advised.isInterfaceProxied(SpringProxy.class)) {
  proxiedInterfaces.add(SpringProxy.class);
 }
 // 1. advised.opaque==false 
 // 2. advised代理的接口中不包含 Advised接口
 // 该目的就是让代理类可以转成Advised类型,满足上述条件后 proxiedInterfaces 添加 Advised 接口
 if (!advised.isOpaque() && !advised.isInterfaceProxied(Advised.class)) {
  proxiedInterfaces.add(Advised.class);
 }
 // proxiedInterfaces 添加 DecoratingProxy 接口
 if (decoratingProxy && !advised.isInterfaceProxied(DecoratingProxy.class)) {
  proxiedInterfaces.add(DecoratingProxy.class);
 }
 // 返回要代理的接口数组
 return ClassUtils.toClassArray(proxiedInterfaces);
}

```

## ultimateTargetClass

获取对象真实的class类型

```java
public static Class<?> ultimateTargetClass(Object candidate) {
 Assert.notNull(candidate, "Candidate object must not be null");
 Object current = candidate;
 Class<?> result = null;
 // 直到当前获得的对象不是TargetClassAware类型
 while (current instanceof TargetClassAware) {
  // 通过current获取targetClass
  result = ((TargetClassAware) current).getTargetClass();
  // 尝试从targetSource中取得目标对象
  current = getSingletonTarget(current);
 }
 // 如果获取到的目标对象是一个cglib代理对象，获取父类类型（才是目标类型）
 if (result == null) {
  result = (AopUtils.isCglibProxy(candidate) ? candidate.getClass().getSuperclass() : candidate.getClass());
 }
 return result;
}

```
