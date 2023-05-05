# anet(TCP 协议的socket连接)

## 头文件

## 方法

### anetSetBlock

```c
int anetSetBlock(char *err, int fd, int non_block) {
    int flags;

    /* Set the socket blocking (if non_block is zero) or non-blocking.
     * Note that fcntl(2) for F_GETFL and F_SETFL can't be
     * interrupted by a signal. */
    if ((flags = fcntl(fd, F_GETFL)) == -1) {
        anetSetError(err, "fcntl(F_GETFL): %s", strerror(errno));
        return ANET_ERR;
    }

    /* Check if this flag has been set or unset, if so, 
     * then there is no need to call fcntl to set/unset it again. */
    if (!!(flags & O_NONBLOCK) == !!non_block)
        return ANET_OK;

    if (non_block)
        flags |= O_NONBLOCK;
    else
        flags &= ~O_NONBLOCK;

    if (fcntl(fd, F_SETFL, flags) == -1) {
        anetSetError(err, "fcntl(F_SETFL,O_NONBLOCK): %s", strerror(errno));
        return ANET_ERR;
    }
    return ANET_OK;
}
```

### anetCloexec

```c
int anetCloexec(int fd) {
    int r;
    int flags;

    do {
        r = fcntl(fd, F_GETFD);
    } while (r == -1 && errno == EINTR);

    if (r == -1 || (r & FD_CLOEXEC))
        return r;

    flags = r | FD_CLOEXEC;

    do {
        r = fcntl(fd, F_SETFD, flags);
    } while (r == -1 && errno == EINTR);

    return r;
}
```

### anetListen

将套接字绑定到相应的地址，然后开始监听来自客户端的连接

:::tip 参数

- err：表示如果发生错误，则保存错误信息
- s：表示要监听的套接字
- sa：表示要绑定的地址（IP + 端口号）
- len：表示地址长度
- backlog：表示系统为此套接字维护的已完成连接队列的最大值。在 Linux 中，一般为 511。
:::

```c
static int anetListen(char *err, int s, struct sockaddr *sa, socklen_t len, int backlog) {
    /* 使用 bind 函数将套接字与指定地址进行绑定。若返回值为 -1 表示绑定失败 */
    if (bind(s,sa,len) == -1) {
        /* 如果发生错误，则保存并设置错误信息（将错误信息放入 err 参数中） */
        anetSetError(err, "bind: %s", strerror(errno));
        /* 关闭该套接字 */
        close(s);
        /* 返回 ANET_ERR 错误状态 */
        return ANET_ERR;
    }
    /* 如果 bind 成功，则将该套接字设置为监听状态，并开始监听来自客户端的请求 */
    if (listen(s, backlog) == -1) {
        /* 如果监听失败则保存并设置错误信息 */
        anetSetError(err, "listen: %s", strerror(errno));
        /* 关闭该套接字 */
        close(s);
        /* 返回 ANET_ERR 错误状态 */
        return ANET_ERR;
    }
    return ANET_OK;
}
```

### _anetTcpServer

```c
static int _anetTcpServer(char *err, int port, char *bindaddr, int af, int backlog)
{
    int s = -1, rv;
    char _port[6];  /* strlen("65535") */
    /* 查询条件，返回信息 */
    struct addrinfo hints, *servinfo, *p;
    /* 将端口号转为字符串类型 */
    snprintf(_port,6,"%d",port);
    /* hints 结构体的初始化 */
    memset(&hints,0,sizeof(hints));
    /* ipv4 or ipv6 */
    hints.ai_family = af;
    /* TCP 数据类型 */
    hints.ai_socktype = SOCK_STREAM;
    /* 如果 bindarry==NULL，返回的就是通配地址 */
    hints.ai_flags = AI_PASSIVE;    /* No effect if bindaddr != NULL */
    /* 地址通配符的处理 */
    if (bindaddr && !strcmp("*", bindaddr))
        bindaddr = NULL;
    if (af == AF_INET6 && bindaddr && !strcmp("::*", bindaddr))
        bindaddr = NULL;
    /* 获取指定主机名或服务名的网络地址信息 */
    if ((rv = getaddrinfo(bindaddr,_port,&hints,&servinfo)) != 0) {
        anetSetError(err, "%s", gai_strerror(rv));
        return ANET_ERR;
    }
    /* 遍历所有返回地址结构，尝试创建套接字并绑定到监听地址上 */
    for (p = servinfo; p != NULL; p = p->ai_next) {
        /* 创建套接字，返回一个文件描述符作为其标识符 */
        if ((s = socket(p->ai_family,p->ai_socktype,p->ai_protocol)) == -1)
            continue;
        /* IPv4 的套接字（socket）可以通过 IPv6 的地址进行连接，也就是说，IPv6 地址既可以通过 IPv6 协议簇（AF_INET6）来连接，
         * 也可以通过 IPv4 协议簇（AF_INET）来连接。但这种方式容易导致某些联网应用误解地址，造成非正常使用，因此需要设置 IPv6-only 模式。
         */
        if (af == AF_INET6 && anetV6Only(err,s) == ANET_ERR) goto error;
        /* 设置 SO_REUSEADDR 选项，确保重用地址 */
        if (anetSetReuseAddr(err,s) == ANET_ERR) goto error;
        /* 将套接字绑定到指定地址并设为监听状态 */
        if (anetListen(err,s,p->ai_addr,p->ai_addrlen,backlog) == ANET_ERR) s = ANET_ERR;
        goto end;
    }
    /* 无法绑定时的处理 */
    if (p == NULL) {
        anetSetError(err, "unable to bind socket, errno: %d", errno);
        goto error;
    }

error:
    /* 关闭套接字并返回错误码 */
    if (s != -1) close(s);
    s = ANET_ERR;
end:
    /* 当程序使用完由 getaddrinfo() 返回的地址结构链表后，必须调用 freeaddrinfo() 函数以释放这些内存区域 */
    freeaddrinfo(servinfo);
    return s;
}
```

