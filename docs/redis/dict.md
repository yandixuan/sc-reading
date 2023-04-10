# 字典(dict)

## 头文件

### 宏

```c

/* --------------------- dictEntry pointer bit tricks ----------------------  */

/* The 3 least significant bits in a pointer to a dictEntry determines what the
 * pointer actually points to. If the least bit is set, it's a key. Otherwise,
 * the bit pattern of the least 3 significant bits mark the kind of entry. */

#define ENTRY_PTR_MASK     7 /* 111 */
#define ENTRY_PTR_NORMAL   0 /* 000 */
#define ENTRY_PTR_NO_VALUE 2 /* 010 */

/* rehashidx不为-1即说明正在发生渐进式rehash */
#define dictIsRehashing(d) ((d)->rehashidx != -1)
```

### dict

哈希表

```c
struct dict {
    dictType *type;
    /* dictEntry申请到内存，redis会用ENTRY_PTR_*对地址做处理，而且dictEntry是链表（https://coolshell.cn/articles/8990.html），综上使用二级指针
     * 第一个数组使用，第二个数组是为了渐进式rehash使用 */
    dictEntry **ht_table[2];
    /* 每个哈希表中已用的节点数 */
    unsigned long ht_used[2];
    /* rehashidx 就是记录扩容进度的一个指针。它指向原有哈希表中的第一个没有被复制到新哈希表中的键值对。
     * 通过不断地将这些键值对复制到新哈希表中，并更新 rehashidx 的值
     * 所以如果rehashidx为-1则代表没有在进行rehash */
    long rehashidx; /* rehashing not in progress if rehashidx == -1 */
    
    /* 判断是否暂停增量重建。小于0时表示编码错误，大于0rehasing停止了 */
    /* Keep small vars at end for optimal (minimal) struct padding */
    int16_t pauserehash; /* If >0 rehashing is paused (<0 indicates coding error) */
    /* 哈希表的长度的指数大小（长度是2次方），这样可以优化取模运算 */
    signed char ht_size_exp[2]; /* exponent of size. (size = 1<<exp) */
    /* 元数据的指针 */
    void *metadata[];           /* An arbitrary number of bytes (starting at a
                                 * pointer-aligned address) of size as defined
                                 * by dictType's dictEntryBytes. */
};
```

### dictType

dictType中是一个存放函数的结构体，定义了一些函数指针

```c
typedef struct dictType {
    /* 哈希函数 */
    uint64_t (*hashFunction)(const void *key);
    /* 复制key 
     * 该代码的作用是确保Redis中的key和value都是拷贝过的副本，而不是原始数据的引用，在操作这些数据时更加安全和可靠 */
    void *(*keyDup)(dict *d, const void *key);
    /* 复制val */
    void *(*valDup)(dict *d, const void *obj);
    /* 比较key */
    int (*keyCompare)(dict *d, const void *key1, const void *key2);
    /* 删除key */
    void (*keyDestructor)(dict *d, void *key);
    /* 删除val */
    void (*valDestructor)(dict *d, void *obj);
    /* 判断是否允许进行rehash */
    int (*expandAllowed)(size_t moreMem, double usedRatio);
    /* 目前来说只有setDictType使用下面2个标志 */
    /* Flags */
    /* The 'no_value' flag, if set, indicates that values are not used, i.e. the
     * dict is a set. When this flag is set, it's not possible to access the
     * value of a dictEntry and it's also impossible to use dictSetKey(). Entry
     * metadata can also not be used. */
    /* 当 no_value 标志位被设置为 1 时，表示值不被使用（字典是一个集合），也就是说，无法访问字典入口的值，并且无法使用 dictSetKey()，同时也不能使用入口元数据 */ 
    unsigned int no_value:1;
    /* If no_value = 1 and all keys are odd (LSB=1), setting keys_are_odd = 1
     * enables one more optimization: to store a key without an allocated
     * dictEntry. */
    /* 如果 no_value = 1 并且所有键都是奇数（LSB = 1），将键设置为 keys_are_odd = 1 ，可以启用一项优化：为不分配 dictEntry 的键存储键。 */ 
    unsigned int keys_are_odd:1;
    /* TODO: Add a 'keys_are_even' flag and use a similar optimization if that
     * flag is set. */

    /* Allow each dict and dictEntry to carry extra caller-defined metadata. The
     * extra memory is initialized to 0 when allocated. */
    /* 字典条目的的元数据（metadata）所占用的总字节数 */
    size_t (*dictEntryMetadataBytes)(dict *d);
    /* 该值表示字典的元数据所占用的字节数 */
    size_t (*dictMetadataBytes)(void);
    /* Optional callback called after an entry has been reallocated (due to
     * active defrag). Only called if the entry has metadata. */
    /* 在字典中替换一个键值对(entry)之后执行一些操作 */
    void (*afterReplaceEntry)(dict *d, dictEntry *entry);
} dictType;
```

