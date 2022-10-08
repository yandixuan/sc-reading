# EventPublishingRunListener

Springboot中是通过 SpringApplicationRunListeners进行包裹

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
