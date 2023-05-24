# InitServerLast

主要用于创建后台线程，和IO多线程读写相关

```c
void InitServerLast() {
    /* 初始化BIO库（Background I/O library），用于异步执行耗时操作，例如文件读写、网络数据发送等。 */
    bioInit();
    /* 启动Redis的多线程I/O支持 */
    initThreadedIO();
    /* 启动Jemalloc后台线程（background thread），进行内存碎片整理和回收工作。 */
    set_jemalloc_bg_thread(server.jemalloc_bg_thread);
    /* 记录Redis服务器启动前的内存占用大小 */
    server.initial_memory_usage = zmalloc_used_memory();
}
```
