# networking(网络和客户端相关)

## 方法

### createClient

创建一个新的客户端，并初始化该客户端的属性

```c
client *createClient(connection *conn) {
    /* 堆上申请内存地址 */
    client *c = zmalloc(sizeof(client));

    /* passing NULL as conn it is possible to create a non connected client.
     * This is useful since all the commands needs to be executed
     * in the context of a client. When commands are executed in other
     * contexts (for instance a Lua script) we need a non connected client. */
    if (conn) {
        /* 禁用 Nagle 算法 */
        connEnableTcpNoDelay(conn);
        /* 设置 keep alive */
        if (server.tcpkeepalive)
            connKeepAlive(conn,server.tcpkeepalive);
        /* 将（服务度与客户端的）连接的 fd 向事件循环对象注册一个文件事件监听客户端的可读事件 */    
        connSetReadHandler(conn, readQueryFromClient);
        /* 将当前 client 对象关联到这个连接上 */
        connSetPrivateData(conn, c);
    }
    /* 初始化 client 的其他各项字段 */
    c->buf = zmalloc_usable(PROTO_REPLY_CHUNK_BYTES, &c->buf_usable_size);
    /* 默认数据库0 */
    selectDb(c,0);
    uint64_t client_id;
    /* 原子操作，获取下一个client_id */
    atomicGetIncr(server.next_client_id, client_id, 1);
    c->id = client_id;
#ifdef LOG_REQ_RES
    reqresReset(c, 0);
    c->resp = server.client_default_resp;
#else
    c->resp = 2;
#endif
    c->conn = conn;
    c->name = NULL;
    c->lib_name = NULL;
    c->lib_ver = NULL;
    c->bufpos = 0;
    c->buf_peak = c->buf_usable_size;
    c->buf_peak_last_reset_time = server.unixtime;
    c->ref_repl_buf_node = NULL;
    c->ref_block_pos = 0;
    /* 当前querybuf缓冲区中已经被解析完毕的命令数据长度 */
    c->qb_pos = 0;
    /* 动态字符串缓冲区，用来保存客户端发来的命令请求数据 */
    c->querybuf = sdsempty();
    /* 客户端连接所使用的查询缓冲区 querybuf 的峰值大小（peak） */
    c->querybuf_peak = 0;
    /* 客户端发起的请求类型： Inline 和 MulitiBulk */
    c->reqtype = 0;
    c->argc = 0;
    c->argv = NULL;
    c->argv_len = 0;
    c->argv_len_sum = 0;
    c->original_argc = 0;
    c->original_argv = NULL;
    c->cmd = c->lastcmd = c->realcmd = NULL;
    c->cur_script = NULL;
    /* 表示请求类型是 multibulk 时,当前正在解析的命令请求中包含的参数个数(同时也包含CMD) */
    c->multibulklen = 0;
    /* 表示当前正在解析的命令请求中某个参数值的长度 */
    c->bulklen = -1;
    c->sentlen = 0;
    c->flags = 0;
    c->slot = -1;
    c->ctime = c->lastinteraction = server.unixtime;
    c->duration = 0;
    clientSetDefaultAuth(c);
    c->replstate = REPL_STATE_NONE;
    c->repl_start_cmd_stream_on_ack = 0;
    c->reploff = 0;
    c->read_reploff = 0;
    c->repl_applied = 0;
    c->repl_ack_off = 0;
    c->repl_ack_time = 0;
    c->repl_aof_off = 0;
    c->repl_last_partial_write = 0;
    c->slave_listening_port = 0;
    c->slave_addr = NULL;
    c->slave_capa = SLAVE_CAPA_NONE;
    c->slave_req = SLAVE_REQ_NONE;
    c->reply = listCreate();
    c->deferred_reply_errors = NULL;
    c->reply_bytes = 0;
    c->obuf_soft_limit_reached_time = 0;
    /*  用于设置列表中节点值（也就是响应信息）的释放函数，即链表节点被删除时会自动调用的回调函数。
     * 这里使用的函数是 freeClientReplyValue，它会根据响应类型来释放节点值对应的内存空间。 */
    listSetFreeMethod(c->reply,freeClientReplyValue);
    /* 用于设置该列表中节点值（响应信息）的复制函数。当新的响应信息被添加到列表中时，该函数会被调用来复制新的节点值。
     * 这里使用的函数是 dupClientReplyValue，它会将节点值复制到新的内存空间并返回对该空间的指针，以便在新节点插入列表中时进行赋值操作 */
    listSetDupMethod(c->reply,dupClientReplyValue);
    initClientBlockingState(c);
    c->woff = 0;
    c->watched_keys = listCreate();
    c->pubsub_channels = dictCreate(&objectKeyPointerValueDictType);
    c->pubsub_patterns = listCreate();
    c->pubsubshard_channels = dictCreate(&objectKeyPointerValueDictType);
    c->peerid = NULL;
    c->sockname = NULL;
    c->client_list_node = NULL;
    c->postponed_list_node = NULL;
    c->pending_read_list_node = NULL;
    c->client_tracking_redirection = 0;
    c->client_tracking_prefixes = NULL;
    c->last_memory_usage = 0;
    c->last_memory_type = CLIENT_TYPE_NORMAL;
    c->module_blocked_client = NULL;
    c->module_auth_ctx = NULL;
    c->auth_callback = NULL;
    c->auth_callback_privdata = NULL;
    c->auth_module = NULL;
    listInitNode(&c->clients_pending_write_node, c);
    listSetFreeMethod(c->pubsub_patterns,decrRefCountVoid);
    listSetMatchMethod(c->pubsub_patterns,listMatchObjects);
    c->mem_usage_bucket = NULL;
    c->mem_usage_bucket_node = NULL;
    if (conn) linkClient(c);
    initClientMultiState(c);
    /* 返回该客户端的指针 */
    return c;
}
```

### clientAcceptHandler

处理新连接请求的默认处理函数

