# connection

## 头文件

### ConnectionState

```c
typedef enum {
    CONN_STATE_NONE = 0,
    CONN_STATE_CONNECTING,  // connecting, 发起 connect 连接时
    CONN_STATE_ACCEPTING,   // accepting, 创建客户端时初始状态，即 accept 之前的状态
    CONN_STATE_CONNECTED,   // connected, 成功 accept 之后的状态
    CONN_STATE_CLOSED,      // closed,    关闭的状态
    CONN_STATE_ERROR        // error,     出错了
} ConnectionState;
```

### connection

```c
struct connection {
    /* 操作 connection 中的函数指针 */
    ConnectionType *type;
    /* 是一个 enum，表示连接的状态 */
    ConnectionState state;
    /* CONN_FLAG_CLOSE_SCHEDULED 或者 CONN_FLAG_WRITE_BARRIER */
    short int flags;
    /* 引用计数，控制着这个连接对象生命周期 */
    short int refs;
    /* 最近一次的错误类型 */
    int last_errno;
    /* 保存的是这个连接对应的客户端 client */
    void *private_data;
    /* 连接回调 */
    ConnectionCallbackFunc conn_handler;
    /* 写回调 */
    ConnectionCallbackFunc write_handler;
    /* 读回调 */
    ConnectionCallbackFunc read_handler;
    /* 连接对应的文件描述符 */
    int fd;
};
```

## 方法

### connTypeInitialize

初始化客户端连接类型的函数，其中主要包括TCP、Unix和TLS三种类型的连接。在该函数中，通过调用网络库提供的 API 函数来完成不同类型连接的初始化操作，并设置对应连接类型的接收数据、发送数据和关闭连接等函数指针，以便在后续的连接处理过程中进行使用。这些处理都是为了确保 Redis 服务器获得正确的客户端连接类型，可以通过正常的方式进行处理和响应客户端命令请求。

```c
int connTypeInitialize() {
    /* currently socket connection type is necessary  */
    /* 注册Socket连接类型，并确保注册成功 */
    serverAssert(RedisRegisterConnectionTypeSocket() == C_OK);

    /* currently unix socket connection type is necessary  */
    /* 注册Unix Socket连接类型，并确保注册成功 */
    serverAssert(RedisRegisterConnectionTypeUnix() == C_OK);

    /* may fail if without BUILD_TLS=yes */
    /* 注册TLS连接类型，如果没有设置BUILD_TLS为yes，则注册可能会失败 */
    RedisRegisterConnectionTypeTLS();

    /* 返回成功 */
    return C_OK;
}
```
