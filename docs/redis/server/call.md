# call

---
Call()是Redis执行一条命令的核心

---

```c
void call(client *c, int flags) {
    /* 记录Redis所存储的所有数据库中已被修改的键值对数目的 */
    long long dirty;
    uint64_t client_old_flags = c->flags;
    /* 客户端刚刚发送到服务器的命令 */
    struct redisCommand *real_cmd = c->realcmd;
    /* 记录了上一个正在执行的客户端，方便后续恢复状态 */
    client *prev_client = server.executing_client;
    /* 当前执行命令对应的客户端 */
    server.executing_client = c;

    /* When call() is issued during loading the AOF we don't want commands called
     * from module, exec or LUA to go into the slowlog or to populate statistics. */
    /* 当前是否处于AOF载入上下文环境中，如果是，则不需要更新统计信息 */ 
    int update_command_stats = !isAOFLoadingContext();

    /* We want to be aware of a client which is making a first time attempt to execute this command
     * and a client which is reprocessing command again (after being unblocked).
     * Blocked clients can be blocked in different places and not always it means the call() function has been
     * called. For example this is required for avoiding double logging to monitors.*/
    /* 根据命令的标志位判断当前是否为重新处理命令（第二次处理同一命令） */ 
    int reprocessing_command = flags & CMD_CALL_REPROCESSING;

    /* Initialization: clear the flags that must be set by the command on
     * demand, and initialize the array for additional commands propagation. */
    /* ，清除客户端相关的强制AOF、强制复制和阻止命令传播标志位，这些标志用于控制Redis命令操作和与其他节点同步的行为 */ 
    c->flags &= ~(CLIENT_FORCE_AOF|CLIENT_FORCE_REPL|CLIENT_PREVENT_PROP);

    /* Redis core is in charge of propagation when the first entry point
     * of call() is processCommand().
     * The only other option to get to call() without having processCommand
     * as an entry point is if a module triggers RM_Call outside of call()
     * context (for example, in a timer).
     * In that case, the module is in charge of propagation. */

    /* Call the command. */
    dirty = server.dirty;
    long long old_master_repl_offset = server.master_repl_offset;
    incrCommandStatsOnError(NULL, 0);

    const long long call_timer = ustime();
    enterExecutionUnit(1, call_timer);

    /* setting the CLIENT_EXECUTING_COMMAND flag so we will avoid
     * sending client side caching message in the middle of a command reply.
     * In case of blocking commands, the flag will be un-set only after successfully
     * re-processing and unblock the client.*/
    c->flags |= CLIENT_EXECUTING_COMMAND;

    monotime monotonic_start = 0;
    if (monotonicGetType() == MONOTONIC_CLOCK_HW)
        monotonic_start = getMonotonicUs();

    c->cmd->proc(c);

    exitExecutionUnit();

    /* In case client is blocked after trying to execute the command,
     * it means the execution is not yet completed and we MIGHT reprocess the command in the future. */
    if (!(c->flags & CLIENT_BLOCKED)) c->flags &= ~(CLIENT_EXECUTING_COMMAND);

    /* In order to avoid performance implication due to querying the clock using a system call 3 times,
     * we use a monotonic clock, when we are sure its cost is very low, and fall back to non-monotonic call otherwise. */
    ustime_t duration;
    if (monotonicGetType() == MONOTONIC_CLOCK_HW)
        duration = getMonotonicUs() - monotonic_start;
    else
        duration = ustime() - call_timer;

    c->duration += duration;
    dirty = server.dirty-dirty;
    if (dirty < 0) dirty = 0;

    /* Update failed command calls if required. */

    if (!incrCommandStatsOnError(real_cmd, ERROR_COMMAND_FAILED) && c->deferred_reply_errors) {
        /* When call is used from a module client, error stats, and total_error_replies
         * isn't updated since these errors, if handled by the module, are internal,
         * and not reflected to users. however, the commandstats does show these calls
         * (made by RM_Call), so it should log if they failed or succeeded. */
        real_cmd->failed_calls++;
    }

    /* After executing command, we will close the client after writing entire
     * reply if it is set 'CLIENT_CLOSE_AFTER_COMMAND' flag. */
    if (c->flags & CLIENT_CLOSE_AFTER_COMMAND) {
        c->flags &= ~CLIENT_CLOSE_AFTER_COMMAND;
        c->flags |= CLIENT_CLOSE_AFTER_REPLY;
    }

    /* Note: the code below uses the real command that was executed
     * c->cmd and c->lastcmd may be different, in case of MULTI-EXEC or
     * re-written commands such as EXPIRE, GEOADD, etc. */

    /* Record the latency this command induced on the main thread.
     * unless instructed by the caller not to log. (happens when processing
     * a MULTI-EXEC from inside an AOF). */
    if (update_command_stats) {
        char *latency_event = (real_cmd->flags & CMD_FAST) ?
                               "fast-command" : "command";
        latencyAddSampleIfNeeded(latency_event,duration/1000);
    }

    /* Log the command into the Slow log if needed.
     * If the client is blocked we will handle slowlog when it is unblocked. */
    if (update_command_stats && !(c->flags & CLIENT_BLOCKED))
        slowlogPushCurrentCommand(c, real_cmd, c->duration);

    /* Send the command to clients in MONITOR mode if applicable,
     * since some administrative commands are considered too dangerous to be shown.
     * Other exceptions is a client which is unblocked and retring to process the command
     * or we are currently in the process of loading AOF. */
    if (update_command_stats && !reprocessing_command &&
        !(c->cmd->flags & (CMD_SKIP_MONITOR|CMD_ADMIN))) {
        robj **argv = c->original_argv ? c->original_argv : c->argv;
        int argc = c->original_argv ? c->original_argc : c->argc;
        replicationFeedMonitors(c,server.monitors,c->db->id,argv,argc);
    }

    /* Clear the original argv.
     * If the client is blocked we will handle slowlog when it is unblocked. */
    if (!(c->flags & CLIENT_BLOCKED))
        freeClientOriginalArgv(c);

    /* populate the per-command statistics that we show in INFO commandstats.
     * If the client is blocked we will handle latency stats and duration when it is unblocked. */
    if (update_command_stats && !(c->flags & CLIENT_BLOCKED)) {
        real_cmd->calls++;
        real_cmd->microseconds += c->duration;
        if (server.latency_tracking_enabled && !(c->flags & CLIENT_BLOCKED))
            updateCommandLatencyHistogram(&(real_cmd->latency_histogram), c->duration*1000);
    }

    /* The duration needs to be reset after each call except for a blocked command,
     * which is expected to record and reset the duration after unblocking. */
    if (!(c->flags & CLIENT_BLOCKED)) {
        c->duration = 0;
    }

    /* Propagate the command into the AOF and replication link.
     * We never propagate EXEC explicitly, it will be implicitly
     * propagated if needed (see propagatePendingCommands).
     * Also, module commands take care of themselves */
    if (flags & CMD_CALL_PROPAGATE &&
        (c->flags & CLIENT_PREVENT_PROP) != CLIENT_PREVENT_PROP &&
        c->cmd->proc != execCommand &&
        !(c->cmd->flags & CMD_MODULE))
    {
        int propagate_flags = PROPAGATE_NONE;

        /* Check if the command operated changes in the data set. If so
         * set for replication / AOF propagation. */
        if (dirty) propagate_flags |= (PROPAGATE_AOF|PROPAGATE_REPL);

        /* If the client forced AOF / replication of the command, set
         * the flags regardless of the command effects on the data set. */
        if (c->flags & CLIENT_FORCE_REPL) propagate_flags |= PROPAGATE_REPL;
        if (c->flags & CLIENT_FORCE_AOF) propagate_flags |= PROPAGATE_AOF;

        /* However prevent AOF / replication propagation if the command
         * implementation called preventCommandPropagation() or similar,
         * or if we don't have the call() flags to do so. */
        if (c->flags & CLIENT_PREVENT_REPL_PROP        ||
            c->flags & CLIENT_MODULE_PREVENT_REPL_PROP ||
            !(flags & CMD_CALL_PROPAGATE_REPL))
                propagate_flags &= ~PROPAGATE_REPL;
        if (c->flags & CLIENT_PREVENT_AOF_PROP        ||
            c->flags & CLIENT_MODULE_PREVENT_AOF_PROP ||
            !(flags & CMD_CALL_PROPAGATE_AOF))
                propagate_flags &= ~PROPAGATE_AOF;

        /* Call alsoPropagate() only if at least one of AOF / replication
         * propagation is needed. */
        if (propagate_flags != PROPAGATE_NONE)
            alsoPropagate(c->db->id,c->argv,c->argc,propagate_flags);
    }

    /* Restore the old replication flags, since call() can be executed
     * recursively. */
    c->flags &= ~(CLIENT_FORCE_AOF|CLIENT_FORCE_REPL|CLIENT_PREVENT_PROP);
    c->flags |= client_old_flags &
        (CLIENT_FORCE_AOF|CLIENT_FORCE_REPL|CLIENT_PREVENT_PROP);

    /* If the client has keys tracking enabled for client side caching,
     * make sure to remember the keys it fetched via this command. For read-only
     * scripts, don't process the script, only the commands it executes. */
    if ((c->cmd->flags & CMD_READONLY) && (c->cmd->proc != evalRoCommand)
        && (c->cmd->proc != evalShaRoCommand) && (c->cmd->proc != fcallroCommand))
    {
        /* We use the tracking flag of the original external client that
         * triggered the command, but we take the keys from the actual command
         * being executed. */
        if (server.current_client &&
            (server.current_client->flags & CLIENT_TRACKING) &&
            !(server.current_client->flags & CLIENT_TRACKING_BCAST))
        {
            trackingRememberKeys(server.current_client, c);
        }
    }

    if (!(c->flags & CLIENT_BLOCKED))
        server.stat_numcommands++;

    /* Record peak memory after each command and before the eviction that runs
     * before the next command. */
    size_t zmalloc_used = zmalloc_used_memory();
    if (zmalloc_used > server.stat_peak_memory)
        server.stat_peak_memory = zmalloc_used;

    /* Do some maintenance job and cleanup */
    afterCommand(c);

    /* Remember the replication offset of the client, right after its last
     * command that resulted in propagation. */
    if (old_master_repl_offset != server.master_repl_offset)
        c->woff = server.master_repl_offset;

    /* Client pause takes effect after a transaction has finished. This needs
     * to be located after everything is propagated. */
    if (!server.in_exec && server.client_pause_in_transaction) {
        server.client_pause_in_transaction = 0;
    }

    server.executing_client = prev_client;
}
```
