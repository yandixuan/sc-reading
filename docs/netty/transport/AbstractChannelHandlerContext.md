# AbstractChannelHandlerContext

:::tip 注意
inBound事件从`HeadContext`节点向后传递

outBound事件从`TailContext`节点向前传递
:::

## 成员变量

```java
// 组成双向链表
volatile AbstractChannelHandlerContext next;
volatile AbstractChannelHandlerContext prev;

private static final AtomicIntegerFieldUpdater<AbstractChannelHandlerContext> HANDLER_STATE_UPDATER =
        AtomicIntegerFieldUpdater.newUpdater(AbstractChannelHandlerContext.class, "handlerState");

/**
  * {@link ChannelHandler#handlerAdded(ChannelHandlerContext)} is about to be called. 即将被调用
  */
private static final int ADD_PENDING = 1;
/**
  * {@link ChannelHandler#handlerAdded(ChannelHandlerContext)} was called. 已经被调用
  */
private static final int ADD_COMPLETE = 2;
/**
  * {@link ChannelHandler#handlerRemoved(ChannelHandlerContext)} was called. 已经被调用
  */
private static final int REMOVE_COMPLETE = 3;
/**
  * 初始状态
  * Neither {@link ChannelHandler#handlerAdded(ChannelHandlerContext)}
  * nor {@link ChannelHandler#handlerRemoved(ChannelHandlerContext)} was called.
  * 这2个方法都没有调用过
  */
private static final int INIT = 0;
// 管道流
private final DefaultChannelPipeline pipeline;
// handler的名称
private final String name;
// 表示上下文的执行器是不是有序的
private final boolean ordered;
// 生成一个掩码 可以快读判断这个Handler重载了哪些方法
private final int executionMask;

// Will be set to null if no child executor should be used, otherwise it will be set to the
// child executor.
// 如果这个值是 null,那么上下文的执行器用的就是所属通道 Channel 的事件轮询器
final EventExecutor executor;
// 表示成功的future
private ChannelFuture succeededFuture;

// Lazily instantiated tasks used to trigger events to a handler with different executor.
// There is no need to make this volatile as at worse it will just create a few more instances then needed.
private Tasks invokeTasks;
// handler的状态
private volatile int handlerState = INIT;
```

## 构造函数

```java
AbstractChannelHandlerContext(DefaultChannelPipeline pipeline, EventExecutor executor,
                              String name, Class<? extends ChannelHandler> handlerClass) {
    this.name = ObjectUtil.checkNotNull(name, "name");
    this.pipeline = pipeline;
    this.executor = executor;
    // 为当前handler类生成一个覆盖方法的二进制数标志
    this.executionMask = mask(handlerClass);
    // Its ordered if its driven by the EventLoop or the given Executor is an instanceof OrderedEventExecutor.
    ordered = executor == null || executor instanceof OrderedEventExecutor;
}
```

## 方法

### mask

```java
static int mask(Class<? extends ChannelHandler> clazz) {
    // Try to obtain the mask from the cache first. If this fails calculate it and put it in the cache for fast
    // lookup in the future.
    // 缓存
    Map<Class<? extends ChannelHandler>, Integer> cache = MASKS.get();
    Integer mask = cache.get(clazz);
    if (mask == null) {
        mask = mask0(clazz);
        cache.put(clazz, mask);
    }
    return mask;
}

```

### mask0

