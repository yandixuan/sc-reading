# DefaultAopProxyFactory

:::tip 注意
在spring-aop的范畴内，最终生成代理bean的方法都会调用该类的工厂方法生产代理实例

spring aop默认的工厂方法产生代理类实例
:::

## 方法

### createAopProxy

AdvisedSupport 实现了Advised接口

```java
@Override
public AopProxy createAopProxy(AdvisedSupport config) throws AopConfigException {
    // 首先判断是不是不是在GraalVM虚拟机上运行 
    // 如果ProxyFactory的isOptimize为true
    // 或者proxyTargetClass为true，
    // 或者被代理对象没有实现接口或者只实现了SpringProxy这个接口
    // 那么则利用Cglib进行动态代理，但如果被代理类是接口，或者被代理类已经是进行过JDK动态代理而生成的代理类了则只能进行JDK动态代理
    // 其他情况都会进行JDK动态代理，比如被代理类实现了除SpringProxy接口之外的其他接口
    if (!NativeDetector.inNativeImage() &&
            // isOptimize：以前的cglib效率比较高 开启这个会选择cglib
            // optimize为true,或proxyTargetClass为true,或用户没有给ProxyFactory对象添加interface
            (config.isOptimize() || config.isProxyTargetClass() || hasNoUserSuppliedProxyInterfaces(config))) {
            Class<?> targetClass = config.getTargetClass();
            if (targetClass == null) {
                throw new AopConfigException("TargetSource cannot determine target class: " +
                        "Either an interface or a target is required for proxy creation.");
            }
            // 如果 targetClass是接口 或 targetClass是否jdk代理类 或 targetClass是 lambda表达式
            // 都走jdk动态代理
            if (targetClass.isInterface() || Proxy.isProxyClass(targetClass) || ClassUtils.isLambdaClass(targetClass)) {
                return new JdkDynamicAopProxy(config);
            }
            // 最后才采用cglib方式产生代理
            // Objenesis是绕过默认构造器的方式去实例化类（有的类没有默认构造器）
            return new ObjenesisCglibAopProxy(config);
        }
        else {
            // 走JDK动态代理
            return new JdkDynamicAopProxy(config);
        }
}

private boolean hasNoUserSuppliedProxyInterfaces(AdvisedSupport config) {
    Class<?>[] ifcs = config.getProxiedInterfaces();
    return (ifcs.length == 0 || (ifcs.length == 1 && SpringProxy.class.isAssignableFrom(ifcs[0])));
}
```
