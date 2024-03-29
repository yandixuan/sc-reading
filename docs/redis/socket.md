# socket(TCP)

## 方法

### connSocketRead

```c
static int connSocketRead(connection *conn, void *buf, size_t buf_len) {
    int ret = read(conn->fd, buf, buf_len);
    if (!ret) {
        conn->state = CONN_STATE_CLOSED;
    } else if (ret < 0 && errno != EAGAIN) {
        conn->last_errno = errno;

        /* Don't overwrite the state of a connection that is not already
         * connected, not to mess with handler callbacks.
         */
        if (errno != EINTR && conn->state == CONN_STATE_CONNECTED)
            conn->state = CONN_STATE_ERROR;
    }

    return ret;
}

```

### connSocketAccept

```c
static int connSocketAccept(connection *conn, ConnectionCallbackFunc accept_handler) {
    int ret = C_OK;
    /* 检查当前套接字连接状态是否为正在接受客户端连接，如果不是，函数将直接返回错误 */
    if (conn->state != CONN_STATE_ACCEPTING) return C_ERR;
    /* 因为这里已经连接已经建立了，所以要修改连接的状态为`CONN_STATE_CONNECTED`(已连接) */
    conn->state = CONN_STATE_CONNECTED;
    /* 递增连接对象的引用计数 */
    connIncrRefs(conn);
    /* 进一步执行 callHandler 函数来进行进一步处理，调用传进来的`accept_handler`即`clientAcceptHandler` */
    if (!callHandler(conn, accept_handler)) ret = C_ERR;
    /* 递减连接对象计数器 */
    connDecrRefs(conn);
    /* 返回整个操作的最终反馈值 */
    return ret;
}
```

### connSocketSetReadHandler

为连接向eventLoop对象中注册事件（即向epoll注册感兴趣事件）

```c
static int connSocketSetReadHandler(connection *conn, ConnectionCallbackFunc func) {
    /* 如果新旧两个回调函数是一致的，直接返回 C_OK */
    if (func == conn->read_handler) return C_OK;
    /* 将新回调函数设置为连接对象的 read_handler 属性 */
    conn->read_handler = func;
    /* 如果新回调函数为 NULL，删除之前注册的可读事件监听器 */
    if (!conn->read_handler)
        aeDeleteFileEvent(server.el,conn->fd,AE_READABLE);
    else
        /* 否则注册新的可读事件监听器，并将回调函数设置为 conn->type->ae_handler，注册失败时返回 C_ERR */
        if (aeCreateFileEvent(server.el,conn->fd,
                    AE_READABLE,conn->type->ae_handler,conn) == AE_ERR) return C_ERR;
    /* 操作成功，返回 C_OK */
    return C_OK;
}
```

### connSocketAcceptHandler

监听套接字中接受新客户端连接请求，并将其封装成一个连接对象交由 `acceptCommonHandler()` 函数进行处理

- MAX_ACCEPTS_PER_CALL:是 Redis 服务器在处理客户端连接请求时，每次循环最多接受的连接数量。它是一个常量（默认值为 1000），用于限制一次处理的连接数，避免在短时间内接收过多客户端连接请求而导致服务器性能下降。
- NET_IP_STR_LEN:它表示 IP 地址字符串的缓冲区大小。根据 Redis 的实现，它的值为 46，足以存放包括 IPv4 和 IPv6 两种格式的 IP 地址字符串。

```c
static void connSocketAcceptHandler(aeEventLoop *el, int fd, void *privdata, int mask) {
    int cport, cfd, max = MAX_ACCEPTS_PER_CALL;
    char cip[NET_IP_STR_LEN];
    UNUSED(el);
    UNUSED(mask);
    UNUSED(privdata);
    /* 循环接受客户端连接请求，最多处理 MAX_ACCEPTS_PER_CALL 个请求 */
    while(max--) {
        /* 使用 anetTcpAccept() 函数从监听套接字中接受新客户端连接，返回与该客户端通信的套接字描述符 
         * 服务端的套接字一般不直接用于发送或接收数据。它主要是用来监听客户端的连接请求，并在有新的连接请求到达时返回一个新的已连接套接字（connected socket）来进行后续的数据传输。*/
        cfd = anetTcpAccept(server.neterr, fd, cip, sizeof(cip), &cport);
        /* 如果接受连接请求失败，则记录错误信息，然后退出循环 */
        if (cfd == ANET_ERR) {
            if (errno != EWOULDBLOCK)
                serverLog(LL_WARNING,
                    "Accepting client connection: %s", server.neterr);
            return;
        }
        /* 如果成功接收到了新客户端连接，则记录日志信息 */
        serverLog(LL_VERBOSE,"Accepted %s:%d", cip, cport);
        /* 使用 connCreateAcceptedSocket() 函数创建并初始化一个连接对象 */
        acceptCommonHandler(connCreateAcceptedSocket(cfd, NULL),0,cip);
    }
}
```

### connSocketListen

监听TCP端口，委托给`server.c`的`listenToPort`去完成

```c
static int connSocketListen(connListener *listener) {
    return listenToPort(listener);
}
```
