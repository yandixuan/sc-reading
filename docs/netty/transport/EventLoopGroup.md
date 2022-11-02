# EventLoopGroup

:::tip 概况
可以理解为一个线程池，内部维护了一组线程，每个线程负责处理多个Channel上的事件，而一个Channel只对应于一个线程

所以这里继承`EventExecutorGroup`就拥有了线程池的能力
:::

:::danger 注意

netty中的Future接口继承了JUC中的Future，同时扩展了isSuccess()成功、cause()异常、sync()同步、await()等待、以及添加监听器GenericFutureListener让我们可以响应式的实时监听对应的异步处理结果，不必使用get阻塞等待结果。

ChannelFuture 接口扩展了 Netty 的 Future 接口，表示一种没有返回值的异步调用，同时和一个 Channel 进行绑定。

ChannelPromise 接口扩展了 Promise 和 ChannelFuture，绑定了 Channel，既设置异步执行结果同时又具备了监听处理结果的功能，是 Netty 实际编程使用的表示异步执行的接口。其实现类为DefaultChannelPromise。
:::

```java
/**
 * Special {@link EventExecutorGroup} which allows registering {@link Channel}s that get
 * processed for later selection during the event loop.
 *
 */
public interface EventLoopGroup extends EventExecutorGroup {
    /**
     * Return the next {@link EventLoop} to use
     */
    @Override
    EventLoop next();

    /**
     * Register a {@link Channel} with this {@link EventLoop}. The returned {@link ChannelFuture}
     * will get notified once the registration was complete.
     */
    ChannelFuture register(Channel channel);

    /**
     * Register a {@link Channel} with this {@link EventLoop} using a {@link ChannelFuture}. The passed
     * {@link ChannelFuture} will get notified once the registration was complete and also will get returned.
     */
    // 向当前EventLoop注册 ChannelFuture
    ChannelFuture register(ChannelPromise promise);

    /**
     * Register a {@link Channel} with this {@link EventLoop}. The passed {@link ChannelFuture}
     * will get notified once the registration was complete and also will get returned.
     *
     * @deprecated Use {@link #register(ChannelPromise)} instead.
     */
    @Deprecated
    ChannelFuture register(Channel channel, ChannelPromise promise);
}
```
