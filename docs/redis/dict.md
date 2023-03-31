# dict

## 头文件

### 宏

```c
/* rehashidx不为-1即说明正在发生渐进式rehash */
#define dictIsRehashing(d) ((d)->rehashidx != -1)
```

### dict

哈希表

```c
struct dict {
    dictType *type;
    /* 数组存放的是指向dictEntry地址的地址
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
    /* 复制key */
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
    /*  */
    _dictReset(d, 0);
    _dictReset(d, 1);
    d->type = type;
    d->rehashidx = -1;
    d->pauserehash = 0;
    return DICT_OK;
}
```

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

### dictExpand

dictExpand方法是Redis源码中一个字典的扩容方法。当字典中的节点数超过dict中size属性（可容纳节点数）时，就需要调用dictExpand方法，将其扩容。

在dictExpand方法中，会根据dict的类型（intset或者ht）以及节点数大小，计算新的size大小。然后，根据dict类型的不同，执行相应的扩容操作。

```c
/* return DICT_ERR if expand was not performed */
int dictExpand(dict *d, unsigned long size) {
    return _dictExpand(d, size, NULL);
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

### registerConfigValue

向configs字典中添加新的配置项

```c
/* Create a new config by copying the passed in config. Returns 1 on success
 * or 0 when their was already a config with the same name.. */
int registerConfigValue(const char *name, const standardConfig *config, int alias) {
    /* 分配新的内存空间，并将config内容复制到新的内存空间中 */
    standardConfig *new = zmalloc(sizeof(standardConfig));
    memcpy(new, config, sizeof(standardConfig));
    /* 如果是别名
     * flags使用二进制位来表示config的类型，所以这里 或操作 ALIAS_CONFIG
     * 并将config别名作为新的name，将config原始name作为新的alias */
    if (alias) {
        new->flags |= ALIAS_CONFIG;
        new->name = config->alias;
        new->alias = config->name;
    }
    /* 将新的配置项加入字典，使用sds类型的name作为key，new为value 
     * 如果添加成功，返回DICT_OK */
    return dictAdd(configs, sdsnew(name), new) == DICT_OK;
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
    void *position = dictFindPositionForInsert(d, key, existing);
    if (!position) return NULL;

    /* Dup the key if necessary. */
    if (d->type->keyDup) key = d->type->keyDup(d, key);

    return dictInsertAtPosition(d, key, position);
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
    if (_dictExpandIfNeeded(d) == DICT_ERR)
        return NULL;
    for (table = 0; table <= 1; table++) {
        idx = hash & DICTHT_SIZE_MASK(d->ht_size_exp[table]);
        /* Search if this slot does not already contain the given key */
        he = d->ht_table[table][idx];
        while(he) {
            void *he_key = dictGetKey(he);
            if (key == he_key || dictCompareKeys(d, key, he_key)) {
                if (existing) *existing = he;
                return NULL;
            }
            he = dictGetNext(he);
        }
        if (!dictIsRehashing(d)) break;
    }

    /* If we are in the process of rehashing the hash table, the bucket is
     * always returned in the context of the second (new) hash table. */
    dictEntry **bucket = &d->ht_table[dictIsRehashing(d) ? 1 : 0][idx];
    return bucket;
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
    /* 如果字典已经被设置为避免扩容（DICT_RESIZE_AVOID），
     * 则通过计算当前哈希表（dict->ht_size_exp[1]）和上一个哈希表（dict->ht_size_exp[0]）的大小比例，
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
            /* */
            nextde = dictGetNext(de);
            void *key = dictGetKey(de);
            /* Get the index in the new hash table */
            if (d->ht_size_exp[1] > d->ht_size_exp[0]) {
                h = dictHashKey(d, key) & DICTHT_SIZE_MASK(d->ht_size_exp[1]);
            } else {
                /* We're shrinking the table. The tables sizes are powers of
                 * two, so we simply mask the bucket index in the larger table
                 * to get the bucket index in the smaller table. */
                h = d->rehashidx & DICTHT_SIZE_MASK(d->ht_size_exp[1]);
            }
            if (d->type->no_value) {
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
                    if (!entryIsKey(de)) zfree(decodeMaskedPtr(de));
                    de = key;
                } else if (entryIsKey(de)) {
                    /* We don't have an allocated entry but we need one. */
                    de = createEntryNoValue(key, d->ht_table[1][h]);
                } else {
                    /* Just move the existing entry to the destination table and
                     * update the 'next' field. */
                    assert(entryIsNoValue(de));
                    dictSetNext(de, d->ht_table[1][h]);
                }
            } else {
                dictSetNext(de, d->ht_table[1][h]);
            }
            d->ht_table[1][h] = de;
            d->ht_used[0]--;
            d->ht_used[1]++;
            de = nextde;
        }
        d->ht_table[0][d->rehashidx] = NULL;
        d->rehashidx++;
    }

    /* Check if we already rehashed the whole table... */
    if (d->ht_used[0] == 0) {
        zfree(d->ht_table[0]);
        /* Copy the new ht onto the old one */
        d->ht_table[0] = d->ht_table[1];
        d->ht_used[0] = d->ht_used[1];
        d->ht_size_exp[0] = d->ht_size_exp[1];
        _dictReset(d, 1);
        d->rehashidx = -1;
        return 0;
    }

    /* More to rehash... */
    return 1;
}
```

### dictGetNext

```c
/* Returns the 'next' field of the entry or NULL if the entry doesn't have a
 * 'next' field. */
static dictEntry *dictGetNext(const dictEntry *de) {
    if (entryIsKey(de)) return NULL; /* there's no next */
    if (entryIsNoValue(de)) return decodeEntryNoValue(de)->next;
    return de->next;
}
```

### entryIsKey

dictEntry的地址最低位如果是0，就说明redis返回的地址没有做mask处理，说明含有dictEntry链表

所以通过这个方式可以很快判断dictEntry的next是否有值

```c
/* Returns 1 if the entry pointer is a pointer to a key, rather than to an
 * allocated entry. Returns 0 otherwise. */
static inline int entryIsKey(const dictEntry *de) {
    return (uintptr_t)(void *)de & 1;
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
