# DefaultChannelPipeline

[netty入门之inbound &outbound](https://zhuanlan.zhihu.com/p/334326729)

## 方法

### addLast

```java
@Override
public final ChannelPipeline addLast(String name, ChannelHandler handler) {
    return addLast(null, name, handler);
}

@Override
public final ChannelPipeline addLast(EventExecutorGroup group, String name, ChannelHandler handler) {
    final AbstractChannelHandlerContext newCtx;
    synchronized (this) {
        // 检查 handler 是否重复使用，如果重复使用得有@Sharable注解
        checkMultiplicity(handler);
        // 自动生成 handler 的名字 且保证唯一性
        newCtx = newContext(group, filterName(name, handler), handler);

        addLast0(newCtx);

        // If the registered is false it means that the channel was not registered on an eventLoop yet.
        // In this case we add the context to the pipeline and add a task that will call
        // ChannelHandler.handlerAdded(...) once the channel is registered.
        // 当channel没注册到selector上时，先构建一个Task放在pendingHandlerCallbackHead链表里
        // 待channel注册到selector上时，再执行ChannelHandler.handlerAdded钩子
        if (!registered) {
            // cas更新状态为：`handlerAdded`即将被调用
            newCtx.setAddPending();
            // 添加 PendingHandlerAddedTask
            callHandlerCallbackLater(newCtx, true);
            return this;
        }
        // 防止调用方法是外部线程，封装成任务提交的eventLoop中去执行
        EventExecutor executor = newCtx.executor();
        if (!executor.inEventLoop()) {
            callHandlerAddedInEventLoop(newCtx, executor);
            return this;
        }
    }
    // channel已经注册完成，同步执行ChannelHandler.handlerAdded钩子
    callHandlerAdded0(newCtx);
    return this;
}
```

### addLast0

将新的节点插入最后一个节点，即`TailContext`的前一个

```java
private void addLast0(AbstractChannelHandlerContext newCtx) {
    AbstractChannelHandlerContext prev = tail.prev;
    newCtx.prev = prev;
    newCtx.next = tail;
    prev.next = newCtx;
    tail.prev = newCtx;
}
```

### invokeHandlerAddedIfNeeded

```java
final void invokeHandlerAddedIfNeeded() {
    assert channel.eventLoop().inEventLoop();
    // 内部变量保证添加handler只执行一次
    if (firstRegistration) {
        firstRegistration = false;
        // We are now registered to the EventLoop. It's time to call the callbacks for the ChannelHandlers,
        // that were added before the registration was done.
        callHandlerAddedForAllHandlers();
    }
}
```

### callHandlerAddedForAllHandlers

```java
private void callHandlerAddedForAllHandlers() {
    final PendingHandlerCallback pendingHandlerCallbackHead;
    synchronized (this) {
        assert !registered;

        // This Channel itself was registered.
        registered = true;

        pendingHandlerCallbackHead = this.pendingHandlerCallbackHead;
        // Null out so it can be GC'ed.
        this.pendingHandlerCallbackHead = null;
    }

    // This must happen outside of the synchronized(...) block as otherwise handlerAdded(...) may be called while
    // holding the lock and so produce a deadlock if handlerAdded(...) will try to add another handler from outside
    // the EventLoop.
    PendingHandlerCallback task = pendingHandlerCallbackHead;
    while (task != null) {
        task.execute();
        task = task.next;
    }
}
```

### callHandlerCallbackLater

```java
private void callHandlerCallbackLater(AbstractChannelHandlerContext ctx, boolean added) {
    assert !registered;
    // added参数判断是新增任务还是删除任务
    PendingHandlerCallback task = added ? new PendingHandlerAddedTask(ctx) : new PendingHandlerRemovedTask(ctx);
    PendingHandlerCallback pending = pendingHandlerCallbackHead;
    // 相当于是形成一个 PendingHandlerCallback的链表
    if (pending == null) {
        pendingHandlerCallbackHead = task;
    } else {
        // Find the tail of the linked-list.
        while (pending.next != null) {
            pending = pending.next;
        }
        pending.next = task;
    }
}
```

### checkMultiplicity

防止handler重复添加

```java
private static void checkMultiplicity(ChannelHandler handler) {
    if (handler instanceof ChannelHandlerAdapter) {
        ChannelHandlerAdapter h = (ChannelHandlerAdapter) handler;
        // 重复添加handler且不存在@Sharable注解抛异常
        if (!h.isSharable() && h.added) {
            throw new ChannelPipelineException(
                    h.getClass().getName() +
                    " is not a @Sharable handler, so can't be added or removed multiple times.");
        }
        // handler已经被添加进管道流中
        h.added = true;
    }
}
```

### newContext

```java
private AbstractChannelHandlerContext newContext(EventExecutorGroup group, String name, ChannelHandler handler) {
    return new DefaultChannelHandlerContext(this, childExecutor(group), name, handler);
}
```

### callHandlerAdded0

```java
private void callHandlerAdded0(final AbstractChannelHandlerContext ctx) {
    try {
        // 执行ChannelHandler的钩子
        ctx.callHandlerAdded();
    } catch (Throwable t) {
        boolean removed = false;
        try {
            atomicRemoveFromHandlerList(ctx);
            ctx.callHandlerRemoved();
            removed = true;
        } catch (Throwable t2) {
            if (logger.isWarnEnabled()) {
                logger.warn("Failed to remove a handler: " + ctx.name(), t2);
            }
        }

        if (removed) {
            fireExceptionCaught(new ChannelPipelineException(
                    ctx.handler().getClass().getName() +
                    ".handlerAdded() has thrown an exception; removed.", t));
        } else {
            fireExceptionCaught(new ChannelPipelineException(
                    ctx.handler().getClass().getName() +
                    ".handlerAdded() has thrown an exception; also failed to remove.", t));
        }
    }
}
```

## PendingHandlerAddedTask

实现了`Runnable方法`,目的就是为了执行`callHandlerAdded0`

```java
PendingHandlerAddedTask(AbstractChannelHandlerContext ctx) {
    super(ctx);
}
```

### run

```java
@Override
public void run() {
    callHandlerAdded0(ctx);
}
```

## HeadContext

### bind

[](./AbstractChannel#abstractunsafe)

```java
@Override
public void bind(
        ChannelHandlerContext ctx, SocketAddress localAddress, ChannelPromise promise) {
    // AbstractUnsafe来实现
    unsafe.bind(localAddress, promise);
}
```

### channelActive

```java
@Override
public void channelActive(ChannelHandlerContext ctx) {
    // 从头节点继续向下传播事件
    ctx.fireChannelActive();
    // 设置为读监听
    readIfIsAutoRead();
}
```

### readIfIsAutoRead

```java
private void readIfIsAutoRead() {
    // 默认为true
    if (channel.config().isAutoRead()) {
        // 交给pipeline调用,又是一个事件传播
        // 该方法是从tail节点开始传播，Netty整体架构课上说过，read属于ChannelOutboundInvoker，属于倒序传播，该代码是从tail节点向上寻找，默认实现是HeadContext实现，我们进入到HeadContext
        channel.read();
    }
}
```

### read

```java
@Override
public void read(ChannelHandlerContext ctx) {
    // 调用AbstractChannel的AbstractUnsafe的beginRead
    unsafe.beginRead();
}
```
