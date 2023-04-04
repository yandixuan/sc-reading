# AbstractEventLoopGroup

:::tip 注意
实现了`EventLoopGroup`管理多个`channel`的注册，继承了`AbstractEventExecutorGroup`同时也拥有了管理多个执行器的能力
:::

```java
/**
 * Skeletal implementation of {@link EventLoopGroup}.
 */
public abstract class AbstractEventLoopGroup extends AbstractEventExecutorGroup implements EventLoopGroup {

    // 覆盖接口的next方法
    // EventLoop是 EventExecutorGroup的子接口
    @Override
    public abstract EventLoop next();
}

```
