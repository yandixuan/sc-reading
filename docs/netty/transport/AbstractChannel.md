# AbstractChannel

## 属性

```java
// 父管道
private final Channel parent;
// 管道id，全局唯一
private final ChannelId id;
// Unsafe对象，封装ByteBuf的读写过程
private final Unsafe unsafe;
// 关联的Pipeline对象
private final DefaultChannelPipeline pipeline;
// 作为被动关闭方，这里传入的 ChannelPromise 类型为 VoidChannelPromise ，表示调用方对处理结果并不关心，VoidChannelPromise 不可添加 Listener ，不可修改操作结果状态
private final VoidChannelPromise unsafeVoidPromise = new VoidChannelPromise(this, false);
// 主动关闭方需要监听 Channel 关闭的结果，所以这里传递的 ChannelPromise 参数为 DefaultChannelPromise 
private final CloseFuture closeFuture = new CloseFuture(this);
// 本地地址和远端地址
private volatile SocketAddress localAddress;
private volatile SocketAddress remoteAddress;
// channel绑定事件执行器
private volatile EventLoop eventLoop;
// channel是否被注册
private volatile boolean registered;
private boolean closeInitiated;
private Throwable initialCloseCause;

/** Cache for the string representation of this channel */
private boolean strValActive;
private String strVal;
```

## 构造函数

```java

/**
  * Creates a new instance.
  *
  * @param parent
  *        the parent of this channel. {@code null} if there's no parent.
  */
protected AbstractChannel(Channel parent) {
    // 父管道
    this.parent = parent;
    // 唯一id
    id = newId();
    // netty底层操作的封装（NIO相关）
    unsafe = newUnsafe();
    // 每个 channel内部都会创建一个pipeline（责任链处理读、写消息）
    pipeline = newChannelPipeline();
}

/**
  * Creates a new instance.
  *
  * @param parent
  *        the parent of this channel. {@code null} if there's no parent.
  */
protected AbstractChannel(Channel parent, ChannelId id) {
    // 父管道
    this.parent = parent;
    // 唯一id
    this.id = id;
    // netty底层操作的封装（NIO相关）
    unsafe = newUnsafe();
    // 每个 channel内部都会创建一个pipeline（责任链处理读、写消息）
    pipeline = newChannelPipeline();
}
```

## 方法

### newId

channel唯一的id的获取方式封装在`DefaultChannelId`类中

```java
protected ChannelId newId() {
    return DefaultChannelId.newInstance();
}
```

### newChannelPipeline

管道线的实现默认实现 `DefaultChannelPipeline`,构造参数为channel说明一个pipeline绑定一个channel对象

```java
/**
  * Returns a new {@link DefaultChannelPipeline} instance.
  */
protected DefaultChannelPipeline newChannelPipeline() {
    return new DefaultChannelPipeline(this);
}
```

### maxMessagesPerWrite

```java
protected final int maxMessagesPerWrite() {
    ChannelConfig config = config();
    if (config instanceof DefaultChannelConfig) {
        return ((DefaultChannelConfig) config).getMaxMessagesPerWrite();
    }
    Integer value = config.getOption(ChannelOption.MAX_MESSAGES_PER_WRITE);
    if (value == null) {
        return Integer.MAX_VALUE;
    }
    return value;
}
```

### isWritable

通道是否可写

```java
@Override
public boolean isWritable() {
    // 是否存在输出缓冲区且缓冲区可写
    ChannelOutboundBuffer buf = unsafe.outboundBuffer();
    return buf != null && buf.isWritable();
}
```

### bytesBeforeUnwritable

获取剩余可写空间

```java
@Override
public long bytesBeforeUnwritable() {
    ChannelOutboundBuffer buf = unsafe.outboundBuffer();
    // isWritable() is currently assuming if there is no outboundBuffer then the channel is not writable.
    // We should be consistent with that here.
    return buf != null ? buf.bytesBeforeUnwritable() : 0;
}
```

