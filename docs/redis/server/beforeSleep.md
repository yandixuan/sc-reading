
# beforeSleep

[事件循环执行`aeApiPoll`前调用](../ae#aeProcessEvents)

:::tip todo

- 淘汰过期的key
- unblock client
- 多线程处理I/O读写
- 关闭一些内存占用过大的连接
- 释放 modules 锁 (moduleReleaseGIL), redis框架对数据已经完成读写，允许用户自行实现的模块进行操作
:::

```c
void beforeSleep(struct aeEventLoop *eventLoop) {
    /* 取消未使用的参数警告 */
    UNUSED(eventLoop);
    /* 记录 zmalloc 已经使用多少内存，如果超过峰值则更新 */
    size_t zmalloc_used = zmalloc_used_memory();
    if (zmalloc_used > server.stat_peak_memory)
        server.stat_peak_memory = zmalloc_used;

    /* Just call a subset of vital functions in case we are re-entering
     * the event loop from processEventsWhileBlocked(). Note that in this
     * case we keep track of the number of events we are processing, since
     * processEventsWhileBlocked() wants to stop ASAP if there are no longer
     * events to handle. */
    /* 在 RDB/AOF 加载期间处理客户端，processEventsWhileBlocked会调用aeProcessEvents方法
     * 我们不希望执行所有操作（例如，我们不想过期键） */
    if (ProcessingEventsWhileBlocked) {
        /* 统计已经处理的事件数量，初始值为 0。*/
        uint64_t processed = 0;
        /* 处理待读取的客户端请求，并将处理的请求数量加入统计结果中。*/
        processed += handleClientsWithPendingReadsUsingThreads();
        /* 处理连接类型的待处理数据，并将处理的任务数量加入统计结果中。*/
        processed += connTypeProcessPendingData();
        /* 如果 AOF 功能处于开启或等待重写状态，则将 AOF 文件刷新到磁盘。 */
        if (server.aof_state == AOF_ON || server.aof_state == AOF_WAIT_REWRITE)
            flushAppendOnlyFile(0);
        /* 处理待写入客户端请求（即向客户端发送响应），并将处理的请求数量加入统计结果中。*/
        processed += handleClientsWithPendingWrites();
        /* 释放异步空闲队列中的客户端，并将处理的客户端数量加入统计结果中。 */
        processed += freeClientsInAsyncFreeQueue();
        /* 更新已处理事件计数。 */
        server.events_processed_while_blocked += processed;
        return;
    }

    /* Handle precise timeouts of blocked clients. */
    /* 处理被阻塞客户端的精确超时时间 */
    handleBlockedClientsTimeout();

    /* We should handle pending reads clients ASAP after event loop. */
    /* 在事件循环后应尽快处理待读取的客户端请求 */
    handleClientsWithPendingReadsUsingThreads();

    /* Handle pending data(typical TLS). (must be done before flushAppendOnlyFile) */
    /* 处理连接类型为 TLS 的待处理数据（如 TLS 握手协议），必须在 AOF 刷新之前完成 */
    connTypeProcessPendingData();

    /* If any connection type(typical TLS) still has pending unread data don't sleep at all. */
    /* 如果任何连接类型（通常是 TLS）仍有挂起的未读数据，则不休眠。 */
    aeSetDontWait(server.el, connTypeHasPendingData());

    /* Call the Redis Cluster before sleep function. Note that this function
     * may change the state of Redis Cluster (from ok to fail or vice versa),
     * so it's a good idea to call it before serving the unblocked clients
     * later in this function. */
    /* 调用 Redis Cluster 的休眠前函数
     * 需要注意的是，此函数可能会改变 Redis Cluster 的状态（从正常到故障或反之），因此建议在服务非阻塞客户端之前调用它。*/ 
    if (server.cluster_enabled) clusterBeforeSleep();

    /* Run a fast expire cycle (the called function will return
     * ASAP if a fast cycle is not needed). */
    /* 运行一个快速过期周期（如果不需要快速周期，则调用的函数将会立即返回）。 */ 
    if (server.active_expire_enabled && iAmMaster())
        activeExpireCycle(ACTIVE_EXPIRE_CYCLE_FAST);

    /* Unblock all the clients blocked for synchronous replication
     * in WAIT or WAITAOF. */
    /* 解除" WAIT "或" WAITAOF "同步复制中阻止的所有客户端。*/ 
    if (listLength(server.clients_waiting_acks))
        processClientsWaitingReplicas();

    /* Check if there are clients unblocked by modules that implement
     * blocking commands. */
    /* 检查是否有由实现阻塞命令的模块，并且解除阻止的客户端。*/
    if (moduleCount()) {
        /* REDISMODULE_SUBEVENT_EVENTLOOP_BEFORE_SLEEP表示子事件类型为事件循环前休眠（即在事件循环每次进入休眠之前触发的事件） */
        moduleFireServerEvent(REDISMODULE_EVENT_EVENTLOOP,
                              REDISMODULE_SUBEVENT_EVENTLOOP_BEFORE_SLEEP,
                              NULL);
        moduleHandleBlockedClients();
    }

    /* Try to process pending commands for clients that were just unblocked. */
    /* 尝试处理刚解除阻止的客户端的挂起命令。*/
    if (listLength(server.unblocked_clients))
        processUnblockedClients();

    /* Send all the slaves an ACK request if at least one client blocked
     * during the previous event loop iteration. Note that we do this after
     * processUnblockedClients(), so if there are multiple pipelined WAITs
     * and the just unblocked WAIT gets blocked again, we don't have to wait
     * a server cron cycle in absence of other event loop events. See #6623.
     * 
     * We also don't send the ACKs while clients are paused, since it can
     * increment the replication backlog, they'll be sent after the pause
     * if we are still the master. */
    /* 检查是否需要从从节点获取 ACK（确认信息），并且当前不在暂停 replica 的操作中 */ 
    if (server.get_ack_from_slaves && !isPausedActionsWithUpdate(PAUSE_ACTION_REPLICA)) {
        /* 向所有从节点发送 getack 命令 */
        sendGetackToReplicas();
        /* 重置 get_ack_from_slaves 标志位 */
        server.get_ack_from_slaves = 0;
    }

    /* We may have received updates from clients about their current offset. NOTE:
     * this can't be done where the ACK is received since failover will disconnect 
     * our clients. */
    /* 更新 failover 状态 */ 
    updateFailoverStatus();

    /* Since we rely on current_client to send scheduled invalidation messages
     * we have to flush them after each command, so when we get here, the list
     * must be empty. */
    /* 确保 tracking_pending_keys 列表中的元素为空，要在每次处理完请求之后清空 */
    serverAssert(listLength(server.tracking_pending_keys) == 0);

    /* Send the invalidation messages to clients participating to the
     * client side caching protocol in broadcasting (BCAST) mode. */
    /* 发送失效消息给客户端，用于 client side caching protocol ，广播模式 */ 
    trackingBroadcastInvalidationMessages();

    /* Try to process blocked clients every once in while.
     *
     * Example: A module calls RM_SignalKeyAsReady from within a timer callback
     * (So we don't visit processCommand() at all).
     *
     * must be done before flushAppendOnlyFile, in case of appendfsync=always,
     * since the unblocked clients may write data. */
    /* 定期检查被阻塞的 clients，尝试将它们 unblock 以便继续执行 */ 
    handleClientsBlockedOnKeys();

    /* Write the AOF buffer on disk,
     * must be done before handleClientsWithPendingWritesUsingThreads,
     * in case of appendfsync=always. */
    /* 写 AOF 缓存到磁盘，需要在 handleClientsWithPendingWritesUsingThreads 之前进行。
     * 因为写AOF是异步刷盘，如果在`handleClientsWithPendingWritesUsingThreads`之后开始进行持久化操作，在客户端请求处理完成前，Redis可能会向AOF缓存中添加一些命令，导致数据不完整或丢失。*/
    if (server.aof_state == AOF_ON || server.aof_state == AOF_WAIT_REWRITE)
        flushAppendOnlyFile(0);

    /* Update the fsynced replica offset.
     * If an initial rewrite is in progress then not all data is guaranteed to have actually been
     * persisted to disk yet, so we cannot update the field. We will wait for the rewrite to complete. */
    /* 更新 fsynced_reploff （表示复制进度的字段）*/
    if (server.aof_state == AOF_ON && server.fsynced_reploff != -1) {
        long long fsynced_reploff_pending;
        atomicGet(server.fsynced_reploff_pending, fsynced_reploff_pending);
        server.fsynced_reploff = fsynced_reploff_pending;
    }

    /* Handle writes with pending output buffers. */
    /* 处理写操作挂起的客户端 */
    handleClientsWithPendingWritesUsingThreads();

    /* Close clients that need to be closed asynchronous */
    /* 异步关闭需要关闭的 clients */
    freeClientsInAsyncFreeQueue();

    /* Incrementally trim replication backlog, 10 times the normal speed is
     * to free replication backlog as much as possible. */
    /* 递增地清除 replication backlog，在这里加速（10 倍），以尽量释放 replication backlog */ 
    if (server.repl_backlog)
        incrementalTrimReplicationBacklog(10*REPL_BACKLOG_TRIM_BLOCKS_PER_CALL);

    /* Disconnect some clients if they are consuming too much memory. */
    /* 如果某些 clients 占用了太多的内存，则将其断开连接 */
    evictClients();

    /* Before we are going to sleep, let the threads access the dataset by
     * releasing the GIL. Redis main thread will not touch anything at this
     * time. */
    /* 在 Redis 主线程进入睡眠状态之前，释放全局解释锁 GIL，使其他线程可以访问数据库 */ 
    if (moduleCount()) moduleReleaseGIL();
    /********************* WARNING ********************
     * Do NOT add anything below moduleReleaseGIL !!! *
     ***************************** ********************/
}
```