```java
/**
  * Calculate the {@code executionMask}.
  */
private static int mask0(Class<? extends ChannelHandler> handlerType) {
    int mask = MASK_EXCEPTION_CAUGHT;
    try {
        if (ChannelInboundHandler.class.isAssignableFrom(handlerType)) {
            // mask= 0 0000 0001 | 1 1111 1111 = 1 1111 1111
            mask |= MASK_ALL_INBOUND;
            // isSkippable的逻辑就是：如果我在Handler的实现类中重载方法即返回false，
            // 如果返回true就与对应的方法标记的二进制位取反 进行与运算
            // 效果就是在 MASK_ALL_INBOUND 上的对应进制位取消了该方法标记
            // 这样我们就可以快速判断这个handler重写了哪些接口
            if (isSkippable(handlerType, "channelRegistered", ChannelHandlerContext.class)) {
               // mask = 1 1111 1111 & 1 1111 1011 = 1 1111 1011
                mask &= ~MASK_CHANNEL_REGISTERED;
            }
            if (isSkippable(handlerType, "channelUnregistered", ChannelHandlerContext.class)) {
                mask &= ~MASK_CHANNEL_UNREGISTERED;
            }
            if (isSkippable(handlerType, "channelActive", ChannelHandlerContext.class)) {
                mask &= ~MASK_CHANNEL_ACTIVE;
            }
            if (isSkippable(handlerType, "channelInactive", ChannelHandlerContext.class)) {
                mask &= ~MASK_CHANNEL_INACTIVE;
            }
            if (isSkippable(handlerType, "channelRead", ChannelHandlerContext.class, Object.class)) {
                mask &= ~MASK_CHANNEL_READ;
            }
            if (isSkippable(handlerType, "channelReadComplete", ChannelHandlerContext.class)) {
                mask &= ~MASK_CHANNEL_READ_COMPLETE;
            }
            if (isSkippable(handlerType, "channelWritabilityChanged", ChannelHandlerContext.class)) {
                mask &= ~MASK_CHANNEL_WRITABILITY_CHANGED;
            }
            if (isSkippable(handlerType, "userEventTriggered", ChannelHandlerContext.class, Object.class)) {
                mask &= ~MASK_USER_EVENT_TRIGGERED;
            }
        }

        if (ChannelOutboundHandler.class.isAssignableFrom(handlerType)) {
            mask |= MASK_ALL_OUTBOUND;

            if (isSkippable(handlerType, "bind", ChannelHandlerContext.class,
                    SocketAddress.class, ChannelPromise.class)) {
                mask &= ~MASK_BIND;
            }
            if (isSkippable(handlerType, "connect", ChannelHandlerContext.class, SocketAddress.class,
                    SocketAddress.class, ChannelPromise.class)) {
                mask &= ~MASK_CONNECT;
            }
            if (isSkippable(handlerType, "disconnect", ChannelHandlerContext.class, ChannelPromise.class)) {
                mask &= ~MASK_DISCONNECT;
            }
            if (isSkippable(handlerType, "close", ChannelHandlerContext.class, ChannelPromise.class)) {
                mask &= ~MASK_CLOSE;
            }
            if (isSkippable(handlerType, "deregister", ChannelHandlerContext.class, ChannelPromise.class)) {
                mask &= ~MASK_DEREGISTER;
            }
            if (isSkippable(handlerType, "read", ChannelHandlerContext.class)) {
                mask &= ~MASK_READ;
            }
            if (isSkippable(handlerType, "write", ChannelHandlerContext.class,
                    Object.class, ChannelPromise.class)) {
                mask &= ~MASK_WRITE;
            }
            if (isSkippable(handlerType, "flush", ChannelHandlerContext.class)) {
                mask &= ~MASK_FLUSH;
            }
        }
        // ChannelHandlerAdapter里有这个方法
        // ChannelOutboundHandlerAdapter、ChannelInboundHandlerAdapter都继承了ChannelHandlerAdapter这个接口
        if (isSkippable(handlerType, "exceptionCaught", ChannelHandlerContext.class, Throwable.class)) {
            mask &= ~MASK_EXCEPTION_CAUGHT;
        }
    } catch (Exception e) {
        // Should never reach here.
        PlatformDependent.throwException(e);
    }

    return mask;
}
```

### isSkippable

```java
@SuppressWarnings("rawtypes")
private static boolean isSkippable(
        final Class<?> handlerType, final String methodName, final Class<?>... paramTypes) throws Exception {
    return AccessController.doPrivileged(new PrivilegedExceptionAction<Boolean>() {
        @Override
        public Boolean run() throws Exception {
            Method m;
            try {
                m = handlerType.getMethod(methodName, paramTypes);
            } catch (NoSuchMethodException e) {
                if (logger.isDebugEnabled()) {
                    logger.debug(
                        "Class {} missing method {}, assume we can not skip execution", handlerType, methodName, e);
                }
                return false;
            }
            return m.isAnnotationPresent(Skip.class);
        }
    });
}
```

