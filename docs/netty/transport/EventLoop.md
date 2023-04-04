# EventLoop

:::tip 注意
可以理解为绑定一个channel,处理其所有的I/O事件，类似`EventExecutor`单线程处理器
:::

```java
/**
 * Will handle all the I/O operations for a {@link Channel} once registered.
 *
 * One {@link EventLoop} instance will usually handle more than one {@link Channel} but this may depend on
 * implementation details and internals.
 *
 */
public interface EventLoop extends OrderedEventExecutor, EventLoopGroup {
    // 覆盖方法
    // EventLoopGroup是`EventExecutorGroup`的子类
    @Override
    EventLoopGroup parent();
}
```
