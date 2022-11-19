# AbstractNioChannel

:::tip 概述
对channel进行基本的初始化工作，把channel设置成非阻塞模式

实现Channel.Unsafe的connect方法框架，提供给了doConnection, doFinishConnect两个抽象方法，把真正的连接操作交给子类实现

覆盖了AbstractChannel的doRegister，doDeregister方法，正两个方法实现了Channel的selectionKey的注册和注销

实现AbstractChannel的doClose, 这个方法并没有真正关闭channel动作
:::

## 成员变量

```java
// 基于selector的channel必然是`SelectableChannel`
private final SelectableChannel ch;
/**
 * selector感兴趣事件,在`NioServerSocketChannel`构造方法中传递的是`SelectionKey.OP_ACCEPT`
 * 
 */
protected final int readInterestOp;
volatile SelectionKey selectionKey;
boolean readPending;
private final Runnable clearReadPendingRunnable = new Runnable() {
    @Override
    public void run() {
        clearReadPending0();
    }
};

/**
    * The future of the current connection attempt.  If not null, subsequent
    * connection attempts will fail.
    */
private ChannelPromise connectPromise;
private Future<?> connectTimeoutFuture;
private SocketAddress requestedRemoteAddress;
```

## 构造方法

```java
/**
  * Create a new instance
  *
  * @param parent            the parent {@link Channel} by which this instance was created. May be {@code null}
  * @param ch                the underlying {@link SelectableChannel} on which it operates
  * @param readInterestOp    the ops to set to receive data from the {@link SelectableChannel}
  */
protected AbstractNioChannel(Channel parent, SelectableChannel ch, int readInterestOp) {
    // 父类构造函数
    super(parent);
    // 设置ch
    this.ch = ch;
    // 设置selector敢兴趣的事件
    this.readInterestOp = readInterestOp;
    // 对于nio的channel一定是可选择的，不然selector没用
    try {
        // 基于NIO，通道设置非阻塞的
        ch.configureBlocking(false);
    } catch (IOException e) {
        try {
            // 异常，关闭通道
            ch.close();
        } catch (IOException e2) {
            logger.warn(
                        "Failed to close a partially initialized socket.", e2);
        }

        throw new ChannelException("Failed to enter non-blocking mode.", e);
    }
}
```

## AbstractNioUnsafe

### doRegister

```java
@Override
protected void doRegister() throws Exception {
    boolean selected = false;
    for (;;) {
        try {
            /**
             * NIO channel注册进selector感兴趣事件为0（仅仅表示注册成功，还不能监听任何网络事件）
             * 在`doBeginRead`中会调用selector注册感谢趣事件即`SelectionKey.OP_ACCEPT`事件
             */
            selectionKey = javaChannel().register(eventLoop().unwrappedSelector(), 0, this);
            return;
        } catch (CancelledKeyException e) {
            /**
             * 在服务端收到客户端的连接时，也是通过复用这个方法将`SocketChannel`注册到这个selector中。
             * 有可能在注册的过程中客户端断开连接则会抛出这个CanceledKeyException异常
             * 那么这里捕获了异常并且调用select.selectNow，理论上会从selector中移除这个无效的channel
             * https://segmentfault.com/a/1190000013015303
             */
            if (!selected) {
                // Force the Selector to select now as the "canceled" SelectionKey may still be
                // cached and not removed because no Select.select(..) operation was called yet.
                eventLoop().selectNow();
                selected = true;
            } else {
                // We forced a select operation on the selector before but the SelectionKey is still cached
                // for whatever reason. JDK bug ?
                throw e;
            }
        }
    }
}
```

### doBeginRead

```java
@Override
protected void doBeginRead() throws Exception {
    // Channel.read() or ChannelHandlerContext.read() was called
    final SelectionKey selectionKey = this.selectionKey;
    // 判断selectionKey是否有效，无效则不读
    if (!selectionKey.isValid()) {
        return;
    }

    readPending = true;

    final int interestOps = selectionKey.interestOps();
    // `AbstractNioChannel`初始化会通过子类传递的`readInterestOp`
    // 对感兴趣的事件就行合并
    if ((interestOps & readInterestOp) == 0) {
        // 设置 selectionKey 感兴趣的事件
        // 对于`NioServerSocketChannel`来说就是`SelectionKey.OP_ACCEPT`
        selectionKey.interestOps(interestOps | readInterestOp);
    }
}
```

### doBind
