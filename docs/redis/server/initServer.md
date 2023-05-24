# initServer

[参考](https://juejin.cn/post/7219925045228437562)

```c
void initServer(void) {
    int j;
    /* Redis服务器接收到SIGHUP信号时，它不会做任何事情。 */
    signal(SIGHUP, SIG_IGN);
    /* 忽略对于管道/套接字等读取端已经关闭的写入操作而产生的SIGPIPE信号 */
    signal(SIGPIPE, SIG_IGN);
    /* 信号处理 */
    setupSignalHandlers();
    /* 当前线程标记为可被取消的状态 */
    makeThreadKillable();

    if (server.syslog_enabled) {
        openlog(server.syslog_ident, LOG_PID | LOG_NDELAY | LOG_NOWAIT,
            server.syslog_facility);
    }

    /* Initialization after setting defaults from the config system. */
    /* 标志是否启用 AOF（Append Only File）持久化，初始化为启用或禁用状态 */
    server.aof_state = server.aof_enabled ? AOF_ON : AOF_OFF;
    server.fsynced_reploff = server.aof_enabled ? 0 : -1;
    /* 服务器的运行频率，即每秒执行的事件循环次数 */
    server.hz = server.config_hz;
    server.pid = getpid();
    /* 标记当前进程是否为子进程，初始为 NONE */
    server.in_fork_child = CHILD_TYPE_NONE;
    /* Redis 服务器的主线程 ID */
    server.main_thread_id = pthread_self();
    /* 当前客户端，初始为 NULL */
    server.current_client = NULL;
    server.errors = raxNew();
    server.execution_nesting = 0;
    /* 存储所有已连接的客户端 */
    server.clients = listCreate();
    /* 用于快速查找客户端 */
    server.clients_index = raxNew();
    /* 存储待关闭的客户端 */
    server.clients_to_close = listCreate();
    /* 存储所有从服务器 */
    server.slaves = listCreate();
    /* 存储所有 MONITOR 客户端 */
    server.monitors = listCreate();
    /* 存储需要写入数据的客户端 */
    server.clients_pending_write = listCreate();
    /* 待处理的客户端的请求数据队列（需要进行协议解析等操作） */
    server.clients_pending_read = listCreate();
    /* 存储客户端的超时时间 */
    server.clients_timeout_table = raxNew();
    server.replication_allowed = 1;
    server.slaveseldb = -1; /* Force to emit the first SELECT command. */
    server.unblocked_clients = listCreate();
    server.ready_keys = listCreate();
    server.tracking_pending_keys = listCreate();
    server.clients_waiting_acks = listCreate();
    server.get_ack_from_slaves = 0;
    server.paused_actions = 0;
    memset(server.client_pause_per_purpose, 0,
           sizeof(server.client_pause_per_purpose));
    server.postponed_clients = listCreate();
    server.events_processed_while_blocked = 0;
    server.system_memory_size = zmalloc_get_memory_size();
    server.blocked_last_cron = 0;
    server.blocking_op_nesting = 0;
    server.thp_enabled = 0;
    server.cluster_drop_packet_filter = -1;
    server.reply_buffer_peak_reset_time = REPLY_BUFFER_DEFAULT_PEAK_RESET_TIME;
    server.reply_buffer_resizing_enabled = 1;
    server.client_mem_usage_buckets = NULL;
    /* 重置服务器缓冲区 */
    resetReplicationBuffer();

    /* Make sure the locale is set on startup based on the config file. */
    if (setlocale(LC_COLLATE,server.locale_collate) == NULL) {
        serverLog(LL_WARNING, "Failed to configure LOCALE for invalid locale name.");
        exit(1);
    }
    /* 创建共享对象（可以减少内存占用和提高性能） */
    createSharedObjects();
    /* 调整文件描述符限制 */
    adjustOpenFilesLimit();
    const char *clk_msg = monotonicInit();
    serverLog(LL_NOTICE, "monotonic clock: %s", clk_msg);
    /* 创建事件循环对象 */
    server.el = aeCreateEventLoop(server.maxclients+CONFIG_FDSET_INCR);
    if (server.el == NULL) {
        serverLog(LL_WARNING,
            "Failed creating the event loop. Error message: '%s'",
            strerror(errno));
        exit(1);
    }
    /* 为redis的db分配内存（默认16个db） */
    server.db = zmalloc(sizeof(redisDb)*server.dbnum);

    /* Create the Redis databases, and initialize other internal state. */
    for (j = 0; j < server.dbnum; j++) {
        /* 给当前数据库创建一个字典结构，并使用预定义类型dbDictType */
        server.db[j].dict = dictCreate(&dbDictType);
        server.db[j].expires = dictCreate(&dbExpiresDictType);
        server.db[j].expires_cursor = 0;
        server.db[j].blocking_keys = dictCreate(&keylistDictType);
        server.db[j].blocking_keys_unblock_on_nokey = dictCreate(&objectKeyPointerValueDictType);
        server.db[j].ready_keys = dictCreate(&objectKeyPointerValueDictType);
        /* 给当前数据库创建一个存储被当前客户端所监视的键的列表，并使用预定义类型keylistDictType */
        server.db[j].watched_keys = dictCreate(&keylistDictType);
        /* 给当前数据库设置编号 */
        server.db[j].id = j;
        server.db[j].avg_ttl = 0;
        server.db[j].defrag_later = listCreate();
        server.db[j].slots_to_keys = NULL; /* Set by clusterInit later on if necessary. */
        listSetFreeMethod(server.db[j].defrag_later,(void (*)(void*))sdsfree);
    }
    /* 初始化LRU淘汰池 */
    evictionPoolAlloc(); /* Initialize the LRU keys pool. */
    server.pubsub_channels = dictCreate(&keylistDictType);
    server.pubsub_patterns = dictCreate(&keylistDictType);
    server.pubsubshard_channels = dictCreate(&keylistDictType);
    server.cronloops = 0;
    server.in_exec = 0;
    server.busy_module_yield_flags = BUSY_MODULE_YIELD_NONE;
    server.busy_module_yield_reply = NULL;
    server.client_pause_in_transaction = 0;
    server.child_pid = -1;
    server.child_type = CHILD_TYPE_NONE;
    server.rdb_child_type = RDB_CHILD_TYPE_NONE;
    server.rdb_pipe_conns = NULL;
    server.rdb_pipe_numconns = 0;
    server.rdb_pipe_numconns_writing = 0;
    server.rdb_pipe_buff = NULL;
    server.rdb_pipe_bufflen = 0;
    server.rdb_bgsave_scheduled = 0;
    server.child_info_pipe[0] = -1;
    server.child_info_pipe[1] = -1;
    server.child_info_nread = 0;
    server.aof_buf = sdsempty();
    server.lastsave = time(NULL); /* At startup we consider the DB saved. */
    server.lastbgsave_try = 0;    /* At startup we never tried to BGSAVE. */
    server.rdb_save_time_last = -1;
    server.rdb_save_time_start = -1;
    server.rdb_last_load_keys_expired = 0;
    server.rdb_last_load_keys_loaded = 0;
    server.dirty = 0;
    resetServerStats();
    /* A few stats we don't want to reset: server startup time, and peak mem. */
    server.stat_starttime = time(NULL);
    server.stat_peak_memory = 0;
    server.stat_current_cow_peak = 0;
    server.stat_current_cow_bytes = 0;
    server.stat_current_cow_updated = 0;
    server.stat_current_save_keys_processed = 0;
    server.stat_current_save_keys_total = 0;
    server.stat_rdb_cow_bytes = 0;
    server.stat_aof_cow_bytes = 0;
    server.stat_module_cow_bytes = 0;
    server.stat_module_progress = 0;
    for (int j = 0; j < CLIENT_TYPE_COUNT; j++)
        server.stat_clients_type_memory[j] = 0;
    server.stat_cluster_links_memory = 0;
    server.cron_malloc_stats.zmalloc_used = 0;
    server.cron_malloc_stats.process_rss = 0;
    server.cron_malloc_stats.allocator_allocated = 0;
    server.cron_malloc_stats.allocator_active = 0;
    server.cron_malloc_stats.allocator_resident = 0;
    server.lastbgsave_status = C_OK;
    server.aof_last_write_status = C_OK;
    server.aof_last_write_errno = 0;
    server.repl_good_slaves_count = 0;
    server.last_sig_received = 0;

    /* Initiate acl info struct */
    server.acl_info.invalid_cmd_accesses = 0;
    server.acl_info.invalid_key_accesses  = 0;
    server.acl_info.user_auth_failures = 0;
    server.acl_info.invalid_channel_accesses = 0;

    /* Create the timer callback, this is our way to process many background
     * operations incrementally, like clients timeout, eviction of unaccessed
     * expired keys and so forth. */
    /* 创建一个时间事件，这个定时器事件每秒会执行一次serverCron函数，用于执行一些周期性的任务，例如检查过期键值对、清理过期数据等。 */ 
    if (aeCreateTimeEvent(server.el, 1, serverCron, NULL, NULL) == AE_ERR) {
        /* 如果创建定时器事件失败（返回AE_ERR），那么服务器将调用serverPanic函数进入崩溃状态，并退出程序。 */
        serverPanic("Can't create event loop timers.");
        exit(1);
    }

    /* Register a readable event for the pipe used to awake the event loop
     * from module threads. */
    /* 通过 aeCreateFileEvent 函数注册一个将 server.module_pipe[0] 文件描述符上的可读事件与 modulePipeReadable() 事件处理器函数关联起来的事件。
     * 当 server.module_pipe[0] 上有可读数据时，就会触发 modulePipeReadable() 函数被调用，接着根据管道缓冲区内是否还有未处理的数据来判断后续要做什么操作。
     * 这段代码主要是为 Redis 加载的模块与 Redis 核心提供相互通信之用，
     * 因为 Redis 模块加载器（Redis Module Loader）是通过 Unix 域套接字（Unix Domain Socket）与 Redis 服务器通信的。 */ 
    if (aeCreateFileEvent(server.el, server.module_pipe[0], AE_READABLE,
        modulePipeReadable,NULL) == AE_ERR) {
            serverPanic(
                "Error registering the readable event for the module pipe.");
    }

    /* Register before and after sleep handlers (note this needs to be done
     * before loading persistence since it is used by processEventsWhileBlocked. */
    /* 注册事件驱动框架的钩子函数，事件循环器在每次阻塞前后都会调用钩子函数 */ 
    aeSetBeforeSleepProc(server.el,beforeSleep);
    aeSetAfterSleepProc(server.el,afterSleep);

    /* 32 bit instances are limited to 4GB of address space, so if there is
     * no explicit limit in the user provided configuration we set a limit
     * at 3 GB using maxmemory with 'noeviction' policy'. This avoids
     * useless crashes of the Redis instance for out of memory. */
    /* 如果 Redis 运行在 32 位操作系统上，由于 32 位操作系统内存空间限制为 4GB，所以将 Redis 使用内存限制为 3GB，避免 Redis 服务器因内存不足而崩溃。. */
    if (server.arch_bits == 32 && server.maxmemory == 0) {
        serverLog(LL_WARNING,"Warning: 32 bit instance detected but no memory limit set. Setting 3 GB maxmemory limit with 'noeviction' policy now.");
        server.maxmemory = 3072LL*(1024*1024); /* 3 GB */
        server.maxmemory_policy = MAXMEMORY_NO_EVICTION;
    }

    /* 初始化LUA机制 */
    scriptingInit(1);
    /* 初始化Function机制 */
    functionsInit();
    /* 初始化慢日志机制 */
    slowlogInit();
    /* 初始化延迟监控机制 */
    latencyMonitorInit();

    /* Initialize ACL default password if it exists */
    ACLUpdateDefaultUserPassword(server.requirepass);
    /* 用于启用或禁用Redis的看门狗程序。看门狗程序是一个定期的任务，用于检查Redis是否处于假死状态，如果是，则通过发送SIGUSR1信号重启Redis进程 */
    applyWatchdogPeriod();
    /* 否设置了客户端的最大内存使用限制
     * 如果设置了，就会调用 initServerClientMemUsageBuckets() 函数来初始化一个用于记录客户端内存使用情况的数据结构。
     * 该函数会在 dict.c 文件中定义。在启用了客户端内存限制后，服务器会定期检查客户端的内存使用情况，并在客户端使用的内存超出限制时，
     * 通过断开与客户端的连接来保证服务器的稳定性。 */
    if (server.maxmemory_clients != 0)
        initServerClientMemUsageBuckets();
}
```
