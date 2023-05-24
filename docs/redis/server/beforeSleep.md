
# beforeSleep

在[`事件循环(ae)中调用`](../ae#aeprocessevents)

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
    if (ProcessingEventsWhileBlocked) {
        uint64_t processed = 0;
        processed += handleClientsWithPendingReadsUsingThreads();
        processed += connTypeProcessPendingData();
        if (server.aof_state == AOF_ON || server.aof_state == AOF_WAIT_REWRITE)
            flushAppendOnlyFile(0);
        processed += handleClientsWithPendingWrites();
        processed += freeClientsInAsyncFreeQueue();
        server.events_processed_while_blocked += processed;
        return;
    }

    /* Handle precise timeouts of blocked clients. */
    handleBlockedClientsTimeout();

    /* We should handle pending reads clients ASAP after event loop. */
    handleClientsWithPendingReadsUsingThreads();

    /* Handle pending data(typical TLS). (must be done before flushAppendOnlyFile) */
    connTypeProcessPendingData();

    /* If any connection type(typical TLS) still has pending unread data don't sleep at all. */
    aeSetDontWait(server.el, connTypeHasPendingData());

    /* Call the Redis Cluster before sleep function. Note that this function
     * may change the state of Redis Cluster (from ok to fail or vice versa),
     * so it's a good idea to call it before serving the unblocked clients
     * later in this function. */
    if (server.cluster_enabled) clusterBeforeSleep();

    /* Run a fast expire cycle (the called function will return
     * ASAP if a fast cycle is not needed). */
    if (server.active_expire_enabled && iAmMaster())
        activeExpireCycle(ACTIVE_EXPIRE_CYCLE_FAST);

    /* Unblock all the clients blocked for synchronous replication
     * in WAIT or WAITAOF. */
    if (listLength(server.clients_waiting_acks))
        processClientsWaitingReplicas();

    /* Check if there are clients unblocked by modules that implement
     * blocking commands. */
    if (moduleCount()) {
        moduleFireServerEvent(REDISMODULE_EVENT_EVENTLOOP,
                              REDISMODULE_SUBEVENT_EVENTLOOP_BEFORE_SLEEP,
                              NULL);
        moduleHandleBlockedClients();
    }

    /* Try to process pending commands for clients that were just unblocked. */
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
    if (server.get_ack_from_slaves && !isPausedActionsWithUpdate(PAUSE_ACTION_REPLICA)) {
        sendGetackToReplicas();
        server.get_ack_from_slaves = 0;
    }

    /* We may have received updates from clients about their current offset. NOTE:
     * this can't be done where the ACK is received since failover will disconnect 
     * our clients. */
    updateFailoverStatus();

    /* Since we rely on current_client to send scheduled invalidation messages
     * we have to flush them after each command, so when we get here, the list
     * must be empty. */
    serverAssert(listLength(server.tracking_pending_keys) == 0);

    /* Send the invalidation messages to clients participating to the
     * client side caching protocol in broadcasting (BCAST) mode. */
    trackingBroadcastInvalidationMessages();

    /* Try to process blocked clients every once in while.
     *
     * Example: A module calls RM_SignalKeyAsReady from within a timer callback
     * (So we don't visit processCommand() at all).
     *
     * must be done before flushAppendOnlyFile, in case of appendfsync=always,
     * since the unblocked clients may write data. */
    handleClientsBlockedOnKeys();

    /* Write the AOF buffer on disk,
     * must be done before handleClientsWithPendingWritesUsingThreads,
     * in case of appendfsync=always. */
    if (server.aof_state == AOF_ON || server.aof_state == AOF_WAIT_REWRITE)
        flushAppendOnlyFile(0);

    /* Update the fsynced replica offset.
     * If an initial rewrite is in progress then not all data is guaranteed to have actually been
     * persisted to disk yet, so we cannot update the field. We will wait for the rewrite to complete. */
    if (server.aof_state == AOF_ON && server.fsynced_reploff != -1) {
        long long fsynced_reploff_pending;
        atomicGet(server.fsynced_reploff_pending, fsynced_reploff_pending);
        server.fsynced_reploff = fsynced_reploff_pending;
    }

    /* Handle writes with pending output buffers. */
    handleClientsWithPendingWritesUsingThreads();

    /* Close clients that need to be closed asynchronous */
    freeClientsInAsyncFreeQueue();

    /* Incrementally trim replication backlog, 10 times the normal speed is
     * to free replication backlog as much as possible. */
    if (server.repl_backlog)
        incrementalTrimReplicationBacklog(10*REPL_BACKLOG_TRIM_BLOCKS_PER_CALL);

    /* Disconnect some clients if they are consuming too much memory. */
    evictClients();

    /* Before we are going to sleep, let the threads access the dataset by
     * releasing the GIL. Redis main thread will not touch anything at this
     * time. */
    if (moduleCount()) moduleReleaseGIL();
    /********************* WARNING ********************
     * Do NOT add anything below moduleReleaseGIL !!! *
     ***************************** ********************/
}
```
