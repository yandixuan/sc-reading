# AbstractNioMessageChannel

主要实现read和write的抽象层

AbstractNioMessageChannel读的时候会把byte array转换成结构化的对象，写的时候把结构化对象序列化成byte array

## 属性

```java
private final Channel parent;
private final ChannelId id;
private final Unsafe unsafe;
private final DefaultChannelPipeline pipeline;
private final VoidChannelPromise unsafeVoidPromise = new VoidChannelPromise(this, false);
private final CloseFuture closeFuture = new CloseFuture(this);

private volatile SocketAddress localAddress;
private volatile SocketAddress remoteAddress;
private volatile EventLoop eventLoop;
private volatile boolean registered;
private boolean closeInitiated;
private Throwable initialCloseCause;

/** Cache for the string representation of this channel */
private boolean strValActive;
private String strVal;
```

## 构造方法

```java

```

## 方法