### dictEntry

哈希实体（键值对）

```c
struct dictEntry {
    /* 键 */
    void *key;
    /* 值 （这些成员都使用同一块内存空间，在一个给定的时间只有其中一个成员是有效的。当一个成员被赋值后，其他成员的值将变为未定义。这种特性可以用来实现不同类型的数据在同一块内存中进行交替存储和访问）*/
    union {
        /* 任意类型 */
        void *val;
        /* 64位无符号整数 */
        uint64_t u64;
        /* 64位有符号整数 */
        int64_t s64;
        /* 双精度浮点数 */
        double d;
    } v;
    /* next中存储的是哈希值相同的key/val对（出现哈希冲突），使用拉链法，通过链表串起来 */
    struct dictEntry *next;     /* Next entry in the same hash bucket. */
    void *metadata[];           /* An arbitrary number of bytes (starting at a
                                 * pointer-aligned address) of size as returned
                                 * by dictType's dictEntryMetadataBytes(). */
};
```

## 方法

### _dictReset

根据htidx重置哈希表，将其全部元素清空并重置相关的计数器和状态变量

```c
/* Reset hash table parameters already initialized with _dictInit()*/
static void _dictReset(dict *d, int htidx)
{   
    /* 将序号htidx对应的哈希表置空 */
    d->ht_table[htidx] = NULL;
    /* 将序号htidx对应的哈希表长度初始化（长度置为-1） */
    d->ht_size_exp[htidx] = -1;
    /* 将序号htidx对应的哈希表使用长度置为0 */
    d->ht_used[htidx] = 0;
}
```

### dictCreate

创建新的hash表

```c
/* Create a new hash table */
dict *dictCreate(dictType *type)
{   
    /*  获取元数据的大小(如果type没有定义dictMetadataBytes方法则返回0) */
    size_t metasize = type->dictMetadataBytes ? type->dictMetadataBytes() : 0;
    /* 分配内存空间给字典 */
    dict *d = zmalloc(sizeof(*d) + metasize);
    if (metasize) {
        /* 将元数据在内存中的值全部设置成0 */
        memset(dictMetadata(d), 0, metasize);
    }
    /* 初始化字典 */
    _dictInit(d,type);
    return d;
}
```

### _dictInit

初始化hash表

```c
int _dictInit(dict *d, dictType *type)
{
    /* 重置ht_table[0] */
    _dictReset(d, 0);
    /* 重置ht_table[1]  */
    _dictReset(d, 1);
    /* 设置dict的类型，渐进式rehash的相关参数的重置 */
    d->type = type;
    d->rehashidx = -1;
    d->pauserehash = 0;
    return DICT_OK;
}
```

### _dictExpand

