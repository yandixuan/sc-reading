# SimpleApplicationEventMulticaster

## 方法

### multicastEvent

```java
@Override
public void multicastEvent(ApplicationEvent event) {
  // event封装成 可解析类型
  multicastEvent(event, resolveDefaultEventType(event));
}

@Override
public void multicastEvent(final ApplicationEvent event, @Nullable ResolvableType eventType) {
    ResolvableType type = (eventType != null ? eventType : resolveDefaultEventType(event));
    // 获取线程执行器
    Executor executor = getTaskExecutor();
    for (ApplicationListener<?> listener : getApplicationListeners(event, type)) {
        // 如果线程执行器存在，则异步处理；否则当前线程调用监听器方法
        if (executor != null) {
            executor.execute(() -> invokeListener(listener, event));
        }
        else {
            invokeListener(listener, event);
        }
    }
}
```

### invokeListener

```java
/**
 * Invoke the given listener with the given event.
 * @param listener the ApplicationListener to invoke
 * @param event the current event to propagate
 * @since 4.1
 */
protected void invokeListener(ApplicationListener<?> listener, ApplicationEvent event) {
    // 获取异常处理器
    ErrorHandler errorHandler = getErrorHandler();
    if (errorHandler != null) {
        try {
            // 执行listener监听事件的方法
            doInvokeListener(listener, event);
        }
        catch (Throwable err) {
            // 异常处理
            errorHandler.handleError(err);
        }
    }
    else {
        doInvokeListener(listener, event);
    }
}

```

### doInvokeListener

```java
@SuppressWarnings({"rawtypes", "unchecked"})
private void doInvokeListener(ApplicationListener listener, ApplicationEvent event) {
    try {
        // 真正实现方法的位置
        listener.onApplicationEvent(event);
    }
    catch (ClassCastException ex) {
        String msg = ex.getMessage();
        // java8、9、11错误信息有区别
        // 判断是否抛出异常或是打印异常（不处理异常）
        if (msg == null || matchesClassCastMessage(msg, event.getClass()) ||
        (event instanceof PayloadApplicationEvent &&
        matchesClassCastMessage(msg, ((PayloadApplicationEvent) event).getPayload().getClass()))) {
            // Possibly a lambda-defined listener which we could not resolve the generic event type for
            // -> let's suppress the exception.
            Log loggerToUse = this.lazyLogger;
            if (loggerToUse == null) {
                loggerToUse = LogFactory.getLog(getClass());
                this.lazyLogger = loggerToUse;
            }
            if (loggerToUse.isTraceEnabled()) {
                loggerToUse.trace("Non-matching event type for listener: " + listener, ex);
            }
        }
        else {
            throw ex;
        }
    }
}
```
