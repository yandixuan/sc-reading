# EventExecutorGroup

继承JDK的`ScheduledExecutorService`拥有提供周期性执行的能力

继承`Iterable<EventExecutor>`就成立一个迭代器即`EventExecutor`的容器

:::tip
通过该接口拥有管理`EventExecutor`的能力，通过`next`提供`EventExecutor`供使用
:::

```java
/**
 * The {@link EventExecutorGroup} is responsible for providing the {@link EventExecutor}'s to use
 * via its {@link #next()} method. Besides this, it is also responsible for handling their
 * life-cycle and allows shutting them down in a global fashion.
 *
 */
public interface EventExecutorGroup extends ScheduledExecutorService, Iterable<EventExecutor> {

    /**
     * Returns {@code true} if and only if all {@link EventExecutor}s managed by this {@link EventExecutorGroup}
     * are being {@linkplain #shutdownGracefully() shut down gracefully} or was {@linkplain #isShutdown() shut down}.
     */
    // 返回所有被管理的Executor是否已经关闭 
    boolean isShuttingDown();

    /**
     * Shortcut method for {@link #shutdownGracefully(long, long, TimeUnit)} with sensible default values.
     *
     * @return the {@link #terminationFuture()}
     */
    // 线程组优雅关闭，返回一个Future
    Future<?> shutdownGracefully();

    /**
     * Signals this executor that the caller wants the executor to be shut down.  Once this method is called,
     * {@link #isShuttingDown()} starts to return {@code true}, and the executor prepares to shut itself down.
     * Unlike {@link #shutdown()}, graceful shutdown ensures that no tasks are submitted for <i>'the quiet period'</i>
     * (usually a couple seconds) before it shuts itself down.  If a task is submitted during the quiet period,
     * it is guaranteed to be accepted and the quiet period will start over.
     *
     * @param quietPeriod the quiet period as described in the documentation
     * @param timeout     the maximum amount of time to wait until the executor is {@linkplain #shutdown()}
     *                    regardless if a task was submitted during the quiet period
     * @param unit        the unit of {@code quietPeriod} and {@code timeout}
     *
     * @return the {@link #terminationFuture()}
     */
     
    /**
     * 向执行器发出信号，表示调用者希望关闭执行器。
     * 一旦这个方法被调用，isShuttingDown() 开始返回 true，执行器准备关闭自己。
     * 与shutdown()不同，本方法确保在自己关闭之前的这段安静期间内(通常是几秒钟)没有任务被提交。
     * 如果有任务是在安静期间提交的，那么它保证被接受，并且安静期间将重新开始。
     * 返回值就是 terminationFuture() 方法返回值
     */
    Future<?> shutdownGracefully(long quietPeriod, long timeout, TimeUnit unit);

    /**
     * Returns the {@link Future} which is notified when all {@link EventExecutor}s managed by this
     * {@link EventExecutorGroup} have been terminated.
     */
    // 当该 EventExecutorGroup 管理的所有 EventExecutor 被终止时，该Future会被通知 
    Future<?> terminationFuture();

    /**
     * @deprecated {@link #shutdownGracefully(long, long, TimeUnit)} or {@link #shutdownGracefully()} instead.
     */
    @Override
    @Deprecated
    void shutdown();

    /**
     * @deprecated {@link #shutdownGracefully(long, long, TimeUnit)} or {@link #shutdownGracefully()} instead.
     */
    @Override
    @Deprecated
    List<Runnable> shutdownNow();

    /**
     * Returns one of the {@link EventExecutor}s managed by this {@link EventExecutorGroup}.
     */
    // 返回该 EventExecutorGroup 所管理的一个 EventExecutor 实例 
    EventExecutor next();

    // 返回该 EventExecutorGroup 所管理 EventExecutor 的迭代器
    @Override
    Iterator<EventExecutor> iterator();

    // 复写来自 ScheduledExecutorService 中的方法，直接将返回值的 Future 和 ScheduledFuture
    // 改成 netty 中的 Future 和 ScheduledFuture
    @Override
    Future<?> submit(Runnable task);

    @Override
    <T> Future<T> submit(Runnable task, T result);

    @Override
    <T> Future<T> submit(Callable<T> task);

    @Override
    ScheduledFuture<?> schedule(Runnable command, long delay, TimeUnit unit);

    @Override
    <V> ScheduledFuture<V> schedule(Callable<V> callable, long delay, TimeUnit unit);

    @Override
    ScheduledFuture<?> scheduleAtFixedRate(Runnable command, long initialDelay, long period, TimeUnit unit);

    @Override
    ScheduledFuture<?> scheduleWithFixedDelay(Runnable command, long initialDelay, long delay, TimeUnit unit);
}

```