```c
/* Expand or create the hash table,
 * when malloc_failed is non-NULL, it'll avoid panic if malloc fails (in which case it'll be set to 1).
 * Returns DICT_OK if expand was performed, and DICT_ERR if skipped. */
int _dictExpand(dict *d, unsigned long size, int* malloc_failed)
{   /* malloc_failed地址不为空，那么就将malloc_failed值置为0（0：成功，1：失败） */
    if (malloc_failed) *malloc_failed = 0;

    /* the size is invalid if it is smaller than the number of
     * elements already inside the hash table */
    /* 如果正在进行rehash操作或者要扩容的容量小于当前已使用元素的数量，则扩容失败，返回错误码 */
    if (dictIsRehashing(d) || d->ht_used[0] > size)
        return DICT_ERR;

    /* the new hash table */
    /* 创建一个新的哈希表 */
    dictEntry **new_ht_table;
    /* 新哈希表当前已使用元素数量初始化 */
    unsigned long new_ht_used;
    /* 根据size计算最接近的2的幂指数 */
    signed char new_ht_size_exp = _dictNextExp(size);

    /* Detect overflows */
    /* 根据指数获取新的容量，检测是否溢出 */
    size_t newsize = 1ul<<new_ht_size_exp;
    /* newsize < size 代表新容器的大小没有超过原先容器的大小，因此不用进行扩容；
     * newsize * sizeof(dictEntry*) < newsize这个条件判断是防止扩容后 newsize 个dictEntry元素指针
     * 的大小超过了新容器的大小，导致内存越界的问题。因为 newsize 是一个无符号整数类型，
     * 所以如果 newsize * sizeof(dictEntry*) 的结果比 newsize 还小，说明 newsize 这个整数已经溢出，也就是新的元素指针所需要的空间已经大于了新容器的总容量 */
    if (newsize < size || newsize * sizeof(dictEntry*) < newsize)
        return DICT_ERR;

    /* Rehashing to the same table size is not useful. */
    /* 如果新旧哈希表的容量相同，则扩容失败，返回错误码 */
    if (new_ht_size_exp == d->ht_size_exp[0]) return DICT_ERR;

    /* Allocate the new hash table and initialize all pointers to NULL */
    /* 先尝试使用 ztrycalloc 分配新内存，如果分配成功则将指针赋值给新哈希表指针 */
    if (malloc_failed) {
        new_ht_table = ztrycalloc(newsize*sizeof(dictEntry*));
        /* new_ht_table的地址判断 malloc_failed 为true还是flase */
        *malloc_failed = new_ht_table == NULL;
        if (*malloc_failed)
            return DICT_ERR;
    } else
        /* 如果之前的内存分配成功，则使用 zcalloc 分配新内存，并将指针赋值给新哈希表指针 */
        new_ht_table = zcalloc(newsize*sizeof(dictEntry*));
    /* 新哈希表的已使用元素数量初始化为0 */
    new_ht_used = 0;

    /* Is this the first initialization? If so it's not really a rehashing
     * we just set the first hash table so that it can accept keys. */
    if (d->ht_table[0] == NULL) {
        d->ht_size_exp[0] = new_ht_size_exp;
        d->ht_used[0] = new_ht_used;
        d->ht_table[0] = new_ht_table;
        return DICT_OK;
    }

    /* Prepare a second hash table for incremental rehashing */
    /* 如果不是第一次初始化，则将新哈希表设置为第二个哈希表，用于逐步进行rehash操作 */
    d->ht_size_exp[1] = new_ht_size_exp;
    d->ht_used[1] = new_ht_used;
    d->ht_table[1] = new_ht_table;
    d->rehashidx = 0;
    return DICT_OK;
}
```

### dictExpand

dictExpand方法是Redis源码中一个字典的扩容方法。当字典中的节点数超过dict中size属性（可容纳节点数）时，就需要调用dictExpand方法，将其扩容。

在dictExpand方法中，会根据dict的类型（intset或者ht）以及节点数大小，计算新的size大小。然后，根据dict类型的不同，执行相应的扩容操作。

```c
/* return DICT_ERR if expand was not performed */
int dictExpand(dict *d, unsigned long size) {
    return _dictExpand(d, size, NULL);
}
```

### dictRehash

