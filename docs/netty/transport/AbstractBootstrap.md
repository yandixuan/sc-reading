# AbstractBootstrap

## 属性

```java
@SuppressWarnings("unchecked")
private static final Map.Entry<ChannelOption<?>, Object>[] EMPTY_OPTION_ARRAY = new Map.Entry[0];
@SuppressWarnings("unchecked")
private static final Map.Entry<AttributeKey<?>, Object>[] EMPTY_ATTRIBUTE_ARRAY = new Map.Entry[0];

volatile EventLoopGroup group;
@SuppressWarnings("deprecation")
private volatile ChannelFactory<? extends C> channelFactory;
// SocketAddress 是用来绑定一个服务端口用的
private volatile SocketAddress localAddress;

// The order in which ChannelOptions are applied is important they may depend on each other for validation
// purposes.
private final Map<ChannelOption<?>, Object> options = new LinkedHashMap<ChannelOption<?>, Object>();
private final Map<AttributeKey<?>, Object> attrs = new ConcurrentHashMap<AttributeKey<?>, Object>();
// ChannelHandler 是具体怎么处理Channel 的IO事件。
private volatile ChannelHandler handler;
```

## 构造函数

防止其他包继承

```java
AbstractBootstrap() {
    // Disallow extending from a different package.
}

AbstractBootstrap(AbstractBootstrap<B, C> bootstrap) {
    group = bootstrap.group;
    channelFactory = bootstrap.channelFactory;
    handler = bootstrap.handler;
    localAddress = bootstrap.localAddress;
    synchronized (bootstrap.options) {
        options.putAll(bootstrap.options);
    }
    attrs.putAll(bootstrap.attrs);
}
```

## 方法

### channel

传入Channel实现类的class即可

```java
/**
  * The {@link Class} which is used to create {@link Channel} instances from.
  * You either use this or {@link #channelFactory(io.netty.channel.ChannelFactory)} if your
  * {@link Channel} implementation has no no-args constructor.
  */
public B channel(Class<? extends C> channelClass) {
    return channelFactory(new ReflectiveChannelFactory<C>(
            ObjectUtil.checkNotNull(channelClass, "channelClass")
    ));
}
```

### channelFactory(ChannelFactory<? extends C> channelFactory)

`io.netty.bootstrap.ChannelFactory`接口过时

```java
/**
  * @deprecated Use {@link #channelFactory(io.netty.channel.ChannelFactory)} instead.
  */
@Deprecated
public B channelFactory(ChannelFactory<? extends C> channelFactory) {
    ObjectUtil.checkNotNull(channelFactory, "channelFactory");
    if (this.channelFactory != null) {
        throw new IllegalStateException("channelFactory set already");
    }

    this.channelFactory = channelFactory;
    return self();
}
```

### channelFactory(io.netty.channel.ChannelFactory<? extends C> channelFactory)

```java
/**
  * {@link io.netty.channel.ChannelFactory} which is used to create {@link Channel} instances from
  * when calling {@link #bind()}. This method is usually only used if {@link #channel(Class)}
  * is not working for you because of some more complex needs. If your {@link Channel} implementation
  * has a no-args constructor, its highly recommend to just use {@link #channel(Class)} to
  * simplify your code.
  */
@SuppressWarnings({ "unchecked", "deprecation" })
public B channelFactory(io.netty.channel.ChannelFactory<? extends C> channelFactory) {
    return channelFactory((ChannelFactory<C>) channelFactory);
}
```

### localAddress

设置channel绑定的本地地址

```java
/**
 * The {@link SocketAddress} which is used to bind the local "end" to.
 */
public B localAddress(SocketAddress localAddress) {
    this.localAddress = localAddress;
    return self();
}

/**
 * @see #localAddress(SocketAddress)
 */
public B localAddress(int inetPort) {
    return localAddress(new InetSocketAddress(inetPort));
}

/**
 * @see #localAddress(SocketAddress)
 */
public B localAddress(String inetHost, int inetPort) {
    return localAddress(SocketUtils.socketAddress(inetHost, inetPort));
}

/**
 * @see #localAddress(SocketAddress)
 */
public B localAddress(InetAddress inetHost, int inetPort) {
    return localAddress(new InetSocketAddress(inetHost, inetPort));
}
```

### bind