### anetTcpServer

绑定 IPv4 地址支持时用于监听并接收客户端连接的函数

```c
int anetTcpServer(char *err, int port, char *bindaddr, int backlog)
{
    return _anetTcpServer(err, port, bindaddr, AF_INET, backlog);
}
```

### anetTcp6Server

绑定 IPv6 地址支持时用于监听并接收客户端连接的函数

```c
int anetTcp6Server(char *err, int port, char *bindaddr, int backlog)
{
    return _anetTcpServer(err, port, bindaddr, AF_INET6, backlog);
}
```

### anetPipe

创建一个管道（pipe），并返回这个管道的读写文件描述符。

```c
int anetPipe(int fds[2], int read_flags, int write_flags) {
    int pipe_flags = 0;
/* 条件编译，当操作系统为 Linux 或 FreeBSD **时编译以下代码块 */    
#if defined(__linux__) || defined(__FreeBSD__)
    /* When possible, try to leverage pipe2() to apply flags that are common to both ends.
     * There is no harm to set O_CLOEXEC to prevent fd leaks. */ 
    /* 优先使用 pipe2() 创建具有指定属性的管道，设置 O_CLOEXEC 来防止 fd 泄漏没有坏处。
     * 取按位与运算（&）是为了避免使用普通的 pipe() 创建出来的管道在设置属性时进行两次调用，
     * 因为 read_flags & write_flags 表示的是这两个标记的交集，它们都将被应用于该管道的读端和写端。这样可以更好地简化代码，并最小化性能损失。
     * O_CLOEXEC：在子进程中关闭文件描述符，等效于 fcntl() 中的 FD_CLOEXEC
     * O_NONBLOCK：将读写管道的文件描述符设置为非阻塞模式，等效于 fcntl() 中的 O_NONBLOCK。
     * O_DIRECT（仅 Linux 特有）：直接 I/O 模式，启用此模式可以在一些场景下提升性能。 */
    pipe_flags = O_CLOEXEC | (read_flags & write_flags);
    if (pipe2(fds, pipe_flags)) {
        /* Fail on real failures, and fallback to simple pipe if pipe2 is unsupported. */
        /* 如果不支持 pipe2()，则回退到普通的 pipe() */
        if (errno != ENOSYS && errno != EINVAL)
            return -1;
        pipe_flags = 0;
    } else {
        /* If the flags on both ends are identical, no need to do anything else. */
        /* 读端和写端的文件标志已经完全相同，也就意味着这两个端口都可以使用相同的文件描述符集合，并且没有必要再向内核申请额外的文件描述符 */
        if ((O_CLOEXEC | read_flags) == (O_CLOEXEC | write_flags))
            return 0;
        /* Clear the flags which have already been set using pipe2. */
        /* 清除已经被 pipe2() 设置的属性，后续可能 */
        read_flags &= ~pipe_flags;
        write_flags &= ~pipe_flags;
    }
#endif

    /* When we reach here with pipe_flags of 0, it means pipe2 failed (or was not attempted),
     * so we try to use pipe. Otherwise, we skip and proceed to set specific flags below. */
    /* 如果 pipe2() 创建失败或不可用或当前系统不为 Linux 或 FreeBSD，则使用普通的pipe去申请管道 */
    if (pipe_flags == 0 && pipe(fds))
        return -1;

    /* File descriptor flags.
     * Currently, only one such flag is defined: FD_CLOEXEC, the close-on-exec flag. */
    /* 检查 read_flags 和 write_flags 中是否设置了 O_CLOEXEC 标志，
     * 如果有，则将读端或写端的文件描述符设置为 close-on-exec，以便保证在进程执行 exec 系列函数时自动关闭它们。
     * 具体实现是通过调用fcntl函数（fcntl可以改变已打开的文件性质）并传入参数 F_SETFD, FD_CLOEXEC 来完成的。 */ 
    if (read_flags & O_CLOEXEC)
        if (fcntl(fds[0], F_SETFD, FD_CLOEXEC))
            goto error;
    if (write_flags & O_CLOEXEC)
        if (fcntl(fds[1], F_SETFD, FD_CLOEXEC))
            goto error;

    /* File status flags after clearing the file descriptor flag O_CLOEXEC. */
    /* 代码使用位运算操作符将 O_CLOEXEC 从 read_flags 和 write_flags 中清除，
     * 并在剩余标志不为0时，通过调用 fcntl() 函数为管道读端和写端设置相应的文件状态标志。例如，可以设置管道为非阻塞模式(O_NONBLOCK)，以便提高性能和响应速度。 */
    read_flags &= ~O_CLOEXEC;
    if (read_flags)
        if (fcntl(fds[0], F_SETFL, read_flags))
            goto error;
    write_flags &= ~O_CLOEXEC;
    if (write_flags)
        if (fcntl(fds[1], F_SETFL, write_flags))
            goto error;

    return 0;

error:
    /* 错误后，关闭fd */
    close(fds[0]);
    close(fds[1]);
    return -1;
}
```