```c
/* Performs N steps of incremental rehashing. Returns 1 if there are still
 * keys to move from the old to the new hash table, otherwise 0 is returned.
 *
 * Note that a rehashing step consists in moving a bucket (that may have more
 * than one key as we use chaining) from the old to the new hash table, however
 * since part of the hash table may be composed of empty spaces, it is not
 * guaranteed that this function will rehash even a single bucket, since it
 * will visit at max N*10 empty buckets in total, otherwise the amount of
 * work it does would be unbound and the function may block for a long time. */
int dictRehash(dict *d, int n) {
    /* 最大访问的空 bucket 数量 */
    int empty_visits = n*10; /* Max number of empty buckets to visit. */
    /* 如果禁止调整大小或者当前没有进行 rehash，则返回 0 */
    if (dict_can_resize == DICT_RESIZE_FORBID || !dictIsRehashing(d)) return 0;
    // TODO: 这里注释有问题
    /* 如果字典已经被设置为避免扩容（DICT_RESIZE_AVOID），
     * 则通过计算当前哈希表（dict->ht_size_exp[1]）和上一个哈希表（dict->ht_size_exp[0]）的长度比例，
     * （dict_force_resize_ratio）判断是否需要进行扩容。如果比例小于指定的强制扩容比例 
     * 则返回0，跳过扩容操作，以避免不必要的消耗 */
    if (dict_can_resize == DICT_RESIZE_AVOID && 
        (DICTHT_SIZE(d->ht_size_exp[1]) / DICTHT_SIZE(d->ht_size_exp[0]) < dict_force_resize_ratio))
    {
        return 0;
    }
    /* 只进行 n 步 rehash，直到移动完所有元素或者达到 n 步为止 */
    while(n-- && d->ht_used[0] != 0) {
        dictEntry *de, *nextde;

        /* Note that rehashidx can't overflow as we are sure there are more
         * elements because ht[0].used != 0 */
        assert(DICTHT_SIZE(d->ht_size_exp[0]) > (unsigned long)d->rehashidx);
        /* 找到下一个非空的 bucket */
        while(d->ht_table[0][d->rehashidx] == NULL) {
            d->rehashidx++;
            /* 达到最大空 bucket 访问数量，返回 1 */
            if (--empty_visits == 0) return 1;
        }
        /* 获取键值对 */
        de = d->ht_table[0][d->rehashidx];
        /* Move all the keys in this bucket from the old to the new hash HT */
        /* 将该 bucket 中的所有键值对从旧哈希表移动到新哈希表 */
        while(de) {
            uint64_t h;
            /* 找到下一个dictEntry（可能为NULL） */
            nextde = dictGetNext(de);
            /* 获取key值 */
            void *key = dictGetKey(de);
            /* Get the index in the new hash table */
            /* 扩容 */
            if (d->ht_size_exp[1] > d->ht_size_exp[0]) {
                /* 根据key的hash值取模算出在桶中的对应下标 */
                h = dictHashKey(d, key) & DICTHT_SIZE_MASK(d->ht_size_exp[1]);
            } else {
                /* We're shrinking the table. The tables sizes are powers of
                 * two, so we simply mask the bucket index in the larger table
                 * to get the bucket index in the smaller table. */
                /* 字典处于缩容，计算索引。https://github.com/redis/redis/pull/11540 
                 * 举例：hash & 15 坐落在0~7区间，那么 hash & 7 也在 0~7区间
                 * 反之 hash & 15坐落在7~15区间，hash & 7的结果相当于是 oldIndex & 7
                 * 因此这里优化可以省去一次key哈希值的运算，节省cpu资源
                 */ 
                h = d->rehashidx & DICTHT_SIZE_MASK(d->ht_size_exp[1]);
            }
            /* 如果字典是无值的类型 */
            if (d->type->no_value) {
                /* 这里涉及到对set的一个内存优化(https://github.com/redis/redis/pull/11595)
                 * 当dict的type转化为setDictType时(redis在数据量不同时，内部使用的结构式不同的),d->type->keys_are_odd == 1
                 */
                if (d->type->keys_are_odd && !d->ht_table[1][h]) {
                    /* Destination bucket is empty and we can store the key
                     * directly without an allocated entry. Free the old entry
                     * if it's an allocated entry.
                     *
                     * TODO: Add a flag 'keys_are_even' and if set, we can use
                     * this optimization for these dicts too. We can set the LSB
                     * bit when stored as a dict entry and clear it again when
                     * we need the key back. */
                    assert(entryIsKey(key));
                    /* 如果该字典的“keys_are_odd”属性设置为true，且对应ht_table[1]对应h位置的桶为空 
                     * de的数据结构是dictEntry则释放内存
                     * 直接将key（SDS）的地址指针赋值给de(不用重新再申请个dictEntry的内存空间，由于本身就是set无值的，避免内存的浪费，直接使用key的内存地址即可)
                     */
                    if (!entryIsKey(de)) zfree(decodeMaskedPtr(de));
                    de = key;
                } else if (entryIsKey(de)) {
                    /* We don't have an allocated entry but we need one. */
                    /* 如果de是SDS结构 且 如果ht_table[1][h]位置上有dictEntry的存在，那么只能拉链，申请一个没有值的dictEntryNoValue结构体，头插法插进桶内 */
                    de = createEntryNoValue(key, d->ht_table[1][h]);
                } else {
                    /* Just move the existing entry to the destination table and
                     * update the 'next' field. */
                    assert(entryIsNoValue(de));
                    /* dictEntryNoValue类型头插法插入ht_table[1]的h位置 */
                    dictSetNext(de, d->ht_table[1][h]);
                }
            } else {
                /* 字典需要存储键值对，头插法插入即可 */
                dictSetNext(de, d->ht_table[1][h]);
            }
            /* 将de放置ht_table[1]的h下标处
             * ht_used[0]（bucket已使用数量）递减
             * ht_used[1]（bucket已使用数量）递增
             */
            d->ht_table[1][h] = de;
            d->ht_used[0]--;
            d->ht_used[1]++;
            // 赋值
            de = nextde;
        }
        /* dict的第一个hash表对应索引rehashidx处的元素迁移完成，修改dict下一个rehash的桶的索引 */
        d->ht_table[0][d->rehashidx] = NULL;
        d->rehashidx++;
    }

    /* Check if we already rehashed the whole table... */
    /* dict的第一个hash表所有元素迁移完成 */
    if (d->ht_used[0] == 0) {
        /* 释放第一个hash表的内存（dictExpand方法会重新为ht_table[1]申请内存空间）
         * ht_table[1]的相关值指向ht_table[0]
         * 重置
         */
        zfree(d->ht_table[0]);
        /* Copy the new ht onto the old one */
        d->ht_table[0] = d->ht_table[1];
        d->ht_used[0] = d->ht_used[1];
        d->ht_size_exp[0] = d->ht_size_exp[1];
        /* 第一张hash表的值都指向了第二张表对应的值，所以重置第二张hash表的参数 */
        _dictReset(d, 1);
        /* 渐进式rehash完成，所以rehashidx置为-1 */
        d->rehashidx = -1;
        return 0;
    }

    /* More to rehash... */
    /* 返回1代表还有元素没有迁移完成 */
    return 1;
}
```

