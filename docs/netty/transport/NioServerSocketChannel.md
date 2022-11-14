# NioServerSocketChannel

## 构造函数

```java
/**
  * Create a new instance
  */
public NioServerSocketChannel() {
    this(DEFAULT_SELECTOR_PROVIDER);
}

/**
  * Create a new instance using the given {@link SelectorProvider}.
  */
public NioServerSocketChannel(SelectorProvider provider) {
    this(provider, null);
}

/**
  * Create a new instance using the given {@link SelectorProvider} and protocol family (supported only since JDK 15).
  */
public NioServerSocketChannel(SelectorProvider provider, InternetProtocolFamily family) {
    this(newChannel(provider, family));
}

/**
  * Create a new instance using the given {@link ServerSocketChannel}.
  */
public NioServerSocketChannel(ServerSocketChannel channel) {
    // 父类构造方法，传递感兴趣的事件`OP_ACCEPT`
    super(null, channel, SelectionKey.OP_ACCEPT);
    config = new NioServerSocketChannelConfig(this, javaChannel().socket());
}
```

## 方法

### newChannel

打开通道

```java
private static ServerSocketChannel newChannel(SelectorProvider provider, InternetProtocolFamily family) {
    try {
        /**
         * InternetProtocolFamily支持IPV4,IPV6。如果没传`SelectorProviderUtil.newChannel`返回null
         */
        ServerSocketChannel channel =
                SelectorProviderUtil.newChannel(OPEN_SERVER_SOCKET_CHANNEL_WITH_FAMILY, provider, family);
        // 不传ip协议，默认通过NIO的selector开启通道
        return channel == null ? provider.openServerSocketChannel() : channel;
    } catch (IOException e) {
        throw new ChannelException("Failed to open a socket.", e);
    }
}
```
