# ae(事件驱动)

## 头文件

### 宏

不同的平台引入不同实现（类似门面模式）

- ae_epoll.c：Linux平台
- ae_kqueue.c：BSD平台
- ae_evport.c：Solaris平台
- ae_select.c：其他Unix平台

```c
#ifdef HAVE_EVPORT
#include "ae_evport.c"
#else
    #ifdef HAVE_EPOLL
    #include "ae_epoll.c"
    #else
        #ifdef HAVE_KQUEUE
        #include "ae_kqueue.c"
        #else
        #include "ae_select.c"
        #endif
    #endif
#endif
```

## 结构体

### aeTimeEvent

```c
/* Time event structure */
typedef struct aeTimeEvent {
    /* time event 的唯一标识符 */
    long long id; /* time event identifier. */
    /* 时间事件要在何时被执行 */
    monotime when;
    /* 指向用户定义的时间处理函数 */
    aeTimeProc *timeProc;
    /* 事件结束时执行的函数 */
    aeEventFinalizerProc *finalizerProc;
    /*  事件处理函数的参数 */
    void *clientData;
    /* 双向链表上的前置指针 */
    struct aeTimeEvent *prev;
    /* 双向链表上的后置指针 */
    struct aeTimeEvent *next;
    /* 用于防止计时器事件在递归的计时处理调用中被释放的引用计数器. */
    int refcount; /* refcount to prevent timer events from being
             * freed in recursive time event calls. */
} aeTimeEvent;
```

### aeEventLoop

1. `maxfd`：当前已经监听的最大文件描述符。
2. `setsize`：用于表示events和fired两个数组的大小。这两个数组分别用于存储该aeEventLoop监听的所有事件以及就绪的事件。
3. `timeEventNextId`：下一个定时事件的ID
4. `events`：一个指向aeFileEvent数组的指针，该数组用于保存所有被监听的事件信息。
5. `fired`：一个指向aeFiredEvent数组的指针，该数组保存那些有事件发生的文件描述符及其对应事件类型。
6. `stop`：表示是否停止事件循环。
7. `apidata`：保存对底层I/O多路复用库的特定状态/数据的指针（如epoll实例）。
8. `beforeSleep`和`afterSleep`：函数指针，它们分别在事件循环每轮开始之前和结束后执行，以处理一些其他非事件相关任务。
9. `flags`：控制事件循环行为的标志位

```c
/* State of an event based program */
typedef struct aeEventLoop {
    int maxfd;   /* highest file descriptor currently registered */
    int setsize; /* max number of file descriptors tracked */
    long long timeEventNextId;
    aeFileEvent *events; /* Registered events */
    aeFiredEvent *fired; /* Fired events */
    aeTimeEvent *timeEventHead;
    int stop;
    void *apidata; /* This is used for polling API specific data */
    aeBeforeSleepProc *beforesleep;
    aeBeforeSleepProc *aftersleep;
    int flags;
} aeEventLoop;
```

## 方法

### aeCreateEventLoop

初始化事件循环结构体

```c
aeEventLoop *aeCreateEventLoop(int setsize) {
    aeEventLoop *eventLoop;
    int i;
    /* 初始化单调时间函数 */
    monotonicInit();    /* just in case the calling app didn't initialize */
    /* 根据结构体大小创建一个aeEventLoop结构体内存空间，并将eventLoop指向该内存空间 */
    if ((eventLoop = zmalloc(sizeof(*eventLoop))) == NULL) goto err;
    /* 创建事件数组与触发器数组，并分别设置其大小为setsize */
    eventLoop->events = zmalloc(sizeof(aeFileEvent)*setsize);
    eventLoop->fired = zmalloc(sizeof(aeFiredEvent)*setsize);
    /* 如果数组为空则表示分配空间失败，则跳转到错误处理语句 */
    if (eventLoop->events == NULL || eventLoop->fired == NULL) goto err;
    /* 设置事件循环机制的最大监听描述符数为初始值-1，表示未添加任何监听。 */
    eventLoop->setsize = setsize;
    /* 时间事件链表头置空 */
    eventLoop->timeEventHead = NULL;
    /* 时间事件计数器置0，用于记录下一个时间事件ID */
    eventLoop->timeEventNextId = 0;
    /* 停止标志设为0，表示没有停止事件循环 */
    eventLoop->stop = 0;
    /* 当前已监听到的最大文件描述符初始化为-1 */
    eventLoop->maxfd = -1;
    /* 设置休息前回调函数为NULL */
    eventLoop->beforesleep = NULL;
    /* 设置休息后回调函数为NULL */
    eventLoop->aftersleep = NULL;
    /* 设置默认的事件循环标志为0，没有被设置 */
    eventLoop->flags = 0;
    /* 调用多路复用的底层API（即不同OS对应不同的实现）创建I/O多路复用机制对象，并把该对象与aeEventLoop关联起来 */
    if (aeApiCreate(eventLoop) == -1) goto err;
    /* Events with mask == AE_NONE are not set. So let's initialize the
     * vector with it. */
    /* 初始化文件事件状态数组，将每个文件描述符的状态初始化为 AE_NONE */
    for (i = 0; i < setsize; i++)
        eventLoop->events[i].mask = AE_NONE;
    return eventLoop;

err:
    /* 释放内存空间 */
    if (eventLoop) {
        zfree(eventLoop->events);
        zfree(eventLoop->fired);
        zfree(eventLoop);
    }
    return NULL;
}
```