```c
void clientAcceptHandler(connection *conn) {
    client *c = connGetPrivateData(conn);
    /* 当前连接必须处于已连接状态（CONN_STATE_CONNECTED）*/
    if (connGetState(conn) != CONN_STATE_CONNECTED) {
        /* 否则日志文件将记录有关发生事件的错误信息 */
        serverLog(LL_WARNING,
                  "Error accepting a client connection: %s (addr=%s laddr=%s)",
                  connGetLastError(conn), getClientPeerId(c), getClientSockname(c));
        /* 异步释放客户端连接对象的函数，主要用于避免阻塞主线程 */
        freeClientAsync(c);
        return;
    }

    /* If the server is running in protected mode (the default) and there
     * is no password set, nor a specific interface is bound, we don't accept
     * requests from non loopback interfaces. Instead we try to explain the
     * user what to do to fix it if needed. */
    /* 开启了保护模式（protected mode）并且默认用户（DefaultUser）没有设置认证密码，
     * 只有本地循环连接(它对应一个IP地址127.0.0.1或::1)才可以通过自动认证，
     * 并且如果进行远程连接的话，在反馈信息中会详细解释如何更改 Redis 允许的远程 IP 地址范围 */
    if (server.protected_mode &&
        DefaultUser->flags & USER_FLAG_NOPASS)
    {
        if (connIsLocal(conn) != 1) {
            char *err =
                "-DENIED Redis is running in protected mode because protected "
                "mode is enabled and no password is set for the default user. "
                "In this mode connections are only accepted from the loopback interface. "
                "If you want to connect from external computers to Redis you "
                "may adopt one of the following solutions: "
                "1) Just disable protected mode sending the command "
                "'CONFIG SET protected-mode no' from the loopback interface "
                "by connecting to Redis from the same host the server is "
                "running, however MAKE SURE Redis is not publicly accessible "
                "from internet if you do so. Use CONFIG REWRITE to make this "
                "change permanent. "
                "2) Alternatively you can just disable the protected mode by "
                "editing the Redis configuration file, and setting the protected "
                "mode option to 'no', and then restarting the server. "
                "3) If you started the server manually just for testing, restart "
                "it with the '--protected-mode no' option. "
                "4) Set up an authentication password for the default user. "
                "NOTE: You only need to do one of the above things in order for "
                "the server to start accepting connections from the outside.\r\n";
            if (connWrite(c->conn,err,strlen(err)) == -1) {
                /* Nothing to do, Just to avoid the warning... */
            }
            /* 拒绝连接数递增， */
            server.stat_rejected_conn++;
            /* 异步释放客户端连接对象的函数，主要用于避免阻塞主线程 */
            freeClientAsync(c);
            return;
        }
    }

    server.stat_numconnections++;
    /* 向redis模块传递`REDISMODULE_SUBEVENT_CLIENT_CHANGE_CONNECTED`事件 
     * REDISMODULE_EVENT_CLIENT_CHANGE 表示触发的事件类型为 "客户端连接状态改变" 
     * REDISMODULE_SUBEVENT_CLIENT_CHANGE_CONNECTED 表示触发的子事件类型为 "某个客户端已经连接" */
    moduleFireServerEvent(REDISMODULE_EVENT_CLIENT_CHANGE,
                          REDISMODULE_SUBEVENT_CLIENT_CHANGE_CONNECTED,
                          c);
}
```

### acceptCommonHandler

Redis 在内部封装了 accept 函数的处理流程，并定义了 acceptCommonHandler 函数来统一处理客户端连接请求

```c
void acceptCommonHandler(connection *conn, int flags, char *ip) {
    client *c;
    UNUSED(ip);
    /* 获取到的连接状态不等于CONN_STATE_ACCEPTING，则表示连接出现错误，需要记录日志并关闭该连接 */
    if (connGetState(conn) != CONN_STATE_ACCEPTING) {
        /* 初始化数组 */
        char addr[NET_ADDR_STR_LEN] = {0};
        char laddr[NET_ADDR_STR_LEN] = {0};
        /* 使用connFormatAddr()函数分别获取连接的源地址和本地地址，存储在addr和laddr两个字符数组中 */
        connFormatAddr(conn, addr, sizeof(addr), 1);
        connFormatAddr(conn, laddr, sizeof(addr), 0);
        /* 输出错误日志 */
        serverLog(LL_VERBOSE,
                  "Accepted client connection in error state: %s (addr=%s laddr=%s)",
                  connGetLastError(conn), addr, laddr);
        /* 关闭连接 */                
        connClose(conn);
        return;
    }

    /* Limit the number of connections we take at the same time.
     *
     * Admission control will happen before a client is created and connAccept()
     * called, because we don't want to even start transport-level negotiation
     * if rejected. */
    /* 检查客户端数量是否超过阈值 */ 
    if (listLength(server.clients) + getClusterConnectionsCount()
        >= server.maxclients)
    {   
        /* 如果客户端数量加上集群中连接的节点数量已经超过了 Redis 服务器的最大处理能力，则表示无法再接受新的连接请求 */
        char *err;
        /* 为了提供更清晰的错误提示，根据 cluster_enabled 形参的值设置 err 字符串内容 */
        if (server.cluster_enabled)
            err = "-ERR max number of clients + cluster "
                  "connections reached\r\n";
        else
            err = "-ERR max number of clients reached\r\n";

        /* That's a best effort error message, don't check write errors.
         * Note that for TLS connections, no handshake was done yet so nothing
         * is written and the connection will just drop. */
        /* 使用 connWrite() 函数向该连接写入相关错误信息 
         * 因为 Redis 支持多种网络库，因此 connection 类型封装了这些不同 API 所需的操作方法，并提供了对它们进行访问的接口 */
        if (connWrite(conn,err,strlen(err)) == -1) {
            /* Nothing to do, Just to avoid the warning... */
        }
        /* 记录被拒绝的连接数到 server.stat_rejected_conn 变量中 */
        server.stat_rejected_conn++;
        /* 关闭连接 */
        connClose(conn);
        return;
    }

    /* Create connection and client */
    /* 走到这里说明服务器可以接受连接
     * 创建一个新的 Redis 客户端对象 
     * 如果创建客户端对象失败，会记录一个错误日志并关闭连接 */
    if ((c = createClient(conn)) == NULL) {
        char addr[NET_ADDR_STR_LEN] = {0};
        char laddr[NET_ADDR_STR_LEN] = {0};
        connFormatAddr(conn, addr, sizeof(addr), 1);
        connFormatAddr(conn, laddr, sizeof(addr), 0);
        serverLog(LL_WARNING,
                  "Error registering fd event for the new client connection: %s (addr=%s laddr=%s)",
                  connGetLastError(conn), addr, laddr);
        connClose(conn); /* May be already closed, just ignore errors */
        return;
    }

    /* Last chance to keep flags */
    /* 设置客户端相关的标识符 */
    c->flags |= flags;

    /* Initiate accept.
     *
     * Note that connAccept() is free to do two things here:
     * 1. Call clientAcceptHandler() immediately;
     * 2. Schedule a future call to clientAcceptHandler().
     *
     * Because of that, we must do nothing else afterwards.
     */
    /*  将 conn 的状态改为 CONN_STATE_CONNECTED，然后调用 callHanlder->clientAcceptHandler */
    if (connAccept(conn, clientAcceptHandler) == C_ERR) {
        if (connGetState(conn) == CONN_STATE_ERROR)
            serverLog(LL_WARNING,
                      "Error accepting a client connection: %s (addr=%s laddr=%s)",
                      connGetLastError(conn), getClientPeerId(c), getClientSockname(c));
        freeClient(connGetPrivateData(conn));
        return;
    }
}
```

