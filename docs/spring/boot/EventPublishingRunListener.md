# EventPublishingRunListener

Springboot中是通过 SpringApplicationRunListeners进行包裹

## 构造函数

```java
public EventPublishingRunListener(SpringApplication application, String[] args) {
    this.application = application;
    this.args = args;
    this.initialMulticaster = new SimpleApplicationEventMulticaster();
    // 将SPI加载到的`ApplicationListener`放入 initialMulticaster中
    for (ApplicationListener<?> listener : application.getListeners()) {
        this.initialMulticaster.addApplicationListener(listener);
    }
}
```

## 方法

### contextLoaded

在boot调用contextLoaded时，会通过boot通过SPI加载的listener添加到applicationContext的listener中

```java
public void contextLoaded(ConfigurableApplicationContext context) {
    for (ApplicationListener<?> listener : this.application.getListeners()) {
        if (listener instanceof ApplicationContextAware) {
            // 如果listener实现了ApplicationContextAware 那么调用 setApplicationContext方法
            ((ApplicationContextAware) listener).setApplicationContext(context);
        }
        // 塞入applicationContext中
        context.addApplicationListener(listener);
    }
    // 发布 ApplicationPreparedEvent 事件
    this.initialMulticaster.multicastEvent(new ApplicationPreparedEvent(this.application, this.args, context));
}
```

### environmentPrepared

[SpringApplication](./SpringApplication)的`prepareEnvironment`会调用该方法

```java
@Override
public void environmentPrepared(ConfigurableBootstrapContext bootstrapContext,
        ConfigurableEnvironment environment) {
    // SimpleApplicationEventMulticaster发布事件
    this.initialMulticaster.multicastEvent(
            new ApplicationEnvironmentPreparedEvent(bootstrapContext, this.application, this.args, environment));
}
```
