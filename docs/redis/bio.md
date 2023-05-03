# bio

该库提供了一组API，用于在Redis服务器中执行异步、非阻塞的I/O操作。通过使用BIO库，Redis可以在后台异步地完成一些耗时操作（如持久化、AOF重写、发送数据）而不会影响Redis服务器对客户端请求的处理速度和响应时间。

## 全局变量

```c
/* 字符串数组，用于保存每个后台任务的名称 */
static char* bio_worker_title[] = {
    "bio_close_file",
    "bio_aof",
    "bio_lazy_free",
};

/* 定义宏，表示后台任务的数量 */
#define BIO_WORKER_NUM (sizeof(bio_worker_title) / sizeof(*bio_worker_title))
/* 用于将不同类型的后台任务映射到相应的工作者线程中处理 */
static unsigned int bio_job_to_worker[] = {
    [BIO_CLOSE_FILE] = 0,
    [BIO_AOF_FSYNC] = 1,
    [BIO_CLOSE_AOF] = 1,
    [BIO_LAZY_FREE] = 2,
};
/* pthread_t类型的数组，存储所有的工作者线程ID */
static pthread_t bio_threads[BIO_WORKER_NUM];
/* pthread_mutex_t类型的数组，用于控制各个工作者线程的并发访问 */
static pthread_mutex_t bio_mutex[BIO_WORKER_NUM];
/* pthread_cond_t类型的数组，用于实现工作者线程的等待/通知机制 */
static pthread_cond_t bio_newjob_cond[BIO_WORKER_NUM];
/* list类型的数组，用于存放不同类型的后台任务 */
static list *bio_jobs[BIO_WORKER_NUM];
/* 无符号长整型的数组，用于统计当前系统中不同类型的后台任务数量 */
static unsigned long bio_jobs_counter[BIO_NUM_OPS] = {0};
```

## 方法

### bioInit

初始化BIO库（Background I/O library），用于异步执行耗时操作，例如文件读写、网络数据发送等。

```c
void bioInit(void) {
    /* 线程属性 */
    pthread_attr_t attr;
    /* 线程变量 */
    pthread_t thread;
    /* 线程栈大小 */
    size_t stacksize;
    /* 计数器 */
    unsigned long j;

    /* Initialization of state vars and objects */
    /* 对锁、条件变量和任务队列进行初始化 */
    for (j = 0; j < BIO_WORKER_NUM; j++) {
        pthread_mutex_init(&bio_mutex[j],NULL);
        pthread_cond_init(&bio_newjob_cond[j],NULL);
        bio_jobs[j] = listCreate();
    }

    /* Set the stack size as by default it may be small in some system */
    /* 设置线程栈的大小，避免在某些系统默认值太小的情况下引发溢出 */
    /* 初始化线程属性 */
    pthread_attr_init(&attr);
    /* 获取当前线程栈的大小 */
    pthread_attr_getstacksize(&attr,&stacksize);
    /* 如果当前线程栈的大小为0，将其设为1（某些处理器特有的“草案”修复方式） */
    if (!stacksize) stacksize = 1; /* The world is full of Solaris Fixes */
    /* 当线程栈的大小小于REDIS_THREAD_STACK_SIZE时，倍增线程栈的大小 */
    while (stacksize < REDIS_THREAD_STACK_SIZE) stacksize *= 2;
    /* 将线程属性中的栈大小设置为新计算出的栈大小 */
    pthread_attr_setstacksize(&attr, stacksize);

    /* Ready to spawn our threads. We use the single argument the thread
     * function accepts in order to pass the job ID the thread is
     * responsible for. */
    /* 按照BIO_WORKER_NUM（用户可以在redis.conf中设置）指定的数量，创建对应数量的线程，
     * 并指定线程入口函数为 bioProcessBackgroundJobs */ 
    for (j = 0; j < BIO_WORKER_NUM; j++) {
        void *arg = (void*)(unsigned long) j;
        if (pthread_create(&thread,&attr,bioProcessBackgroundJobs,arg) != 0) {
            serverLog(LL_WARNING,"Fatal: Can't initialize Background Jobs.");
            exit(1);
        }
        /* 将线程ID保存在全局变量中 */
        bio_threads[j] = thread;
    }
}
```

### bioProcessBackgroundJobs

接收一个 void* 类型的参数，实际上是指向 bio_job 结构体数组的索引