### bytesBeforeWritable

还需处理多少字节才可写

```java
@Override
public long bytesBeforeWritable() {
    ChannelOutboundBuffer buf = unsafe.outboundBuffer();
    // isWritable() is currently assuming if there is no outboundBuffer then the channel is not writable.
    // We should be consistent with that here.
    return buf != null ? buf.bytesBeforeWritable() : Long.MAX_VALUE;
}
```

### ChannelOutboundInvoker接口

全都代理给pipeline管道流去处理

```java
    @Override
    public ChannelFuture bind(SocketAddress localAddress) {
        return pipeline.bind(localAddress);
    }

    @Override
    public ChannelFuture connect(SocketAddress remoteAddress) {
        return pipeline.connect(remoteAddress);
    }

    @Override
    public ChannelFuture connect(SocketAddress remoteAddress, SocketAddress localAddress) {
        return pipeline.connect(remoteAddress, localAddress);
    }

    @Override
    public ChannelFuture disconnect() {
        return pipeline.disconnect();
    }

    @Override
    public ChannelFuture close() {
        return pipeline.close();
    }

    @Override
    public ChannelFuture deregister() {
        return pipeline.deregister();
    }

    @Override
    public Channel flush() {
        pipeline.flush();
        return this;
    }

    @Override
    public ChannelFuture bind(SocketAddress localAddress, ChannelPromise promise) {
        return pipeline.bind(localAddress, promise);
    }

    @Override
    public ChannelFuture connect(SocketAddress remoteAddress, ChannelPromise promise) {
        return pipeline.connect(remoteAddress, promise);
    }

    @Override
    public ChannelFuture connect(SocketAddress remoteAddress, SocketAddress localAddress, ChannelPromise promise) {
        return pipeline.connect(remoteAddress, localAddress, promise);
    }

    @Override
    public ChannelFuture disconnect(ChannelPromise promise) {
        return pipeline.disconnect(promise);
    }

    @Override
    public ChannelFuture close(ChannelPromise promise) {
        return pipeline.close(promise);
    }

    @Override
    public ChannelFuture deregister(ChannelPromise promise) {
        return pipeline.deregister(promise);
    }

    @Override
    public Channel read() {
        pipeline.read();
        return this;
    }

    @Override
    public ChannelFuture write(Object msg) {
        return pipeline.write(msg);
    }

    @Override
    public ChannelFuture write(Object msg, ChannelPromise promise) {
        return pipeline.write(msg, promise);
    }

    @Override
    public ChannelFuture writeAndFlush(Object msg) {
        return pipeline.writeAndFlush(msg);
    }

    @Override
    public ChannelFuture writeAndFlush(Object msg, ChannelPromise promise) {
        return pipeline.writeAndFlush(msg, promise);
    }

    @Override
    public ChannelPromise newPromise() {
        return pipeline.newPromise();
    }

    @Override
    public ChannelProgressivePromise newProgressivePromise() {
        return pipeline.newProgressivePromise();
    }

    @Override
    public ChannelFuture newSucceededFuture() {
        return pipeline.newSucceededFuture();
    }

    @Override
    public ChannelFuture newFailedFuture(Throwable cause) {
        return pipeline.newFailedFuture(cause);
    }
```

### newUnsafe

```java
/**
  * Create a new {@link AbstractUnsafe} instance which will be used for the life-time of the {@link Channel}
  */
protected abstract AbstractUnsafe newUnsafe();
```

## AbstractUnsafe

对unsafe的现

```java
// ChannelOutboundBuffer是Netty发送缓存
private volatile ChannelOutboundBuffer outboundBuffer = new ChannelOutboundBuffer(AbstractChannel.this);
// RecvByteBufAllocator是Netty的「数据接收缓冲区分配器」，Channel依赖它来创建大小合适的ByteBuf，提升性能和节省内存。
private RecvByteBufAllocator.Handle recvHandle;
private boolean inFlush0;
/** true if the channel has never been registered, false otherwise */
private boolean neverRegistered = true;
```

