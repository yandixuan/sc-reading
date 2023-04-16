# server(服务器)

## 头文件

### OBJ

```c
/* The actual Redis Object */
#define OBJ_STRING 0    /* String object. */
#define OBJ_LIST 1      /* List object. */
#define OBJ_SET 2       /* Set object. */
#define OBJ_ZSET 3      /* Sorted set object. */
#define OBJ_HASH 4      /* Hash object. */

/* The "module" object type is a special one that signals that the object
 * is one directly managed by a Redis module. In this case the value points
 * to a moduleValue struct, which contains the object value (which is only
 * handled by the module itself) and the RedisModuleType struct which lists
 * function pointers in order to serialize, deserialize, AOF-rewrite and
 * free the object.
 *
 * Inside the RDB file, module types are encoded as OBJ_MODULE followed
 * by a 64 bit module type ID, which has a 54 bits module-specific signature
 * in order to dispatch the loading to the right module, plus a 10 bits
 * encoding version. */
#define OBJ_MODULE 5    /* Module object. */
#define OBJ_STREAM 6    /* Stream object. */
```

### OBJ_ENCODING

```c
/* Objects encoding. Some kind of objects like Strings and Hashes can be
 * internally represented in multiple ways. The 'encoding' field of the object
 * is set to one of this fields for this object. */
/* 简单动态字符串 */ 
#define OBJ_ENCODING_RAW 0     /* Raw representation */
/* 编码为整数 */
#define OBJ_ENCODING_INT 1     /* Encoded as integer */
/* 编码为哈希表 */
#define OBJ_ENCODING_HT 2      /* Encoded as hash table */
/* 不再用，旧的hash编码 */
#define OBJ_ENCODING_ZIPMAP 3  /* No longer used: old hash encoding. */
/* 不再用，旧的list编码 */
#define OBJ_ENCODING_LINKEDLIST 4 /* No longer used: old list encoding. */
/* 不再用，压缩列表 list/hash/zset所使用 */
#define OBJ_ENCODING_ZIPLIST 5 /* No longer used: old list/hash/zset encoding. */
/* 编码为整数集合 */
#define OBJ_ENCODING_INTSET 6  /* Encoded as intset */
/* 编码为跳跃表 */
#define OBJ_ENCODING_SKIPLIST 7  /* Encoded as skiplist */
/* 编码为编码为SDS字符串,但是obj_encoding_embstr编码的数据都存储在连续的内存上，一次性分配好的 */
#define OBJ_ENCODING_EMBSTR 8  /* Embedded sds string encoding */
/* 编码为快速列表 压缩列表+链表 */
#define OBJ_ENCODING_QUICKLIST 9 /* Encoded as linked list of listpacks */
/* 编码为流 */
#define OBJ_ENCODING_STREAM 10 /* Encoded as a radix tree of listpacks */
/* 编码为压缩链表 listpack 的出现是用来代替 ziplist 的 */
#define OBJ_ENCODING_LISTPACK 11 /* Encoded as a listpack */

/* Redis 在实现上引入了一个LRU时钟来代替unix时间戳，每个对象的每次被访问都会记录下当前服务器的LRU时钟，
 * 然后用服务器的LRU时钟减去对象本身的时钟，得到的就是这个对象没有被访问的时间间隔（也称空闲时间），空闲时间最大的就是需要淘汰的对象。 */

/* 当使用LRU时，它保存的上次读写的24位unix时间戳(秒级)；使用LFU时，24位会被分为两个部分，16位的分钟级时间戳和8位特殊计数器 */
#define LRU_BITS 24
/* LRU时钟最大值 */
#define LRU_CLOCK_MAX ((1<<LRU_BITS)-1) /* Max value of obj->lru */
/* LRU_CLOCK_RESOLUTION 是指 Least Recently Used (LRU) 算法中的时钟分辨率，
 * 即指定多长时间内对数据进行一次检查更新。它的作用是控制在缓存容量有限的情况下，如何更好地利用缓存空间的策略。
 * 通过调整 LRU_CLOCK_RESOLUTION 的值，可以使缓存更加准确地判断哪些数据经常被访问，哪些数据很少被访问。
 * 较小的 LRU_CLOCK_RESOLUTION 值能够更准确地确定数据的使用频率，但也会导致更多的性能损失，因为缓存需要更频繁地更新。
 * 较大的 LRU_CLOCK_RESOLUTION 能够减少性能损失，但会降低缓存的准确性，因为缓存可能会错误地保留很少被访问的数据 */
#define LRU_CLOCK_RESOLUTION 1000 /* LRU clock resolution in ms */

```

