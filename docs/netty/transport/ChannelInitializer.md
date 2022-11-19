# ChannelInitializer

## 方法

### handlerAdded

```java
/**
  * {@inheritDoc} If override this method ensure you call super!
  */
@Override
public void handlerAdded(ChannelHandlerContext ctx) throws Exception {
    // channel必须是注册完成
    if (ctx.channel().isRegistered()) {
        // This should always be true with our current DefaultChannelPipeline implementation.
        // The good thing about calling initChannel(...) in handlerAdded(...) is that there will be no ordering
        // surprises if a ChannelInitializer will add another ChannelInitializer. This is as all handlers
        // will be added in the expected order.
        if (initChannel(ctx)) {
            // initChannel返回true，那么handler已经移除，相应initMap中也要清理
            // We are done with init the Channel, removing the initializer now.
            removeState(ctx);
        }
    }
}
```

### initChannel

```java
@SuppressWarnings("unchecked")
private boolean initChannel(ChannelHandlerContext ctx) throws Exception {
    // 防止重复进入
    if (initMap.add(ctx)) { // Guard against re-entrance.
        try {
            // 执行子类的`initChannel`的方法
            initChannel((C) ctx.channel());
        } catch (Throwable cause) {
            // Explicitly call exceptionCaught(...) as we removed the handler before calling initChannel(...).
            // We do so to prevent multiple calls to initChannel(...).
            exceptionCaught(ctx, cause);
        } finally {
            // AbstractChannelHandlerContext在调用`callHandlerAdded`方法后，会将handler节点的状态设置成 ADD_COMPLETE
            // 如果节点状态不是 REMOVE_COMPLETE 那要移除当前handler
            if (!ctx.isRemoved()) {
                // 从管道流中移除改handler
                ctx.pipeline().remove(this);
            }
        }
        return true;
    }
    return false;
}
```