### _dictRehashStep

```c

/* This function performs just a step of rehashing, and only if hashing has
 * not been paused for our hash table. When we have iterators in the
 * middle of a rehashing we can't mess with the two hash tables otherwise
 * some elements can be missed or duplicated.
 *
 * This function is called by common lookup or update operations in the
 * dictionary so that the hash table automatically migrates from H1 to H2
 * while it is actively used. */
static void _dictRehashStep(dict *d) {
    /* 当值为0时，表示可以执行rehash操作；值为1时，表示暂停rehash操作 */
    if (d->pauserehash == 0) dictRehash(d,1);
}
```

### dictAdd

在字典d中添加键值对(key, val)，并返回操作结果

```c
/* Add an element to the target hash table */
int dictAdd(dict *d, void *key, void *val)
{   /* 调用dictAddRaw()函数，在字典d中添加一个带有键key的新的字典项 */
    dictEntry *entry = dictAddRaw(d,key,NULL);
    /* 如果entry为NULL，则说明插入失败，返回DICT_ERR（错误状态） */
    if (!entry) return DICT_ERR;
    /* 如果no_value为0，则可以设置字典项的value */
    if (!d->type->no_value) dictSetVal(d, entry, val);
    /* 返回操作成功状态：DICT_OK */
    return DICT_OK;
}
```

### dictAddRaw

```c
dictEntry *dictAddRaw(dict *d, void *key, dictEntry **existing)
{
    /* Get the position for the new key or NULL if the key already exists. */
    /* 获取要插入的桶的索引 */
    void *position = dictFindPositionForInsert(d, key, existing);
    if (!position) return NULL;

    /* Dup the key if necessary. */
    /* 如果d结构体中的type字段的keyDup指针不为NULL，那么就使用它来拷贝key值，并将拷贝后的key值赋给key */
    if (d->type->keyDup) key = d->type->keyDup(d, key);
    /* 将节点插入指定位置 */
    return dictInsertAtPosition(d, key, position);
}
```

### dictInsertAtPosition