### aeCreateFileEvent

创建一个新的文件事件

- eventLoop - 事件循环对象指针
- fd - 文件描述符
- mask - 感兴趣的事件掩码
- proc - 事件处理器函数指针
- clientData - 客户端数据指针

```c
int aeCreateFileEvent(aeEventLoop *eventLoop, int fd, int mask,
        aeFileProc *proc, void *clientData)
{   
    /* 1.fd 为 0、1、2 分别表示标准输入、标准输出和错误输出
     * 2.每次新打开的 fd，必须使用当前进程中最小可用的文件描述符 
     * 例如，当程序刚刚启动时候，创建监听套接字，按照标准规定，该 fd 的值为 3。此时就直接在 eventLoop->events 下标为 3 的元素中存放相应 event 数据 
     * 所以，如果文件描述符大于等于事件循环对象中设置的最大描述符数setsize，返回错误  */
    if (fd >= eventLoop->setsize) {
        errno = ERANGE;
        return AE_ERR;
    }
    /* 获取文件描述符对应的aeFileEvent结构体指针 */
    aeFileEvent *fe = &eventLoop->events[fd];
    /* 调用底层I/O多路复用库的文件事件添加函数将事件添加到事件驱动框架中*/
    if (aeApiAddEvent(eventLoop, fd, mask) == -1)
        return AE_ERR;
    /* 更新aeFileEvent结构体关注的事件掩码 */    
    fe->mask |= mask;
    /* 根据掩码更新相应读写处理器函数 */
    if (mask & AE_READABLE) fe->rfileProc = proc;
    if (mask & AE_WRITABLE) fe->wfileProc = proc;
    /* 记录客户端数据指针 */
    fe->clientData = clientData;
    /* 更新事件循环对象中设置的最大描述符数 */
    if (fd > eventLoop->maxfd)
        eventLoop->maxfd = fd;
    /* 返回成功状态 */
    return AE_OK;
}
```

### aeCreateTimeEvent

```c
long long aeCreateTimeEvent(aeEventLoop *eventLoop, long long milliseconds,
        aeTimeProc *proc, void *clientData,
        aeEventFinalizerProc *finalizerProc)
{   
    /* 为新的计时器事件分配一个唯一的 id，同时eventLoop的timeEventNextId自增 */
    long long id = eventLoop->timeEventNextId++;
    aeTimeEvent *te;
    /* 为新的aeTimeEvent结构体申请内存 */
    te = zmalloc(sizeof(*te));
    /* 若内存分配失败，则返回 AE_ERR. */
    if (te == NULL) return AE_ERR;
    /* 将计时器事件对象的各个字段初始化. */
    te->id = id;
    /* 获取当前时间，加上延迟后赋值给计时器事件结构体的 when 字段 
     *
     */
    te->when = getMonotonicUs() + milliseconds * 1000;
    /* 指定回调函数. */
    te->timeProc = proc;
    te->finalizerProc = finalizerProc;
    /* 指定回调函数参数. */
    te->clientData = clientData;
    /* 新事件将被放在双向链表的前端. */
    te->prev = NULL;
    te->next = eventLoop->timeEventHead;
    te->refcount = 0;
    /* 若链表不为空，则设置下一个事件的前置指针为新事件. */
    if (te->next)
        te->next->prev = te;
    /* 将新事件设置为链表头. */    
    eventLoop->timeEventHead = te;
    /* 返回计时器事件的唯一标识符. */
    return id;
}
```