### processInlineBuffer

处理`PROTO_REQ_INLINE`类型的协议报文(支持\n和\r\n作为协议的结束符标志)

```c
int processInlineBuffer(client *c) {
    char *newline;
    int argc, j, linefeed_chars = 1;
    sds *argv, aux;
    size_t querylen;

    /* Search for end of line */
    /* 从qb_pos位置开始在搜索请求缓冲区中第一个换行符的位置 */
    newline = strchr(c->querybuf+c->qb_pos,'\n');

    /* Nothing to do without a \r\n */
    /* 如果没有找到，则返回错误 */
    if (newline == NULL) {
        /* 判断行协议请求的大小是否超过预设值 */
        if (sdslen(c->querybuf)-c->qb_pos > PROTO_INLINE_MAX_SIZE) {
            /* 向客户端发送错误信息 */
            addReplyError(c,"Protocol error: too big inline request");
            /* 设置协议解析错误标记 */
            setProtocolError("too big inline request",c);
        }
        return C_ERR;
    }

    /* Handle the \r\n case. */
    /* 如果新行指针不是开头且前一个字符是回车符，则需要跳过回车符 */
    if (newline != c->querybuf+c->qb_pos && *(newline-1) == '\r')
        newline--, linefeed_chars++;

    /* Split the input buffer up to the \r\n */
    /* 算出缓冲区中尚未处理的数据的长度 */
    querylen = newline-(c->querybuf+c->qb_pos);
    /* 将上述长度的数据读出来 */
    aux = sdsnewlen(c->querybuf+c->qb_pos,querylen);
    /* 使用sdssplitargs分割为参数列表并保存在argv数组中 */
    argv = sdssplitargs(aux,&argc);
    sdsfree(aux);
    if (argv == NULL) {
        addReplyError(c,"Protocol error: unbalanced quotes in request");
        setProtocolError("unbalanced quotes in inline request",c);
        return C_ERR;
    }

    /* Newline from slaves can be used to refresh the last ACK time.
     * This is useful for a slave to ping back while loading a big
     * RDB file. */
    /* 如果客户端类型是 SLAVE 并且请求长度为 0，则刷新最后确认时间戳 */
    if (querylen == 0 && getClientType(c) == CLIENT_TYPE_SLAVE)
        c->repl_ack_time = server.unixtime;

    /* Masters should never send us inline protocol to run actual
     * commands. If this happens, it is likely due to a bug in Redis where
     * we got some desynchronization in the protocol, for example
     * because of a PSYNC gone bad.
     *
     * However there is an exception: masters may send us just a newline
     * to keep the connection active. */
    if (querylen != 0 && c->flags & CLIENT_MASTER) {
        sdsfreesplitres(argv,argc);
        serverLog(LL_WARNING,"WARNING: Receiving inline protocol from master, master stream corruption? Closing the master connection and discarding the cached master.");
        setProtocolError("Master using the inline protocol. Desync?",c);
        return C_ERR;
    }

    /* Move querybuffer position to the next query in the buffer. */
    /* 指向缓冲区下一个可以被写入的位置 */
    c->qb_pos += querylen+linefeed_chars;

    /* Setup argv array on client structure */
    /* 释放原有的参数空间，再根据参数个数动态分配一个大小为 sizeof(robj*) * c->argv_len 的内存空间 */
    if (argc) {
        if (c->argv) zfree(c->argv);
        c->argv_len = argc;
        c->argv = zmalloc(sizeof(robj*)*c->argv_len);
        c->argv_len_sum = 0;
    }

    /* Create redis objects for all arguments. */
    /* 每个参数按照 OBJ_STRING 类型创建成 Redis 对象，并将该对象的地址保存在指针数组 c->argv 中 
     * 累加所有参数长度得到参数长度总和并保存在 c->argv_len_sum 中 */
    for (c->argc = 0, j = 0; j < argc; j++) {
        c->argv[c->argc] = createObject(OBJ_STRING,argv[j]);
        c->argc++;
        c->argv_len_sum += sdslen(argv[j]);
    }
    /* 释放argv内存空间 */
    zfree(argv);
    return C_OK;
}
```

### processMultibulkBuffer

处理`PROTO_REQ_MULTIBULK`类型的协议报文