```c
void *bioProcessBackgroundJobs(void *arg) {
    /* 定义指向后台任务的指针变量 job */
    bio_job *job;
    /* 将传入的参数转换为 unsigned long 型并赋给 worker 变量 */
    unsigned long worker = (unsigned long) arg;
    sigset_t sigset;

    /* Check that the worker is within the right interval. */
    /* 判断索引的合法性 */
    serverAssert(worker < BIO_WORKER_NUM);
    /* 设置工作者线程名称 */
    redis_set_thread_title(bio_worker_title[worker]);
    /* 如果配置了bio线程的cpu亲和性，则设置cpu亲和性 */
    redisSetCpuAffinity(server.bio_cpulist);
    /* 将当前线程设置为可取消状态 */
    makeThreadKillable();
    /* 因为有多(3)个工作线程会对bio_jobs进行读写，为了保证共享变量的线程安全需要加锁 */
    pthread_mutex_lock(&bio_mutex[worker]);
    /* Block SIGALRM so we are sure that only the main thread will
     * receive the watchdog signal. */
    /* 清空 sigset  */ 
    sigemptyset(&sigset);
    /* 添加 SIGALRM 信号到 sigset 集合中 */
    sigaddset(&sigset, SIGALRM);
    /* 阻止 SIGALARM 信号的发送 */
    if (pthread_sigmask(SIG_BLOCK, &sigset, NULL))
        serverLog(LL_WARNING,
            "Warning: can't mask SIGALRM in bio.c thread: %s", strerror(errno));
    /* 循环，直到获取到后台任务 */
    while(1) {
        listNode *ln;

        /* The loop always starts with the lock hold. */
        /* 如果当前线程队列中没有等待处理的任务 */
        if (listLength(bio_jobs[worker]) == 0) {
            /* 在pthread_cond_wait之前必须获取该共享数据的互斥锁，线程挂起时释放锁，并在满足条件离开条件变量时重新加锁 */
            pthread_cond_wait(&bio_newjob_cond[worker], &bio_mutex[worker]);
            /* 被唤醒了，说明有任务了，进入下一次循环 */
            continue;
        }
        /* Get the job from the queue. */
        /* 获取队列中最先加入的任务 */
        ln = listFirst(bio_jobs[worker]);
        /* 获取任务对应的指针 */
        job = ln->value;
        /* It is now possible to unlock the background system as we know have
         * a stand alone job structure to process.*/
        /* 拿到bio任务了则可以解锁了，后面是单线程处理任务了 */ 
        pthread_mutex_unlock(&bio_mutex[worker]);

        /* Process the job accordingly to its type. */
        /* 获取该任务的类型 */
        int job_type = job->header.type;
        /* 如果是关闭文件操作，则进行相应处理 */
        if (job_type == BIO_CLOSE_FILE) {
            /* 如果需要执行 fsync，并且执行失败，并且错误不属于 EBADF 和 EINVAL，则记录错误日志 */
            if (job->fd_args.need_fsync &&
                redis_fsync(job->fd_args.fd) == -1 &&
                errno != EBADF && errno != EINVAL)
            {
                serverLog(LL_WARNING, "Fail to fsync the AOF file: %s",strerror(errno));
            }
            /* 如果需要回收缓存，则进行相应处理 */
            if (job->fd_args.need_reclaim_cache) {
                if (reclaimFilePageCache(job->fd_args.fd, 0, 0) == -1) {
                    serverLog(LL_NOTICE,"Unable to reclaim page cache: %s", strerror(errno));
                }
            }
            /* 关闭文件描述符 */
            close(job->fd_args.fd);
          /* 如果是 AOF 相关的操作 */  
        } else if (job_type == BIO_AOF_FSYNC || job_type == BIO_CLOSE_AOF) {
            /* The fd may be closed by main thread and reused for another
             * socket, pipe, or file. We just ignore these errno because
             * aof fsync did not really fail. */
            /* 在 fsync 操作时，如果操作失败，会更新全局变量 server.aof_bio_fsync_status 
             * 和 server.aof_bio_fsync_errno 来记录最近一次 fsync 结果及其 errorno（只有非 EBADF 和 EINVAL 才表示真正失败） */ 
            if (redis_fsync(job->fd_args.fd) == -1 &&
                errno != EBADF && errno != EINVAL)
            {
                int last_status;
                atomicGet(server.aof_bio_fsync_status,last_status);
                atomicSet(server.aof_bio_fsync_status,C_ERR);
                atomicSet(server.aof_bio_fsync_errno,errno);
                /* 如果前一次 fsync 成功，那么通过日志输出当前 fsync 失败原因 */
                if (last_status == C_OK) {
                    serverLog(LL_WARNING,
                        "Fail to fsync the AOF file: %s",strerror(errno));
                }
            } else {
                atomicSet(server.aof_bio_fsync_status,C_OK);
                atomicSet(server.fsynced_reploff_pending, job->fd_args.offset);
            }
            /* 如果开启了page cache实现的AOF缓存优化，并且链表节点job中设置了标记，则调用函数reclaimFilePageCache(job->fd_args.fd, 0, 0)来回收这个文件句柄对应的页缓存 */
            if (job->fd_args.need_reclaim_cache) {
                if (reclaimFilePageCache(job->fd_args.fd, 0, 0) == -1) {
                    serverLog(LL_NOTICE,"Unable to reclaim page cache: %s", strerror(errno));
                }
            }
            /* 如果job类型是 BIO_CLOSE_AOF，就将 AOF 文件描述符关闭 */
            if (job_type == BIO_CLOSE_AOF)
                close(job->fd_args.fd);
        } else if (job_type == BIO_LAZY_FREE) {
            /* 后台任务类型为 BIO_LAZY_FREE，则执行延迟释放函数并释放该链表节点 */
            job->free_args.free_fn(job->free_args.free_args);
        } else {
            serverPanic("Wrong job type in bioProcessBackgroundJobs().");
        }
        /* 任务处理完了，释放堆上的内存 */
        zfree(job);

        /* Lock again before reiterating the loop, if there are no longer
         * jobs to process we'll block again in pthread_cond_wait(). */
        /* 重新加锁以便再次循环，在没有需要处理的任务时再次阻塞等待 */
        pthread_mutex_lock(&bio_mutex[worker]);
        /* 移除任务节点 */
        listDelNode(bio_jobs[worker], ln);
        bio_jobs_counter[job_type]--;
        /* 唤醒卡在`bioDrainWorker`处的线程 */
        pthread_cond_signal(&bio_newjob_cond[worker]);
    }
}
```
