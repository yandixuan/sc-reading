# ae_epoll(Linux)

## 结构体

### aeApiState

```c
typedef struct aeApiState {
    /* epoll实例描述符 */
    int epfd;
    /* 指向一个epoll_event结构体数组的指针，该数组存放了所有已经被监听的文件描述符以及相应的事件类型 */
    struct epoll_event *events;
} aeApiState;
```

## 方法

### aeApiCreate

用于创建epoll实例，参数为事件循环结构体的指针

```c
static int aeApiCreate(aeEventLoop *eventLoop) {
    /* 分配一个aeApiState结构体的内存空间  */
    aeApiState *state = zmalloc(sizeof(aeApiState));
    /* 判断分配内存是否成功 */
    if (!state) return -1;
    /* 为epoll_event数组分配内存空间 */
    state->events = zmalloc(sizeof(struct epoll_event)*eventLoop->setsize);
    /* 如果分配内存失败，则释放已经分配的内存并返回-1  */
    if (!state->events) {
        zfree(state);
        return -1;
    }
    /* 创建epoll实例 
     * Linux 内核 2.6.8 版本以后，这个参数是被忽略的，只需要指定一个大于 0 的数值就可以了
     * 1024只是对内核的一个提示 */
    state->epfd = epoll_create(1024); /* 1024 is just a hint for the kernel */
    /* 如果创建失败，则释放已经分配的内存并返回-1 */
    if (state->epfd == -1) {
        zfree(state->events);
        zfree(state);
        return -1;
    }
    /* 将epfd设置为close-on-exec
     * https://blog.csdn.net/Leeds1993/article/details/52724428/
     * 文件描述符在我们fork出子进程后、执行exec时就关闭，可以方便我们关闭无用的文件描述符 */
    anetCloexec(state->epfd);
    /* 设置eventLoop的apidata指向state */
    eventLoop->apidata = state;
    /* 返回0表示创建成功 */
    return 0;
}
```

### aeApiAddEvent

```c
static int aeApiAddEvent(aeEventLoop *eventLoop, int fd, int mask) {
    /* 获取底层API相关对象 */
    aeApiState *state = eventLoop->apidata;
    /* 始化epoll_event结构体，将所有字段的值都赋为0 */
    struct epoll_event ee = {0}; /* avoid valgrind warning */
    /* If the fd was already monitored for some event, we need a MOD
     * operation. Otherwise we need an ADD operation. */
    /* EPOLL_CTL_ADD:注册新的fd到epfd 
     * EPOLL_CTL_MOD:修改已经注册的fd监听事件
     * 在epoll事件模型中，我们需要将需要监控的文件描述符（如socket）添加到epfd所代表的内核事件表中，以便在该文件描述符上发生感兴趣的事件时，能够通知应用程序进行相应处理。
     * 即 AE_NONE则代表要将fd注册到epfd中 */ 
    int op = eventLoop->events[fd].mask == AE_NONE ?
            EPOLL_CTL_ADD : EPOLL_CTL_MOD;

    ee.events = 0;
    /* 将旧的事件和新的事件合并起来 */
    mask |= eventLoop->events[fd].mask; /* Merge old events */
    /* 设置感兴趣事件 
     * 可读事件
     * 可写事件
     */
    if (mask & AE_READABLE) ee.events |= EPOLLIN;
    if (mask & AE_WRITABLE) ee.events |= EPOLLOUT;
    /* 赋值fd */
    ee.data.fd = fd;
    /* epoll_ctl向 epoll对象中添加、修改或者删除感兴趣的事件，返回0表示成功，否则返回–1 */
    if (epoll_ctl(state->epfd,op,fd,&ee) == -1) return -1;
    return 0;
}
```