```c
int processMultibulkBuffer(client *c) {
    char *newline = NULL;
    int ok;
    long long ll;

    if (c->multibulklen == 0) {
        /* The client should have been reset */
        /* 如果 c->multibulklen 已经为 0，表示上一个 Multi-bulk 请求已经执行完成 */
        serverAssertWithInfo(c,NULL,c->argc == 0);

        /* Multi bulk length cannot be read without a \r\n */
        /* 若当前未读到 \r，说明请求数据不完整或格式错误 */
        newline = strchr(c->querybuf+c->qb_pos,'\r');
        if (newline == NULL) {
            if (sdslen(c->querybuf)-c->qb_pos > PROTO_INLINE_MAX_SIZE) {
                addReplyError(c,"Protocol error: too big mbulk count string");
                setProtocolError("too big mbulk count string",c);
            }
            return C_ERR;
        }

        /* Buffer should also contain \n */
        /* 如果成立则没有读到\n，即当前参数值是不完整的，等待客户端继续发送数据 */
        if (newline-(c->querybuf+c->qb_pos) > (ssize_t)(sdslen(c->querybuf)-c->qb_pos-2))
            return C_ERR;

        /* We know for sure there is a whole line since newline != NULL,
         * so go ahead and find out the multi bulk length. */
        /* 断言当前读取的数据块的第一个字符必须是 *，即 Multi-bulk 请求的开头，
         * 如果不是则表示协议解析错误，会触发服务器内部的断言机制，导致进程异常终止以避免后续程序出现错误 */ 
        serverAssertWithInfo(c,NULL,c->querybuf[c->qb_pos] == '*');
        /* 字符串转long long 类型，成功返回1
         * eg: *2\r\n$4\r\nkey1\r\n$4\r\nval1\r\n*2\r\n$4\r\nkey2\r\n$4\r\nval2\r\n
         * 这里ll得到的是参数的个数 */
        ok = string2ll(c->querybuf+1+c->qb_pos,newline-(c->querybuf+1+c->qb_pos),&ll);
        if (!ok || ll > INT_MAX) {
            /* 如果无法读取参数数量或读到的数量超过偏移量上限 INT_MAX，返回错误并断开连接 */
            addReplyError(c,"Protocol error: invalid multibulk length");
            setProtocolError("invalid mbulk count",c);
            return C_ERR;
        } else if (ll > 10 && authRequired(c)) {
            /* 如果当前连接需要进行身份验证，并且收到的参数数量太多（>10），则拒绝执行该请求 */
            addReplyError(c, "Protocol error: unauthenticated multibulk length");
            setProtocolError("unauth mbulk count", c);
            return C_ERR;
        }
        /* 更新指针位置，指向下一个参数 */
        c->qb_pos = (newline-c->querybuf)+2;
        /* 如果参数数量为 0，直接跳过后续操作 */
        if (ll <= 0) return C_OK;
        /* 将参数数量保存至客户端状态结构体 c 中，准备开始处理 Multi-bulk 命令的参数 */
        c->multibulklen = ll;

        /* Setup argv array on client structure */
        /* 初始化 argv 数组 */
        if (c->argv) zfree(c->argv);
        /* 设置最多可处理的参数数量上限，避免参数过多导致内存占用过大 */
        c->argv_len = min(c->multibulklen, 1024);
        /* 分配 argv 数组 */
        c->argv = zmalloc(sizeof(robj*)*c->argv_len);
        /* 初始化命令参数的总长度 */
        c->argv_len_sum = 0;
    }
    /* multibulklen必须大于0，不然报文有问题 */
    serverAssertWithInfo(c,NULL,c->multibulklen > 0);
    while(c->multibulklen) {
        /* Read bulk length if unknown */
        /* 如果 bulklen 为 -1，则表明目前并不知道下一个参数的长度是多少，需要先读取长度信息。*/
        if (c->bulklen == -1) {
            /* 从qb_pos位置搜索最近的'\r' */
            newline = strchr(c->querybuf+c->qb_pos,'\r');
            if (newline == NULL) {
                if (sdslen(c->querybuf)-c->qb_pos > PROTO_INLINE_MAX_SIZE) {
                    addReplyError(c,
                        "Protocol error: too big bulk count string");
                    setProtocolError("too big bulk count string",c);
                    return C_ERR;
                }
                break;
            }

            /* Buffer should also contain \n */
            /* 如果成立则没有读到\n，即当前参数值是不完整的，跳出循环等待客户端继续发送数据 */
            if (newline-(c->querybuf+c->qb_pos) > (ssize_t)(sdslen(c->querybuf)-c->qb_pos-2))
                break;
            /* 第一个字符必须是$，如果不是则表明这里出现了协议解析错误，并停止请求处理。 */
            if (c->querybuf[c->qb_pos] != '$') {
                addReplyErrorFormat(c,
                    "Protocol error: expected '$', got '%c'",
                    c->querybuf[c->qb_pos]);
                setProtocolError("expected $ but got something else",c);
                return C_ERR;
            }
            /* 读到参数长度，转成long long类型 */
            ok = string2ll(c->querybuf+c->qb_pos+1,newline-(c->querybuf+c->qb_pos+1),&ll);
            /* 如果参数长度不是整数或小于 0，或者大于了 server.proto_max_bulk_len 控制流程会进入其中，Redis 服务器调用了 addReplyError 函数发送错误响应信息，并设置一个全局的 client 状态变量来通知客户端连接发生了协议错误 */
            if (!ok || ll < 0 ||
                (!(c->flags & CLIENT_MASTER) && ll > server.proto_max_bulk_len)) {
                addReplyError(c,"Protocol error: invalid bulk length");
                setProtocolError("invalid bulk length",c);
                return C_ERR;
            } else if (ll > 16384 && authRequired(c)) {
                /* 如果该参数值的长度超过了服务端允许的最大值（16384）且当前客户端连接没有进行身份验证，就返回错误信息并中断解析流程，同样设置一个全局的 client 状态变量。 */
                addReplyError(c, "Protocol error: unauthenticated bulk length");
                setProtocolError("unauth bulk length", c);
                return C_ERR;
            }
            /* 参数读到了，更新qb_pos（已读取数据）位置 */
            c->qb_pos = newline-c->querybuf+2;
            /* 如果 ll 大于等于 PROTO_MBULK_BIG_ARG(32KB)并且当前客户端不是 master 接入端
             * 对客户端输入缓冲区 querybuf 进行一些优化处理 */
            if (!(c->flags & CLIENT_MASTER) && ll >= PROTO_MBULK_BIG_ARG) {
                /* When the client is not a master client (because master
                 * client's querybuf can only be trimmed after data applied
                 * and sent to replicas).
                 *
                 * If we are going to read a large object from network
                 * try to make it likely that it will start at c->querybuf
                 * boundary so that we can optimize object creation
                 * avoiding a large copy of data.
                 *
                 * But only when the data we have not parsed is less than
                 * or equal to ll+2. If the data length is greater than
                 * ll+2, trimming querybuf is just a waste of time, because
                 * at this time the querybuf contains not only our bulk. */
                /* 如果剩余待解析数据还没有被截掉并且小于或等于 ll+2（+2 表示回车符和换行符的长度），则需要对 querybuf 进行一些优化操作。
                 * 这个判别条件主要应该是为了判断是否应该把 bulk 值移动到 querybuf 缓冲区的起始位置以达到内存整理的目的，
                 * 因为 Redis 的 bulk 值一般都是存储在单独的一个 dictEntry 中的。*/ 
                if (sdslen(c->querybuf)-c->qb_pos <= (size_t)ll+2) {
                    sdsrange(c->querybuf,c->qb_pos,-1);
                    c->qb_pos = 0;
                    /* Hint the sds library about the amount of bytes this string is
                     * going to contain. */
                    c->querybuf = sdsMakeRoomForNonGreedy(c->querybuf,ll+2-sdslen(c->querybuf));
                    /* We later set the peak to the used portion of the buffer, but here we over
                     * allocated because we know what we need, make sure it'll not be shrunk before used. */
                    /* 设置新的数据长度占用峰值 */ 
                    if (c->querybuf_peak < (size_t)ll + 2) c->querybuf_peak = ll + 2;
                }
            }
            /* 解析出来的 bulk 值数值赋值给 bulklen 变量，表示完成了这个 bulk string 参数值的解析 */
            c->bulklen = ll;
        }

        /* Read bulk argument */
        /* 首先检查当前缓冲区是否已经包含完整的某一个 bulk string 参数值，如果数据不足和回车换行符 \r\n 的长度之和小于 bulklen，
         * 说明这个参数字符串并未完整传输完，所以直接跳出循环等待下一次读入更多数据 */
        if (sdslen(c->querybuf)-c->qb_pos < (size_t)(c->bulklen+2)) {
            /* Not enough data (+2 == trailing \r\n) */
            break;
        } else {
            /* Check if we have space in argv, grow if needed */
            /* 检查参数数组 argv 中是否还有空间存放新的参数对象，如果没有，则对数组进行扩充 */
            if (c->argc >= c->argv_len) {
                c->argv_len = min(c->argv_len < INT_MAX/2 ? c->argv_len*2 : INT_MAX, c->argc+c->multibulklen);
                c->argv = zrealloc(c->argv, sizeof(robj*)*c->argv_len);
            }

            /* Optimization: if a non-master client's buffer contains JUST our bulk element
             * instead of creating a new object by *copying* the sds we
             * just use the current sds string. */
            /* 如果当前连接是非master客户端且当前bulk string参数数据所在的querybuf压根没有被裁剪过（即 querybuf 游标 qb_pos==0）
             * 而且当前待解析的 bulk 参数值长度超过 PROTO_MBULK_BIG_ARG（一个常量，表示最大可处理的 bulk 参数大小） 而且整个缓冲区都被数据封住，
             * 即缓冲区长度为 bulklen + 2，则可以直接将 querybuf 本身作为 bulk string 参数值对象。这个优化的目的是避免无意义的内存拷贝操作。*/ 
            if (!(c->flags & CLIENT_MASTER) &&
                c->qb_pos == 0 &&
                c->bulklen >= PROTO_MBULK_BIG_ARG &&
                sdslen(c->querybuf) == (size_t)(c->bulklen+2))
            {
                c->argv[c->argc++] = createObject(OBJ_STRING,c->querybuf);
                c->argv_len_sum += c->bulklen;
                sdsIncrLen(c->querybuf,-2); /* remove CRLF */
                /* Assume that if we saw a fat argument we'll see another one
                 * likely... */
                c->querybuf = sdsnewlen(SDS_NOINIT,c->bulklen+2);
                sdsclear(c->querybuf);
            } else {
                /* 随后更新下一次如何寻找待解析数据的位置，也就是将游标向前移动到下一个 bulk 参数的开始位置（+2 表示要跳过该参数最后的回车与换行符） */
                c->argv[c->argc++] =
                    createStringObject(c->querybuf+c->qb_pos,c->bulklen);
                /* 叠加参数内容的长度和 */
                c->argv_len_sum += c->bulklen;
                c->qb_pos += c->bulklen+2;
            }
            /* 最后清空 bulklen 变量并减少记录还需要解析的 bulk 值得个数 */
            c->bulklen = -1;
            c->multibulklen--;
        }
    }

    /* We're done when c->multibulk == 0 */
    /* multibulk协议报文解析完成，返回C_OK */
    if (c->multibulklen == 0) return C_OK;

    /* Still not ready to process the command */
    /* 仍然不足以解析完整的命令 */
    return C_ERR;
}
```