```c
/* Adds a key in the dict's hashtable at the position returned by a preceding
 * call to dictFindPositionForInsert. This is a low level function which allows
 * splitting dictAddRaw in two parts. Normally, dictAddRaw or dictAdd should be
 * used instead. */
dictEntry *dictInsertAtPosition(dict *d, void *key, void *position) {
    /* position返回的就是dictEntry类型 */
    dictEntry **bucket = position; /* It's a bucket, but the API hides that. */
    dictEntry *entry;
    /* If rehashing is ongoing, we insert in table 1, otherwise in table 0.
     * Assert that the provided bucket is the right table. */
    /* 如果正在进行 rehash，插入 table 1，否则插入 table 0 */
    int htidx = dictIsRehashing(d) ? 1 : 0;
    assert(bucket >= &d->ht_table[htidx][0] &&
           bucket <= &d->ht_table[htidx][DICTHT_SIZE_MASK(d->ht_size_exp[htidx])]);
    /* 计算 entry 的元数据大小 */
    size_t metasize = dictEntryMetadataSize(d);
    /* 对于set的优化，跟dictRehash是一样的流程 */
    if (d->type->no_value) {
        assert(!metasize); /* Entry metadata + no value not supported. */
        if (d->type->keys_are_odd && !*bucket) {
            /* We can store the key directly in the destination bucket without the
             * allocated entry.
             *
             * TODO: Add a flag 'keys_are_even' and if set, we can use this
             * optimization for these dicts too. We can set the LSB bit when
             * stored as a dict entry and clear it again when we need the key
             * back. */
            entry = key;
            assert(entryIsKey(entry));
        } else {
            /* Allocate an entry without value. */
            entry = createEntryNoValue(key, *bucket);
        }
    } else {
        /* Allocate the memory and store the new entry.
         * Insert the element in top, with the assumption that in a database
         * system it is more likely that recently added entries are accessed
         * more frequently. */
        /* 分配 entry 的内存，并把新 entry 存进去 */ 
        entry = zmalloc(sizeof(*entry) + metasize);
        assert(entryIsNormal(entry)); /* Check alignment of allocation */
        if (metasize > 0) {
            memset(dictEntryMetadata(entry), 0, metasize);
        }
        entry->key = key;
        /* 头插法，拉链法 */
        entry->next = *bucket;
    }
    /* 将新的 entry 放到桶中 */
    *bucket = entry;
    /* 哈希表中元素数量加 1 */
    d->ht_used[htidx]++;
    /* 返回桶 */
    return entry;
}
```

### dictGetNext

```c
/* Returns the 'next' field of the entry or NULL if the entry doesn't have a
 * 'next' field. */
static dictEntry *dictGetNext(const dictEntry *de) {
    if (entryIsKey(de)) return NULL; /* there's no next */
    /* de是无值，需要decodeEntryNoValue得到真实地址，再拿到下一个节点地址 */
    if (entryIsNoValue(de)) return decodeEntryNoValue(de)->next;
    /* 正常链表直接取next指针 */
    return de->next;
}
```

### entryIsKey

sds的sdshdr基本都是偶数，但是sds的内存指针是buf[]的起始地址，所以sds的内存地址值通常是奇数

通过这个方法判断de的地址是不是指向SDS

```c
/* Returns 1 if the entry pointer is a pointer to a key, rather than to an
 * allocated entry. Returns 0 otherwise. */
/*  */
static inline int entryIsKey(const dictEntry *de) {
    return (uintptr_t)(void *)de & 1;
}
```

### entryIsNoValue

判断de是否指向的是dictEntryNoValue(无值结构体)节点

```c
/* Returns 1 if the entry is a special entry with key and next, but without
 * value. Returns 0 otherwise. */
static inline int entryIsNoValue(const dictEntry *de) {
    /* 取低三位bit，如果entry没值则返回true否则false */
    return ((uintptr_t)(void *)de & ENTRY_PTR_MASK) == ENTRY_PTR_NO_VALUE;
}
```

### createEntryNoValue

创建一个没有值的dictEntryNoValue节点，de地址低3位加了`ENTRY_PTR_NO_VALUE`

```c
/* Creates an entry without a value field. */
static inline dictEntry *createEntryNoValue(void *key, dictEntry *next) {
    dictEntryNoValue *entry = zmalloc(sizeof(*entry));
    entry->key = key;
    entry->next = next;
    return (dictEntry *)(void *)((uintptr_t)(void *)entry | ENTRY_PTR_NO_VALUE);
}
```

### decodeMaskedPtr

解出`dictEntry`实际地址
:::danger 注意
`de` 为 `dictEntry`实际地址 | ENTRY_PTR_NO_VALUE的结果

`~ENTRY_PTR_MASK`相当于`ENTRY_PTR_MASK`进制位上1变0，0变1；再与`de`做`位与运算`消除地址值中低三位的`mask`值，从而得到`dictEntry`的实际地址
:::

```c
static inline void *decodeMaskedPtr(const dictEntry *de) {
    assert(!entryIsKey(de));
    return (void *)((uintptr_t)(void *)de & ~ENTRY_PTR_MASK);
}
```

### decodeEntryNoValue