### redisCommandGroup

```c
/* Must be synced with COMMAND_GROUP_STR and generate-command-code.py */
/* redis命令组 */
typedef enum {
    COMMAND_GROUP_GENERIC,
    COMMAND_GROUP_STRING,
    COMMAND_GROUP_LIST,
    COMMAND_GROUP_SET,
    COMMAND_GROUP_SORTED_SET,
    COMMAND_GROUP_HASH,
    COMMAND_GROUP_PUBSUB,
    COMMAND_GROUP_TRANSACTIONS,
    COMMAND_GROUP_CONNECTION,
    COMMAND_GROUP_SERVER,
    COMMAND_GROUP_SCRIPTING,
    COMMAND_GROUP_HYPERLOGLOG,
    COMMAND_GROUP_CLUSTER,
    COMMAND_GROUP_SENTINEL,
    COMMAND_GROUP_GEO,
    COMMAND_GROUP_STREAM,
    COMMAND_GROUP_BITMAP,
    COMMAND_GROUP_MODULE,
} redisCommandGroup;
```

### redisCommandArg

redis命令参数结构体

```c
/* WARNING! This struct must match RedisModuleCommandArg */
typedef struct redisCommandArg {
    const char *name;
    redisCommandArgType type;
    int key_spec_index;
    const char *token;
    const char *summary;
    const char *since;
    int flags;
    const char *deprecated_since;
    struct redisCommandArg *subargs;
    const char *display_text;
    /* runtime populated data */
    int num_args;
} redisCommandArg;
```

### redisCommand