### processCommandAndResetClient

```c
int processCommandAndResetClient(client *c) {
    /* 客户端是否断开连接的标志位 */
    int deadclient = 0;
    /* 一个客户端的请求在处理的过程中有可能被中断或者暂停，并切换到另一个客户端的请求
     * 保存当前处理的客户端 c 并将其赋值给 old_client */
    client *old_client = server.current_client;
    /* 设定 Redis 当前操作的客户端为指向 c 的指针 */
    server.current_client = c;
    /* 调用 processCommand 处理客户端发送的命令，并检查其返回值 */
    if (processCommand(c) == C_OK) {
        /* 标记命令已经被处理 */
        commandProcessed(c);
        /* Update the client's memory to include output buffer growth following the
         * processed command. */
        /* 更新客户端内存使用率和输出缓冲区大小 */ 
        updateClientMemUsageAndBucket(c);
    }
    /* 如果服务端当前没有正在处理的客户端，则表示客户端异常终止 */
    if (server.current_client == NULL) deadclient = 1;
    /*
     * Restore the old client, this is needed because when a script
     * times out, we will get into this code from processEventsWhileBlocked.
     * Which will cause to set the server.current_client. If not restored
     * we will return 1 to our caller which will falsely indicate the client
     * is dead and will stop reading from its buffer.
     */
    /* 恢复原来的客户端 */ 
    server.current_client = old_client;
    /* performEvictions may flush slave output buffers. This may
     * result in a slave, that may be the active client, to be
     * freed. */
    /*  如果客户端断开连接，则返回 C_ERR；否则返回 C_OK */ 
    return deadclient ? C_ERR : C_OK;
}
```

### processInputBuffer

表示是否处于执行某个长时间命令的状态

