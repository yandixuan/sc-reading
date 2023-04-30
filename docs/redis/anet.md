# anet(TCP 协议的socket连接)

## 头文件

## 方法

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
