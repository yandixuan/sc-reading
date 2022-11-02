# EventExecutor

:::tip
`EventExecutor`就是一个单线程的Executor，至于为什么继承`EventExecutorGroup`，可能仅仅是为了继承那些接口拥有线程执行的能力
:::

```java
/**
 * The {@link EventExecutor} is a special {@link EventExecutorGroup} which comes
 * with some handy methods to see if a {@link Thread} is executed in a event loop.
 * Besides this, it also extends the {@link EventExecutorGroup} to allow for a generic
 * way to access methods.
 *
 */
/**
 * EventExecutor是一个特殊的 EventExecutorGroup ，它带有一些方便
 * 的方法来查看线程是否在事件循环中执行。
 */ 
public interface EventExecutor extends EventExecutorGroup {

    /**
     * Returns a reference to itself.
     */
    // 所有这里注释了 `next()`只返回知己 
    @Override
    EventExecutor next();

    /**
     * Return the {@link EventExecutorGroup} which is the parent of this {@link EventExecutor},
     */
    // 返回所在的线程执行器组 
    EventExecutorGroup parent();

    /**
     * Calls {@link #inEventLoop(Thread)} with {@link Thread#currentThread()} as argument
     */
    /**
     * 相当于 inEventLoop(Thread.currentThread())
     */ 
    boolean inEventLoop();

    /**
     * Return {@code true} if the given {@link Thread} is executed in the event loop,
     * {@code false} otherwise.
     */
    /**
     * 如果给定线程在事件循环中执行，则返回true，否则返回false。
     */ 
    boolean inEventLoop(Thread thread);

    /**
     * Return a new {@link Promise}.
     */
    /**
     * 返回一个新的 Promise 实例
     */ 
    <V> Promise<V> newPromise();

    /**
     * Create a new {@link ProgressivePromise}.
     */
    /**
     * 返回一个新的 ProgressivePromise 实例
     */ 
    <V> ProgressivePromise<V> newProgressivePromise();

    /**
     * Create a new {@link Future} which is marked as succeeded already. So {@link Future#isSuccess()}
     * will return {@code true}. All {@link FutureListener} added to it will be notified directly. Also
     * every call of blocking methods will just return without blocking.
     */
    /**
     * 创建一个标记为`已成功`的新Future。因此Future.isSuccess()将返回true。
     * 并且所有添加到它的FutureListener都会被直接通知。
     * 而且所有阻塞方法的调用都将没有阻塞直接返回。
     */
    <V> Future<V> newSucceededFuture(V result);

    /**
     * Create a new {@link Future} which is marked as failed already. So {@link Future#isSuccess()}
     * will return {@code false}. All {@link FutureListener} added to it will be notified directly. Also
     * every call of blocking methods will just return without blocking.
     */
    /**
     * 创建一个已经被标记为`已失败`的新Future。因此Future.isSuccess()将返回false。
     * 并且所有添加到它的FutureListener都会被直接通知。而且所有阻塞方法的调用都将没有阻塞直接返回。
     */
    <V> Future<V> newFailedFuture(Throwable cause);
}
```