```c
int processInputBuffer(client *c) {
    /* Keep processing while there is something in the input buffer */
    /* 遍历客户端输入缓冲区 */
    while(c->qb_pos < sdslen(c->querybuf)) {
        /* Immediately abort if the client is in the middle of something. */
        /* 客户端处于阻塞状态，直接退出循环，例如 BLPOP、BRPOP、BRPOPLPUSH 等 */
        if (c->flags & CLIENT_BLOCKED) break;

        /* Don't process more buffers from clients that have already pending
         * commands to execute in c->argv. */
        /* 判断当前客户端处于等待执行命令的状态，直接退出循环 */ 
        if (c->flags & CLIENT_PENDING_COMMAND) break;

        /* Don't process input from the master while there is a busy script
         * condition on the slave. We want just to accumulate the replication
         * stream (instead of replying -BUSY like we do with other clients) and
         * later resume the processing. */
        /* 如果当前客户端既满足执行某个长时间命令的条件，又满足是主节点的条件，则跳出循环 */ 
        if (isInsideYieldingLongCommand() && c->flags & CLIENT_MASTER) break;

        /* CLIENT_CLOSE_AFTER_REPLY closes the connection once the reply is
         * written to the client. Make sure to not let the reply grow after
         * this flag has been set (i.e. don't process more commands).
         *
         * The same applies for clients we want to terminate ASAP. */
        /* 客户端请求要求在回复之后立即关闭连接，直接退出循环 */ 
        if (c->flags & (CLIENT_CLOSE_AFTER_REPLY|CLIENT_CLOSE_ASAP)) break;

        /* Determine request type when unknown. */
        /* 确定请求类型 */
        if (!c->reqtype) {
            if (c->querybuf[c->qb_pos] == '*') {
                /* 多条批量协议 */
                c->reqtype = PROTO_REQ_MULTIBULK;
            } else {
                /* 单行协议 */
                c->reqtype = PROTO_REQ_INLINE;
            }
        }
        /* 根据不同的客户端请求类型，这里会分别调用processInlineBuffer或者processMultibulkBuffer来处理输入缓冲区中存储的命令请求
         * 如果返回值为 C_OK 则继续执行，否则退出当前循环说明还不能够解析出一条完整的命令 */
        if (c->reqtype == PROTO_REQ_INLINE) {
            if (processInlineBuffer(c) != C_OK) break;
        } else if (c->reqtype == PROTO_REQ_MULTIBULK) {
            if (processMultibulkBuffer(c) != C_OK) break;
        } else {
            /* 未知的协议类型 */
            serverPanic("Unknown request type");
        }

        /* Multibulk processing could see a <= 0 length. */
        /* 如果当前请求中没有合法参数，即 argc 为0，则重置客户端状态并开始等待下一次读取数据 */
        if (c->argc == 0) {
            resetClient(c);
        } else {
            /* If we are in the context of an I/O thread, we can't really
             * execute the command here. All we can do is to flag the client
             * as one that needs to process the command. */
            /* 如果 io_threads_op 为非空闲状态，即 I/O 线程正在进行异步网络 I/O 操作，此时主线程不应该执行命令
             * 如果主线执行可能导致，命令重复执行、资源竞争导致死锁、数据出错
             * 为了避免这些问题，主线程在 I/O 线程工作期间不应该执行命令。而是应该先将客户端请求加入到任务队列中，等待 I/O 线程异步处理完毕后再执行响应的回调函数，
             * 避免数据的重复操作和并发访问问题。这样可以确保 Redis 实例的正确性，并提高整个系统的并发处理效率 */
            if (io_threads_op != IO_THREADS_OP_IDLE) {
                serverAssert(io_threads_op == IO_THREADS_OP_READ);
                c->flags |= CLIENT_PENDING_COMMAND;
                break;
            }

            /* We are finally ready to execute the command. */
            /* 执行命令 */
            if (processCommandAndResetClient(c) == C_ERR) {
                /* If the client is no longer valid, we avoid exiting this
                 * loop and trimming the client buffer later. So we return
                 * ASAP in that case. */
                return C_ERR;
            }
        }
    }

    if (c->flags & CLIENT_MASTER) {
        /* If the client is a master, trim the querybuf to repl_applied,
         * since master client is very special, its querybuf not only
         * used to parse command, but also proxy to sub-replicas.
         *
         * Here are some scenarios we cannot trim to qb_pos:
         * 1. we don't receive complete command from master
         * 2. master client blocked cause of client pause
         * 3. io threads operate read, master client flagged with CLIENT_PENDING_COMMAND
         *
         * In these scenarios, qb_pos points to the part of the current command
         * or the beginning of next command, and the current command is not applied yet,
         * so the repl_applied is not equal to qb_pos. */
        if (c->repl_applied) {
            sdsrange(c->querybuf,c->repl_applied,-1);
            c->qb_pos -= c->repl_applied;
            c->repl_applied = 0;
        }
    } else if (c->qb_pos) {
        /* Trim to pos */
        sdsrange(c->querybuf,c->qb_pos,-1);
        c->qb_pos = 0;
    }

    /* Update client memory usage after processing the query buffer, this is
     * important in case the query buffer is big and wasn't drained during
     * the above loop (because of partially sent big commands). */
    if (io_threads_op == IO_THREADS_OP_IDLE)
        updateClientMemUsageAndBucket(c);

    return C_OK;
}
```

### readQueryFromClient

读取客户端发送的请求命令的函数

