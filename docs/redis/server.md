# server(服务器)

## 头文件

### 全局变量

`全局变量`：在编译阶段就已经分配了内存空间，因此无需手动分配内存。

```c
/* redis服务器 */
extern struct redisServer server;

/* redis所有支持的命令的硬编码表 */
extern struct redisCommand redisCommandTable[];
```

### MAXMEMORY

淘汰策略

```c
/* Redis maxmemory strategies. Instead of using just incremental number
 * for this defines, we use a set of flags so that testing for certain
 * properties common to multiple policies is faster. */
/* 0001 --> 1
 * LRU算法 */ 
#define MAXMEMORY_FLAG_LRU (1<<0)
/* 0010 --> 2
 * LFU算法 */
#define MAXMEMORY_FLAG_LFU (1<<1)
/* 0100 --> 4
 * 所有键 */
#define MAXMEMORY_FLAG_ALLKEYS (1<<2)
/* 它表示不要与其他进程共享Redis使用的整数对象。如果启用了此选项，
 * 则Redis将使用大约两倍于默认内存的数量，但可以避免跨进程共享整数对象带来的性能问题。
 * 在多个Redis实例之间共享内存时，建议启用此选项。 */
#define MAXMEMORY_FLAG_NO_SHARED_INTEGERS \
    (MAXMEMORY_FLAG_LRU|MAXMEMORY_FLAG_LFU)
/* 0000 0000 0001 --> 1
 * 在设置了过期时间的键，使用近似LRU算法淘汰键 */
#define MAXMEMORY_VOLATILE_LRU ((0<<8)|MAXMEMORY_FLAG_LRU)
/* 0001 0000 0010 --> 258
 * 在设置了过期时间的键，使用近似LFU算法淘汰使用频率比较低的键 */
#define MAXMEMORY_VOLATILE_LFU ((1<<8)|MAXMEMORY_FLAG_LFU)
/* 0010 0000 0000 --> 512
 * 删除最接近到期时间(较小的TTL)的键 */
#define MAXMEMORY_VOLATILE_TTL (2<<8)
/* 0011 0000 0000 --> 768
 * 随机删除设置了过期时间的数据 */
#define MAXMEMORY_VOLATILE_RANDOM (3<<8)
/* 0100 0000 0101 --> 1029
 * 使用近似LRU算法淘汰整个数据库的键 */
#define MAXMEMORY_ALLKEYS_LRU ((4<<8)|MAXMEMORY_FLAG_LRU|MAXMEMORY_FLAG_ALLKEYS)
/* 0101 0000 0110 --> 1286
 * 使用近似LFU算法淘汰整个数据库的键 */
#define MAXMEMORY_ALLKEYS_LFU ((5<<8)|MAXMEMORY_FLAG_LFU|MAXMEMORY_FLAG_ALLKEYS)
/* 0110 0000 0110 --> 1542
 * 随机回收所有的键 */
#define MAXMEMORY_ALLKEYS_RANDOM ((6<<8)|MAXMEMORY_FLAG_ALLKEYS)
/* 0111 0000 0000 --> 1792
 * 不淘汰任何数据，如果缓存数据超过了maxmemory限定值，并且客户端正在执行的命令(大部分的写入指令，
 * 但DEL和几个指令例外)会导致内存分配，则向客户端返回错误响应 */
#define MAXMEMORY_NO_EVICTION (7<<8)
```

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

### redisDb

