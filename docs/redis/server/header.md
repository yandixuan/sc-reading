# 头文件

## OBJ

Redis的对象类型常量

```c
/* The actual Redis Object */
/* 字符串对象。 */
#define OBJ_STRING 0    /* String object. */
/* 列表对象 */
#define OBJ_LIST 1      /* List object. */
/* 集合对象 */
#define OBJ_SET 2       /* Set object. */
/* 有序集合对象 */
#define OBJ_ZSET 3      /* Sorted set object. */
/* 哈希对象 */
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
/* 模块对象。表示被Redis模块管理的对象。它由一个moduleValue结构体包含一个指向实际值的指针和RedisModuleType结构体的函数指针列表，
 * 用于序列化、反序列化、AOF-重写和释放对象等操作 
 * 
 * 在Redis中，模块可以定义自己的对象类型，并通过实现相关的函数指针来对这些对象进行处理。当模块定义新的对象类型时，需要使用RedisModuleType结构体来描述这个新类型，
 * 其中包括该类型的名称、序列化函数、反序列化函数等信息。在使用该类型的对象时，需要将其标识为OBJ_MODULE类型，并将相应的RedisModuleType结构体指针保存在对象的type字段中。
 *
 * 在RDB文件中，模块类型被编码为OBJ_MODULE后面跟着一个64位的模块类型ID。这个ID有54个位是给模块特定签名使用的，以便将加载工作分派到正确的模块，另外还有10个编码版本位 */
#define OBJ_MODULE 5    /* Module object. */
/* 流对象 */
#define OBJ_STREAM 6    /* Stream object. */
```

## OBJ_ENCODING

Redis对象中编码常量

```c
/* SDS（使用 buf 指针来表示字符串内容） */
#define OBJ_ENCODING_RAW 0     /* Raw representation */
/* 整型数字类型 */
#define OBJ_ENCODING_INT 1     /* Encoded as integer */
/* 哈希表编码方式，将数据对象存储为哈希表结构，支持 O(1) 复杂度的增加、删除和查找操作，适用于字典类型等 */
#define OBJ_ENCODING_HT 2      /* Encoded as hash table */
/* 不再使用的旧版哈希表编码方式，通过压缩列表结构实现，已被 OBJ_ENCODING_HT 取代 */
#define OBJ_ENCODING_ZIPMAP 3  /* No longer used: old hash encoding. */
/* 不再使用的旧版列表编码方式，由双向链表和字节数组组成，已被 OBJ_ENCODING_ZIPLIST 和 OBJ_ENCODING_QUICKLIST 取代 */
#define OBJ_ENCODING_LINKEDLIST 4 /* No longer used: old list encoding. */
/* 不再使用的旧版列表、哈希和有序集合的编码方式，由连续内存区段组成，适用于小型的列表和哈希结构，已被 OBJ_ENCODING_QUICKLIST 和 OBJ_ENCODING_SKIPLIST 取代 */
#define OBJ_ENCODING_ZIPLIST 5 /* No longer used: old list/hash/zset encoding. */
/* 整数集合编码方式，由有序的、不重复的整数值组成，适用于列表和有序集合类型中元素的排重和统计，内部使用 intset 实现 */
#define OBJ_ENCODING_INTSET 6  /* Encoded as intset */
/* 跳跃表编码方式，将有序集合存储为跳跃表结构，支持 O(log N) 复杂度的增删改查操作，适用于需要排序和范围查询（range query）的有序集合 */
#define OBJ_ENCODING_SKIPLIST 7  /* Encoded as skiplist */
/* 嵌入式简单动态字符串编码方式，内部使用 SDS 实现（该指针直接指向对象头的未使用空间中保存的内嵌式字符串的字符数组。由于内嵌式字符串的长度有限制（默认为 44 字节），所以可以保证该指针指向的字符数组足够存储该内嵌式字符串的内容） */
#define OBJ_ENCODING_EMBSTR 8  /* Embedded sds string encoding */
/* 快速列表编码方式，由链表和列表数据结构（listpacks）组成，支持快速的尾部插入和删除以及随机访问功能，适用于列表类型和哈希类型等 */
#define OBJ_ENCODING_QUICKLIST 9 /* Encoded as linked list of listpacks */
/* 流数据结构，内部使用 radix tree 实现 */
#define OBJ_ENCODING_STREAM 10 /* Encoded as a radix tree of listpacks */
/* 列表类型，它通过将列表拆解为多个 listpack（列表包） 来降低内存占用和提高效率。列表包是一种用于存储元素的紧凑二进制数组，支持 O(1) 的随机访问、O(1) 的尾部插入和删除操作以及可重复使用的空间分配等特性 */
#define OBJ_ENCODING_LISTPACK 11 /* Encoded as a listpack */
```

## LRU

Redis 在实现上引入了一个LRU时钟来代替unix时间戳，每个对象的每次被访问都会记录下当前服务器的LRU时钟，
然后用服务器的LRU时钟减去对象本身的时钟，得到的就是这个对象没有被访问的时间间隔（也称空闲时间），空闲时间最大的就是需要淘汰的对象。

```c


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

## MAXMEMORY

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

## redisCommandGroup

redisCommandGroup 是 Redis 客户端中的一个枚举类型，用来表示命令所属的分组。具体包括以下 18 种分组：

:::details 分组

- COMMAND_GROUP_GENERIC：通用命令
- COMMAND_GROUP_STRING：字符串命令
- COMMAND_GROUP_LIST：列表命令
- COMMAND_GROUP_SET：集合命令
- COMMAND_GROUP_SORTED_SET：有序集命令
- COMMAND_GROUP_HASH：哈希命令
- COMMAND_GROUP_PUBSUB：发布订阅命令
- COMMAND_GROUP_TRANSACTIONS：事务命令
- COMMAND_GROUP_CONNECTION：连接命令
- COMMAND_GROUP_SERVER：服务器命令
- COMMAND_GROUP_SCRIPTING：脚本命令
- COMMAND_GROUP_HYPERLOGLOG：HyperLogLog命令
- COMMAND_GROUP_CLUSTER：集群命令
- COMMAND_GROUP_SENTINEL：Sentinel命令
- COMMAND_GROUP_GEO：地理位置命令
- COMMAND_GROUP_STREAM：流命令
- COMMAND_GROUP_BITMAP：位图命令
- COMMAND_GROUP_MODULE：模块命令
:::

```c
/* Must be synced with COMMAND_GROUP_STR and generate-command-code.py */
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

## redisObject

[type](#OBJ)

[encoding](#OBJ_ENCODING)

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

## redisCommand

```c

```

## redisDb

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