绑定本地地址，最后都调用[`doBind(localAddress)`](#dobind)方法

```java
/**
 * Create a new {@link Channel} and bind it.
 */
public ChannelFuture bind() {
    validate();
    SocketAddress localAddress = this.localAddress;
    if (localAddress == null) {
        throw new IllegalStateException("localAddress not set");
    }
    return doBind(localAddress);
}

/**
 * Create a new {@link Channel} and bind it.
 */
public ChannelFuture bind(int inetPort) {
    return bind(new InetSocketAddress(inetPort));
}

/**
 * Create a new {@link Channel} and bind it.
 */
public ChannelFuture bind(String inetHost, int inetPort) {
    return bind(SocketUtils.socketAddress(inetHost, inetPort));
}

/**
 * Create a new {@link Channel} and bind it.
 */
public ChannelFuture bind(InetAddress inetHost, int inetPort) {
    return bind(new InetSocketAddress(inetHost, inetPort));
}

/**
 * Create a new {@link Channel} and bind it.
 */
public ChannelFuture bind(SocketAddress localAddress) {
    validate();
    return doBind(ObjectUtil.checkNotNull(localAddress, "localAddress"));
}
```

### doBind

```java
private ChannelFuture doBind(final SocketAddress localAddress) {
    // 初始化和注册通道，返回异步channelFuture
    final ChannelFuture regFuture = initAndRegister();
    // 获取通道实例
    final Channel channel = regFuture.channel();
    // 通道
    if (regFuture.cause() != null) {
        return regFuture;
    }

    if (regFuture.isDone()) {
        // At this point we know that the registration was complete and successful.
        ChannelPromise promise = channel.newPromise();
        doBind0(regFuture, channel, localAddress, promise);
        return promise;
    } else {
        // Registration future is almost always fulfilled already, but just in case it's not.
        // 异步操作还没未完成，添加监听
        final PendingRegistrationPromise promise = new PendingRegistrationPromise(channel);
        regFuture.addListener(new ChannelFutureListener() {
            @Override
            public void operationComplete(ChannelFuture future) throws Exception {
                Throwable cause = future.cause();
                if (cause != null) {
                    // Registration on the EventLoop failed so fail the ChannelPromise directly to not cause an
                    // IllegalStateException once we try to access the EventLoop of the Channel.
                    promise.setFailure(cause);
                } else {
                    // Registration was successful, so set the correct executor to use.
                    // See https://github.com/netty/netty/issues/2586
                    // channel已经注册成功与eventLoop已经绑定
                    promise.registered();
                    // 绑定端口
                    doBind0(regFuture, channel, localAddress, promise);
                }
            }
        });
        return promise;
    }
}
```

### initAndRegister

```java
final ChannelFuture initAndRegister() {
    Channel channel = null;
    try {
        // 反射生成channel实例 NioServerSocketChannel、NioDatagramChannel等不同协议的实现
        channel = channelFactory.newChannel();
        // 初始化通道，模板方法由子类实现
        init(channel);
    } catch (Throwable t) {
        if (channel != null) {
            // channel can be null if newChannel crashed (eg SocketException("too many open files"))
            channel.unsafe().closeForcibly();
            // as the Channel is not registered yet we need to force the usage of the GlobalEventExecutor
            return new DefaultChannelPromise(channel, GlobalEventExecutor.INSTANCE).setFailure(t);
        }
        // as the Channel is not registered yet we need to force the usage of the GlobalEventExecutor
        return new DefaultChannelPromise(new FailedChannel(), GlobalEventExecutor.INSTANCE).setFailure(t);
    }

    ChannelFuture regFuture = config().group().register(channel);
    if (regFuture.cause() != null) {
        if (channel.isRegistered()) {
            channel.close();
        } else {
            channel.unsafe().closeForcibly();
        }
    }

    // If we are here and the promise is not failed, it's one of the following cases:
    // 1) If we attempted registration from the event loop, the registration has been completed at this point.
    //    i.e. It's safe to attempt bind() or connect() now because the channel has been registered.
    // 2) If we attempted registration from the other thread, the registration request has been successfully
    //    added to the event loop's task queue for later execution.
    //    i.e. It's safe to attempt bind() or connect() now:
    //         because bind() or connect() will be executed *after* the scheduled registration task is executed
    //         because register(), bind(), and connect() are all bound to the same thread.

    return regFuture;
}
```

### doBind0

bind0这个方法，是由Reactor线程来负责执行的，但是此时register0方法并没有执行完毕，还需要执行后面的逻辑，而绑定逻辑需要在注册逻辑执行完之后执行，所以在doBind0方法中Reactor线程会将绑定操作封装成异步任务先提交给taskQueue中保存，这样可以使Reactor线程立马从safeSetSuccess中返回，继续执行剩下的register0方法逻辑

```java
private static void doBind0(
        final ChannelFuture regFuture, final Channel channel,
        final SocketAddress localAddress, final ChannelPromise promise) {

    // This method is invoked before channelRegistered() is triggered.  Give user handlers a chance to set up
    // the pipeline in its channelRegistered() implementation.
    channel.eventLoop().execute(new Runnable() {
        @Override
        public void run() {
            if (regFuture.isSuccess()) {
                // 交由DefaultChannelPipeline#bind调用
                // bind事件在Netty中被定义为outbound事件，所以它在pipeline中是反向传播。先从TailContext开始反向传播直到HeadContext
                channel.bind(localAddress, promise).addListener(ChannelFutureListener.CLOSE_ON_FAILURE);
            } else {
                promise.setFailure(regFuture.cause());
            }
        }
    });
}
```
