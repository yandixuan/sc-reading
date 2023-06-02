# call

---
call()是Redis执行一条命令的核心方法

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
    /* 记录原本被修改过的键值对数目 */
    dirty = server.dirty;
    /* 保存此时主从节点同步偏移量 */
    long long old_master_repl_offset = server.master_repl_offset;
    /* 更新发生错误的命令计数统计 */
    incrCommandStatsOnError(NULL, 0);
    /* 开始记录命令执行时间 */
    const long long call_timer = ustime();
    enterExecutionUnit(1, call_timer);

    /* setting the CLIENT_EXECUTING_COMMAND flag so we will avoid
     * sending client side caching message in the middle of a command reply.
     * In case of blocking commands, the flag will be un-set only after successfully
     * re-processing and unblock the client.*/
    /* 防止在命令回复过程中发送客户端缓存消息 */ 
    c->flags |= CLIENT_EXECUTING_COMMAND;
    /* 获取当前的单调时间戳，用于记录命令耗时 */
    monotime monotonic_start = 0;
    /* 如果支持单调时间戳，则获取当前时间戳 */
    if (monotonicGetType() == MONOTONIC_CLOCK_HW)
        monotonic_start = getMonotonicUs();
    /* 调用具体命令所对应的处理函数进行命令执行 */
    c->cmd->proc(c);
    /* 命令执行结束，记录命令总耗时，并取消防止发送客户端缓存消息的标记 */
    exitExecutionUnit();

    /* In case client is blocked after trying to execute the command,
     * it means the execution is not yet completed and we MIGHT reprocess the command in the future. */
    /* 如果该客户端未被阻塞，将其执行命令的标识清除 
     * CLIENT_EXECUTING_COMMAND: 通常用于判断客户端是否正在等待阻塞操作的结果，如果是，则不能立即将该标记清除 */
    if (!(c->flags & CLIENT_BLOCKED)) c->flags &= ~(CLIENT_EXECUTING_COMMAND);

    /* In order to avoid performance implication due to querying the clock using a system call 3 times,
     * we use a monotonic clock, when we are sure its cost is very low, and fall back to non-monotonic call otherwise. */
    /* 程序计算命令执行的时间。为了尽可能避免使用系统调用查询系统实时钟的时间导致的性能影响，如果检测到系统支持获取单调硬件时钟（MONOTONIC_CLOCK_HW），则使用该时钟；否则则使用普通的实时时钟（ustime）。最终得到的执行时间累加到c->duration中 */
    ustime_t duration;
    if (monotonicGetType() == MONOTONIC_CLOCK_HW)
        duration = getMonotonicUs() - monotonic_start;
    else
        duration = ustime() - call_timer;
    c->duration += duration;
    /* 根据脏数据量计算出本次命令执行产生的脏数据量，并将其写入dirty变量中 */
    dirty = server.dirty-dirty;
    if (dirty < 0) dirty = 0;

    /* Update failed command calls if required. */
    /* 如果发现该命令执行失败且失败次数需要计数，则将real_cmd对应的命令对象的failed_calls计数器增1 */
    if (!incrCommandStatsOnError(real_cmd, ERROR_COMMAND_FAILED) && c->deferred_reply_errors) {
        /* When call is used from a module client, error stats, and total_error_replies
         * isn't updated since these errors, if handled by the module, are internal,
         * and not reflected to users. however, the commandstats does show these calls
         * (made by RM_Call), so it should log if they failed or succeeded. */
        real_cmd->failed_calls++;
    }

    /* After executing command, we will close the client after writing entire
     * reply if it is set 'CLIENT_CLOSE_AFTER_COMMAND' flag. */
    /* 客户端是否启用了"CLIENT_CLOSE_AFTER_COMMAND"标志，如果是，则设置"CLIENT_CLOSE_AFTER_REPLY"标志，表示命令执行完毕后将关闭连接 */ 
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
    /* 根据update_command_stats变量判断是否需要更新命令相关的统计信息 */ 
    if (update_command_stats) {
        /* 将本次命令的执行时间添加到Redis的latency监控中 */
        char *latency_event = (real_cmd->flags & CMD_FAST) ?
                               "fast-command" : "command";
        latencyAddSampleIfNeeded(latency_event,duration/1000);
    }

    /* Log the command into the Slow log if needed.
     * If the client is blocked we will handle slowlog when it is unblocked. */
    /* 如果需要更新命令统计信息且客户端没有被阻塞，则将本次命令推送到慢日志中。 */ 
    if (update_command_stats && !(c->flags & CLIENT_BLOCKED))
        slowlogPushCurrentCommand(c, real_cmd, c->duration);

    /* Send the command to clients in MONITOR mode if applicable,
     * since some administrative commands are considered too dangerous to be shown.
     * Other exceptions is a client which is unblocked and retring to process the command
     * or we are currently in the process of loading AOF. */
    /* 如果需要更新命令统计信息、不是正在重试命令且命令既不是MONITOR跳过的命令也不是管理命令，则将该命令广播给所有MONITOR客户端。*/ 
    if (update_command_stats && !reprocessing_command &&
        !(c->cmd->flags & (CMD_SKIP_MONITOR|CMD_ADMIN))) {
        robj **argv = c->original_argv ? c->original_argv : c->argv;
        int argc = c->original_argv ? c->original_argc : c->argc;
        replicationFeedMonitors(c,server.monitors,c->db->id,argv,argc);
    }

    /* Clear the original argv.
     * If the client is blocked we will handle slowlog when it is unblocked. */
    /* 如果客户端没有被阻塞，则清空保存的原始命令参数。 */ 
    if (!(c->flags & CLIENT_BLOCKED))
        freeClientOriginalArgv(c);

    /* populate the per-command statistics that we show in INFO commandstats.
     * If the client is blocked we will handle latency stats and duration when it is unblocked. */
    /* 如果需要更新命令统计信息且客户端没有被阻塞，则更新该命令对象的统计数据，包括调用次数和总共消耗的微秒数，并根据duration更新该命令执行时间的直方图 */ 
    if (update_command_stats && !(c->flags & CLIENT_BLOCKED)) {
        real_cmd->calls++;
        real_cmd->microseconds += c->duration;
        if (server.latency_tracking_enabled && !(c->flags & CLIENT_BLOCKED))
            updateCommandLatencyHistogram(&(real_cmd->latency_histogram), c->duration*1000);
    }

    /* The duration needs to be reset after each call except for a blocked command,
     * which is expected to record and reset the duration after unblocking. */
    /* 如果客户端没有被阻塞，则重置命令执行时间（duration）为0 */ 
    if (!(c->flags & CLIENT_BLOCKED)) {
        c->duration = 0;
    }

    /* Propagate the command into the AOF and replication link.
     * We never propagate EXEC explicitly, it will be implicitly
     * propagated if needed (see propagatePendingCommands).
     * Also, module commands take care of themselves */
    /* 判断是否需要将当前命令传播到 AOF（append-only file）和 replication 通道，以此来实现数据的持久化和同步
     * 如果命令需要被传播（flags & CMD_CALL_PROPAGATE），并且该客户端没有被禁止传播（(c->flags & CLIENT_PREVENT_PROP) != CLIENT_PREVENT_PROP），
     * (并且该命令不是EXEC命令（c->cmd->proc != execCommand），并且该命令不是由模块处理的（!(c->cmd->flags & CMD_MODULE)） */ 
    if (flags & CMD_CALL_PROPAGATE &&
        (c->flags & CLIENT_PREVENT_PROP) != CLIENT_PREVENT_PROP &&
        c->cmd->proc != execCommand &&
        !(c->cmd->flags & CMD_MODULE))
    {   /* 定义一个 propagate_flags 变量，默认为 PROPAGATE_NONE */
        int propagate_flags = PROPAGATE_NONE;

        /* Check if the command operated changes in the data set. If so
         * set for replication / AOF propagation. */
        /* 如果该命令对数据集产生了变化，则将 propagate_flags 标记为PROPAGATE_AOF|PROPAGATE_REP */ 
        if (dirty) propagate_flags |= (PROPAGATE_AOF|PROPAGATE_REPL);

        /* If the client forced AOF / replication of the command, set
         * the flags regardless of the command effects on the data set. */
        /* 如果客户端强制执行命令的AOF/replication时，则无论命令是否影响数据集，都设置相应标志 */ 
        if (c->flags & CLIENT_FORCE_REPL) propagate_flags |= PROPAGATE_REPL;
        if (c->flags & CLIENT_FORCE_AOF) propagate_flags |= PROPAGATE_AOF;

        /* However prevent AOF / replication propagation if the command
         * implementation called preventCommandPropagation() or similar,
         * or if we don't have the call() flags to do so. */
        /* 如果该命令被调用 preventCommandPropagation() 或类似函数阻止传播，或者没有调用CMD_CALL_PROPAGATE_REPL状态来进行传播，则防止 AOF/replication 传播。 */ 
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
        /* 如果至少需要进行 AOF/replication 中的一种传播，则调用 alsoPropagate() 对相关操作进行传播至 AOF/replication 通道 */ 
        if (propagate_flags != PROPAGATE_NONE)
            alsoPropagate(c->db->id,c->argv,c->argc,propagate_flags);
    }

    /* Restore the old replication flags, since call() can be executed
     * recursively. */
    /* 恢复旧的 replication 标志，因为 call() 可能会递归执行 */  
    c->flags &= ~(CLIENT_FORCE_AOF|CLIENT_FORCE_REPL|CLIENT_PREVENT_PROP);
    c->flags |= client_old_flags &
        (CLIENT_FORCE_AOF|CLIENT_FORCE_REPL|CLIENT_PREVENT_PROP);

    /* If the client has keys tracking enabled for client side caching,
     * make sure to remember the keys it fetched via this command. For read-only
     * scripts, don't process the script, only the commands it executes. */
    /* 如果客户端启用了键追踪（CLIENT_TRACKING），并且不是 readonly 的脚本，则将通过该命令获取到的键记录下来。
     * 其中通过 server.current_client 记录追踪信息，但通过传入的 c 命令参数记录键信息。*/ 
    if ((c->cmd->flags & CMD_READONLY) && (c->cmd->proc != evalRoCommand)
        && (c->cmd->proc != evalShaRoCommand) && (c->cmd->proc != fcallroCommand))
    {
        /* We use the tracking flag of the original external client that
         * triggered the command, but we take the keys from the actual command
         * being executed. */
        /* 检查当前客户端是否存在以及其特定标志，即 CLIENT_TRACKING（启用对 Redis 键的跟踪）和 CLIENT_TRACKING_BCAST（禁止从旧实例转发反应式复制消息)
         * 如果满足则记录只读命令获取到的键在跟踪客户端状态中 */ 
        if (server.current_client &&
            (server.current_client->flags & CLIENT_TRACKING) &&
            !(server.current_client->flags & CLIENT_TRACKING_BCAST))
        {
            trackingRememberKeys(server.current_client, c);
        }
    }
    /* 如果客户端没有阻塞，则增加已执行命令数的统计。*/
    if (!(c->flags & CLIENT_BLOCKED))
        server.stat_numcommands++;

    /* Record peak memory after each command and before the eviction that runs
     * before the next command. */
    /* 统计每个命令完成后服务器占用的内存峰值，并将其记录在 server.stat_peak_memory 中。*/ 
    size_t zmalloc_used = zmalloc_used_memory();
    if (zmalloc_used > server.stat_peak_memory)
        server.stat_peak_memory = zmalloc_used;

    /* Do some maintenance job and cleanup */
    /* 进行一些维护作业和清理工作。*/
    afterCommand(c);

    /* Remember the replication offset of the client, right after its last
     * command that resulted in propagation. */
    if (old_master_repl_offset != server.master_repl_offset)
        c->woff = server.master_repl_offset;

    /* Client pause takes effect after a transaction has finished. This needs
     * to be located after everything is propagated. */
    /* 在一个事务结束之后，client pause 才会生效。这需要在所有东西传播之后进行。*/ 
    if (!server.in_exec && server.client_pause_in_transaction) {
        server.client_pause_in_transaction = 0;
    }
    /* 将当前执行的客户端设置为之前的值 */
    server.executing_client = prev_client;
}
```