```c
/* Decodes the pointer to an entry without value, when you know it is an entry
 * without value. Hint: Use entryIsNoValue to check. */
static inline dictEntryNoValue *decodeEntryNoValue(const dictEntry *de) {
    return decodeMaskedPtr(de);
}


```

### dictInsertAtPosition

```c
/* Adds a key in the dict's hashtable at the position returned by a preceding
 * call to dictFindPositionForInsert. This is a low level function which allows
 * splitting dictAddRaw in two parts. Normally, dictAddRaw or dictAdd should be
 * used instead. */
dictEntry *dictInsertAtPosition(dict *d, void *key, void *position) {
    dictEntry **bucket = position; /* It's a bucket, but the API hides that. */
    dictEntry *entry;
    /* If rehashing is ongoing, we insert in table 1, otherwise in table 0.
     * Assert that the provided bucket is the right table. */
    int htidx = dictIsRehashing(d) ? 1 : 0;
    assert(bucket >= &d->ht_table[htidx][0] &&
           bucket <= &d->ht_table[htidx][DICTHT_SIZE_MASK(d->ht_size_exp[htidx])]);
    size_t metasize = dictEntryMetadataSize(d);
    if (d->type->no_value) {
        assert(!metasize); /* Entry metadata + no value not supported. */
        if (d->type->keys_are_odd && !*bucket) {
            /* We can store the key directly in the destination bucket without the
             * allocated entry.
             *
             * TODO: Add a flag 'keys_are_even' and if set, we can use this
             * optimization for these dicts too. We can set the LSB bit when
             * stored as a dict entry and clear it again when we need the key
             * back. */
            entry = key;
            assert(entryIsKey(entry));
        } else {
            /* Allocate an entry without value. */
            entry = createEntryNoValue(key, *bucket);
        }
    } else {
        /* Allocate the memory and store the new entry.
         * Insert the element in top, with the assumption that in a database
         * system it is more likely that recently added entries are accessed
         * more frequently. */
        entry = zmalloc(sizeof(*entry) + metasize);
        assert(entryIsNormal(entry)); /* Check alignment of allocation */
        if (metasize > 0) {
            memset(dictEntryMetadata(entry), 0, metasize);
        }
        entry->key = key;
        entry->next = *bucket;
    }
    *bucket = entry;
    d->ht_used[htidx]++;

    return entry;
}
```

### dictGetKey

字典数据结构中获取字典节点的键

```c
void *dictGetKey(const dictEntry *de) {
    if (entryIsKey(de)) return (void*)de;
    if (entryIsNoValue(de)) return decodeEntryNoValue(de)->key;
    return de->key;
}
```

### dictTypeExpandAllowed

是否允许字典扩展

```c
/* Because we may need to allocate huge memory chunk at once when dict
 * expands, we will check this allocation is allowed or not if the dict
 * type has expandAllowed member function. */
static int dictTypeExpandAllowed(dict *d) {
    /* 如果字典类型的 expandAllowed 成员函数为 NULL，则允许扩展操作 */
    if (d->type->expandAllowed == NULL) return 1;
    /* 调用字典类型的 expandAllowed 函数来判断是否允许字典扩展，
     * 传入两个参数，第一个参数是需要分配的内存大小，第二个参数是当前字典的负载因子 */
    return d->type->expandAllowed(
                    DICTHT_SIZE(_dictNextExp(d->ht_used[0] + 1)) * sizeof(dictEntry*),
                    (double)d->ht_used[0] / DICTHT_SIZE(d->ht_size_exp[0]));
}
```

### _dictExpandIfNeeded

```c
/* Expand the hash table if needed */
static int _dictExpandIfNeeded(dict *d)
{
    /* Incremental rehashing already in progress. Return. */
    /* 若已经在进行rehash，则直接返回 */
    if (dictIsRehashing(d)) return DICT_OK;

    /* If the hash table is empty expand it to the initial size. */
    /* 若哈希表为空，则扩容至初始大小 */
    if (DICTHT_SIZE(d->ht_size_exp[0]) == 0) return dictExpand(d, DICT_HT_INITIAL_SIZE);

    /* If we reached the 1:1 ratio, and we are allowed to resize the hash
     * table (global setting) or we should avoid it but the ratio between
     * elements/buckets is over the "safe" threshold, we resize doubling
     * the number of buckets. */
    /* 是否允许字典进行扩展 */
    if (!dictTypeExpandAllowed(d))
        return DICT_OK;
    /* 1. 允许dict_can_resize，如果字典的hash表0的已使用长度大于等于hash表0的长度
     * 2. 不允许dict_can_resize，则判断字典的hash表0的负载因子是否达到了强制扩展的要求即dict_force_resize_ratio
     * 上述任意满足即扩展字典hash表
     */    
    if ((dict_can_resize == DICT_RESIZE_ENABLE &&
         d->ht_used[0] >= DICTHT_SIZE(d->ht_size_exp[0])) ||
        (dict_can_resize != DICT_RESIZE_FORBID &&
         d->ht_used[0] / DICTHT_SIZE(d->ht_size_exp[0]) > dict_force_resize_ratio))
    {   
        /* 字典长度扩展1倍 */
        return dictExpand(d, d->ht_used[0] + 1);
    }
    return DICT_OK;
}
```

