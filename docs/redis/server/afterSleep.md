# afterSleep

[事件循环执行`aeApiPoll`后调用](../ae#aeProcessEvents)

:::tip ProcessingEventsWhileBlocked

在读取 RDB 文件、AOF 文件，以及模块的`RM_Yield`,脚本的`scriptInterrupt`，被调用。

- true: 在主线程阻塞期间依旧处理事件，可以更好地在高负载情况下保持响应能力。
- fasle: 默认值，需要拿到动态模块的全局锁，避免动态模块破环其一致性,导致数据丢失

:::

:::tip GIL

`!ProcessingEventsWhileBlocked`，在多线程启用情况下，会将客户端命令的读取推迟给多线程执行

Redis的动态模块可以访问和修改Redis服务器的共享内存和全局变量，为防止动态模块实现使用多线程参与读写，从而引起Redis数据一致性问题，所以这里获取全局互斥锁即`moduleGIL`，让Redis内部命令先执行，防止动态模块对Redis数据的影响。

[`beforeSleep`](./beforeSleep)会释放`GIL`互斥锁，让其他的线程有机会去访问Redis数据集

:::

```c
void afterSleep(struct aeEventLoop *eventLoop) {
    /* 消除编译时的未使用变量警告 */
    UNUSED(eventLoop);
    /* 这段代码是一个警告，建议不要在模块获取 GIL 之前添加其他代码，以确保 Redis 在处理事件期间不受到其他线程的干扰 */
    /********************* WARNING ********************
     * Do NOT add anything above moduleAcquireGIL !!! *
     ***************************** ********************/
    if (!ProcessingEventsWhileBlocked) {
        /* Acquire the modules GIL so that their threads won't touch anything. */
        /* 如果有安装的 Redis 模块 */
        if (moduleCount()) {
            mstime_t latency;
            /* 启动延迟监控器，统计事件循环阻塞期间的延迟时间，并将结果添加到指定的延迟统计项中 */
            latencyStartMonitor(latency);
            /* 先处理Redis内部命令，防止动态模块并发读写 */
            moduleAcquireGIL();
            /* 触发一个名为 "REDISMODULE_EVENT_EVENTLOOP"、"REDISMODULE_SUBEVENT_EVENTLOOP_AFTER_SLEEP"的事件，表示 Redis 的事件循环模型已经被阻塞 */
            moduleFireServerEvent(REDISMODULE_EVENT_EVENTLOOP,
                                  REDISMODULE_SUBEVENT_EVENTLOOP_AFTER_SLEEP,
                                  NULL);
            /* 结束延迟监控器 */
            latencyEndMonitor(latency);
            /* 将延迟样本添加到 Redis 的统计数据中 */
            latencyAddSampleIfNeeded("module-acquire-GIL",latency);
        }
    }

    /* Update the time cache. */
    /* 更新时间缓存 */
    updateCachedTime(1);

    /* Update command time snapshot in case it'll be required without a command
     * e.g. somehow used by module timers. Don't update it while yielding to a
     * blocked command, call() will handle that and restore the original time. */
    /* 将 Redis 服务器的当前毫秒时间赋值给 Redis 服务器状态结构体中的 cmd_time_snapshot 属性。
     * 这个属性用来记录 Redis 执行命令时的时间，它通常用于模块定时器、慢查询日志等功能中。如果正在执行阻塞命令，则不更新 cmd_time_snapshot，
     * 因为 call() 函数会处理这种情况，并恢复原始时间。 */ 
    if (!ProcessingEventsWhileBlocked) {
        server.cmd_time_snapshot = server.mstime;
    }
}
```