### aeProcessEvents

```c
int aeProcessEvents(aeEventLoop *eventLoop, int flags)
{
    int processed = 0, numevents;

    /* Nothing to do? return ASAP */
    if (!(flags & AE_TIME_EVENTS) && !(flags & AE_FILE_EVENTS)) return 0;

    /* Note that we want to call select() even if there are no
     * file events to process as long as we want to process time
     * events, in order to sleep until the next time event is ready
     * to fire. */
    if (eventLoop->maxfd != -1 ||
        ((flags & AE_TIME_EVENTS) && !(flags & AE_DONT_WAIT))) {
        int j;
        struct timeval tv, *tvp;
        int64_t usUntilTimer = -1;

        if (flags & AE_TIME_EVENTS && !(flags & AE_DONT_WAIT))
            usUntilTimer = usUntilEarliestTimer(eventLoop);

        if (usUntilTimer >= 0) {
            tv.tv_sec = usUntilTimer / 1000000;
            tv.tv_usec = usUntilTimer % 1000000;
            tvp = &tv;
        } else {
            /* If we have to check for events but need to return
             * ASAP because of AE_DONT_WAIT we need to set the timeout
             * to zero */
            if (flags & AE_DONT_WAIT) {
                tv.tv_sec = tv.tv_usec = 0;
                tvp = &tv;
            } else {
                /* Otherwise we can block */
                tvp = NULL; /* wait forever */
            }
        }

        if (eventLoop->flags & AE_DONT_WAIT) {
            tv.tv_sec = tv.tv_usec = 0;
            tvp = &tv;
        }

        if (eventLoop->beforesleep != NULL && flags & AE_CALL_BEFORE_SLEEP)
            eventLoop->beforesleep(eventLoop);

        /* Call the multiplexing API, will return only on timeout or when
         * some event fires. */
        numevents = aeApiPoll(eventLoop, tvp);

        /* Don't process file events if not requested. */
        if (!(flags & AE_FILE_EVENTS)) {
            numevents = 0;
        }

        /* After sleep callback. */
        if (eventLoop->aftersleep != NULL && flags & AE_CALL_AFTER_SLEEP)
            eventLoop->aftersleep(eventLoop);

        for (j = 0; j < numevents; j++) {
            int fd = eventLoop->fired[j].fd;
            aeFileEvent *fe = &eventLoop->events[fd];
            int mask = eventLoop->fired[j].mask;
            int fired = 0; /* Number of events fired for current fd. */

            /* Normally we execute the readable event first, and the writable
             * event later. This is useful as sometimes we may be able
             * to serve the reply of a query immediately after processing the
             * query.
             *
             * However if AE_BARRIER is set in the mask, our application is
             * asking us to do the reverse: never fire the writable event
             * after the readable. In such a case, we invert the calls.
             * This is useful when, for instance, we want to do things
             * in the beforeSleep() hook, like fsyncing a file to disk,
             * before replying to a client. */
            int invert = fe->mask & AE_BARRIER;

            /* Note the "fe->mask & mask & ..." code: maybe an already
             * processed event removed an element that fired and we still
             * didn't processed, so we check if the event is still valid.
             *
             * Fire the readable event if the call sequence is not
             * inverted. */
            if (!invert && fe->mask & mask & AE_READABLE) {
                fe->rfileProc(eventLoop,fd,fe->clientData,mask);
                fired++;
                fe = &eventLoop->events[fd]; /* Refresh in case of resize. */
            }

            /* Fire the writable event. */
            if (fe->mask & mask & AE_WRITABLE) {
                if (!fired || fe->wfileProc != fe->rfileProc) {
                    fe->wfileProc(eventLoop,fd,fe->clientData,mask);
                    fired++;
                }
            }

            /* If we have to invert the call, fire the readable event now
             * after the writable one. */
            if (invert) {
                fe = &eventLoop->events[fd]; /* Refresh in case of resize. */
                if ((fe->mask & mask & AE_READABLE) &&
                    (!fired || fe->wfileProc != fe->rfileProc))
                {
                    fe->rfileProc(eventLoop,fd,fe->clientData,mask);
                    fired++;
                }
            }

            processed++;
        }
    }
    /* Check time events */
    if (flags & AE_TIME_EVENTS)
        processed += processTimeEvents(eventLoop);

    return processed; /* return the number of processed file/time events */
}
```
