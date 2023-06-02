# I/O多线程相关

代码位于`redis`的`networking.c`的`L4119`

```c
/* I/O线程数的最大值 */
#define IO_THREADS_MAX_NUM 128
/* 定义缓存行大小 */
#ifndef CACHE_LINE_SIZE
#if defined(__aarch64__) && defined(__APPLE__)
#define CACHE_LINE_SIZE 128
#else
#define CACHE_LINE_SIZE 64
#endif
#endif
/* 一个atomic unsigned long类型的结构体，表示线程池中未处理的请求数量 */
typedef struct __attribute__((aligned(CACHE_LINE_SIZE))) threads_pending {
    redisAtomic unsigned long value;
} threads_pending;
/* 存放I/O线程的tid数组 */
pthread_t io_threads[IO_THREADS_MAX_NUM];
/* 它用于保护线程池中每个I/O线程对应的待处理队列，避免多个线程同时修改同一个队列时引起竞争和互斥问题。也就是说，每个I/O线程分别对应一个mutex，用于控制其所属队列的并发访问 */
pthread_mutex_t io_threads_mutex[IO_THREADS_MAX_NUM];
/* 线程池中每个I/O线程对应的未处理请求数 */
threads_pending io_threads_pending[IO_THREADS_MAX_NUM];
/* 表示正在进行的I/O操作类型（读/写），由main线程设置，I/O线程可读 */
/* 按照顺序存放分配给不同I/O线程的客户端连接的list结构体数组，
 * 其中io_threads_list[0]为主线程负责的列表。*/
int io_threads_op;      /* IO_THREADS_OP_IDLE, IO_THREADS_OP_READ or IO_THREADS_OP_WRITE. */ // TODO: should access to this be atomic??!

/* This is the list of clients each thread will serve when threaded I/O is
 * used. We spawn io_threads_num-1 threads, since one is the main thread
 * itself. */
/* 按照顺序存放分配给不同I/O线程的客户端连接的list结构体数组，
 * 其中io_threads_list[0]为主线程负责的列表。*/ 
list *io_threads_list[IO_THREADS_MAX_NUM];
```

## IOThreadMain

I/O 线程的入口函数，主要功能是处理客户端的读写请求，确保Redis服务器能够快速响应客户端请求并保持高性能和可扩展性。

