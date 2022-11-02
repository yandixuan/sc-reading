# AbstractEventLoop

:::tip
单线程执行器（继承了EventExecutor）

实现了`EventLoop`，继承了`AbstractEventExecutor`用了执行任务的能力
:::

```java
/**
 * Skeletal implementation of {@link EventLoop}.
 */
public abstract class AbstractEventLoop extends AbstractEventExecutor implements EventLoop {

    protected AbstractEventLoop() { }

    protected AbstractEventLoop(EventLoopGroup parent) {
        super(parent);
    }

    // 接口覆盖
    // EventLoopGroup是EventExecutorGroup的子类
    // 直接调用父类的`parent`的方法
    @Override
    public EventLoopGroup parent() {
        return (EventLoopGroup) super.parent();
    }
    // 接口覆盖
    // EventLoop是EventExecutor的子类
    // 父类的实现里是返回自己
    @Override
    public EventLoop next() {
        return (EventLoop) super.next();
    }
}

```