### executor

如果在实例化`AbstractChannelHandlerContext`没有传`executor`参数，默认使用channel的执行器

```java
@Override
public EventExecutor executor() {
    if (executor == null) {
        return channel().eventLoop();
    } else {
        return executor;
    }
}
```

### findContextInbound

```java
private AbstractChannelHandlerContext findContextInbound(int mask) {
    AbstractChannelHandlerContext ctx = this;
    // 获取事件执行器
    EventExecutor currentExecutor = executor();
    do {
        ctx = ctx.next;
        // 通过 MASK_ONLY_INBOUND 表示查找的是入站事件
        // mask 代表处理的方法，是否需要被跳过
    } while (skipContext(ctx, currentExecutor, mask, MASK_ONLY_INBOUND));
    return ctx;
}
```

### findContextOutbound

```java
private AbstractChannelHandlerContext findContextOutbound(int mask) {
    AbstractChannelHandlerContext ctx = this;
    EventExecutor currentExecutor = executor();
    do {
        ctx = ctx.prev;
    } while (skipContext(ctx, currentExecutor, mask, MASK_ONLY_OUTBOUND));
    return ctx;
}
```

### skipContext

```java
private static boolean skipContext(
        AbstractChannelHandlerContext ctx, EventExecutor currentExecutor, int mask, int onlyMask) {
    // Ensure we correctly handle MASK_EXCEPTION_CAUGHT which is not included in the MASK_EXCEPTION_CAUGHT
    // 这个方法返回 true，表示跳过这个 ctx，继续从管道中查找下一个。
    // 因为使用的是 || 或逻辑符，两个条件只要有一个为 true，就返回 true。
    /**
     * 
     * 
     * 
     * onlyMask(出栈) = 1 1111 1111 0000 0000
     * onlyMask(进栈) = 0 0000 0001 1111 1110
     * 此处假设handler重载了channelActive方法
     * mask = 0 0000 1000
     * executionMask = 0 0000 1011
     * mask | onlyMask = 1 1111 1110
     * 
     *
     * 1. 0 0000 1011 & 0 0000 1000 如果不为0 说明该mask对应的方法被重载了
     *  
     */ 
    return (ctx.executionMask & (onlyMask | mask)) == 0 ||
            // We can only skip if the EventExecutor is the same as otherwise we need to ensure we offload
            // everything to preserve ordering.
            //
            // See https://github.com/netty/netty/issues/10067
            (ctx.executor() == currentExecutor && (ctx.executionMask & mask) == 0);
}
```

### callHandlerAdded

```java
final void callHandlerAdded() throws Exception {
    // We must call setAddComplete before calling handlerAdded. Otherwise if the handlerAdded method generates
    // any pipeline events ctx.handler() will miss them because the state will not allow it.
    // CAS设置`handlerAdded`调用完成
    if (setAddComplete()) {
        handler().handlerAdded(this);
    }
}
```

### bind

[bind的核心逻辑也正是实现在HeadContext中](./DefaultChannelPipeline)

```java
@Override
public ChannelFuture bind(final SocketAddress localAddress, final ChannelPromise promise) {
    ObjectUtil.checkNotNull(localAddress, "localAddress");
    if (isNotValidPromise(promise, false)) {
        // cancelled
        return promise;
    }
    // 向上寻找下一个需要调用bind方法的节点
    final AbstractChannelHandlerContext next = findContextOutbound(MASK_BIND);
    // 获取执行器
    EventExecutor executor = next.executor();
    // DefaultChannelHandlerContext可以自定义 executor。所以需要判断一下
    if (executor.inEventLoop()) {
        next.invokeBind(localAddress, promise);
    } else {
        safeExecute(executor, new Runnable() {
            @Override
            public void run() {
                next.invokeBind(localAddress, promise);
            }
        }, promise, null, false);
    }
    return promise;
}
```
