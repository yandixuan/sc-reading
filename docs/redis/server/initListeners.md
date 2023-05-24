# initListeners

---

根据配置文件中指定的IP地址和端口号创建并启动监听套接字,在`connTypeInitialize`方法中，我们注册了不同连接类型的`ConnectionType`的结构体，注册到了connTypes数组中。（tcp的监听端口则由[`listenToPort`](../server#listenToPort)函数完成）

---

```c
void initListeners() {
    /* Setup listeners from server config for TCP/TLS/Unix */
    int conn_index;
    connListener *listener;
    /* 如果server.port不为0，则创建监听套接字类型为TCP的连接器 */
    if (server.port != 0) {
        conn_index = connectionIndexByType(CONN_TYPE_SOCKET);
        if (conn_index < 0)
            serverPanic("Failed finding connection listener of %s", CONN_TYPE_SOCKET);
        listener = &server.listeners[conn_index];
        listener->bindaddr = server.bindaddr;
        listener->bindaddr_count = server.bindaddr_count;
        listener->port = server.port;
        listener->ct = connectionByType(CONN_TYPE_SOCKET);
    }

    if (server.tls_port || server.tls_replication || server.tls_cluster) {
        ConnectionType *ct_tls = connectionTypeTls();
        if (!ct_tls) {
            serverLog(LL_WARNING, "Failed finding TLS support.");
            exit(1);
        }
        if (connTypeConfigure(ct_tls, &server.tls_ctx_config, 1) == C_ERR) {
            serverLog(LL_WARNING, "Failed to configure TLS. Check logs for more info.");
            exit(1);
        }
    }
    /* 如果server.tls_port不为0，则创建监听套接字类型为TLS的连接器 */
    if (server.tls_port != 0) {
        conn_index = connectionIndexByType(CONN_TYPE_TLS);
        if (conn_index < 0)
            serverPanic("Failed finding connection listener of %s", CONN_TYPE_TLS);
        /* 获取监听器数组对应索引位置的结构体 */
        listener = &server.listeners[conn_index];
        /* 使用 bindaddr 和 bindaddr_count 创建 TLS 连接器*/
        listener->bindaddr = server.bindaddr;
        listener->bindaddr_count = server.bindaddr_count;
        listener->port = server.tls_port;
        listener->ct = connectionByType(CONN_TYPE_TLS);
    }
    /* 如果设置了 Unix 套接字，则创建类型为 Unix 的套接字 */
    if (server.unixsocket != NULL) {
        conn_index = connectionIndexByType(CONN_TYPE_UNIX);
        if (conn_index < 0)
            serverPanic("Failed finding connection listener of %s", CONN_TYPE_UNIX);
        listener = &server.listeners[conn_index];
        /* 使用 unixsocket 和 unixsocketperm 参数创建 Unix 连接器 */
        listener->bindaddr = &server.unixsocket;
        listener->bindaddr_count = 1;
        listener->ct = connectionByType(CONN_TYPE_UNIX);
        listener->priv = &server.unixsocketperm; /* Unix socket specified */
    }

    /* create all the configured listener, and add handler to start to accept */
    /* 创建所有配置的监听器，并添加处理程序以开始接收连接 */
    int listen_fds = 0;
    for (int j = 0; j < CONN_TYPE_MAX; j++) {
        listener = &server.listeners[j];
        if (listener->ct == NULL)
            continue;
        /* 对不同的套接字，执行相应的监听方法 */
        if (connListen(listener) == C_ERR) {
            serverLog(LL_WARNING, "Failed listening on port %u (%s), aborting.", listener->port, listener->ct->get_type(NULL));
            exit(1);
        }
        /* 上面监听完了端口后，将fd注册进事件循环器（epoll）中，监听感兴趣的事件，
         * 即listenfd 和 accept 事件（也就是接收客户端连接的处理事件）注册到事件循环器 */
        if (createSocketAcceptHandler(listener, connAcceptHandler(listener->ct)) != C_OK)
            serverPanic("Unrecoverable error creating %s listener accept handler.", listener->ct->get_type(NULL));

       listen_fds += listener->count;
    }
    /* 如果没有成功设置任何监听套接字，则立即退出服务器 */
    if (listen_fds == 0) {
        serverLog(LL_WARNING, "Configured to not listen anywhere, exiting.");
        exit(1);
    }
}
```