[redisCommandGroup](#rediscommandgroup)

```c

struct redisCommand {
    /* 命令名称 */
    /* Declarative data */
    const char *declared_name; /* A string representing the command declared_name.
                                * It is a const char * for native commands and SDS for module commands. */
    /* 命令功能的描述（可选） */
    const char *summary; /* Summary of the command (optional). */
    /* 命令的时间负责度（可选） */
    const char *complexity; /* Complexity description (optional). */
    /* 命令首次亮相的版本号 */
    const char *since; /* Debut version of the command (optional). */
    /* 0：正常命令；1：命令过时；2：内部命令 */
    int doc_flags; /* Flags for documentation (see CMD_DOC_*). */
    /* 被什么命令替代 */
    const char *replaced_by; /* In case the command is deprecated, this is the successor command. */
    /* 从什么版本号开始过期 */
    const char *deprecated_since; /* In case the command is deprecated, when did it happen? */
    /* redis命令组 */
    redisCommandGroup group; /* Command group */
    /* 命令的变更历史记录 */
    commandHistory *history; /* History of the command */
    const char **tips; /* An array of strings that are meant to be tips for clients/proxies regarding this command */
    /* 命令相应的执行方法 */
    redisCommandProc *proc; /* Command implementation */

    /* 命令参数数目，用于校验命令请求格式是否正确；当arity小于0时，表示命令参数数目大于等于arity；
     * 当arity大于0时，表示命令参数数目必须为arity；注意命令请求中，命令的名称本身也是一个参数 */
    int arity; /* Number of arguments, it is possible to use -N to say >= N */
    uint64_t flags; /* Command flags, see CMD_*. */
    /* ACL的类别 */
    uint64_t acl_categories; /* ACl categories, see ACL_CATEGORY_*. */
    keySpec key_specs_static[STATIC_KEY_SPECS_NUM]; /* Key specs. See keySpec */
    /* Use a function to determine keys arguments in a command line.
     * Used for Redis Cluster redirect (may be NULL) */
    redisGetKeysProc *getkeys_proc;
    /* Array of subcommands (may be NULL) */
    struct redisCommand *subcommands;
    /* Array of arguments (may be NULL) */
    /* redis命令参数 */
    struct redisCommandArg *args;

    /* Runtime populated data */
    /* microseconds：从服务器启动至今命令总的执行时间
     * calls：从服务器启动至今命令执行的次数，用于统计
     * rejected_calls：从服务器启动至今命令执行拒绝的次数，用于统计
     * failed_calls：从服务器启动至今命令执行失败的次数，用于统计
     */
    long long microseconds, calls, rejected_calls, failed_calls;
    int id;     /* Command ID. This is a progressive ID starting from 0 that
                   is assigned at runtime, and is used in order to check
                   ACLs. A connection is able to execute a given command if
                   the user associated to the connection has this command
                   bit set in the bitmap of allowed commands. */
    /* declared_name封装成sds类型 */               
    sds fullname; /* A SDS string representing the command fullname. */
    /* 命令执行耗时直方图 */
    struct hdr_histogram* latency_histogram; /*points to the command latency command histogram (unit of time nanosecond) */
    keySpec *key_specs;
    keySpec legacy_range_key_spec; /* The legacy (first,last,step) key spec is
                                     * still maintained (if applicable) so that
                                     * we can still support the reply format of
                                     * COMMAND INFO and COMMAND GETKEYS */
    int num_args;
    int num_history;
    int num_tips;
    int key_specs_num;
    int key_specs_max;
    dict *subcommands_dict; /* A dictionary that holds the subcommands, the key is the subcommand sds name
                             * (not the fullname), and the value is the redisCommand structure pointer. */
    struct redisCommand *parent;
    struct RedisModuleCommand *module_cmd; /* A pointer to the module command data (NULL if native command) */
};
```

### redisObject

[type](#obj)

[encoding](#obj-encoding)

```c
struct redisObject {
    unsigned type:4;
    unsigned encoding:4;
    /* lru----> 高16位: 最后被访问的时间，时间戳秒级十进制是19位，所以分钟级别的是16位 
     * lfu----> 低8位: 最近访问次数
     */
    unsigned lru:LRU_BITS; /* LRU time (relative to global lru_clock) or
                            * LFU data (least significant 8 bits frequency
                            * and most significant 16 bits access time). */
    /* 记录的是该对象被引用的次数 */
    int refcount;
    /* 指针指向具体的数据 */
    void *ptr;
};
```

## 方法

### ustime

```c
/* Return the UNIX time in microseconds */
long long ustime(void) {
    /*  创建一个 struct timeval 结构体，用于保存当前时间 */
    struct timeval tv;
    /*  定义 long long 类型的变量 ust，用于保存当前时间的微秒数 */
    long long ust;
    /* 获取当前时间，将获取到的当前时间保存到 tv 结构体中 
     * tv_sec为Epoch到创建struct timeval时的秒数，tv_usec为额外的微秒精度
     */
    gettimeofday(&tv, NULL);
    /* 秒转微秒 */
    ust = ((long long)tv.tv_sec)*1000000;
    /* 相加即可得到精确的时间戳 */
    ust += tv.tv_usec;
    /* 返回时间戳 */
    return ust;
}
```

### updateCachedTimeWithUs

```c
static inline void updateCachedTimeWithUs(int update_daylight_info, const long long ustime) {
    /* 更新服务器的微秒级时间 */
    server.ustime = ustime;
    /*  根据微秒计算服务器的毫秒级时间 */
    server.mstime = server.ustime / 1000;
    /*  根据毫秒计算服务器的 Unix 时间（秒级） */
    time_t unixtime = server.mstime / 1000;
    /* 因为多个线程同时执行更新 Unix 时间的操作，所以使用原子操作更新服务器的 Unix 时间 */
    atomicSet(server.unixtime, unixtime);

    /* To get information about daylight saving time, we need to call
     * localtime_r and cache the result. However calling localtime_r in this
     * context is safe since we will never fork() while here, in the main
     * thread. The logging function will call a thread safe version of
     * localtime that has no locks. */
    /* 若需要更新夏令时信息 */ 
    if (update_daylight_info) {
        struct tm tm;
        /* 获取服务器unixtime */
        time_t ut = server.unixtime;
        /* 获取本地时间的年月日等信息 */
        localtime_r(&ut,&tm);
        /* 检查当前是否处于夏令时 */
        server.daylight_active = tm.tm_isdst;
    }
}
```

### updateCachedTime

更新全局状态(server结构体)中缓存的Unix时间戳

```c
void updateCachedTime(int update_daylight_info) {
    /* 获取当前时间微秒时间戳 */
    const long long us = ustime();
    /* 更新时间 */
    updateCachedTimeWithUs(update_daylight_info, us);
}
```

### main

服务端启动的主方法

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
    // ACL子系统的初始化，是6.0之后新增的内容
    ACLInit(); /* The ACL subsystem must be initialized ASAP because the
                  basic networking code and client creation depends on it. */
    // 初始化所有的依赖模块             
    moduleInitModulesSystem();
    connTypeInitialize();

    /* Store the executable path and arguments in a safe place in order
     * to be able to restart the server later. */
    server.executable = getAbsolutePath(argv[0]);
    server.exec_argv = zmalloc(sizeof(char*)*(argc+1));
    server.exec_argv[argc] = NULL;
    for (j = 0; j < argc; j++) server.exec_argv[j] = zstrdup(argv[j]);

    /* We need to init sentinel right now as parsing the configuration file
     * in sentinel mode will have the effect of populating the sentinel
     * data structures with master nodes to monitor. */
    if (server.sentinel_mode) {
        initSentinelConfig();
        initSentinel();
    }

    /* Check if we need to start in redis-check-rdb/aof mode. We just execute
     * the program main. However the program is part of the Redis executable
     * so that we can easily execute an RDB check on loading errors. */
    if (strstr(exec_name,"redis-check-rdb") != NULL)
        redis_check_rdb_main(argc,argv,NULL);
    else if (strstr(exec_name,"redis-check-aof") != NULL)
        redis_check_aof_main(argc,argv);
```

### initServerConfig

初始化服务器状态结构

```c
void initServerConfig(void) {
    int j;
    /* 绑定的所有IP地址，可以通过参数bind配置多个；CONFIG_BINDADDR_MAX常量为16，即最多绑定16个IP地址 */
    char *default_bindaddr[CONFIG_DEFAULT_BINDADDR_COUNT] = CONFIG_DEFAULT_BINDADDR;
    /* 初始化redis默认的配置字典 */
    initConfigValues();
    /* 更新服务器时间 */
    updateCachedTime(1);
    server.cmd_time_snapshot = server.mstime;
    /* 生成一个随机字符串作为服务器的运行ID */
    getRandomHexChars(server.runid,CONFIG_RUN_ID_SIZE);
    server.runid[CONFIG_RUN_ID_SIZE] = '\0';
    changeReplicationId();
    clearReplicationId2();
    /* 设置serverCron()调用频率 */
    server.hz = CONFIG_DEFAULT_HZ; /* Initialize it ASAP, even if it may get
                                      updated later after loading the config.
                                      This value may be used before the server
                                      is initialized. */
    server.timezone = getTimeZone(); /* Initialized by tzset(). */
    /* 设置默认配置文件路径 */
    server.configfile = NULL;
    server.executable = NULL;
    /* 设置服务器的运行架构32位或64位 */
    server.arch_bits = (sizeof(long) == 8) ? 64 : 32;
    /* 默认的地址绑定数量 */
    server.bindaddr_count = CONFIG_DEFAULT_BINDADDR_COUNT;
    /* 将默认的IP地址复制到server.bindaddr数组中，server.bindaddr数组的最大个数是16 */
    for (j = 0; j < CONFIG_DEFAULT_BINDADDR_COUNT; j++)
        server.bindaddr[j] = zstrdup(default_bindaddr[j]);
    /*  将 server.listeners 数组清空 */
    memset(server.listeners, 0x00, sizeof(server.listeners));
    /* 激活主动过期删除 */
    server.active_expire_enabled = 1;
    /* 初始化惰性删除标志，大于0则不会触发 */
    server.lazy_expire_disabled = 0;
    /* 不跳过校验和验证 */
    server.skip_checksum_validation = 0;
    /* 数据库未加载 */
    server.loading = 0;
    server.async_loading = 0;
    /* RDB文件使用的内存量为0 */
    server.loading_rdb_used_mem = 0;
    /* AOF相关 */
    server.aof_state = AOF_OFF;
    server.aof_rewrite_base_size = 0;
    server.aof_rewrite_scheduled = 0;
    server.aof_flush_sleep = 0;
    server.aof_last_fsync = time(NULL);
    server.aof_cur_timestamp = 0;
    atomicSet(server.aof_bio_fsync_status,C_OK);
    server.aof_rewrite_time_last = -1;
    server.aof_rewrite_time_start = -1;
    server.aof_lastbgrewrite_status = C_OK;
    server.aof_delayed_fsync = 0;
    server.aof_fd = -1;
    server.aof_selected_db = -1; /* Make sure the first time will not match */
    server.aof_flush_postponed_start = 0;
    server.aof_last_incr_size = 0;
    server.active_defrag_running = 0;
    /* 未开启事件通知 */
    server.notify_keyspace_events = 0;
    /* 阻塞的客户端数量为0 */
    server.blocked_clients = 0;
    /* 将阻塞客户端数组清空 */
    memset(server.blocked_clients_by_type,0,
           sizeof(server.blocked_clients_by_type));
    /* 不立即关闭服务器 */       
    server.shutdown_asap = 0;
    /* 关机标志位初始化 */
    server.shutdown_flags = 0;
    /* 关机时的UNIX时间戳 */
    server.shutdown_mstime = 0;
    /* 集群模块标志位 */
    server.cluster_module_flags = CLUSTER_MODULE_FLAG_NONE;
    server.migrate_cached_sockets = dictCreate(&migrateCacheDictType);
    /* 下一个客户端的id号，从1开始计数 */
    server.next_client_id = 1; /* Client IDs, start from 1 .*/
    /* 获取系统页面大小 */
    server.page_size = sysconf(_SC_PAGESIZE);
    /* 是否暂停计时器的标识，初始为0，表示不暂停 */
    server.pause_cron = 0;

    server.latency_tracking_info_percentiles_len = 3;
    server.latency_tracking_info_percentiles = zmalloc(sizeof(double)*(server.latency_tracking_info_percentiles_len));
    server.latency_tracking_info_percentiles[0] = 50.0;  /* p50 */
    server.latency_tracking_info_percentiles[1] = 99.0;  /* p99 */
    server.latency_tracking_info_percentiles[2] = 99.9;  /* p999 */
    /* 初始化LRU算法的时钟变量
     * 获取当前的LRU时钟值 */
    unsigned int lruclock = getLRUClock();
    atomicSet(server.lruclock,lruclock);
    /* 初始化服务器存储快照的参数 */
    resetServerSaveParams();

    /* 保存快照的条件：1小时内有1个键值对被修改 */
    appendServerSaveParams(60*60,1);  /* save after 1 hour and 1 change */
    /* 保存快照的条件：5分钟内有100个键值对被修改 */
    appendServerSaveParams(300,100);  /* save after 5 minutes and 100 changes */
    /* 保存快照的条件：1分钟内有1万个键值对被修改 */
    appendServerSaveParams(60,10000); /* save after 1 minute and 10000 changes */

    /* Replication related */
    /* 初始化服务器的主从复制相关信息 */
    server.masterhost = NULL;
    server.masterport = 6379;
    server.master = NULL;
    server.cached_master = NULL;
    server.master_initial_offset = -1;
    server.repl_state = REPL_STATE_NONE;
    server.repl_transfer_tmpfile = NULL;
    server.repl_transfer_fd = -1;
    server.repl_transfer_s = NULL;
    server.repl_syncio_timeout = CONFIG_REPL_SYNCIO_TIMEOUT;
    server.repl_down_since = 0; /* Never connected, repl is down since EVER. */
    server.master_repl_offset = 0;

    /* Replication partial resync backlog */
    /* 初始化复制的部分同步缓存 */
    server.repl_backlog = NULL;
    server.repl_no_slaves_since = time(NULL);

    /* Failover related */
    /* 定义故障转移相关的变量 */
    server.failover_end_time = 0;
    server.force_failover = 0;
    server.target_replica_host = NULL;
    server.target_replica_port = 0;
    server.failover_state = NO_FAILOVER;

    /* Client output buffer limits */
    /* 定义客户端输出缓冲区限制 */
    for (j = 0; j < CLIENT_TYPE_OBUF_COUNT; j++)
        server.client_obuf_limits[j] = clientBufferLimitsDefaults[j];
    
    /* Linux OOM Score config */
    /* 定义 Linux OOM Score 相关配置 */
    for (j = 0; j < CONFIG_OOM_COUNT; j++)
        server.oom_score_adj_values[j] = configOOMScoreAdjValuesDefaults[j];

    /* Double constants initialization */
    /*  定义 Double 常量的初始值 */
    R_Zero = 0.0;
    R_PosInf = 1.0/R_Zero;
    R_NegInf = -1.0/R_Zero;
    R_Nan = R_Zero/R_Zero;

    /* Command table -- we initialize it here as it is part of the
     * initial configuration, since command names may be changed via
     * redis.conf using the rename-command directive. */
    /* 定义一个命令字典，并指定使用命令字典的类型 */
    server.commands = dictCreate(&commandTableDictType);
    /* 定义一个原始命令字典，并指定使用命令字典的类型 */
    server.orig_commands = dictCreate(&commandTableDictType);
    /*  将源码中硬编码的命令列表解析存储到 server.commands 中 */
    populateCommandTable();

    /* Debugging */
    server.watchdog_period = 0;
}
```

### populateCommandTable

```c

extern struct redisCommand redisCommandTable[];
/* Populates the Redis Command Table dict from the static table in commands.c
 * which is auto generated from the json files in the commands folder. */
void populateCommandTable(void) {
    int j;
    struct redisCommand *c;

    for (j = 0;; j++) {
        /* 一个类型为T的指针的移动，是以sizeof(T)为移动单位 
         * redisCommandTable是redis命令的硬编码集合在commands.c中 */
        c = redisCommandTable + j;
        if (c->declared_name == NULL)
            break;

        int retval1, retval2;

        c->fullname = sdsnew(c->declared_name);
        if (populateCommandStructure(c) == C_ERR)
            continue;

        retval1 = dictAdd(server.commands, sdsdup(c->fullname), c);
        /* Populate an additional dictionary that will be unaffected
         * by rename-command statements in redis.conf. */
        retval2 = dictAdd(server.orig_commands, sdsdup(c->fullname), c);
        serverAssert(retval1 == DICT_OK && retval2 == DICT_OK);
    }
}
```
