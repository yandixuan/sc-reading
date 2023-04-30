# module(模块系统)

## 方法

### moduleInitModulesSystem

模块系统初始化

```c
void moduleInitModulesSystem(void) {
    /* 创建非阻塞客户端列表 */
    moduleUnblockedClients = listCreate();
    /* 创建模块队列 */
    server.loadmodule_queue = listCreate();
    /* 创建模块配置项哈希表 */
    server.module_configs_queue = dictCreate(&sdsKeyValueHashDictType);
    /* 创建模块字典 */
    modules = dictCreate(&modulesDictType);
    moduleAuthCallbacks = listCreate();

    /* Set up the keyspace notification subscriber list and static client */
    moduleKeyspaceSubscribers = listCreate();
    /* 创建后置任务列表 */
    modulePostExecUnitJobs = listCreate();

    /* Set up filter list */
    /* 创建命令过滤器列表 */
    moduleCommandFilters = listCreate();
    /* 注册核心 API */
    moduleRegisterCoreAPI();

    /* Create a pipe for module threads to be able to wake up the redis main thread.
     * Make the pipe non blocking. This is just a best effort aware mechanism
     * and we do not want to block not in the read nor in the write half.
     * Enable close-on-exec flag on pipes in case of the fork-exec system calls in
     * sentinels or redis servers. */
    /* 为模块线程创建一个管道，用于唤醒 Redis 主线程，同时设置文件描述符属性 
     * O_NONBLOCK：非阻塞属性，在读数据时即使管道内没有数据，read函数也会立即返回，返回值为-1。
     * O_CLOEXEC：关闭子进程无用描述符，创建子进程后，子进程会自动继承标准输入输出和错误输出（文件描述符 0、1 和 2），但不会继承管道的文件描述符，从而避免了潜在的死锁和资源泄露问题
     * module_pipe[0]读，module_pipe[1]写
     */
    if (anetPipe(server.module_pipe, O_CLOEXEC|O_NONBLOCK, O_CLOEXEC|O_NONBLOCK) == -1) {
        serverLog(LL_WARNING,
            "Can't create the pipe for module threads: %s", strerror(errno));
        exit(1);
    }
    /* 创建定时器 Radix 树 */
    /* Create the timers radix tree. */
    Timers = raxNew();
    /* Setup the event listeners data structures. */
    /* 设置事件监听器数据结构 */
    RedisModule_EventListeners = listCreate();
    /* Making sure moduleEventVersions is synced with the number of events. */
    /* 确保 moduleEventVersions 的长度与事件数量匹配 */
    serverAssert(sizeof(moduleEventVersions)/sizeof(moduleEventVersions[0]) == _REDISMODULE_EVENT_NEXT);

    /* Our thread-safe contexts GIL must start with already locked:
     * it is just unlocked when it's safe. */
    /* 模块 GIL 需要一开始就被锁定，直到安全解锁为止 */
    pthread_mutex_lock(&moduleGIL);
}
```
