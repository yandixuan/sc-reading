# AbstractNioChannel

:::tip 概述
对channel进行基本的初始化工作，把channel设置成非阻塞模式

实现Channel.Unsafe的connect方法框架，提供给了doConnection, doFinishConnect两个抽象方法，把真正的连接操作交给子类实现

覆盖了AbstractChannel的doRegister，doDeregister方法，正两个方法实现了Channel的selectionKey的注册和注销

实现AbstractChannel的doClose, 这个方法并没有真正关闭channel动作

:::

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
