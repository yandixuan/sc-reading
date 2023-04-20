# evict(内存淘汰)

[Redis底层详解（八） LRU 算法](https://blog.csdn.net/WhereIsHeroFrom/article/details/86501571/)

## 头文件

### 宏

```c
/* 池中最多容纳16个entry */
#define EVPOOL_SIZE 16
/* 缓存大小(字节数) */
#define EVPOOL_CACHED_SDS_SIZE 255
```

### evictionPoolEntry

数据结构：缓存池对象

是一个缓存中的元素，通常用于LRU（Least Recently Used）缓存淘汰算法

evictionPoolEntry会记录每个元素的访问时间，当需要淘汰元素时，会根据访问时间来决定淘汰哪些元素，从而保留最近最常被使用的元素

```c
struct evictionPoolEntry {
    /* 对象的空闲时间，对于 LFU 是频度的倒数 */
    unsigned long long idle;    /* Object idle time (inverse frequency for LFU) */
    /* 键名 */
    sds key;                    /* Key name. */
    /* 缓存的键值对应的 SDS 对象 */
    sds cached;                 /* Cached SDS object for key name. */
    /* 键所属的数据库编号 */
    int dbid;                   /* Key DB number. */
};
```

## 全局变量

```c
/* 全局LRU算法的池结构 */
static struct evictionPoolEntry *EvictionPoolLRU;
```

## 方法

### getLRUClock

在调用getLRUClock函数时，取得的时钟值会被除以LRU_CLOCK_RESOLUTION来获得最终的LRU时钟值

我们可以将LRU时钟的分辨率调整为适合当前应用场景的大小。如果分辨率过低，可能会导致LRU算法的精度不足，而分辨率过高则可能会导致额外的计算开销。

```c
/* Return the LRU clock, based on the clock resolution. This is a time
 * in a reduced-bits format that can be used to set and check the
 * object->lru field of redisObject structures. */
unsigned int getLRUClock(void) {
    /* mstime() 获取 unix 时间戳，单位时毫秒
     * 除以 LRU_CLOCK_RESOLUTION(值为 1000)，将时间戳转化为秒
     * LRU_CLOCK_MAX进行取模，定位到 LRU 时钟的某个刻度
     */
    return (mstime()/LRU_CLOCK_RESOLUTION) & LRU_CLOCK_MAX;
}
```

### LRU_CLOCK

该函数用于获取当前LRU时钟值，LRU时钟是在Redis中用于实现LRU算法的数据结构，用于记录每个键值对最后一次被使用的时间。该函数会根据当前系统的分辨率和频率来选择不同的方式来获取LRU时钟

:::tip 提示

而如果系统的刷新频率高于 LRU 时钟的分辨率，即 Redis 检查键值对的频率比时钟的更新速度更快，那么 LRU 时钟的更新就变得没有意义，因为它并不能提供比 Redis 自身检查更精细的缓存淘汰策略。因此，在这种情况下，直接返回预先计算好的 LRU 时钟值，可以避免不必要的计算，提高 Redis 的性能。

:::

```c
/* This function is used to obtain the current LRU clock.
 * If the current resolution is lower than the frequency we refresh the
 * LRU clock (as it should be in production servers) we return the
 * precomputed value, otherwise we need to resort to a system call. */
unsigned int LRU_CLOCK(void) {
    unsigned int lruclock;
    /* 1 / server.hz 代表了 serverCron 这个定时器函数两次调用之间的最小时间间隔（以秒为单位）
     * 那么 1000 / server.hz 就是以毫秒为单位了。如果这个最小时间间隔小于等于 LRU 时钟的精度
     * 那么不需要重新计算 LRU时钟，直接用服务器 LRU时钟做近似值即可，因为时间间隔越小，server.lruclock 刷新的越频繁
     * 相反，当时间间隔很大的时候，server.lruclock 的刷新可能不及时，所以需要用 getLRUClock 重新计算准确的 LRU 时钟 */
    if (1000/server.hz <= LRU_CLOCK_RESOLUTION) {
        atomicGet(server.lruclock,lruclock);
    } else {
        /* 否则调用getLRUClock()系统函数来获取LRU时钟值 */
        lruclock = getLRUClock();
    }
    return lruclock;
}
```

### estimateObjectIdleTime

计算给定对象从上次被请求到现在的空闲时间，使用近似的LRU算法实现

```c
/* Given an object returns the min number of milliseconds the object was never
 * requested, using an approximated LRU algorithm. */
unsigned long long estimateObjectIdleTime(robj *o) {
    /* 获取当前LRU时钟的值 */
    unsigned long long lruclock = LRU_CLOCK();
    /* 对象上次被请求的时间（o->lru）早于或等于当前LRU时钟的值 */
    if (lruclock >= o->lru) {
        /* 计算从上次请求到现在的时间间隔，乘以分辨率获得毫秒数 */
        return (lruclock - o->lru) * LRU_CLOCK_RESOLUTION;
    } else {
        /* 由于时钟是循环的，即出现LRU时钟小于对象的LRU时钟，所以需要考虑服务器当前时钟和对象本身时钟的相对大小
         * 即：当前时钟的LRU加上对象LRU时钟刻度与LRU_CLOCK_MAX的差
         */
        return (lruclock + (LRU_CLOCK_MAX - o->lru)) *
                    LRU_CLOCK_RESOLUTION;
    }
}
```

### evictionPoolAlloc

创建一个用于LRU算法的池结构

```c
void evictionPoolAlloc(void) {
    struct evictionPoolEntry *ep;
    int j;
    /* 申请内存地址 */    
    ep = zmalloc(sizeof(*ep)*EVPOOL_SIZE);
    /* 循环变量`EVPOOL_SIZE`次，给结构体赋初始值 */
    for (j = 0; j < EVPOOL_SIZE; j++) {
        ep[j].idle = 0;
        ep[j].key = NULL;
        /* 创建了一个空字符串缓存，长度是EVPOOL_CACHED_SDS_SIZE */
        ep[j].cached = sdsnewlen(NULL,EVPOOL_CACHED_SDS_SIZE);
        ep[j].dbid = 0;
    }
    /* 赋值给全局LRU算法池对象 */
    EvictionPoolLRU = ep;
}
```

### evictionPoolPopulate

从字典中随机选取若干key加入池，池按照访问时间降序排序，也就是按照idle时间升序排序，池中的entry使用缓存，若key不是很长的话，保存在缓存中，这样就不用多次申请和释放内存。只要池中有空的entry，那么key一定能加进来，否则把key和池中保存的所有key比较一下，把idle时间最小的从池中移除

```c
void evictionPoolPopulate(int dbid, dict *sampledict, dict *keydict, struct evictionPoolEntry *pool) {
    int j, k, count;
    /*  redis在每个dict中最多选择出server.maxmemory_sample个元素存放在以EvictionPoolLRU所指向的内存中 */
    dictEntry *samples[server.maxmemory_samples];
    /* 从采样字典中获取一些 key 来填充驱逐池 */
    count = dictGetSomeKeys(sampledict,samples,server.maxmemory_samples);
    /* 循环处理采样结果 */
    for (j = 0; j < count; j++) {
        unsigned long long idle;
        sds key;
        robj *o;
        dictEntry *de;
        /* 获取dictEntry链 */
        de = samples[j];
        /*  获取 key */
        key = dictGetKey(de);

        /* If the dictionary we are sampling from is not the main
         * dictionary (but the expires one) we need to lookup the key
         * again in the key dictionary to obtain the value object. */
        /* 如果最大内存回收策略不是基于TTL，那么需要读到存储的robj对象的lru属性 */
        if (server.maxmemory_policy != MAXMEMORY_VOLATILE_TTL) {
            if (sampledict != keydict) de = dictFind(keydict, key);
            o = dictGetVal(de);
        }

        /* Calculate the idle time according to the policy. This is called
         * idle just because the code initially handled LRU, but is in fact
         * just a score where an higher score means better candidate. */
        /* 根据策略计算闲置时间，idle 变量在此不是真正的闲置时间，而是个分数（得分越高表示更好的驱逐目标） */
        if (server.maxmemory_policy & MAXMEMORY_FLAG_LRU) {
            /* LRU 策略，使用真正的闲置时间来计算得分
             * 获取robj闲置时间 */ 
            idle = estimateObjectIdleTime(o);
        } else if (server.maxmemory_policy & MAXMEMORY_FLAG_LFU) {
            /* When we use an LRU policy, we sort the keys by idle time
             * so that we expire keys starting from greater idle time.
             * However when the policy is an LFU one, we have a frequency
             * estimation, and we want to evict keys with lower frequency
             * first. So inside the pool we put objects using the inverted
             * frequency subtracting the actual frequency to the maximum
             * frequency of 255. */
            /*  LFU 策略，使用最大频率值减去实际频率值来计算得分 */   
            idle = 255-LFUDecrAndReturn(o);
        } else if (server.maxmemory_policy == MAXMEMORY_VOLATILE_TTL) {
            /* In this case the sooner the expire the better. */
            /* MAXMEMORY_VOLATILE_TTL 策略，使用剩余存活时间的补码表示作为得分
             * redis针对TTL时间有专门的dict进行存储，就是redisDb当中的dict *expires字段，dict顾名思义就是一个hashtable，key为对应的rediskey，value为对应的TTL时间。
             * 所以这里直接取de的值就是TTL时间，越快过期，取的的val越小，则idle越大  */
            idle = ULLONG_MAX - (long)dictGetVal(de);
        } else {
            serverPanic("Unknown eviction policy in evictionPoolPopulate()");
        }

        /* Insert the element inside the pool.
         * First, find the first empty bucket or the first populated
         * bucket that has an idle time smaller than our idle time. */
        /* 将采集的 key，填充到 pool 数组中去。
         * 在池中插入元素，第一步查找第一个空桶或者第一个拥有一个等待时间小于我们等待时间的填充桶 */
        k = 0;
        while (k < EVPOOL_SIZE &&
               pool[k].key &&
               pool[k].idle < idle) k++;
        /* 因为等待时间从小开始排，所以越往后越大，找到第一个大于当前等待时间的键 */       
        if (k == 0 && pool[EVPOOL_SIZE-1].key != NULL) {
            /* Can't insert if the element is < the worst element we have
             * and there are no empty buckets. */
            /* 如果我们当前的元素就是等待时间最短的那个，并且池是满的，不能插入当前元素 */ 
            continue;
        } else if (k < EVPOOL_SIZE && pool[k].key == NULL) {
            /* Inserting into empty position. No setup needed before insert. */
            /* 找到合适位置插入，不需要移动数组其它元素 */
        } else {
            /* Inserting in the middle. Now k points to the first element
             * greater than the element to insert.  */
            /* 找到数组中间位置，但是k位置有数据了需要向右移动数据。 */ 
            if (pool[EVPOOL_SIZE-1].key == NULL) {
                /* Free space on the right? Insert at k shifting
                 * all the elements from k to end to the right. */

                /* Save SDS before overwriting. */
                /* pool数组从k位置向右移动到k+1位置（evictionPoolEntry里的cached都是预分配过内存的）
                 * 从k开始到EVPOOL_SIZE-1的cached地址指针向后覆盖，那么EVPOOL_SIZE-1处的cached指针我们需要赋值到k处，这样才不会发生内存泄漏
                 */
                sds cached = pool[EVPOOL_SIZE-1].cached;
                memmove(pool+k+1,pool+k,
                    sizeof(pool[0])*(EVPOOL_SIZE-k-1));
                pool[k].cached = cached;
            } else {
                /* No free space on right? Insert at k-1 */
                /* 数组满了，只有插入k-1处了 */
                k--;
                /* 这k不可能为0，至少为1，因为上述的if判定了条件pool[EVPOOL_SIZE-1].key ！= NULL，
                 * 而第一种情况下 k == 0 && pool[EVPOOL_SIZE-1].key != NULL 这种情况已判，故k最小是1 */
                /* Shift all elements on the left of k (included) to the
                 * left, so we discard the element with smaller idle time. */
                /* 采样插入k-1处，所以从pool数组索引1处开始移动移动k个元素到索引0处，那么k-1处就空了
                 * 但是pool[0]处的元素就覆盖了，所以先取出pool[0]的cached地址，后面赋值回pool[k]
                 * 同时，如果key和cached指向不同的空间，那么key所指向的空间需要被释放，否则就是孤魂野鬼，会造成内存泄漏 */
                sds cached = pool[0].cached; /* Save SDS before overwriting. */
                if (pool[0].key != pool[0].cached) sdsfree(pool[0].key);
                memmove(pool,pool+1,sizeof(pool[0])*k);
                pool[k].cached = cached;
            }
        }

        /* Try to reuse the cached SDS string allocated in the pool entry,
         * because allocating and deallocating this object is costly
         * (according to the profiler, not my fantasy. Remember:
         * premature optimization bla bla bla. */
        /* 尝试使用分配给池中实体的缓存字符串空间，因为分配和释放分配的内存消耗很大(EVPOOL_CACHED_SDS_SIZE就是cached就是指向sds的长度) */
        int klen = sdslen(key);
        if (klen > EVPOOL_CACHED_SDS_SIZE) {
            /* 如果超过了缓存的空间大小，那需要新建一个SDS字符串 */
            pool[k].key = sdsdup(key);
        } else {
            /* 如果缓存空间够用，将键拷贝到缓存中（其中+1是为了存放字符串结束符'\0'） */
            memcpy(pool[k].cached,key,klen+1);
            /* 设置SDS字符串长度 */
            sdssetlen(pool[k].cached,klen);
            /* 将键也指向缓存所在内存空间 */
            pool[k].key = pool[k].cached;
        }
        /* 设置驱逐分数，key所在db */
        pool[k].idle = idle;
        pool[k].dbid = dbid;
    }
}
```

### LFUGetTimeInMinutes

1. `server.unixtime` 是 Redis 服务器记录的当前Unix时间戳，表示从1970年1月1日00:00:00 UTC开始到当前时间所经过的秒数。

2. 通过将 `server.unixtime` 除以60，可以得到从Unix时间戳开始到当前时间所经过的分钟数。

3. & 65535 是为了防止溢出，因为返回的值是无符号长整数。65535（即0xFFFF）是16位无符号整数可以表示的最大值，因此按位与操作相当于对16位取模，得到的余数就是当前分钟数。

4. 最后返回值为无符号长整数，即该函数返回当前时间距离Unix时间戳的分钟数。

```c
unsigned long LFUGetTimeInMinutes(void) {
    return (server.unixtime/60) & 65535;
}
```

### LFUTimeElapsed

计算当前时间和给定的时间的差值

```c
unsigned long LFUTimeElapsed(unsigned long ldt) {
    /* 获取服务器当前的时间（分钟） */
    unsigned long now = LFUGetTimeInMinutes();
    /* 如果当前时间大于给点的分钟，则取差值 */
    if (now >= ldt) return now-ldt;
    /* 否则，当前时间肯定超过了最大值65535（取模），则用给点时间和最大值的差值加上当前服务器时间 */
    return 65535-ldt+now;
}
```

### LFUDecrAndReturn

获取`redisObject`的`lru`计数器的值，当对象递减时间到达，减少LFU计数器但是不更新`redisObject`的`lru`字段，当一个对象真正被访问到的时候显式更新对象的访问时间和计数器值

:::tip 注意
Redis的LFU算法对访问时间的精度控制在分钟，是为了减少Redis占用CPU的负担。LFU需要对每个数据项的访问频率进行统计，精度越高，需要进行的统计操作就越频繁，对CPU的负荷也越大。选择分钟级别的时间精度，可以平衡算法的效果和Redis的性能消耗。此外，考虑到实际应用场景中，大部分数据项的访问频率不会像秒级别的热点数据那么高，因此分钟级别的精度已经足够满足绝大多数使用场景。
:::

```c
unsigned long LFUDecrAndReturn(robj *o) {
    /* lru 属性的高 16 位用来记录访问时间（last decrement time：ldt，单位为分钟），
     * 低 8 位用来记录访问频率（logistic counter：logc），简称 counter。 */
    unsigned long ldt = o->lru >> 8;
    /* 255转二进制 1111 1111(低8位) */
    unsigned long counter = o->lru & 255;
    /* 根据 LFU 的衰减系数（默认为1，如果该值为0，就是不衰减的意思，如果该值大于1，那么衰减的就会比较慢，该值可以进行配置） 
     * server.lfu_decay_time 和上一次被访问的时间 ldt，计算出当前对象即将衰减的数量 */
    unsigned long num_periods = server.lfu_decay_time ? LFUTimeElapsed(ldt) / server.lfu_decay_time : 0;
    if (num_periods)
        /* 计算出衰减完成后的计数 */
        counter = (num_periods > counter) ? 0 : counter - num_periods;
    /* 返回值 */    
    return counter;
}
```
