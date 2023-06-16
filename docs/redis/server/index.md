# server

## 相关

<PageLink icon="i-carbon-document" title="头文件" url="./header"/>
<PageLink icon="i-carbon-document" title="initServer" url="./initServer"/>
<PageLink icon="i-carbon-document" title="initListeners" url="./initListeners"/>
<PageLink icon="i-carbon-document" title="InitServerLast" url="./InitServerLast"/>

## main

redis-server进程主函数入口

```c
    struct timeval tv;
    int j;
    char config_from_stdin = 0;
#ifdef INIT_SETPROCTITLE_REPLACEMENT
    /* 设置进程名 */
    spt_init(argc, argv);
#endif
    /* tzset 函数实现 UNIX 时间兼容，设置时区 */
    tzset(); /* Populates 'timezone' global. */
    /* 设置内存溢出的处理函数 */
    zmalloc_set_oom_handler(redisOutOfMemoryHandler);

    /* To achieve entropy, in case of containers, their time() and getpid() can
     * be the same. But value of tv_usec is fast enough to make the difference */
    /* 获取系统当前时间，保存到tv结构体中 */ 
    gettimeofday(&tv,NULL);
    /* int型随机数发生器的初始化函数srand，
     * long型随机数发生器的初始化函数srandom，
     * 用当前时间、进程ID、tv.tv_usec进行按位异或增大随机种子的随机概率 */
    srand(time(NULL)^getpid()^tv.tv_usec);
    srandom(time(NULL)^getpid()^tv.tv_usec);
    /* 初始化64位梅森旋转算法的随机器 */
    init_genrand64(((long long) tv.tv_sec * 1000000 + tv.tv_usec) ^ getpid());
    /* 会初始化一个crc校验用的Lookup Table 空间换时间o(1)的时间复杂度算出CRC校验码 */
    crc64_init();

    /* Store umask value. Because umask(2) only offers a set-and-get API we have
     * to reset it and restore it back. We do this early to avoid a potential
     * race condition with threads that could be creating files or directories.
     */
    /* umask()会将系统umask值设成参数mask&0777后的值, 然后将先前的umask值返回
     * server.umask存储当前系统的权限掩码，然后再设置回去
     */
    umask(server.umask = umask(0777));
    /* 根据本地时间生成一个随机数种子（16字节数组），后面要介绍的dict结构体内会有用到 */
    uint8_t hashseed[16];
    /* hashseed填充随机元素作为初始化值，用作哈希表的seed */
    getRandomBytes(hashseed,sizeof(hashseed));
    /* 将seed的16字节赋值给dict_hash_function_seed */
    dictSetHashFunctionSeed(hashseed);
    /* 获取执行文件名称 */
    char *exec_name = strrchr(argv[0], '/');
    if (exec_name == NULL) exec_name = argv[0];
    // 判断是否开启了哨兵模式
    server.sentinel_mode = checkForSentinelMode(argc,argv, exec_name);
    /* 初始化服务端配置 */
    initServerConfig();
    /* ACL子系统的初始化，是6.0之后新增的内容 */
    ACLInit(); /* The ACL subsystem must be initialized ASAP because the
                  basic networking code and client creation depends on it. */
    /* 初始化模块环境并注册api https://github.com/vislee/leevis.com/issues/60 */
    moduleInitModulesSystem();
    /* 初始化连接类型 */
    connTypeInitialize();

    /* Store the executable path and arguments in a safe place in order
     * to be able to restart the server later. */
    /* 将可执行路径和参数存储在一个安全的地方，以便以后能够重新启动服务器 */
    server.executable = getAbsolutePath(argv[0]);
    /* 使用zmalloc分配了一个内存空间，该空间大小为char *类型的指针数，即 argc+1。
     * 然后，将最后一个元素设置为NULL，以便确定参数列表在哪里结束
     */
    server.exec_argv = zmalloc(sizeof(char*)*(argc+1));
    server.exec_argv[argc] = NULL;
    /* 将参数复制进数组exec_argv中 */
    for (j = 0; j < argc; j++) server.exec_argv[j] = zstrdup(argv[j]);

    /* We need to init sentinel right now as parsing the configuration file
     * in sentinel mode will have the effect of populating the sentinel
     * data structures with master nodes to monitor. */
    /* 如果是哨兵模式，就初始化哨兵的配置以及哨兵模式的参数 */ 
    if (server.sentinel_mode) {
        initSentinelConfig();
        initSentinel();
    }

    /* Check if we need to start in redis-check-rdb/aof mode. We just execute
     * the program main. However the program is part of the Redis executable
     * so that we can easily execute an RDB check on loading errors. */
    /* 检查是否要执行 RDB 检测或 AOF 检查，这对应了实际运行的程序是 redis-check-rdb 或 redis-check-aof */ 
    if (strstr(exec_name,"redis-check-rdb") != NULL)
        redis_check_rdb_main(argc,argv,NULL);
    else if (strstr(exec_name,"redis-check-aof") != NULL)
        redis_check_aof_main(argc,argv);

    if (argc >= 2) {
        /* 解析命令行的选项 */u
        j = 1; /* First option to parse in argv[] */
        sds options = sdsempty();

        /* Handle special options --help and --version */
        /* 处理特殊的命令行选项，--help、--version */
        if (strcmp(argv[1], "-v") == 0 ||
            /* 打印redis版本相关信息 */
            strcmp(argv[1], "--version") == 0) version();
        if (strcmp(argv[1], "--help") == 0 ||
            /* 打印redis服务端的使用方式 */
            strcmp(argv[1], "-h") == 0) usage();
        /* 内存检测 */    
        if (strcmp(argv[1], "--test-memory") == 0) {
            if (argc == 3) {
                memtest(atoi(argv[2]),50);
                exit(0);
            } else {
                fprintf(stderr,"Please specify the amount of memory to test in megabytes.\n");
                fprintf(stderr,"Example: ./redis-server --test-memory 4096\n\n");
                exit(1);
            }
        /* 执行系统检查 */    
        } if (strcmp(argv[1], "--check-system") == 0) {
            exit(syscheck() ? 0 : 1);
        }
        /* Parse command line options
         * Precedence wise, File, stdin, explicit options -- last config is the one that matters.
         *
         * First argument is the config file name? */
        /* 如果第一个参数（argv[1]）不是以 "--" 或 "-" 开头，那么它应该是一个配置文件 */ 
        if (argv[1][0] != '-') {
            /* Replace the config file in server.exec_argv with its absolute path. */
            /* 返回配置文件的绝对路径（SDS），同时释放server.exec_argv[1]所占用的内存 */
            server.configfile = getAbsolutePath(argv[1]);
            zfree(server.exec_argv[1]);
            server.exec_argv[1] = zstrdup(server.configfile);
            /* 处理option的时候从索引2开始 */
            j = 2; // Skip this arg when parsing options
        }
        sds *argv_tmp;
        int argc_tmp;
        int handled_last_config_arg = 1;
        while(j < argc) {
            /* Either first or last argument - Should we read config from stdin? */
            /* 检查命令行参数是否是一个单独的 -，如果是的话，表示程序需要从标准输入中读取配置 */
            if (argv[j][0] == '-' && argv[j][1] == '\0' && (j == 1 || j == argc-1)) {
                config_from_stdin = 1;
            }
            /* All the other options are parsed and conceptually appended to the
             * configuration file. For instance --port 6380 will generate the
             * string "port 6380\n" to be parsed after the actual config file
             * and stdin input are parsed (if they exist).
             * Only consider that if the last config has at least one argument. */
            /* 当前参数以双破折线（--）开头，则进入以下分支 */
            else if (handled_last_config_arg && argv[j][0] == '-' && argv[j][1] == '-') {
                /* Option name */
                /* options 变量的内容末尾添加一个换行符，以确保下一行输出的内容和当前行的选项显示在不同行上，以提高输出的可读性 */
                if (sdslen(options)) options = sdscat(options,"\n");
                /* argv[j]+2 for removing the preceding `--` */
                /* argv[j]+2的目的是为了跳过命令行参数的前缀-- */
                options = sdscat(options,argv[j]+2);
                /* 字符串末尾加上一个空格，以便将该选项与后面的参数分隔开来 */
                options = sdscat(options," ");
                /* eg:"--port 6379"，将字符串分割 */
                argv_tmp = sdssplitargs(argv[j], &argc_tmp);
                if (argc_tmp == 1) {
                    /* Means that we only have one option name, like --port or "--port " */
                    /* 进入这个分支，说明只有一个参数，设置处理参数标志 */
                    handled_last_config_arg = 0;
                    /* 如果当前选项为 --save，并且接下来的参数仍然是选项参数，则将其解析为 "",表示这个选项没有值 */
                    if ((j != argc-1) && argv[j+1][0] == '-' && argv[j+1][1] == '-' &&
                        !strcasecmp(argv[j], "--save"))
                    {
                        /* Special case: handle some things like `--save --config value`.
                         * In this case, if next argument starts with `--`, we will reset
                         * handled_last_config_arg flag and append an empty "" config value
                         * to the options, so it will become `--save "" --config value`.
                         * We are doing it to be compatible with pre 7.0 behavior (which we
                         * break it in #10660, 7.0.1), since there might be users who generate
                         * a command line from an array and when it's empty that's what they produce. */
                        options = sdscat(options, "\"\"");
                        /* 更改标志，说明处理完一组参数 */
                        handled_last_config_arg = 1;
                    }
                    /* 如果命令行最后一个参数是"--save"，且没有任何配置信息紧随其后，这里会将一个空字符串""追加到options字符串的末尾 */
                    else if ((j == argc-1) && !strcasecmp(argv[j], "--save")) {
                        /* Special case: when empty save is the last argument.
                         * In this case, we append an empty "" config value to the options,
                         * so it will become `--save ""` and will follow the same reset thing. */
                        options = sdscat(options, "\"\"");
                    }
                    /* --sentinel是一个伪配置选项，它没有值,这里会将一个空字符串""追加到options字符串的末尾 */
                    else if ((j != argc-1) && argv[j+1][0] == '-' && argv[j+1][1] == '-' &&
                        !strcasecmp(argv[j], "--sentinel"))
                    {
                        /* Special case: handle some things like `--sentinel --config value`.
                         * It is a pseudo config option with no value. In this case, if next
                         * argument starts with `--`, we will reset handled_last_config_arg flag.
                         * We are doing it to be compatible with pre 7.0 behavior (which we
                         * break it in #10660, 7.0.1). */
                        options = sdscat(options, "");
                        handled_last_config_arg = 1;
                    }
                    /* 如果命令行最后一个参数是 "--sentinel"，且没有任何配置信息紧随其后，这里会将一个空字符串""追加到options字符串的末尾 */
                    else if ((j == argc-1) && !strcasecmp(argv[j], "--sentinel")) {
                        /* Special case: when --sentinel is the last argument.
                         * It is a pseudo config option with no value. In this case, do nothing.
                         * We are doing it to be compatible with pre 7.0 behavior (which we
                         * break it in #10660, 7.0.1). */
                        options = sdscat(options, "");
                    }
                } else {
                    /* Means that we are passing both config name and it's value in the same arg,
                     * like "--port 6380", so we need to reset handled_last_config_arg flag. */
                    handled_last_config_arg = 1;
                }
                /* 释放临时变量的内存 */
                sdsfreesplitres(argv_tmp, argc_tmp);
            } else {
                /* Option argument */
                /* 参数拼接上去，再用空格分隔 类似 'port "7777" ' */
                options = sdscatrepr(options,argv[j],strlen(argv[j]));
                options = sdscat(options," ");
                handled_last_config_arg = 1;
            }
            /* 处理下一个字符串 */
            j++;
        }
        /* 加载 Redis 服务器的配置。它接受三个参数:
         * Redis 配置文件的路径
         * 是否从标准输入中读取配置。这个值会在解析命令行参数时被设置
         * Redis 配置选项。这个字符串包含了从命令行读取到的 Redis 配置选项和对应的值
         */
        loadServerConfig(server.configfile, config_from_stdin, options);
        /* 是否在sentinel模式下运行，则从sentinel.conf中加载配置 */
        if (server.sentinel_mode) loadSentinelConfigFromQueue();
        /* 加载完配置后，这个字符串就不再需要了，即释放options字符串的内存空间 */
        sdsfree(options);
    }
    /* 检查哨兵配置文件 */
    if (server.sentinel_mode) sentinelCheckConfigFile();

    /* Do system checks */
    /* linuxMemoryWarnings：在内存使用达到某个阈值时发出警告
     * checkXenClocksource：检查系统时钟源是否正确，如果不正确则可能导致性能下降
     * checkLinuxMadvFreeForkBug：检查系统是否受到特定内核bug影响，可能导致在后台保存数据时出现数据损坏
     */
#ifdef __linux__
    linuxMemoryWarnings();
    sds err_msg = NULL;
    if (checkXenClocksource(&err_msg) < 0) {
        serverLog(LL_WARNING, "WARNING %s", err_msg);
        sdsfree(err_msg);
    }
#if defined (__arm64__)
    int ret;
    if ((ret = checkLinuxMadvFreeForkBug(&err_msg)) <= 0) {
        if (ret < 0) {
            serverLog(LL_WARNING, "WARNING %s", err_msg);
            sdsfree(err_msg);
        } else
            serverLog(LL_WARNING, "Failed to test the kernel for a bug that could lead to data corruption during background save. "
                                  "Your system could be affected, please report this error.");
        if (!checkIgnoreWarning("ARM64-COW-BUG")) {
            serverLog(LL_WARNING,"Redis will now exit to prevent data corruption. "
                                 "Note that it is possible to suppress this warning by setting the following config: ignore-warnings ARM64-COW-BUG");
            exit(1);
        }
    }
#endif /* __arm64__ */
#endif /* __linux__ */

    /* Daemonize if needed */
    /* 检查当前 Redis 进程是否被某个监控进程管理，检查方式因平台而异，
     * Linux 上的实现是检查当前进程的父进程是否为 1（init 进程）。如果是，说明 Redis 进程被启动在监控模式下，否则不是。 */
    server.supervised = redisIsSupervised(server.supervised_mode);
    /* 判断redis是否需要后台运行 */
    int background = server.daemonize && !server.supervised;
    if (background) daemonize();

    serverLog(LL_NOTICE, "oO0OoO0OoO0Oo Redis is starting oO0OoO0OoO0Oo");
    serverLog(LL_NOTICE,
        "Redis version=%s, bits=%d, commit=%s, modified=%d, pid=%d, just started",
            REDIS_VERSION,
            (sizeof(long) == 8) ? 64 : 32,
            redisGitSHA1(),
            strtol(redisGitDirty(),NULL,10) > 0,
            (int)getpid());

    if (argc == 1) {
        serverLog(LL_WARNING, "Warning: no config file specified, using the default config. In order to specify a config file use %s /path/to/redis.conf", argv[0]);
    } else {
        serverLog(LL_NOTICE, "Configuration loaded");
    }
    /* 初始化服务器相关的结构体和参数 */
    initServer();
    /* 是否需要以后台进程方式运行或者设置了pidfile，如有则创建pidfile */
    if (background || server.pidfile) createPidFile();
    /* 设置命令行进程标题，方便观察进程信息 */
    if (server.set_proc_title) redisSetProcTitle(NULL);
    /* 显示Redis启动LOGO */
    redisAsciiArt();
    /* 检查server.tcp_backlog(最大允许连接客户端数)相关参数配置是否足够大 */
    checkTcpBacklogSettings();
    /* 如果开启了集群模式，则进行集群初始化 */
    if (server.cluster_enabled) {
        clusterInit();
    }
    /* 如果不是Sentinel模式，则初始化模块，并加载从配置文件里提前读入到队列中的模块 */
    if (!server.sentinel_mode) {
        moduleInitModulesSystemLast();
        moduleLoadFromQueue();
    }
    /* 加载启动时用户的ACL信息 */
    ACLLoadUsersAtStartup();
    /* 初始化监听器 */
    initListeners();
    /* 如果是集群模式，则初始化集群监听器 */
    if (server.cluster_enabled) {
        clusterInitListeners();
    }
    /* 最后进行一些其他服务器初始化操作 */
    InitServerLast();
    /* 如果不是Sentinel模式 */
    if (!server.sentinel_mode) {
        /* Things not needed when running in Sentinel mode. */
        serverLog(LL_NOTICE,"Server initialized");
        /* 从磁盘上加载AOF持久化的manifest文件 */
        aofLoadManifestFromDisk();
        /* 从磁盘上加载RDB持久化的快照 */
        loadDataFromDisk();
        /* 如果AOF持久化开启，则打开并同步至最新状态 */
        aofOpenIfNeededOnServerStart();
        /* 删除已经超过历史版本数目限制的AOF备份文件 */
        aofDelHistoryFiles();
        /* 检验集群配置信息是否正确 */
        if (server.cluster_enabled) {
            serverAssert(verifyClusterConfigWithData() == C_OK);
        }
        /* 输出监听端口信息 */
        for (j = 0; j < CONN_TYPE_MAX; j++) {
            connListener *listener = &server.listeners[j];
            if (listener->ct == NULL)
                continue;

            serverLog(LL_NOTICE,"Ready to accept connections %s", listener->ct->get_type(NULL));
        }
        /* 如果是以systemd方式管理进程，则通过redisCommunicateSystemd()函数与对应的守护程序通信，告诉本进程状态为"就绪"的状态 */
        if (server.supervised_mode == SUPERVISED_SYSTEMD) {
            if (!server.masterhost) {
                redisCommunicateSystemd("STATUS=Ready to accept connections\n");
            } else {
                redisCommunicateSystemd("STATUS=Ready to accept connections in read-only mode. Waiting for MASTER <-> REPLICA sync\n");
            }
            redisCommunicateSystemd("READY=1\n");
        }
    } else {
        /* 如果是Sentinel模式，则检测当前启动的哨兵状态并向systemd守护程序通信进行状态更新 */
        sentinelIsRunning();
        if (server.supervised_mode == SUPERVISED_SYSTEMD) {
            redisCommunicateSystemd("STATUS=Ready to accept connections\n");
            redisCommunicateSystemd("READY=1\n");
        }
    }

    /* Warning the user about suspicious maxmemory setting. */
    /* 如果设置了maxmemory值过小，发送警告信息给日志记录系统 */
    if (server.maxmemory > 0 && server.maxmemory < 1024*1024) {
        serverLog(LL_WARNING,"WARNING: You specified a maxmemory value that is less than 1MB (current value is %llu bytes). Are you sure this is what you really want?", server.maxmemory);
    }
    /* 通过配置来设置CPU亲和度
     * Redis 的进程绑定到特定的 CPU 核心上，可以更有效地利用硬件资源并减少由于 CPU 切换造成的额外开销 */
    redisSetCpuAffinity(server.server_cpulist);
    /* 设置 Redis 进程在全局进程列表中的 OOM_Score_Adjust 值，该值越低，
     * 则表示对系统的资源占用越少，在系统遇到资源吃紧情况下更难被杀死。 */
    setOOMScoreAdj(-1);
    /* 启动事件循环机制 */
    aeMain(server.el);
    /* 事件循环结束，删除event loop */
    aeDeleteEventLoop(server.el);
    return 0;
```