```c
void *IOThreadMain(void *myid) {
    /* The ID is the thread number (from 0 to server.io_threads_num-1), and is
     * used by the thread to just manipulate a single sub-array of clients. */
    long id = (unsigned long)myid;
    char thdname[16];

    /* 设置线程名称，并将CPU亲和度设置为server_cpulist中指定的CPU列表。
     * 这可以提高系统资源利用率，因为I/O线程主要依赖CPU处理客户端请求，
     * 界面不涉及到CPU计算操作时，也可自动进入休眠模式，以减少 CPU 开销和功耗消耗。*/
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

## initThreadedIO

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

## handleClientsWithPendingWritesUsingThreads

通过主线程（多线程）的方式（同步）异步地向客户端写入数据，取决于`io_threads_num`配置

```c
int handleClientsWithPendingWritesUsingThreads(void) {
    int processed = listLength(server.clients_pending_write);
    /* 没有客户端连接需要进行写操作，则立即返回 */
    if (processed == 0) return 0; /* Return ASAP if there are no clients. */

    /* If I/O threads are disabled or we have few clients to serve, don't
     * use I/O threads, but the boring synchronous code. */
    /* 配置文件设置只使用单线程，或者当前待处理的客户端数量较少，则不启用I/O多线程，而是使用主线程 */ 
    if (server.io_threads_num == 1 || stopThreadedIOIfNeeded()) {
        return handleClientsWithPendingWrites();
    }

    /* Start threads if needed. */
    /* 如果未开启则调用startThreadedIO()开启多线程 */
    if (!server.io_threads_active) startThreadedIO();

    /* Distribute the clients across N different lists. */
    listIter li;
    listNode *ln;
    /* 客户端连接需要进行写操作的链表的迭代器重置为表头 */
    listRewind(server.clients_pending_write,&li);
    int item_id = 0;
    /* 从头开始遍历 */
    while((ln = listNext(&li))) {
        /* 获取相应的客户端对象 */
        client *c = listNodeValue(ln);
       /* 将客户端标志 flags 中的 CLIENT_PENDING_WRITE 位标记为未设置，
        * 表示这个客户端的未发送的消息已经发送或者存在其他的缓冲区等待发送。 */
        c->flags &= ~CLIENT_PENDING_WRITE;

        /* Remove clients from the list of pending writes since
         * they are going to be closed ASAP. */
        /* 如果客户端标志 flags 中的 CLIENT_CLOSE_ASAP 位被标记，则表示该客户端需要立即关闭，\
         * 这时将其从待处理发送数据的客户端链表中删除。 */ 
        if (c->flags & CLIENT_CLOSE_ASAP) {
            listUnlinkNode(server.clients_pending_write, ln);
            continue;
        }

        /* Since all replicas and replication backlog use global replication
         * buffer, to guarantee data accessing thread safe, we must put all
         * replicas client into io_threads_list[0] i.e. main thread handles
         * sending the output buffer of all replicas. */
        /* 如果该客户端为从节点，则将其添加到服务端线程池中 IO 线程工作队列 io_threads_list[0]j即主线程来处理。 
         * 因为所有从节点共用一个复制缓冲区，统一由主线程操作可以保持操作的原子性与线程安全性，避免了多线程之间出现的并发问题。*/ 
        if (getClientType(c) == CLIENT_TYPE_SLAVE) {
            listAddNodeTail(io_threads_list[0],c);
            continue;
        }
        /* 通过hash取摸计算将该客户端添加到哪个 IO 线程工作队列 io_threads_list 中，将其添加到相应的队列尾部。 */
        int target_id = item_id % server.io_threads_num;
        listAddNodeTail(io_threads_list[target_id],c);
        item_id++;
    }

    /* Give the start condition to the waiting threads, by setting the
     * start condition atomic var. */
    /* 设置进行写操作的 IO 线程操作类型为写操作 */ 
    io_threads_op = IO_THREADS_OP_WRITE;
    /* 遍历除主线程之外的所有 IO 线程，并获取其待处理节点数 */
    for (int j = 1; j < server.io_threads_num; j++) {
        int count = listLength(io_threads_list[j]);
        /* 更新 IO 线程待处理节点数 */
        setIOPendingCount(j, count);
    }

    /* Also use the main thread to process a slice of clients. */
    /* 让主线程对其队列中的客户端请求进行处理 */
    listRewind(io_threads_list[0],&li);
    while((ln = listNext(&li))) {
        client *c = listNodeValue(ln);
        /* 将输出缓冲区中的数据写入客户端 */
        writeToClient(c,0);
    }
    /* 清空主线程等待队列 */
    listEmpty(io_threads_list[0]);

    /* Wait for all the other threads to end their work. */
    /* 等待其他所有 IO 线程完成处理 */
    while(1) {
        unsigned long pending = 0;
        for (int j = 1; j < server.io_threads_num; j++)
            pending += getIOPendingCount(j);
        if (pending == 0) break;
    }
    /* 将进行写操作的 IO 线程操作类型设置为空闲 */
    io_threads_op = IO_THREADS_OP_IDLE;

    /* Run the list of clients again to install the write handler where
     * needed. */
    /* 遍历所有等待写入响应的客户端，并更新其内存使用情况，为下一次 IO 线程处理做好准备 */ 
    listRewind(server.clients_pending_write,&li);
    while((ln = listNext(&li))) {
        client *c = listNodeValue(ln);

        /* Update the client in the mem usage after we're done processing it in the io-threads */
        /* 更新 IO 线程处理后客户端的内存使用情况 */
        updateClientMemUsageAndBucket(c);

        /* Install the write handler if there are pending writes in some
         * of the clients. */
        /* 如果客户端存在待写入的响应，则安装 write handler 以保证后续能够正确写入响应*/ 
        if (clientHasPendingReplies(c)) {
            installClientWriteHandler(c);
        }
    }
    /* 清空等待写入响应的客户端队列 */
    while(listLength(server.clients_pending_write) > 0) {
        listUnlinkNode(server.clients_pending_write, server.clients_pending_write->head);
    }

    /* Update processed count on server */
    /* 更新 IO 线程已处理完毕的写操作数目 */
    server.stat_io_writes_processed += processed;
    /* 返回处理完毕的写操作数 */
    return processed;
}
```

## handleClientsWithPendingReadsUsingThreads

通过主线程（多线程）的方式（同步）异步地从客户端读入数据，取决于`io_threads_num`配置

```c
int handleClientsWithPendingReadsUsingThreads(void) {
    /* 检查工作线程是否激活，以及是否可以执行读取操作，如果不能则直接跳过 */
    if (!server.io_threads_active || !server.io_threads_do_reads) return 0;
    /* 获取等待读取的客户端数量 */
    int processed = listLength(server.clients_pending_read);
    /* 如果没有等待读取的客户端，则处理数量为 0，直接返回 */
    if (processed == 0) return 0;

    /* Distribute the clients across N different lists. */
    /* 将待读取的客户端通过取模算法分配到多线程IO各自的队列中去 */
    listIter li;
    listNode *ln;
    listRewind(server.clients_pending_read,&li);
    /* 记录当前待分配 client 的编号 */
    int item_id = 0;
    while((ln = listNext(&li))) {
        client *c = listNodeValue(ln);
        /* 取模结果 */
        int target_id = item_id % server.io_threads_num;
        /* 将client添加到对应编号队列的队尾 */
        listAddNodeTail(io_threads_list[target_id],c);
        /* 更新下一个待分配 client 的编号 */
        item_id++;
    }

    /* Give the start condition to the waiting threads, by setting the
     * start condition atomic var. */
    /* 设置进行写操作的 IO 线程操作类型为读操作 */
    io_threads_op = IO_THREADS_OP_READ;
    /* 遍历除主线程之外的所有 IO 线程，并获取其待处理节点数 */
    for (int j = 1; j < server.io_threads_num; j++) {
        int count = listLength(io_threads_list[j]);
        /* 更新 IO 线程待处理节点数 */
        setIOPendingCount(j, count);
    }

    /* Also use the main thread to process a slice of clients. */
    /* 让主线程对其队列中的客户端请求进行处理 */
    listRewind(io_threads_list[0],&li);
    while((ln = listNext(&li))) {
        client *c = listNodeValue(ln);
        /* 从客户端的查询缓冲区读取命令 */
        readQueryFromClient(c->conn);
    }
    /* 清空主线程等待队列 */
    listEmpty(io_threads_list[0]);

    /* Wait for all the other threads to end their work. */
    /* 等待其他所有 IO 线程完成处理 */
    while(1) {
        unsigned long pending = 0;
        for (int j = 1; j < server.io_threads_num; j++)
            pending += getIOPendingCount(j);
        if (pending == 0) break;
    }
    /* 将进行读操作的 IO 线程操作类型设置为空闲 */
    io_threads_op = IO_THREADS_OP_IDLE;

    /* Run the list of clients again to process the new buffers. */
    while(listLength(server.clients_pending_read)) {
        /* 从待处理的客户端列表中获取第一个待处理客户端，并将其从列表中删除。
         * 并将 pending_read_list_node 设置为 NULL，标记其不再等待读取 */
        ln = listFirst(server.clients_pending_read);
        client *c = listNodeValue(ln);
        listDelNode(server.clients_pending_read,ln);
        c->pending_read_list_node = NULL;
        /* 断言当前客户端没有被阻塞 */
        serverAssert(!(c->flags & CLIENT_BLOCKED));
        /* 如果当前客户端已失效，则跳过它，继续处理下一个客户端。*/
        if (beforeNextClient(c) == C_ERR) {
            /* If the client is no longer valid, we avoid
             * processing the client later. So we just go
             * to the next. */
            continue;
        }

        /* Once io-threads are idle we can update the client in the mem usage */
        /* 在 I/O 线程空闲时更新客户端的内存使用信息。*/
        updateClientMemUsageAndBucket(c);
        /* 处理客户端传入的命令和输入缓冲区 */
        if (processPendingCommandAndInputBuffer(c) == C_ERR) {
            /* If the client is no longer valid, we avoid
             * processing the client later. So we just go
             * to the next. */
            continue;
        }

        /* We may have pending replies if a thread readQueryFromClient() produced
         * replies and did not put the client in pending write queue (it can't).
         */
        /* 如果当前客户端有待处理的回复且未被标记为等待写入，则将其放入等待写入队列中。 */ 
        if (!(c->flags & CLIENT_PENDING_WRITE) && clientHasPendingReplies(c))
            putClientInPendingWriteQueue(c);
    }

    /* Update processed count on server */
    /* 累加 Redis 在当前运行期间已经处理的读取操作次数 */
    server.stat_io_reads_processed += processed;

    return processed;
}
```