### _dictNextExp

计算下一个哈希表的初始大小（桶数）的指数

```c
/* TODO: clz optimization */
/* Our hash table capability is a power of two */
static signed char _dictNextExp(unsigned long size)
{   
    /* 初始指数为2 */
    unsigned char e = DICT_HT_INITIAL_EXP;
    /* 如果size超出了long类型的最大值
     * long的字节数，共8*sizeof(long)位bit，指数最大值也就是8*sizeof(long)-1 */
    if (size >= LONG_MAX) return (8*sizeof(long)-1);
    /* 一直循环，直到找到合适的指数 */
    while(1) {
        /* 如果2的e次方大于等于size，则返回这个指数 */
        if (((unsigned long)1<<e) >= size)
            return e;
        /* 否则指数加1，继续循环 */    
        e++;
    }
}
```

### dictFindPositionForInsert

在哈希表中查找键值对应的位置或者找到可以插入新键值对的位置

如果key已经存在，返回NULL并将指向它的指针存储在existing中

```c
/* Finds and returns the position within the dict where the provided key should
 * be inserted using dictInsertAtPosition if the key does not already exist in
 * the dict. If the key exists in the dict, NULL is returned and the optional
 * 'existing' entry pointer is populated, if provided. */
void *dictFindPositionForInsert(dict *d, const void *key, dictEntry **existing) {
    /* idx为key哈希值对应的索引，table为0或1，用来指示哈希表 */
    unsigned long idx, table;
    /* 哈希表节点指针 */
    dictEntry *he;
    /* 计算key的哈希值 
     * 在server.c中有实现了各种不同类型的dictType，而不同dictType中有相应的hashFunction实现 */
    uint64_t hash = dictHashKey(d, key);、
    /* 初始化existing */
    if (existing) *existing = NULL;
    /* 判断是否已经开始执行渐进式rehash，则执行一步rehash */
    if (dictIsRehashing(d)) _dictRehashStep(d);

    /* Expand the hash table if needed */
    /* 判断字典是否允许扩容 */
    if (_dictExpandIfNeeded(d) == DICT_ERR)
        return NULL;
    /* 然后遍历两个哈希表（旧表和新表），找到哈希值对应的索引。
     * 如果这个索引已经包含了给定的键，则返回NULL。如果存在已有的值，则将指针existing指向已有的节点 */    
    for (table = 0; table <= 1; table++) {
        /* 取模运算，得出索引 */
        idx = hash & DICTHT_SIZE_MASK(d->ht_size_exp[table]);
        /* Search if this slot does not already contain the given key */
        /* 根据索引取得节点，然后循环变量找key */
        he = d->ht_table[table][idx];
        while(he) {
            void *he_key = dictGetKey(he);
            /* 如果找key，则不用插入key了返回NULL */
            if (key == he_key || dictCompareKeys(d, key, he_key)) {
                if (existing) *existing = he;
                return NULL;
            }
            /* 获取下个key */
            he = dictGetNext(he);
        }
        /* 如果字典没有处于rehash状态，则只需要遍历第一个hash表  */
        if (!dictIsRehashing(d)) break;
    }

    /* If we are in the process of rehashing the hash table, the bucket is
     * always returned in the context of the second (new) hash table. */
    /* 走到这里，索引idx就是我们要找的桶 
       如果字典处于渐进式rehash，则返回新表中对应的bucket，否则返回旧表中对应的bucket */ 
    dictEntry **bucket = &d->ht_table[dictIsRehashing(d) ? 1 : 0][idx];
    return bucket;
}
```