```c
void readQueryFromClient(connection *conn) {
    /* 从连接中获取client对象 */
    client *c = connGetPrivateData(conn);
    /* nread表示本次读取的字节数，big_arg表示是否为multi-bulk request中的大块参数 */
    int nread, big_arg = 0;
    size_t qblen, readlen;

    /* Check if we want to read from the client later when exiting from
     * the event loop. This is the case if threaded I/O is enabled. */
    /* 如果启用了线程IO，则此处判断是否需要推迟从客户端读取数据 */ 
    if (postponeClientRead(c)) return;

    /* Update total number of reads on server */
    /* 增加服务端已处理请求数统计项 */
    atomicIncr(server.stat_total_reads_processed, 1);
    /* 单次读取数据的最大值 16K  */
    readlen = PROTO_IOBUF_LEN;
    /* If this is a multi bulk request, and we are processing a bulk reply
     * that is large enough, try to maximize the probability that the query
     * buffer contains exactly the SDS string representing the object, even
     * at the risk of requiring more read(2) calls. This way the function
     * processMultiBulkBuffer() can avoid copying buffers to create the
     * Redis Object representing the argument. */
    /* c->reqtype == PROTO_REQ_MULTIBULK 表示当前正在处理多条命令请求
     * c->multibulklen 表示还有多少部分需要处理，即还有多少命令需要读取
     * c->bulklen != -1 ，表示当前正在处理一个bulk参数
     * c->bulklen >= PROTO_MBULK_BIG_ARG，表示当前bulk参数请求超过了PROTO_MBULK_BIG_ARG
     * 如果上述条件全部满足，则将big_arg设为1，以启用“非贪婪”模式创建querybuf。后续的processMultiBulkBuffer()函数将会在querybuf的原地缓冲区上直接构建相应的Redis对象，
     * 而不是使用缓冲区间的复制等操作，在保证数据准确无误的前提下进一步优化多条请求的解析效率和响应速度
     */
    if (c->reqtype == PROTO_REQ_MULTIBULK && c->multibulklen && c->bulklen != -1
        && c->bulklen >= PROTO_MBULK_BIG_ARG)
    {   
        /* 检查当前读取的bulk参数是否已经读取完毕，没有则返回剩余长度 */
        ssize_t remaining = (size_t)(c->bulklen+2)-(sdslen(c->querybuf)-c->qb_pos);
        big_arg = 1;

        /* Note that the 'remaining' variable may be zero in some edge case,
         * for example once we resume a blocked client after CLIENT PAUSE. */
        if (remaining > 0) readlen = remaining;

        /* Master client needs expand the readlen when meet BIG_ARG(see #9100),
         * but doesn't need align to the next arg, we can read more data. */
        /* 设置主节点客户端的最小读取长度。当通信协议为 Redis 主从复制协议并且从客户端所读取的数据长度小于 PROTO_IOBUF_LEN 时，
         * 服务器将强制从主节点读取的最小数据长度设置为PROTO_IOBUF_LEN，服务器将把必要数据都以 PROTO_IOBUF_LEN 的长度一次性返回给从节点，提高网络带宽的利用率 */
        if (c->flags & CLIENT_MASTER && readlen < PROTO_IOBUF_LEN)
            readlen = PROTO_IOBUF_LEN;
    }
    /* 获取当前输入缓存区的长度 */
    qblen = sdslen(c->querybuf);
    /* 如果读取长度较小且不是master节点客户端，则会使用非贪心型的缓存扩容方法sdsMakeRoomForNonGreedy，即只为缓存分配恰好所需的空间 */
    if (!(c->flags & CLIENT_MASTER) && // master client's querybuf can grow greedy.
        (big_arg || sdsalloc(c->querybuf) < PROTO_IOBUF_LEN)) {
        /* When reading a BIG_ARG we won't be reading more than that one arg
         * into the query buffer, so we don't need to pre-allocate more than we
         * need, so using the non-greedy growing. For an initial allocation of
         * the query buffer, we also don't wanna use the greedy growth, in order
         * to avoid collision with the RESIZE_THRESHOLD mechanism. */
        c->querybuf = sdsMakeRoomForNonGreedy(c->querybuf, readlen);
        /* We later set the peak to the used portion of the buffer, but here we over
         * allocated because we know what we need, make sure it'll not be shrunk before used. */
        /* 如果当前查询缓冲区的峰值比读取长度（即 readlen）和当前查询缓冲区长度之和小，则认为当前查询缓冲区的峰值便是二者之和。 */
        if (c->querybuf_peak < qblen + readlen) c->querybuf_peak = qblen + readlen;
    } else {
        /* 贪婪模式，会扩容成（现有长度+readlen）的2倍 */
        c->querybuf = sdsMakeRoomFor(c->querybuf, readlen);

        /* Read as much as possible from the socket to save read(2) system calls. */
        /* 这里尽量从套接字 socket 中一次性读取尽可能多的数据以避免频繁的 I/O 系统调用提高程序效率  */
        readlen = sdsavail(c->querybuf);
    }
    /* 从连接（对应socket或unix中的read方法）中读取数据，并存储到客户端的查询缓冲区，返回实际读取的数据长度
     * qblen 是当前查询缓冲区中已有的数据长度，readlen 则是要从连接中最多读取的数据长度，nread 表示实际读取的数据长度 */
    nread = connRead(c->conn, c->querybuf+qblen, readlen);
    /* 如果返回 -1 表示发生了错误 */
    if (nread == -1) {
        if (connGetState(conn) == CONN_STATE_CONNECTED) {
            return;
        } else {
            /* 客户端状态不为已连接则释放客户端以关闭连接 */
            serverLog(LL_VERBOSE, "Reading from client: %s",connGetLastError(c->conn));
            freeClientAsync(c);
            goto done;
        }
    } else if (nread == 0) {
        /* 如果 nread 的值为 0，表示收到了一个空数据包（EOF），输出日志信息，并将客户端对象进行释放以关闭连接 */
        if (server.verbosity <= LL_VERBOSE) {
            sds info = catClientInfoString(sdsempty(), c);
            serverLog(LL_VERBOSE, "Client closed connection %s", info);
            sdsfree(info);
        }
        freeClientAsync(c);
        goto done;
    }
    /* 调整查询缓冲区的长度 */
    sdsIncrLen(c->querybuf,nread);
    /* 返回缓存区的数据长度 */
    qblen = sdslen(c->querybuf);
    if (c->querybuf_peak < qblen) c->querybuf_peak = qblen;
    /* 记录最新的交互时间 */
    c->lastinteraction = server.unixtime;
    /* 客户端标识判断是否累加网络输入流量 */
    if (c->flags & CLIENT_MASTER) {
        c->read_reploff += nread;
        atomicIncr(server.stat_net_repl_input_bytes, nread);
    } else {
        atomicIncr(server.stat_net_input_bytes, nread);
    }
    /* 如果不是主节点 CLIENT_MASTER 且 querybuf 的长度超过了 server.client_max_querybuf_len变量定义的阈值，
     * 则会记录一些信息（client info 和一部分内容），输出警告日志并关闭该客户端连接 */
    if (!(c->flags & CLIENT_MASTER) && sdslen(c->querybuf) > server.client_max_querybuf_len) {
        sds ci = catClientInfoString(sdsempty(),c), bytes = sdsempty();

        bytes = sdscatrepr(bytes,c->querybuf,64);
        serverLog(LL_WARNING,"Closing client that reached max query buffer length: %s (qbuf initial bytes: %s)", ci, bytes);
        sdsfree(ci);
        sdsfree(bytes);
        freeClientAsync(c);
        goto done;
    }

    /* There is more data in the client input buffer, continue parsing it
     * and check if there is a full command to execute. */
    /* 尝试是否能解析一个完整的命令出来 */ 
    if (processInputBuffer(c) == C_ERR)
         c = NULL;

done:
    /* 处理下一个客户端 */
    beforeNextClient(c);
}
```

