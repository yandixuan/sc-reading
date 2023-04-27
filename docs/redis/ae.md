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

    monotonicInit();    /* just in case the calling app didn't initialize */

    if ((eventLoop = zmalloc(sizeof(*eventLoop))) == NULL) goto err;
    eventLoop->events = zmalloc(sizeof(aeFileEvent)*setsize);
    eventLoop->fired = zmalloc(sizeof(aeFiredEvent)*setsize);
    if (eventLoop->events == NULL || eventLoop->fired == NULL) goto err;
    eventLoop->setsize = setsize;
    eventLoop->timeEventHead = NULL;
    eventLoop->timeEventNextId = 0;
    eventLoop->stop = 0;
    eventLoop->maxfd = -1;
    eventLoop->beforesleep = NULL;
    eventLoop->aftersleep = NULL;
    eventLoop->flags = 0;
    if (aeApiCreate(eventLoop) == -1) goto err;
    /* Events with mask == AE_NONE are not set. So let's initialize the
     * vector with it. */
    for (i = 0; i < setsize; i++)
        eventLoop->events[i].mask = AE_NONE;
    return eventLoop;

err:
    if (eventLoop) {
        zfree(eventLoop->events);
        zfree(eventLoop->fired);
        zfree(eventLoop);
    }
    return NULL;
}
```