### register

[AbstractBootstrap#initAndRegister](./AbstractBootstrap#initandregister)方法中会在eventLoopGroup选择一个eventLoop进行注册调用，转而就是通过
[SingleThreadEventLoop#register](../common/SingleThreadEventExecutor#register)进行调用，
该方法中会将channel、executor封装成`DefaultChannelPromise`（netty中所有的操作都是异步操作）最后还是交由channel的unsafe类进行注册

```java
public final void register(EventLoop eventLoop, final ChannelPromise promise) {
    ObjectUtil.checkNotNull(eventLoop, "eventLoop");
    // 判断是否被注册过，时则ChannelPromise失败
    if (isRegistered()) {
        promise.setFailure(new IllegalStateException("registered to an event loop already"));
        return;
    }
    // 必须兼容，eventLoop分很多种类型，有NIO的，还有Epoll的，与之对应的Channel需要兼容
    if (!isCompatible(eventLoop)) {
        promise.setFailure(
                new IllegalStateException("incompatible event loop type: " + eventLoop.getClass().getName()));
        return;
    }
    // channel和事件执行器进行绑定
    // 一个eventLoop可以注册多个channel, 但是channel的整个生命周期中所有的IO事件,仅仅和它关联上的thread有关系
    AbstractChannel.this.eventLoop = eventLoop;
    // 在EventLoop线程组直接执行
    if (eventLoop.inEventLoop()) {
        register0(promise);
    } else {
        try {
            // 它以一个任务的形式提交事件循环器 , 任务在eventLoop中执行,规避了多线程的并发
            eventLoop.execute(new Runnable() {
                @Override
                public void run() {
                    register0(promise);
                }
            });
        } catch (Throwable t) {
            logger.warn(
                    "Force-closing a channel whose registration task was not accepted by an event loop: {}",
                    AbstractChannel.this, t);
            // 如果在注册时出现异常，则关闭socket，不激发任何事件        
            closeForcibly();
            closeFuture.setClosed();
            safeSetFailure(promise, t);
        }
    }
}
```

### register0

[pipeline.invokeHandlerAddedIfNeeded](./DefaultChannelPipeline#invokehandleraddedifneeded)

```java
private void register0(ChannelPromise promise) {
    try {
        // check if the channel is still open as it could be closed in the mean time when the register
        // call was outside of the eventLoop
        // 确保promise没有被取消同时Channel没有被关闭才能执行后面的动作
        if (!promise.setUncancellable() || !ensureOpen(promise)) {
            return;
        }
        boolean firstRegistration = neverRegistered;
        // 子类实现
        // 在`AbstractNioChannel`的实现中把系统创建的ServerSocketChannel注册进了`Selector`
        // 
        doRegister();
        // 标记首次注册为false
        neverRegistered = false;
        // 标记channel已注册
        registered = true;

        // Ensure we call handlerAdded(...) before we actually notify the promise. This is needed as the
        // user may already fire events through the pipeline in the ChannelFutureListener.
        // 调用管道中Handler的Add事件，注：改方法只会调用一次
        pipeline.invokeHandlerAddedIfNeeded();
        // 回调通知`Promise`执行成功
        // 触发端口绑定流程，也是通过提交异步任务的方式
        safeSetSuccess(promise);
        // pipeline触发通道已注册事件
        pipeline.fireChannelRegistered();
        // Only fire a channelActive if the channel has never been registered. This prevents firing
        // multiple channel actives if the channel is deregistered and re-registered.
        // 因为客户端连接不需要绑定端口，只需要进行注册就行，所以这里isActive()为他true。
        if (isActive()) {
            // TODO:REMOVE
            // 如果通道属于第一次注册，那么就通过pipeline触发`channelActive`事件
            // ---> HeadContext#channelActive ---> AbstractChannel#read ---> pipeline的read方法会触发
            // ---> TailContext#read ---> bossGroup的handler底部第一个便是 `ServerBootstrapAcceptor`
            // ServerBootstrapAcceptor里面就有处理`SelectionKey.OP_ACCEPT`事件，将SocketChannel注册进workgroup线程组中
            if (firstRegistration) {
                pipeline.fireChannelActive();
            } else if (config().isAutoRead()) {
                // This channel was registered before and autoRead() is set. This means we need to begin read
                // again so that we process inbound data.
                //
                // See https://github.com/netty/netty/issues/4805
                beginRead();
            }
        }
    } catch (Throwable t) {
        // Close the channel directly to avoid FD leak.
        closeForcibly();
        closeFuture.setClosed();
        safeSetFailure(promise, t);
    }
}
```

### bind

```java
@Override
public final void bind(final SocketAddress localAddress, final ChannelPromise promise) {
    assertEventLoop();
    // 确保 Channel 是打开的
    if (!promise.setUncancellable() || !ensureOpen(promise)) {
        return;
    }

    // See: https://github.com/netty/netty/issues/576
    if (Boolean.TRUE.equals(config().getOption(ChannelOption.SO_BROADCAST)) &&
        localAddress instanceof InetSocketAddress &&
        !((InetSocketAddress) localAddress).getAddress().isAnyLocalAddress() &&
        !PlatformDependent.isWindows() && !PlatformDependent.maybeSuperUser()) {
        // Warn a user about the fact that a non-root user can't receive a
        // broadcast packet on *nix if the socket is bound on non-wildcard address.
        logger.warn(
                "A non-root user can't receive a broadcast packet if the socket " +
                "is not bound to a wildcard address; binding to a non-wildcard " +
                "address (" + localAddress + ") anyway as requested.");
    }
    // 这时未绑定端口，还是false
    boolean wasActive = isActive();
    try {
        // 绑定端口的实现
        // 由子类实现
        // 在`NioServerSocketChannel`中，由JDK，NIO原生绑定端口
        doBind(localAddress);
    } catch (Throwable t) {
        safeSetFailure(promise, t);
        closeIfClosed();
        return;
    }
    // 绑定端口成功后,!wasActive && isActive()必为true
    /**
     * 还是同样的问题，当前执行线程已经是Reactor线程了，那么为何不直接触发pipeline中的ChannelActive事件而是又封装成异步任务呢？？
     * 因为如果直接在这里触发ChannelActive事件，那么Reactor线程就会去执行pipeline中的ChannelHandler的channelActive事件回调。
     * 这样的话就影响了safeSetSuccess(promise)的执行，延迟了注册在promise上的ChannelFutureListener的回调。
     */
    if (!wasActive && isActive()) {
        invokeLater(new Runnable() {
            @Override
            public void run() {
                // 从HeadContext开始向下触发channelActive事件
                // HeadContext中实现了active方法
                // 对于`NioServerSocketChannel`来说，
                pipeline.fireChannelActive();
            }
        });
    }

    safeSetSuccess(promise);
}
``

### doBind

```java

```

### beginRead

```java
@Override
public final void beginRead() {
    assertEventLoop();

    try {
        // 由子类实现
        // AbstractNioChannel中就是修改 NioServerSocketChannel中注册的selector感兴趣的事件即 ACCEPT事件
        // 接受到了新连接即触发了pipeline的read事件，pipeline的尾节点的第一个handler即 `ServerBootstrapAcceptor`将客户端的channel分发给worker线程进行注册，将channel注册进子worker的selector中，这个注册客户端channel的流程基本与ServerSocketChannel的流程一直
        doBeginRead();
    } catch (final Exception e) {
        invokeLater(new Runnable() {
            @Override
            public void run() {
                pipeline.fireExceptionCaught(e);
            }
        });
        close(voidPromise());
    }
}
```