```c
typedef struct redisDb {
    /* 存储该数据集所包含的所有键值对的字典 */
    dict *dict;                 /* The keyspace for this DB */
    /* 存储已经设置了过期时间的键值对和相应过期时间的字典 */
    dict *expires;              /* Timeout of keys with a timeout set */
    /* 存储正在阻塞（blocking）的键的字典，用于BLPOP命令 */
    dict *blocking_keys;        /* Keys with clients waiting for data (BLPOP)*/
    /* 存储正在阻塞但在键不存在时就可以解除阻塞的键的字典，例如XREADGROP命令；这是 blocking_keys 的子集 */
    dict *blocking_keys_unblock_on_nokey;   /* Keys with clients waiting for
                                             * data, and should be unblocked if key is deleted (XREADEDGROUP).
                                             * This is a subset of blocking_keys*/
    /* 存储等待 PELLPUSH 命令（或其他相关命令）推送数据进行解锁的键的字典 */
    dict *ready_keys;           /* Blocked keys that received a PUSH */
    /* 存储在 MULTI/EXEC 块中监视的键的字典，用于乐观锁 */
    dict *watched_keys;         /* WATCHED keys for MULTI/EXEC CAS */
    /* 数据库id */ 
    int id;                     /* Database ID */
    /* 所有键的 TTL 平均值，仅用于统计 */   
    long long avg_ttl;          /* Average TTL, just for stats */
    /* 主动过期扫描的游标 */
    unsigned long expires_cursor; /* Cursor of the active expire cycle. */
    /* 需要碎片整理的键名列表，逐个进行 */
    list *defrag_later;         /* List of key names to attempt to defrag one by one, gradually. */
    /* 描述集群模式下槽与键之间映射关系的结构体。仅在dbid为0的情况下使用。 */
    clusterSlotToKeyMapping *slots_to_keys; /* Array of slots to keys. Only used in cluster mode (db 0). */
} redisDb;
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

### initServerConfig

初始化服务器状态结构体

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
    server.aof_last_incr_fsync_offset = 0;
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
    /* 原子操作设置服务器lru时间 */
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

### adjustOpenFilesLimit

检查系统对于Redis进程的打开文件数限制，如果系统限制过低，则尝试将Redis进程的文件打开数限制增加到一个更高的值

```c
void adjustOpenFilesLimit(void) {
    /* rlim_t是无符号整数类型
     * server.maxclients 是服务器程序运行时能处理的最大客户端连接数（默认10000）
     * CONFIG_MIN_RESERVED_FDS = 32 （redis持久化、侦听套接字、日志文件等额外操作保留的文件描述符数） */
    rlim_t maxfiles = server.maxclients+CONFIG_MIN_RESERVED_FDS;
    struct rlimit limit;
    
    /* getrlimit是一个系统调用，返回rlim_cur，rlim_max
     * rlim_cur是进程资源的实际限制，rlim_max是rlim_cur限制的上限
     * RLIMIT_NOFILE(一个进程能打开的最大文件数，内核默认是1024) */
    if (getrlimit(RLIMIT_NOFILE,&limit) == -1) {
        /* 获取失败 */
        serverLog(LL_WARNING,"Unable to obtain the current NOFILE limit (%s), assuming 1024 and setting the max clients configuration accordingly.",
            strerror(errno));
        /* maxclients被设置为 1024-32 */    
        server.maxclients = 1024-CONFIG_MIN_RESERVED_FDS;
    } else {
        /* 保存下来当前获取到的限制数 */
        rlim_t oldlimit = limit.rlim_cur;

        /* Set the max number of files if the current limit is not enough
         * for our needs. */
        /* redis所需要的fd数量超过了获取到的限制数 */ 
        if (oldlimit < maxfiles) {
            rlim_t bestlimit;
            int setrlimit_error = 0;

            /* Try to set the file limit to match 'maxfiles' or at least
             * to the higher value supported less than maxfiles. */
            /* 先设置bestlimit为redis所需要的fd数量 */ 
            bestlimit = maxfiles;
            while(bestlimit > oldlimit) {
                /* 每次循环将redis所需要的fd数量减16 */
                rlim_t decr_step = 16;

                limit.rlim_cur = bestlimit;
                limit.rlim_max = bestlimit;
                /* 通过系统调用，去重新设置限制数，设置成功跳出while循环
                 * 如果失败则尝试递减bestlimit */
                if (setrlimit(RLIMIT_NOFILE,&limit) != -1) break;
                setrlimit_error = errno;

                /* We failed to set file limit to 'bestlimit'. Try with a
                 * smaller limit decrementing by a few FDs per iteration. */
                /* 如果redis所需要的fd数量比16还小了 */ 
                if (bestlimit < decr_step) {
                    /* 将redis所需要的fd数量设置为最初我们拿到的限制数并跳出while循环 */
                    bestlimit = oldlimit;
                    break;
                }
                bestlimit -= decr_step;
            }

            /* Assume that the limit we get initially is still valid if
             * our last try was even lower. */
            /* 当前的redis所需要的fd数量比最开始拿到的限制数还小，还是用之前的限制数吧 */ 
            if (bestlimit < oldlimit) bestlimit = oldlimit;
            
            /* 已经处理过的redis所需要的fd数量比最开始的redis所需要的fd数量小 */
            if (bestlimit < maxfiles) {
                unsigned int old_maxclients = server.maxclients;
                /* 设置maxclients */
                server.maxclients = bestlimit-CONFIG_MIN_RESERVED_FDS;
                /* maxclients is unsigned so may overflow: in order
                 * to check if maxclients is now logically less than 1
                 * we test indirectly via bestlimit. */
                /* 如果redis所需要的fd数量小于等于32（还要预留32），直接挂掉！ */ 
                if (bestlimit <= CONFIG_MIN_RESERVED_FDS) {
                    serverLog(LL_WARNING,"Your current 'ulimit -n' "
                        "of %llu is not enough for the server to start. "
                        "Please increase your open file limit to at least "
                        "%llu. Exiting.",
                        (unsigned long long) oldlimit,
                        (unsigned long long) maxfiles);
                    exit(1);
                }
                serverLog(LL_WARNING,"You requested maxclients of %d "
                    "requiring at least %llu max file descriptors.",
                    old_maxclients,
                    (unsigned long long) maxfiles);
                serverLog(LL_WARNING,"Server can't set maximum open files "
                    "to %llu because of OS error: %s.",
                    (unsigned long long) maxfiles, strerror(setrlimit_error));
                serverLog(LL_WARNING,"Current maximum open files is %llu. "
                    "maxclients has been reduced to %d to compensate for "
                    "low ulimit. "
                    "If you need higher maxclients increase 'ulimit -n'.",
                    (unsigned long long) bestlimit, server.maxclients);
            } else {
                serverLog(LL_NOTICE,"Increased maximum number of open files "
                    "to %llu (it was originally set to %llu).",
                    (unsigned long long) maxfiles,
                    (unsigned long long) oldlimit);
            }
        }
    }
}
```

### checkTcpBacklogSettings

该函数首先判断操作系统是否支持通过/proc/sys/net/core/somaxconn文件来获取当前所有监听套接字的默认backlog值的最大值。

如果支持，就打开这个文件并读取其中内容，将其与服务器设置的backlog值进行比较。如果当前somaxconn值小于指定的backlog值，则发出警告信息。

如果系统不支持通过/proc/sys/net/core/somaxconn文件来获取值，则尝试使用其他方式读取内核参数，例如sysctl或常量SOMAXCONN。

### createSocketAcceptHandler

监听完端口之后，我们需要向epfd（linux）注册我们监听fd感兴趣的事件，这样才能触发我们的`accept_handler`回调函数

而回调函数由不同类型的协议（socket,unix）提供各自的`accept_handler`实现

```c
int createSocketAcceptHandler(connListener *sfd, aeFileProc *accept_handler) {
    int j;
    /* 遍历所有监听描述符并创建文件事件处理器 */
    for (j = 0; j < sfd->count; j++) {
        /* 循环检测所有监听描述符 sfd->fd[j] 的方式，确保所有绑定的端口都被监听到并进行注册 */
        if (aeCreateFileEvent(server.el, sfd->fd[j], AE_READABLE, accept_handler,sfd) == AE_ERR) {
            /* Rollback */
            /* 回滚之前的注册，这里使用了循环值精简代码 */
            for (j = j-1; j >= 0; j--) aeDeleteFileEvent(server.el, sfd->fd[j], AE_READABLE);
            return C_ERR;
        }
    }
    return C_OK;
}
```

### listenToPort

Redis 服务器用于监听 TCP 连接请求的主要逻辑部分

```c
int listenToPort(connListener *sfd) {
    int j;
    /* 获取 connListener 对应的端口号 */
    int port = sfd->port;
    char **bindaddr = sfd->bindaddr;

    /* If we have no bind address, we don't listen on a TCP socket */
    /* 如果没有绑定地址，不监听 TCP 连接请求 */
    if (sfd->bindaddr_count == 0) return C_OK;
    /* 根据bindaddr_count遍历地址 */
    for (j = 0; j < sfd->bindaddr_count; j++) {
        char* addr = bindaddr[j];
        /* 以'-'表示可选 */
        int optional = *addr == '-';
        if (optional) addr++;
        if (strchr(addr,':')) {
            /* Bind IPv6 address. */
            /* 绑定 IPv6 地址，会返回文件标志符 */
            sfd->fd[sfd->count] = anetTcp6Server(server.neterr,port,addr,server.tcp_backlog);
        } else {
            /* Bind IPv4 address. */
             /* 绑定 IPv4 地址，会返回文件标志符 */
            sfd->fd[sfd->count] = anetTcpServer(server.neterr,port,addr,server.tcp_backlog);
        }
        /* 如果绑定失败，则记录错误日志并回滚之前成功绑定的连接套接字 */
        if (sfd->fd[sfd->count] == ANET_ERR) {
            int net_errno = errno;
            serverLog(LL_WARNING,
                "Warning: Could not create server TCP listening socket %s:%d: %s",
                addr, port, server.neterr);
            /* 当绑定出错时，对于可选地址的情况跳过(即以'-'开头的地址) */
            if (net_errno == EADDRNOTAVAIL && optional)
                continue;
            /* 对于一些特定错误码，例如不支持的地址族、协议等，也跳过。 */    
            if (net_errno == ENOPROTOOPT     || net_errno == EPROTONOSUPPORT ||
                net_errno == ESOCKTNOSUPPORT || net_errno == EPFNOSUPPORT ||
                net_errno == EAFNOSUPPORT)
                continue;

            /* Rollback successful listens before exiting */
            closeListener(sfd);
            return C_ERR;
        }
        /* 设置套接字的标记（Socket Mark）(可在redis.conf中设置id)。 */
        if (server.socket_mark_id > 0) anetSetSockMarkId(NULL, sfd->fd[sfd->count], server.socket_mark_id);
        /* 设置套接字为非阻塞模式 */
        anetNonBlock(NULL,sfd->fd[sfd->count]);
        /* 设置套接字为关闭时释放其文件描述符 */
        anetCloexec(sfd->fd[sfd->count]);
        /* 记录成功绑定的连接套接字数量 */
        sfd->count++;
    }
    return C_OK;
}
```

### populateCommandTable

从commands.c中的静态表格中填充Redis命令表dict，该静态表格是从commands文件夹中的json文件自动生成的。

```c
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
        /* 每个命令的fullname字段指向一个新生成的sds字符串(内容是declared_name) */
        c->fullname = sdsnew(c->declared_name);
        /* 填充命令结构体c */
        if (populateCommandStructure(c) == C_ERR)
            continue;
        /* 将c添加到server.commands字典中 */
        retval1 = dictAdd(server.commands, sdsdup(c->fullname), c);
        /* Populate an additional dictionary that will be unaffected
         * by rename-command statements in redis.conf. */
        /* 将c添加到server.orig_commands字典中，该字典不受redis.conf中rename-command指令的影响 */ 
        retval2 = dictAdd(server.orig_commands, sdsdup(c->fullname), c);
        /* 断言两个添加操作成功 */
        serverAssert(retval1 == DICT_OK && retval2 == DICT_OK);
    }
}
```

### setupSignalHandlers

[参考](https://www.cnblogs.com/lidabo/p/14040946.html)

[sigaction](https://blog.csdn.net/u013318019/article/details/124957666)

```c
struct sigaction {
    /* 信号处理器函数的地址 */
    void (*sa_handler)(int);
    void (*sa_sigaction)(int, siginfo_t *, void *);
    /* 定义一组信号，在调用由sa_handler所定义的处理器程序时将阻塞该组信号，不允许它们中断此处理器程序的执行。 */
    sigset_t sa_mask;
    /* 用于控制信号行为 */
    int sa_flags;
    /* 己弃用 */
    void (*sa_restorer)(void);
};
```

```c
void setupSignalHandlers(void) {
    struct sigaction act;

    /* When the SA_SIGINFO flag is set in sa_flags then sa_sigaction is used.
     * Otherwise, sa_handler is used. */
    /* 信号集初始化为空
     * sa_mask指定在信号处理程序执行过程当中，哪些信号应当被阻塞。
     * 缺省状况下当前信号自己被阻塞，防止信号的嵌套发送 */ 
    sigemptyset(&act.sa_mask);
    /* 当其设置为0时，表示使用默认属性，也就是先不响应该信号，而是执行完回调函数再处理此信号 */
    act.sa_flags = 0;
    /* 指定信号捕捉后的关闭处理函数 */
    act.sa_handler = sigShutdownHandler;
    /* 处理 SIGTERM、SIGHUP信号  */
    sigaction(SIGTERM, &act, NULL);
    sigaction(SIGINT, &act, NULL);

    /* 信号集初始化为空 */
    sigemptyset(&act.sa_mask);
    /* SA_NODEFER：信号处理程序在执行期间不应阻塞同一信号，即信号处理程序可以再次接收该信号并立即处理，而不必等待当前信号处理结束。
     *
     * SA_RESETHAND：信号处理函数执行完毕之后重置该信号的处理方式为默认方式。
     * 也就是说，如果使用SA_RESETHAND标志，处理函数只会被执行一次，然后信号的处理方式就会被重置为默认方式，不再执行信号处理函数。
     *
     * SA_SIGINFO：会将其他信息（比如进程ID，状态信息等）作为参数传入信号处理函数中。（这时应该使用 sa_sigaction 而不是 sa_handler）
     */
    act.sa_flags = SA_NODEFER | SA_RESETHAND | SA_SIGINFO;  
    act.sa_sigaction = sigsegvHandler;
    /* 如果开启了崩溃日志，则捕捉SIGSEGV、SIGBUS、SIGFPE、SIGILL和SIGABRT信号 */
    if(server.crashlog_enabled) {
        sigaction(SIGSEGV, &act, NULL);
        sigaction(SIGBUS, &act, NULL);
        sigaction(SIGFPE, &act, NULL);
        sigaction(SIGILL, &act, NULL);
        sigaction(SIGABRT, &act, NULL);
    }
    return;
}
```

### mustObeyClient

- CLIENT_MASTER 是一个 Redis 客户端类型，它表示一个 Redis 服务器的主节点
- CLIENT_ID_AOF 是另一个 Redis 客户端类型，它表示一个正在执行 AOF（Append-only file）持久化操作的客户端。

```c
/* Commands arriving from the master client or AOF client, should never be rejected. */
/* 来自主客户端或 AOF 客户端的命令永远不应该被拒绝。 */
int mustObeyClient(client *c) {
    return c->id == CLIENT_ID_AOF || c->flags & CLIENT_MASTER;
}
```

### processCommand

处理客户端发送的命令的函数

```c
int processCommand(client *c) {
    /* 而 scriptIsRunning() 函数表示是否正在执行脚本。如果 Redis 在执行脚本期间，客户端只能运行 EVAL、EVALSHA 
     * 和 SCRIPT KILL 命令。为了防止客户端误操作，Redis 会在脚本执行期间设置这个标志，以禁止客户端执行其他命令
     * 其中 server.in_exec 表示是否正在执行事务，在 Redis 执行事务期间，客户端不能执行除事务相关命令外的其他命令 */
    if (!scriptIsTimedout()) {
        /* Both EXEC and scripts call call() directly so there should be
         * no way in_exec or scriptIsRunning() is 1.
         * That is unless lua_timedout, in which case client may run
         * some commands. */
        serverAssert(!server.in_exec);
        serverAssert(!scriptIsRunning());
    }

    /* in case we are starting to ProcessCommand and we already have a command we assume
     * this is a reprocessing of this command, so we do not want to perform some of the actions again. */
    /* 例如：如果客户端连接断开时有未完成的命令请求，Redis 服务器会等待一段时间，以便客户端重新连接并进行命令重试，故c->cmd肯定不为NULL */
    int client_reprocessing_command = c->cmd ? 1 : 0;

    /* only run command filter if not reprocessing command */
    /* 只有当不处于重新处理命令状态时，才运行命令过滤器和请求追踪功能 */
    if (!client_reprocessing_command) {
        moduleCallCommandFilters(c);
        reqresAppendRequest(c);
    }

    /* Handle possible security attacks. */
    /* 如果客户端发送了名为 "host:" 或 "post" 的异常命令，则输出安全警告后返回错误 */
    if (!strcasecmp(c->argv[0]->ptr,"host:") || !strcasecmp(c->argv[0]->ptr,"post")) {
        securityWarningCommand(c);
        return C_ERR;
    }

    /* If we're inside a module blocked context yielding that wants to avoid
     * processing clients, postpone the command. */
    /* 如果 Redis 结点处于模块阻塞模式且未被指定可执行客户端操作，则推迟命令执行 
     * BUSY_MODULE_YIELD_NONE 是 Redis 模块中的一个指令，它的含义是不允许模块在执行长时间的操作时，挂起客户端请求，需要即时响应
     * BUSY_MODULE_YIELD_CLIENTS是 Redis 模块中的一个指令，它的含义是让模块在执行长时间的操作时，主动放弃CPU时间片，给其他客户端请求提供服务的机会。
     */ 
    if (server.busy_module_yield_flags != BUSY_MODULE_YIELD_NONE &&
        !(server.busy_module_yield_flags & BUSY_MODULE_YIELD_CLIENTS))
    {   /* 推迟命令执行 */
        blockPostponeClient(c);
        return C_OK;
    }

    /* Now lookup the command and check ASAP about trivial error conditions
     * such as wrong arity, bad command name and so forth.
     * In case we are reprocessing a command after it was blocked,
     * we do not have to repeat the same checks */
    if (!client_reprocessing_command) {
        /* 通过 lookupCommand(c->argv, c->argc) 查找并获取客户端发送的命令，并将其记录到 c->cmd、c->realcmd 和 c->lastcmd 成员变量中，
         * 分别表示当前处理的命令、实际命令、上一个执行的命令。 */
        c->cmd = c->lastcmd = c->realcmd = lookupCommand(c->argv,c->argc);
        sds err;
        /* 检查命令是否存 */
        if (!commandCheckExistence(c, &err)) {
            rejectCommandSds(c, err);
            return C_OK;
        }
        /* 检查参数个数是否合法 */
        if (!commandCheckArity(c, &err)) {
            rejectCommandSds(c, err);
            return C_OK;
        }


        /* Check if the command is marked as protected and the relevant configuration allows it */
        /* 通过 Redis 的 CMD_PROTECTED 包含的标记检查所执行的命令是否为受保护的命令，并根据配置文件中的设置和客户端连接方式决定是否允许执行此类命令 */
        if (c->cmd->flags & CMD_PROTECTED) {
            if ((c->cmd->proc == debugCommand && !allowProtectedAction(server.enable_debug_cmd, c)) ||
                (c->cmd->proc == moduleCommand && !allowProtectedAction(server.enable_module_cmd, c)))
            {
                rejectCommandFormat(c,"%s command not allowed. If the %s option is set to \"local\", "
                                      "you can run it from a local connection, otherwise you need to set this option "
                                      "in the configuration file, and then restart the server.",
                                      c->cmd->proc == debugCommand ? "DEBUG" : "MODULE",
                                      c->cmd->proc == debugCommand ? "enable-debug-command" : "enable-module-command");
                return C_OK;

            }
        }
    }
    /* 根据redisCommandTable中定义的命令flags判断下面的命令类型 
     * `getCommandFlags`会判断redis Function和Lua Script */
    uint64_t cmd_flags = getCommandFlags(c);

    int is_read_command = (cmd_flags & CMD_READONLY) ||
                           (c->cmd->proc == execCommand && (c->mstate.cmd_flags & CMD_READONLY));
    int is_write_command = (cmd_flags & CMD_WRITE) ||
                           (c->cmd->proc == execCommand && (c->mstate.cmd_flags & CMD_WRITE));
    int is_denyoom_command = (cmd_flags & CMD_DENYOOM) ||
                             (c->cmd->proc == execCommand && (c->mstate.cmd_flags & CMD_DENYOOM));
    int is_denystale_command = !(cmd_flags & CMD_STALE) ||
                               (c->cmd->proc == execCommand && (c->mstate.cmd_inv_flags & CMD_STALE));
    int is_denyloading_command = !(cmd_flags & CMD_LOADING) ||
                                 (c->cmd->proc == execCommand && (c->mstate.cmd_inv_flags & CMD_LOADING));
    int is_may_replicate_command = (cmd_flags & (CMD_WRITE | CMD_MAY_REPLICATE)) ||
                                   (c->cmd->proc == execCommand && (c->mstate.cmd_flags & (CMD_WRITE | CMD_MAY_REPLICATE)));
    int is_deny_async_loading_command = (cmd_flags & CMD_NO_ASYNC_LOADING) ||
                                        (c->cmd->proc == execCommand && (c->mstate.cmd_flags & CMD_NO_ASYNC_LOADING));
    int obey_client = mustObeyClient(c);
    /* 使用 authRequired(c) 函数来判断当前连接是否需要进行身份验证。如果需要，那么只有 AUTH 和 HELLO 命令可以在未授权的状态下被执行 */
    if (authRequired(c)) {
        /* AUTH and HELLO and no auth commands are valid even in
         * non-authenticated state. */
        if (!(c->cmd->flags & CMD_NO_AUTH)) {
            rejectCommand(c,shared.noautherr);
            return C_OK;
        }
    }
    /* 如果当前客户端正在执行事务（即使用了 MULTI 命令），但它所请求的命令不允许出现在事务内部 (即包含 CMD_NO_MULTI 标记)，则会返回一个设置好以 "Command not allowed inside a transaction" 为格式化字符串的错误信息，并停止执行 */
    if (c->flags & CLIENT_MULTI && c->cmd->flags & CMD_NO_MULTI) {
        rejectCommandFormat(c,"Command not allowed inside a transaction");
        return C_OK;
    }

    /* Check if the user can run this command according to the current
     * ACLs. */
    /* ACL检测用户是否有权限执行当前命令 */ 
    int acl_errpos;
    int acl_retval = ACLCheckAllPerm(c,&acl_errpos);
    if (acl_retval != ACL_OK) {
        addACLLogEntry(c,acl_retval,(c->flags & CLIENT_MULTI) ? ACL_LOG_CTX_MULTI : ACL_LOG_CTX_TOPLEVEL,acl_errpos,NULL,NULL);
        sds msg = getAclErrorMessage(acl_retval, c->user, c->cmd, c->argv[acl_errpos]->ptr, 0);
        rejectCommandFormat(c, "-NOPERM %s", msg);
        sdsfree(msg);
        return C_OK;
    }

    /* If cluster is enabled perform the cluster redirection here.
     * However we don't perform the redirection if:
     * 1) The sender of this command is our master.
     * 2) The command has no key arguments. */
    /* 集群模式下 且 命令对应的客户端不是主节点或者是AOF客户端 且 命令在集群中可以转发或者命令的键值(key)参数个数不为0或者命令处于事务上下文中
     * 则要考虑命令的转发 */ 
    if (server.cluster_enabled &&
        !mustObeyClient(c) &&
        !(!(c->cmd->flags&CMD_MOVABLE_KEYS) && c->cmd->key_specs_num == 0 &&
          c->cmd->proc != execCommand))
    {
        int error_code;
        /* 通过指定命令、参数、个数等信息，获取归属槽及负责执行的目标节点 */
        clusterNode *n = getNodeByQuery(c,c->cmd,c->argv,c->argc,
                                        &c->slot,&error_code);
        /* 如果目标节点为NULL或非本机节点，则进行重定向操作，并记录相关信息 */                                 
        if (n == NULL || n != server.cluster->myself) {
            /* 事务是通过MULTI和EXEC命令组合完成的
             * 在集群环境下，由于节点间哈希槽的变化，可能会发生槽迁移等操作，导致一个客户端发出的事务命令被分摊到多个节点上去执行，从而引发事务执行的失败或出现数据一致性问题 
             * 使用 discardTransaction 命令丢弃掉正在执行的事务，以免出现错误影响Redis集群的数据一致性和高可用性 */
            if (c->cmd->proc == execCommand) {
                discardTransaction(c);
            } else {
                /* 如果是普通命令，则需要标记当前客户端处于事务上下文。因为如果在执行普通命令的过程中发生了重定向操作，
                 * 那么后续的命令也必须同样被转发到目标节点。而标记处于事务上下文后，在执行完所有命令之后再进行重定向，就可以保证事务的原子性和一致性。 */
                flagTransaction(c);
            }
            /* 进行重定向操作 */
            clusterRedirectClient(c,n,c->slot,error_code);
            /* 记录拒绝处理的次数 */
            c->cmd->rejected_calls++;
            return C_OK;
        }
    }

    /* Disconnect some clients if total clients memory is too high. We do this
     * before key eviction, after the last command was executed and consumed
     * some client output buffer memory. */
    /* 防止客户端连接数量占用内存过高，在该函数执行的过程中，Redis 会先遍历所有处于阻塞状态的客户端，并尝试将其取消阻塞。然后，它会遍历所有非阻塞状态的客户端，
     * 按照“LRU(Least Recently Used)”算法的方式选择排在末尾的一些客户端，进行断开连接操作。 */
    evictClients();
    if (server.current_client == NULL) {
        /* If we evicted ourself then abort processing the command */
        return C_ERR;
    }

    /* Handle the maxmemory directive.
     *
     * Note that we do not want to reclaim memory if we are here re-entering
     * the event loop since there is a busy Lua script running in timeout
     * condition, to avoid mixing the propagation of scripts with the
     * propagation of DELs due to eviction. */
    /* 如果启用了 maxmemory 限制，且当前不在长时间阻塞的命令中，则进行内存回收 */ 
    if (server.maxmemory && !isInsideYieldingLongCommand()) {
        /* 调用 performEvictions() 函数进行内存回收，若失败则将 out_of_memory 设置为 1，否则设置为 0 */
        int out_of_memory = (performEvictions() == EVICT_FAIL);

        /* performEvictions may evict keys, so we need flush pending tracking
         * invalidation keys. If we don't do this, we may get an invalidation
         * message after we perform operation on the key, where in fact this
         * message belongs to the old value of the key before it gets evicted.*/
        /* 处理待处理失效键（pending invalid keys），即在命令执行过程中，由于某些原因导致的键变为无效（invalid）状态。该函数会刷新这些失效键，
         * 以便在执行命令时接收到失效消息时正确处理 */ 
        trackingHandlePendingKeyInvalidations();

        /* performEvictions may flush slave output buffers. This may result
         * in a slave, that may be the active client, to be freed. */
        /* 检查当前客户端是否存在。如果当前没有客户端连接到 Redis 服务器，那么该函数将返回 C_ERR */ 
        if (server.current_client == NULL) return C_ERR;
        /* 根据 is_denyoom_command 的值来决定是否拒绝执行客户端发来的命令 */
        int reject_cmd_on_oom = is_denyoom_command;
        /* If client is in MULTI/EXEC context, queuing may consume an unlimited
         * amount of memory, so we want to stop that.
         * However, we never want to reject DISCARD, or even EXEC (unless it
         * contains denied commands, in which case is_denyoom_command is already
         * set. */
        /* 如果客户端处于 MULTI 上下文中，并且所执行的命令不是 EXEC、DISCARD、QUIT 或 RESET，则设置 reject_cmd_on_oom 为 1 */ 
        if (c->flags & CLIENT_MULTI &&
            c->cmd->proc != execCommand &&
            c->cmd->proc != discardCommand &&
            c->cmd->proc != quitCommand &&
            c->cmd->proc != resetCommand) {
            reject_cmd_on_oom = 1;
        }
        /* 如果发生内存不足并且命令拒绝在 out-of-memory 情况下运行，则回复错误 */
        if (out_of_memory && reject_cmd_on_oom) {
            rejectCommand(c, shared.oomerr);
            return C_OK;
        }

        /* Save out_of_memory result at command start, otherwise if we check OOM
         * in the first write within script, memory used by lua stack and
         * arguments might interfere. We need to save it for EXEC and module
         * calls too, since these can call EVAL, but avoid saving it during an
         * interrupted / yielding busy script / module. */
        /* 变量的作用是在执行命令时检查 Redis 是否处于 OOM 状态。如果它的值为 "out_of_memory"，表示 Redis 目前处于 OOM 状态，
         * 并且有可能会在执行命令时发生内存分配失败的情况。 */
        server.pre_command_oom_state = out_of_memory;
    }

    /* Make sure to use a reasonable amount of memory for client side
     * caching metadata. */
    /*  Redis 集群的内部数据追踪功能是否被开启，并在开启的情况下执行有效使用哈希槽数量的监控与限制操作 */ 
    if (server.tracking_clients) trackingLimitUsedSlots();

    /* Don't accept write commands if there are problems persisting on disk
     * unless coming from our master, in which case check the replica ignore
     * disk write error config to either log or crash. */
    /* 检查磁盘错误是否导致写命令被拒绝 */ 
    int deny_write_type = writeCommandsDeniedByDiskError();
    /* 如果写操作被拒绝（deny_write_type!=DISK_ERROR_TYPE_NONE），
     * 并且当前命令为写命令（is_write_command=1），或者当前命令为 ping 命令，则执行下列判断。 */
    if (deny_write_type != DISK_ERROR_TYPE_NONE &&
        (is_write_command || c->cmd->proc == pingCommand))
    {   
        /* obey_client 用于标识当前 Redis 是否处于「主从同步」状态中的从节点。 */
        if (obey_client) {
            /* 如果从节点没有设置 repl_ignore_disk_write_error 参数，并且当前命令不是 ping 命令，那么表示这个从节点需要 panic，停止运行，并打印相关日志信息。 */
            if (!server.repl_ignore_disk_write_error && c->cmd->proc != pingCommand) {
                serverPanic("Replica was unable to write command to disk.");
            } else {
                /* 如果从节点已经设置了 repl_ignore_disk_write_error 参数，或者当前命令是 ping 命令，那么表示该从节点应该忽略写入错误，并打印相应的日志信息。 */
                static mstime_t last_log_time_ms = 0;
                const mstime_t log_interval_ms = 10000;
                if (server.mstime > last_log_time_ms + log_interval_ms) {
                    last_log_time_ms = server.mstime;
                    serverLog(LL_WARNING, "Replica is applying a command even though "
                                          "it is unable to write to disk.");
                }
            }
        } else {
            /* 如果当前 Redis 不是从节点，则表示当前操作是客户端发送的命令，需要拒绝它并返回相关错误信息。 */
            sds err = writeCommandsGetDiskErrorMessage(deny_write_type);
            /* remove the newline since rejectCommandSds adds it. */
            /* 去掉换行符 */
            sdssubstr(err, 0, sdslen(err)-2);
            /* 拒绝命令 */
            rejectCommandSds(c, err);
            return C_OK;
        }
    }

    /* Don't accept write commands if there are not enough good slaves and
     * user configured the min-slaves-to-write option. */
    /* 如果没有足够良好的从节点也是不接受写命令的（min-slaves-to-write） */ 
    if (is_write_command && !checkGoodReplicasStatus()) {
        rejectCommand(c, shared.noreplicaserr);
        return C_OK;
    }

    /* Don't accept write commands if this is a read only slave. But
     * accept write commands if this is our master. */
    /* server.masterhost: 当前节点是否连接了主服务器(masterhost)
     * server.repl_slave_ro: 只读从节点状态 */ 
    if (server.masterhost && server.repl_slave_ro &&
        !obey_client &&
        is_write_command)
    {
        rejectCommand(c, shared.roslaveerr);
        return C_OK;
    }

    /* Only allow a subset of commands in the context of Pub/Sub if the
     * connection is in RESP2 mode. With RESP3 there are no limits. */
    /* 通过判断 c->flags & CLIENT_PUBSUB 是否为真，以及 c->resp 字段是否等于 2 (表示使用 RESP2 协议)，来确定当前连接处在 Redis 的发布/订阅模式下。
     * 然后，通过逐个比较当前待执行命令（c->cmd）的处理函数是否等于允许执行的一组特定命令，确定当前是否是被允许执行的命令。如果发现当前命令不在这个允许列表中，
     * 则返回错误信息并拒绝执行。最后，该代码返回 C_OK 表示执行正常结束。 */ 
    if ((c->flags & CLIENT_PUBSUB && c->resp == 2) &&
        c->cmd->proc != pingCommand &&
        c->cmd->proc != subscribeCommand &&
        c->cmd->proc != ssubscribeCommand &&
        c->cmd->proc != unsubscribeCommand &&
        c->cmd->proc != sunsubscribeCommand &&
        c->cmd->proc != psubscribeCommand &&
        c->cmd->proc != punsubscribeCommand &&
        c->cmd->proc != quitCommand &&
        c->cmd->proc != resetCommand) {
        rejectCommandFormat(c,
            "Can't execute '%s': only (P|S)SUBSCRIBE / "
            "(P|S)UNSUBSCRIBE / PING / QUIT / RESET are allowed in this context",
            c->cmd->fullname);
        return C_OK;
    }

    /* Only allow commands with flag "t", such as INFO, REPLICAOF and so on,
     * when replica-serve-stale-data is no and we are a replica with a broken
     * link with master. */
    /* 当节点为从节点时 且 连接不上主节点 且 节点不会向客户端提供已经超过过期时间的数据 则拒绝命令  */ 
    if (server.masterhost && server.repl_state != REPL_STATE_CONNECTED &&
        server.repl_serve_stale_data == 0 &&
        is_denystale_command)
    {
        rejectCommand(c, shared.masterdownerr);
        return C_OK;
    }

    /* Loading DB? Return an error if the command has not the
     * CMD_LOADING flag. */
    /* 当redis正在加载数据且属于非异步加载并且当前执行的命令被标记为不允许加载期间执行的命令 则拒绝命令*/ 
    if (server.loading && !server.async_loading && is_denyloading_command) {
        rejectCommand(c, shared.loadingerr);
        return C_OK;
    }

    /* During async-loading, block certain commands. */
    /*  Redis 正在进行异步数据加载（async_loading）状态下，如果当前执行的命令被标记为不允许在 Redis 数据库数据异步加载期间执行 则拒绝命令 */
    if (server.async_loading && is_deny_async_loading_command) {
        rejectCommand(c,shared.loadingerr);
        return C_OK;
    }

    /* when a busy job is being done (script / module)
     * Only allow a limited number of commands.
     * Note that we need to allow the transactions commands, otherwise clients
     * sending a transaction with pipelining without error checking, may have
     * the MULTI plus a few initial commands refused, then the timeout
     * condition resolves, and the bottom-half of the transaction gets
     * executed, see Github PR #7022. */
    /* 判断命令是否为长时间消耗资源的命令，例如BLPOP，且未设置 CMD_ALLOW_BUSY 标记，则会根据配置和上下文信息发送相应的错误响应给客户端
     * 如果 Redis 配置了 busy_module_yield_flags 标记和 busy_module_yield_reply 参数，则会返回响应错误信息 -BUSY reply-to-send-to-client
     * 如果只配置了 busy_module_yield_flags 参数，则返回共享字符串对象 shared.slowmoduleerr
     * 如果正在运行 Lua 脚本但不是 eval 命令，则返回共享字符串对象 shared.slowscripterr
     * 否则，返回共享字符串对象 shared.slowevalerr */ 
    if (isInsideYieldingLongCommand() && !(c->cmd->flags & CMD_ALLOW_BUSY)) {
        if (server.busy_module_yield_flags && server.busy_module_yield_reply) {
            rejectCommandFormat(c, "-BUSY %s", server.busy_module_yield_reply);
        } else if (server.busy_module_yield_flags) {
            rejectCommand(c, shared.slowmoduleerr);
        } else if (scriptIsEval()) {
            rejectCommand(c, shared.slowevalerr);
        } else {
            rejectCommand(c, shared.slowscripterr);
        }
        return C_OK;
    }

    /* Prevent a replica from sending commands that access the keyspace.
     * The main objective here is to prevent abuse of client pause check
     * from which replicas are exempt. */
    /* 限制 Redis slave 进程对键空间进行写入和读取操作，以免对主 Redis 进程产生影响 */ 
    if ((c->flags & CLIENT_SLAVE) && (is_may_replicate_command || is_write_command || is_read_command)) {
        rejectCommandFormat(c, "Replica can't interact with the keyspace");
        return C_OK;
    }

    /* If the server is paused, block the client until
     * the pause has ended. Replicas are never paused. */
    /* 如果当前客户端不是 Redis slave，且server处于暂停状态，当前客户端被暂停的操作保存在`paused_actions中`（包括所有操作或只有写操作，并且该写入操作可能会产生副本命令），
     * 那么它将被阻塞（暂停）并推迟进行，直到给定的条件都得到解除为止 */
    if (!(c->flags & CLIENT_SLAVE) && 
        ((isPausedActions(PAUSE_ACTION_CLIENT_ALL)) ||
        ((isPausedActions(PAUSE_ACTION_CLIENT_WRITE)) && is_may_replicate_command)))
    {
        blockPostponeClient(c);
        return C_OK;       
    }

    /* Exec the command */
    /* 如果当前客户端处于事务 MULTI 状态并且不执行 EXEC、DISCARD、MULTI、WATCH、QUIT、RESET 这些和事务相关的命令，
     * 如果满足条件，则将该命令加入到该客户端的事务队列中（queueMultiCommand），并回复客户端 "QUEUED" */
    if (c->flags & CLIENT_MULTI &&
        c->cmd->proc != execCommand &&
        c->cmd->proc != discardCommand &&
        c->cmd->proc != multiCommand &&
        c->cmd->proc != watchCommand &&
        c->cmd->proc != quitCommand &&
        c->cmd->proc != resetCommand)
    {
        queueMultiCommand(c, cmd_flags);
        addReply(c,shared.queued);
    } else {
        /*  CMD_CALL_FULL:表示完整执行该命令 */
        int flags = CMD_CALL_FULL;
        /*  flags 参数追加了 CMD_CALL_REPROCESSING 标记表示重新执行命令 */
        if (client_reprocessing_command) flags |= CMD_CALL_REPROCESSING;
        call(c,flags);
        /* 检查是否有阻塞在某个键上的客户端需要被唤醒（handleClientsBlockedOnKeys） */
        if (listLength(server.ready_keys))
            handleClientsBlockedOnKeys();
    }

    return C_OK;
}
```
