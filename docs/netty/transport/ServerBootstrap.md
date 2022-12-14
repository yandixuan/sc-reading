# ServerBootstrap

服务端引导程序

[childOption,option的参数](https://blog.csdn.net/lipengyao2010/article/details/120531650)

:::tip
option配置`ServerSocketChannel`

child配置`SocketChannel`，连接上来的客户端channel
:::

## 成员变量

```java
// 子Channel的配置
private final Map<ChannelOption<?>, Object> childOptions = new LinkedHashMap<ChannelOption<?>, Object>();
// 将额外的属性设置到Channel上
private final Map<AttributeKey<?>, Object> childAttrs = new ConcurrentHashMap<AttributeKey<?>, Object>();
// 把配置暴露出去的类
private final ServerBootstrapConfig config = new ServerBootstrapConfig(this);
// 工作线程组
private volatile EventLoopGroup childGroup;
// 客户端连接之后的请求进行handler处理
private volatile ChannelHandler childHandler;
```

## 构造函数

```java
public ServerBootstrap() { }

// 为了clone用的，所以是private权限
private ServerBootstrap(ServerBootstrap bootstrap) {
    super(bootstrap);
    childGroup = bootstrap.childGroup;
    childHandler = bootstrap.childHandler;
    synchronized (bootstrap.childOptions) {
        childOptions.putAll(bootstrap.childOptions);
    }
    childAttrs.putAll(bootstrap.childAttrs);
}
```

## 方法

### group(EventLoopGroup group)

主从Reactor共用一个线程组

```java
/**
  * Specify the {@link EventLoopGroup} which is used for the parent (acceptor) and the child (client).
  */
@Override
public ServerBootstrap group(EventLoopGroup group) {
    return group(group, group);
}
```

### group(EventLoopGroup parentGroup, EventLoopGroup childGroup)

```java
/**
  * Set the {@link EventLoopGroup} for the parent (acceptor) and the child (client). These
  * {@link EventLoopGroup}'s are used to handle all the events and IO for {@link ServerChannel} and
  * {@link Channel}'s.
  */
public ServerBootstrap group(EventLoopGroup parentGroup, EventLoopGroup childGroup) {
    // 设置主Reactor的线程组
    super.group(parentGroup);
    // childGroup不能为null
    if (this.childGroup != null) {
        throw new IllegalStateException("childGroup set already");
    }
    // 设置从Reactor的线程组
    this.childGroup = ObjectUtil.checkNotNull(childGroup, "childGroup");
    // 返回对象
    return this;
}
```

### childOption

设置Channel的参数

```java
/**
  * Allow to specify a {@link ChannelOption} which is used for the {@link Channel} instances once they get created
  * (after the acceptor accepted the {@link Channel}). Use a value of {@code null} to remove a previous set
  * {@link ChannelOption}.
  */
public <T> ServerBootstrap childOption(ChannelOption<T> childOption, T value) {
    ObjectUtil.checkNotNull(childOption, "childOption");
    synchronized (childOptions) {
        if (value == null) {
            childOptions.remove(childOption);
        } else {
            childOptions.put(childOption, value);
        }
    }
    return this;
}
```

### childAttr

```java
/**
  * Set the specific {@link AttributeKey} with the given value on every child {@link Channel}. If the value is
  * {@code null} the {@link AttributeKey} is removed
  */
public <T> ServerBootstrap childAttr(AttributeKey<T> childKey, T value) {
    ObjectUtil.checkNotNull(childKey, "childKey");
    // 设置childAttrs，value空则移除key
    if (value == null) {
        childAttrs.remove(childKey);
    } else {
        childAttrs.put(childKey, value);
    }
    return this;
}
```

### childHandler

设置客户端连接之后的handler处理

```java
/**
  * Set the {@link ChannelHandler} which is used to serve the request for the {@link Channel}'s.
  */
public ServerBootstrap childHandler(ChannelHandler childHandler) {
    this.childHandler = ObjectUtil.checkNotNull(childHandler, "childHandler");
    return this;
}
```

### init

```java
@Override
void init(Channel channel) {
    setChannelOptions(channel, newOptionsArray(), logger);
    setAttributes(channel, newAttributesArray());

    ChannelPipeline p = channel.pipeline();

    final EventLoopGroup currentChildGroup = childGroup;
    final ChannelHandler currentChildHandler = childHandler;
    final Entry<ChannelOption<?>, Object>[] currentChildOptions = newOptionsArray(childOptions);
    final Entry<AttributeKey<?>, Object>[] currentChildAttrs = newAttributesArray(childAttrs);
    /**
     * 这里是初始化Channel，往NioServerSocketChannel的管道里面添加了一个 ChannelInitializer
     * 此时channel还未注册，会将 ChannelInitializer中的ChannelAdded的调用延迟
     * 在channel与eventLoop绑定后，即AbstractChannel的`register0`后，会立即触发 ChannelInitializer中的ChannelAdded的调用
     * 即AbstractChannelHandlerContext的`callHandlerAdded0`，即调用当前 ChannelInitializer的 `initChannel`方法
     */
    p.addLast(new ChannelInitializer<Channel>() {
        @Override
        public void initChannel(final Channel ch) {
            final ChannelPipeline pipeline = ch.pipeline();
            ChannelHandler handler = config.handler();
            // 这里就是添加我们在`ServerBootstrap`中配置的handler
            if (handler != null) {
                // 运行到这里，我们的channel已经注册完毕，即会直接调用 handler的initChannel
                // 即可以通过pipeline添加处理类
                pipeline.addLast(handler);
            }
            // 执行到这步，我们在`ServerBootstrap`中配置的handler已经被移除
            // unsafe.fireRead是从pieline的head节点开始传播的
            // 向channel的线程执行器提交任务，为了是保证用户自定义的handler都在ServerBootstrapAcceptor的前面
            // 如果不能保证，channel中的数据到了`ServerBootstrapAcceptor`就不会继续传递了
            ch.eventLoop().execute(new Runnable() {
                @Override
                public void run() {
                    // 专门处理新连接的接入, 把新连接的channel绑定在 workerGroup中的某一条线程上
                    pipeline.addLast(new ServerBootstrapAcceptor(
                            ch, currentChildGroup, currentChildHandler, currentChildOptions, currentChildAttrs));
                }
            });
        }
    });
    // 在 ChannelInitializer 的 initChannel调用完后，该handler都会被移除
}
```

### validate

```java
@Override
public ServerBootstrap validate() {
    // 对主group进行非空校验，channelFactory也不能为空
    super.validate();
    // childHandler非空
    if (childHandler == null) {
        throw new IllegalStateException("childHandler not set");
    }
    // 子Reactor线程组为空，则使用主Rector的线程组
    if (childGroup == null) {
        logger.warn("childGroup is not set. Using parentGroup instead.");
        childGroup = config.group();
    }
    return this;
}
```
