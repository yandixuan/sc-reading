# TransactionManagementConfigurationSelector

:::tip 注意
事务管理器自动配置类由`@EnableTransactionManagement`import

继承`AdviceModeImportSelector`主要是读取引入类(`@EnableTransactionManagement`)的`mode`属性

:::

## selectImports

```java
@Override
protected String[] selectImports(AdviceMode adviceMode) {
    switch (adviceMode) {
        case PROXY:
        // spring-aop 引入 aop的配置类
        // 引入 ProxyTransactionManagementConfiguration 代理事务配置类
            return new String[] {AutoProxyRegistrar.class.getName(),
                    ProxyTransactionManagementConfiguration.class.getName()};
        case ASPECTJ:
            return new String[] {determineTransactionAspectClass()};
        default:
            return null;
    }
}
```
