# ProxyConfig

对于spring-aop的配置

## 属性

```java
// 如果该值为true，则proxyFactory将会使用CGLIB对目标对象进行代理，默认值为false
private boolean proxyTargetClass = false;
// 标记是否对代理进行优化。启动优化通常意味着在代理对象被创建后，增强的修改将不会生效，因此默认值为false。
private boolean optimize = false;
// 该属性用于空值生成的代理对象是否可以强制转型为Advised，默认值为false，表示任何生成的代理对象都可以强制转换成Advised，true是不可以，可以通过Adviced查询代理对象的一些状态
boolean opaque = false;
// 标记代理对象是否应该被aop框架通过AopContext以ThreadLocal的形式暴露出去。
// 当一个代理对象需要调用它自己的另外一个代理方法时，这个属性将非常有用。默认是是false，以避免不必要的拦截。
boolean exposeProxy = false;
// 标记该配置是否需要被冻结，如果被冻结，将不可以修改增强的配置。
// 如果该值为true,那么代理对象的生成的各项信息配置完成，则不容许更改，如果ProxyFactory设置完毕，该值为true，则不能对Advice进行改动，可以优化代理对象生成的性能。默认情况下该值为false
private boolean frozen = false;

```
