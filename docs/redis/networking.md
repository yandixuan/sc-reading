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
    c->querybuf = sdsempty();
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
        /* 检查当前读取的bulk参数是否已经读取完毕 */
        ssize_t remaining = (size_t)(c->bulklen+2)-(sdslen(c->querybuf)-c->qb_pos);
        big_arg = 1;

        /* Note that the 'remaining' variable may be zero in some edge case,
         * for example once we resume a blocked client after CLIENT PAUSE. */
        if (remaining > 0) readlen = remaining;

        /* Master client needs expand the readlen when meet BIG_ARG(see #9100),
         * but doesn't need align to the next arg, we can read more data. */
        /* 客户端连接对象c的属性flags中是否包含CLIENT_MASTER标志位。若包含，
         * 则说明当前连接是一个master节点与slave节点之间的连接，可以看作是一个长连接 
         * 若小于，则说明当前读取缓存的空间不足以容纳一条完整的命令请求数据，需要进行扩容。
         * 将readlen的长度设置为PROTO_IOBUF_LEN。该操作保证了每次读取的数据长度至少为PROTO_IOBUF_LEN，
         * 可以避免因待读取的数据过长而导致的读取缓存溢出问题。 */ 
        if (c->flags & CLIENT_MASTER && readlen < PROTO_IOBUF_LEN)
            readlen = PROTO_IOBUF_LEN;
    }

    qblen = sdslen(c->querybuf);
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
        if (c->querybuf_peak < qblen + readlen) c->querybuf_peak = qblen + readlen;
    } else {
        c->querybuf = sdsMakeRoomFor(c->querybuf, readlen);

        /* Read as much as possible from the socket to save read(2) system calls. */
        readlen = sdsavail(c->querybuf);
    }
    nread = connRead(c->conn, c->querybuf+qblen, readlen);
    if (nread == -1) {
        if (connGetState(conn) == CONN_STATE_CONNECTED) {
            return;
        } else {
            serverLog(LL_VERBOSE, "Reading from client: %s",connGetLastError(c->conn));
            freeClientAsync(c);
            goto done;
        }
    } else if (nread == 0) {
        if (server.verbosity <= LL_VERBOSE) {
            sds info = catClientInfoString(sdsempty(), c);
            serverLog(LL_VERBOSE, "Client closed connection %s", info);
            sdsfree(info);
        }
        freeClientAsync(c);
        goto done;
    }

    sdsIncrLen(c->querybuf,nread);
    qblen = sdslen(c->querybuf);
    if (c->querybuf_peak < qblen) c->querybuf_peak = qblen;

    c->lastinteraction = server.unixtime;
    if (c->flags & CLIENT_MASTER) {
        c->read_reploff += nread;
        atomicIncr(server.stat_net_repl_input_bytes, nread);
    } else {
        atomicIncr(server.stat_net_input_bytes, nread);
    }

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
    if (processInputBuffer(c) == C_ERR)
         c = NULL;

done:
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