### IOThreadMain

I/O 线程的入口函数，主要功能是处理客户端的读写请求，确保Redis服务器能够快速响应客户端请求并保持高性能和可扩展性。

```c
void *IOThreadMain(void *myid) {
    /* The ID is the thread number (from 0 to server.io_threads_num-1), and is
     * used by the thread to just manipulate a single sub-array of clients. */
    long id = (unsigned long)myid;
    char thdname[16];

    /*
     * 设置线程名称，并将CPU亲和度设置为server_cpulist中指定的CPU列表。
     * 这可以提高系统资源利用率，因为I/O线程主要依赖CPU处理客户端请求，
     * 界面不涉及到CPU计算操作时，也可自动进入休眠模式，以减少 CPU 开销和功耗消耗。
     */
    snprintf(thdname, sizeof(thdname), "io_thd_%ld", id);
    redis_set_thread_title(thdname);
    redisSetCpuAffinity(server.server_cpulist);
    /* 设置线程可取消，使得当 Redis 服务器关闭时，能够快速退出线程并释放已申请的内存资源 */
    makeThreadKillable();

    while(1) {
        /* Wait for start */
        /* 这段代码通过一个简单的 for 循环，来轮询等待 I/O 任务队列是否有等待任务存在。
         * 如果等待队列中存在任务，则立即退出循环，并开始处理等待队列中的客户端请求。
         * 否则继续等待，直至超时或等待队列中出现请求任务才能被唤醒。 */ 
        for (int j = 0; j < 1000000; j++) {
            if (getIOPendingCount(id) != 0) break;
        }

        /* Give the main thread a chance to stop this thread. */
        /* 如果要待处理的客户端数量为 0 */
        if (getIOPendingCount(id) == 0) {
            /* 阻塞在这里，等待主线程解锁去唤醒 */
            pthread_mutex_lock(&io_threads_mutex[id]);
            pthread_mutex_unlock(&io_threads_mutex[id]);
            continue;
        }

        serverAssert(getIOPendingCount(id) != 0);

        /* Process: note that the main thread will never touch our list
         * before we drop the pending count to 0. */
        listIter li;
        listNode *ln;
        /* 拿到线程分到的待处理客户端
         * 处理过程中主线程不会访问这些客户端请求，因此无需考虑线程安全和同步问题
         */
        listRewind(io_threads_list[id],&li);
        /* 不断取双端链表的节点直到取完 */
        while((ln = listNext(&li))) {
            /* 从客户端列表中获取一个客户端 */
            client *c = listNodeValue(ln);
            /* 线程是写操作，调用 writeToClient 将数据写回客户端 */
            if (io_threads_op == IO_THREADS_OP_WRITE) {
                writeToClient(c,0);
            /* 如果是读操作，调用 readQueryFromClient 从客户端读数据 */    
            } else if (io_threads_op == IO_THREADS_OP_READ) {
                readQueryFromClient(c->conn);
            } else {
                serverPanic("io_threads_op value is unknown");
            }
        }
        /* 处理完所有客户端，清空该线程的客户端列表 */
        listEmpty(io_threads_list[id]);
        /* 将该线程的待处理任务数量设为 0 */
        setIOPendingCount(id, 0);
    }
}
```

### initThreadedIO

初始化多 IO 线程

```c
/* Initialize the data structures needed for threaded I/O. */
void initThreadedIO(void) {
    /* 初始化时，没有io线程处于活跃状态 */
    server.io_threads_active = 0; /* We start with threads not active. */

    /* Indicate that io-threads are currently idle */
    /* 初始值设为"空闲" */
    io_threads_op = IO_THREADS_OP_IDLE;

    /* Don't spawn any thread if the user selected a single thread:
     * we'll handle I/O directly from the main thread. */
    /* 如果只配置了一个IO线程，我们直接用主线程处理 I/O */
    if (server.io_threads_num == 1) return;
    /* 如果配置的线程数超出上限，打印错误日志并退出程序 */
    if (server.io_threads_num > IO_THREADS_MAX_NUM) {
        serverLog(LL_WARNING,"Fatal: too many I/O threads configured. "
                             "The maximum number is %d.", IO_THREADS_MAX_NUM);
        exit(1);
    }

    /* Spawn and initialize the I/O threads. */
    /* 生成并初始化I/O线程 */
    for (int i = 0; i < server.io_threads_num; i++) {
        /* Things we do for all the threads including the main thread. */
        io_threads_list[i] = listCreate();
        /* i == 0 表示主IO线程 */
        if (i == 0) continue; /* Thread 0 is the main thread. */

        /* Things we do only for the additional threads. */
        pthread_t tid;
        /* 初始化互斥锁变量 */
        pthread_mutex_init(&io_threads_mutex[i],NULL);
        /* 初始化还没处理的任务个数 */
        setIOPendingCount(i, 0);
        /* 主线程在启动 I/O 线程的时候会默认占用io互斥锁资源，直到有 I/O 任务主线程才会释放互斥资源，从而达到I/O线程开启工作 */
        pthread_mutex_lock(&io_threads_mutex[i]); /* Thread will be stopped. */
        /* 启动线程，进入 I/O 线程的主逻辑函数 IOThreadMain */
        if (pthread_create(&tid,NULL,IOThreadMain,(void*)(long)i) != 0) {
            /* 如果创建失败，打印错误日志并退出程序 */
            serverLog(LL_WARNING,"Fatal: Can't initialize IO thread.");
            exit(1);
        }
        /* 设置线程ID */
        io_threads[i] = tid;
    }
}
```
