# quicklist

快速列表

listpack不能保存过多元素，否则访问性能会降低，不能保存过大的元素，否则容易导致内存重新分配

quicklist结合quicklist、链表各自的优势，而链表中的每个元素又是一个quicklist

## 数据结构

### quicklistNode

快速列表节点结构体

```c
typedef struct quicklistNode {
    /*  指向前一个节点的指针 */
    struct quicklistNode *prev;
    /* 指向后一个节点的指针 */
    struct quicklistNode *next;
    /* 指向 entry 数据的指针 */
    unsigned char *entry;
    /* 数据指针。如果当前节点的数据没有压缩，那么它指向一个listpack结构；否则，它指向一个quicklistLZF结构。 */
    size_t sz;             /* entry size in bytes */
    /* listpack 中包含的元素数量 */
    unsigned int count : 16;     /* count of items in listpack */
    /*  编码方式：RAW 或 LZF */
    unsigned int encoding : 2;   /* RAW==1 or LZF==2 */
    /* 内部容器类型：PLAIN 或 PACKED */
    unsigned int container : 2;  /* PLAIN==1 or PACKED==2 */
    /* 当我们使用类似lindex这样的命令查看了某一项本来压缩的数据时，需要把数据暂时解压，
     * 这时就设置recompress=1做一个标记，等有机会再把数据重新压缩 */
    unsigned int recompress : 1; /* was this node previous compressed? */
    /* 标记该节点是否太小无法进行压缩 */
    unsigned int attempted_compress : 1; /* node can't compress; too small */
    /* 标记 entry 是否是使用中，防止 entry 在使用期间被压缩 */
    unsigned int dont_compress : 1; /* prevent compression of entry that will be used later */
    /* 额外占用 9 位无符号整数，留作未来的使用 */
    unsigned int extra : 9; /* more bits to steal for future usage */
} quicklistNode;
```

### quicklistLZF

表示 LZF 压缩后的数据

```c
typedef struct quicklistLZF {
    /* LZF 压缩后的字节数 */
    size_t sz; /* LZF size in bytes*/
    /* 可变长度数组，用于存储压缩后的数据 */
    char compressed[];
} quicklistLZF;
```

### quicklistBookmark

quicklist 中的书签，用于记录某个节点的位置

通过使用书签，可以在 quicklist 中快速定位到某个特定节点，而无需遍历整个列表。这对于需要频繁查找和操作某个节点的应用程序非常有用。

```c
typedef struct quicklistBookmark {
    /* 指向 quicklist 中的节点 */
    quicklistNode *node;
    /* 该书签的名称 */
    char *name;
} quicklistBookmark;
```

### quicklist

快速列表结构体

```c
typedef struct quicklist {
    /* 头节点指针 */
    quicklistNode *head;
    /* 尾节点指针 */
    quicklistNode *tail;
    /* 所有`listpack`中的`entry`数量 */
    unsigned long count;        /* total count of all entries in all listpacks */
    /* `quicklistNode`节点总数 */
    unsigned long len;          /* number of quicklistNodes */
    /* 填充因子是用于控制节点分裂和合并的阈值。当一个快表节点的元素数量超过指定的填充因子时，
     * 会触发节点的分裂操作，将该节点拆分为两个节点。相反，当两个相邻的快表节点的元素数量都低于填充因子时，
     * 会触发节点的合并操作，将相邻节点合并成一个节点 */
    signed int fill : QL_FILL_BITS;       /* fill factor for individual nodes */
    /* `quicklist`的压缩深度，0表示所有节点都不压缩，否则就表示从两端开始有多少个节点不压缩，默认值16 */
    unsigned int compress : QL_COMP_BITS; /* depth of end nodes not to compress;0=off */
    /* bookmarks数组的大小 */
    unsigned int bookmark_count: QL_BM_BITS;
    /* 快速访问特定索引位置所需的标记 */
    quicklistBookmark bookmarks[];
} quicklist;
```

### quicklistIter

```c
typedef struct quicklistIter {
    quicklist *quicklist;
    quicklistNode *current;
    unsigned char *zi; /* points to the current element */
    long offset; /* offset in current listpack */
    int direction;
} quicklistIter;
```

### quicklistEntry

用于在迭代 quicklist 时暴露节点的详细信息，包括压缩和解压缩的数据、值类型等

```c
typedef struct quicklistEntry {
    /* 指向 quicklist 结构体的指针 */
    const quicklist *quicklist;
    /* 指向 quicklist 中的节点的指针 */
    quicklistNode *node;
    /* 指向该节点所在的 listpack 数据块的指针 */
    unsigned char *zi;
    /* 指向解压缩后数据的指针，如果该节点存储的不是字符串或字节数组，则该指针为 NULL */
    unsigned char *value;
    /* 当前节点的值，如果该节点存储的是数字类型的数据，则存储数字值，否则为 0 */
    long long longval;
    /* 节点值的长度 */
    size_t sz;
    /* 在节点的连续压缩数据中的偏移量 */
    int offset;
} quicklistEntry;
```

## 宏

### quicklistNodeEncoding

```c
/* 节点未压缩 */
#define QUICKLIST_NODE_ENCODING_RAW 1
/* 节点被压缩 */
#define QUICKLIST_NODE_ENCODING_LZF 2
```

### quicklistNodeContainerFormat

```c
/* 该节点存储了一个普通元素，即该节点的 entry 属性直接存储元素的值 */
#define QUICKLIST_NODE_CONTAINER_PLAIN 1
/* 快速列表中节点是使用紧凑列表存储数据 */
#define QUICKLIST_NODE_CONTAINER_PACKED 2
```

## 函数

### quicklistNew

```c
quicklist *quicklistNew(int fill, int compress) {
    quicklist *quicklist = quicklistCreate();
    quicklistSetOptions(quicklist, fill, compress);
    return quicklist;
}
```

quicklistCreate

创建了一个新的快速列表节点

```c
REDIS_STATIC quicklistNode *quicklistCreateNode(void) {
    quicklistNode *node;
    /* 分配内存空间给新的节点 */
    node = zmalloc(sizeof(*node));
    /* 节点的数据条目为空 */
    node->entry = NULL;
    /* 节点的条目数量为0 */
    node->count = 0;
    /* 节点的总大小为0 */
    node->sz = 0;
    /* 节点的前驱和后继指针都指向NULL，表示该节点是双向链表中的第一个节点 */
    node->next = node->prev = NULL;
    /* 节点不压缩 */
    node->encoding = QUICKLIST_NODE_ENCODING_RAW;
    /* 节点使用紧凑列表存储数据 */
    node->container = QUICKLIST_NODE_CONTAINER_PACKED;
    /* 节点不需要重新压缩 */
    node->recompress = 0;
    /* 节点可以被压缩 */
    node->dont_compress = 0;
    return node;
}
```

### __quicklistCompressNode

对`quicklist`节点进行`LZF`无损压缩

:::tip lzf_compress参数

- in_data: 指向待压缩的数据的指针
- in_len: 待压缩数据的长度
- out_data: 指向存储压缩结果的缓冲区的指针
- out_len: 指定存储压缩结果的缓冲区的大小

:::

```c
REDIS_STATIC int __quicklistCompressNode(quicklistNode *node) {
#ifdef REDIS_TEST
    node->attempted_compress = 1;
#endif
    /* 如果节点设置了不压缩则直接返回 */
    if (node->dont_compress) return 0;

    /* validate that the node is neither
     * tail nor head (it has prev and next)*/
    assert(node->prev && node->next);
    /* 该节点正在被压缩，姑 recompress=0 */
    node->recompress = 0;
    /* Don't bother compressing small values */
    /* 如果节点的大小小于 MIN_COMPRESS_BYTES 定义的阈值，不进行压缩操作 */
    if (node->sz < MIN_COMPRESS_BYTES)
        return 0;
    /* 为LZF节点申请内存 
     * 结构体本身的大小加上压缩前的大小。这样做的目的是确保缓冲区足够大，可以容纳压缩后的数据 */
    quicklistLZF *lzf = zmalloc(sizeof(*lzf) + node->sz);

    /* Cancel if compression fails or doesn't compress small enough */
    /* 压缩后数据大小肯定变了，所以node->sz需要设置成压缩后的大小
     * 如果压缩失败或者压缩结果大小与原始大小相差不大，则释放缓冲区并返回 */
    if (((lzf->sz = lzf_compress(node->entry, node->sz, lzf->compressed,
                                 node->sz)) == 0) ||
        lzf->sz + MIN_COMPRESS_IMPROVE >= node->sz) {
        /* lzf_compress aborts/rejects compression if value not compressible. */
        zfree(lzf);
        return 0;
    }
    /* 调整缓冲区大小以适应压缩结果 */
    lzf = zrealloc(lzf, sizeof(*lzf) + lzf->sz);
    /* 释放原来的紧凑列表 */
    zfree(node->entry);
    /* node的entry指针指向被压缩的数据结构体 */
    node->entry = (unsigned char *)lzf;
    /* 设置节点的编码类型为压缩类型 */
    node->encoding = QUICKLIST_NODE_ENCODING_LZF;
    return 1;
}
```

### __quicklistDecompressNode

```c
REDIS_STATIC int __quicklistDecompressNode(quicklistNode *node) {
#ifdef REDIS_TEST
    node->attempted_compress = 0;
#endif
    node->recompress = 0;

    void *decompressed = zmalloc(node->sz);
    quicklistLZF *lzf = (quicklistLZF *)node->entry;
    if (lzf_decompress(lzf->compressed, lzf->sz, decompressed, node->sz) == 0) {
        /* Someone requested decompress, but we can't decompress.  Not good. */
        zfree(decompressed);
        return 0;
    }
    zfree(lzf);
    node->entry = decompressed;
    node->encoding = QUICKLIST_NODE_ENCODING_RAW;
    return 1;
}
```

### __quicklistCompress

从快速列表头尾节点开始向中间靠拢达到压缩深度，被压缩节点在深度外则进行压缩，否则进行一步压缩头尾指针所指节点，以达到节省内存目的

```c
REDIS_STATIC void __quicklistCompress(const quicklist *quicklist,
                                      quicklistNode *node) {
    /* 如果快速列表为空，则直接返回，不进行压缩 */
    if (quicklist->len == 0) return;

    /* The head and tail should never be compressed (we should not attempt to recompress them) */
    /* 对于快速列表的头节点和尾节点，它们不应被压缩，因此确保它们的recompress属性为0 */
    assert(quicklist->head->recompress == 0 && quicklist->tail->recompress == 0);

    /* If length is less than our compress depth (from both sides),
     * we can't compress anything. */
    /* 如果快速列表不允许压缩（通过检查其配置）或者其长度小于压缩深度的两倍，则无法进行压缩，直接返回 */ 
    if (!quicklistAllowsCompression(quicklist) ||
        quicklist->len < (unsigned int)(quicklist->compress * 2))
        return;

#if 0
    /* Optimized cases for small depth counts */
    if (quicklist->compress == 1) {
        quicklistNode *h = quicklist->head, *t = quicklist->tail;
        quicklistDecompressNode(h);
        quicklistDecompressNode(t);
        if (h != node && t != node)
            quicklistCompressNode(node);
        return;
    } else if (quicklist->compress == 2) {
        quicklistNode *h = quicklist->head, *hn = h->next, *hnn = hn->next;
        quicklistNode *t = quicklist->tail, *tp = t->prev, *tpp = tp->prev;
        quicklistDecompressNode(h);
        quicklistDecompressNode(hn);
        quicklistDecompressNode(t);
        quicklistDecompressNode(tp);
        if (h != node && hn != node && t != node && tp != node) {
            quicklistCompressNode(node);
        }
        if (hnn != t) {
            quicklistCompressNode(hnn);
        }
        if (tpp != h) {
            quicklistCompressNode(tpp);
        }
        return;
    }
#endif

    /* Iterate until we reach compress depth for both sides of the list.a
     * Note: because we do length checks at the *top* of this function,
     *       we can skip explicit null checks below. Everything exists. */
    /* 从头部开始向后遍历的指针 */
    quicklistNode *forward = quicklist->head;
    /* 从尾部开始向前遍历的指针 */
    quicklistNode *reverse = quicklist->tail;
    /* 当前遍历的深度 */
    int depth = 0;
    /* 待压缩的节点是否在压缩深度内 */
    int in_depth = 0;
    /* 迭代直到达到压缩深度 */
    while (depth++ < quicklist->compress) {
        /* 解压缩前向指针所在的节点
         * 当前节点编码是LZF即被压缩了才进行解压 */
        quicklistDecompressNode(forward);
        quicklistDecompressNode(reverse);

        if (forward == node || reverse == node)
            /* 如果当前节点是待压缩的节点，标记 in_depth 为1 */
            in_depth = 1;

        /* We passed into compress depth of opposite side of the quicklist
         * so there's no need to compress anything and we can exit. */
        /* 如果前向指针和后向指针相遇，或者它们只隔一个节点，表示已经达到了压缩的深度，不需要进行进一步压缩，直接返回 */ 
        if (forward == reverse || forward->next == reverse)
            return;
        /* 向后移动前向指针 */
        forward = forward->next;
        /* 向前移动后向指针 */
        reverse = reverse->prev;
    }

    if (!in_depth)
        /* 如果待压缩的节点不在压缩深度内，进行压缩 */
        quicklistCompressNode(node);

    /* At this point, forward and reverse are one node beyond depth */
    /* 深度外的节点则进行压缩 
     * 每次插入、删除的时候会进行一步压缩，这样的目的是避免频繁地进行压缩消耗过多的计算资源。
     */
    quicklistCompressNode(forward);
    quicklistCompressNode(reverse);
}
```

### __quicklistInsertNode

将一个新的节点插入到 quicklist 中的指定位置

:::tip 参数说明

- quicklist: quicklist对象
- old_node: 参照物
- new_node: 要插入的节点
- after: 位置
  - 1: new_node 插入 old_node 后面
  - 0: new_node 插入 old_node 前面
:::

如果节点的`recompress=1`即被解压过，直接调用<VPLink inline-block icon="i-carbon-code" title="__quicklistCompressNode" url="#__quicklistCompressNode"/>，否则调用
<VPLink inline-block icon="i-carbon-code" title="__quicklistCompress" url="#__quicklistCompress"/>

```c
REDIS_STATIC void __quicklistInsertNode(quicklist *quicklist,
                                        quicklistNode *old_node,
                                        quicklistNode *new_node, int after) {
    if (after) {
        /* 新节点的前驱指向 old_node */
        new_node->prev = old_node;
        /* old_node存在，将old_node、new_node的关系双向链接 */
        if (old_node) {
            new_node->next = old_node->next;
            if (old_node->next)
                old_node->next->prev = new_node;
            old_node->next = new_node;
        }
        /* 如果 old_node 是尾节点，则将新节点设置为尾节点 */
        if (quicklist->tail == old_node)
            quicklist->tail = new_node;
    } else {
        /* 设置新节点的后继为 old_node */
        new_node->next = old_node;
        /* old_node存在，将old_node、new_node的关系双向链接 */
        if (old_node) {
            new_node->prev = old_node->prev;
            if (old_node->prev)
                old_node->prev->next = new_node;
            old_node->prev = new_node;
        }
        /* 如果 old_node 是头节点，则将新节点设置为头节点 */
        if (quicklist->head == old_node)
            quicklist->head = new_node;
    }
    /* If this insert creates the only element so far, initialize head/tail. */
    /* 如果这次插入是链表中唯一的元素，初始化头尾节点 */
    if (quicklist->len == 0) {
        quicklist->head = quicklist->tail = new_node;
    }

    /* Update len first, so in __quicklistCompress we know exactly len */
    /* 先更新 len，以便在 __quicklistCompress 函数中准确知道长度 */
    quicklist->len++;
    /* 对插入节点，被插入节点进行压缩 */
    if (old_node)
        quicklistCompress(quicklist, old_node);
    quicklistCompress(quicklist, new_node);
}
```

### quicklistNodeLimit

根据`fill`即`list-max-listpack-size`配置来确定QUICKLIST类型的阈值

- list-max-listpack-size:
  - 非负数: 作为列表的最大长度限制
  - 负数: 内存使用超过配置的内存时才会进行编码转换，`(-fill) - 1`决定`{4096, 8192, 16384, 32768, 65536}`的偏移量，默认4096即4K

```c
void quicklistNodeLimit(int fill, size_t *size, unsigned int *count) {
    *size = SIZE_MAX;
    *count = UINT_MAX;

    if (fill >= 0) {
        /* Ensure that one node have at least one entry */
        *count = (fill == 0) ? 1 : fill;
    } else {
        size_t offset = (-fill) - 1;
        size_t max_level = sizeof(optimization_level) / sizeof(*optimization_level);
        if (offset >= max_level) offset = max_level - 1;
        *size = optimization_level[offset];
    }
}
```

### quicklistNodeExceedsLimit

根据`fill`即`list-max-listpack-size`配置确定是否达到转换quicklist的临界值

返回值，1: 超过限制；0: 没有超过。

```c
int quicklistNodeExceedsLimit(int fill, size_t new_sz, unsigned int new_count) {
    size_t sz_limit;
    unsigned int count_limit;
    quicklistNodeLimit(fill, &sz_limit, &count_limit);

    if (likely(sz_limit != SIZE_MAX)) {
        return new_sz > sz_limit;
    } else if (count_limit != UINT_MAX) {
        /* when we reach here we know that the limit is a size limit (which is
         * safe, see comments next to optimization_level and SIZE_SAFETY_LIMIT) */
        if (!sizeMeetsSafetyLimit(new_sz)) return 1;
        return new_count > count_limit;
    }

    redis_unreachable();
}
```

### quicklistAppendListpack

用于将一个 `listpack` 编码的列表追加到 `quicklist` 中

`_quicklistInsertNodeAfter`最终会调用 <VPLink inline-block icon="i-carbon-code" title="__quicklistInsertNode" url="#__quicklistInsertNode"/>

```c
void quicklistAppendListpack(quicklist *quicklist, unsigned char *zl) {
    /* 创建一个quicklist节点 */
    quicklistNode *node = quicklistCreateNode();
    /* entry指向listpack的内容 */
    node->entry = zl;
    /* 获取listpack元素数量 */
    node->count = lpLength(node->entry);
    /* 计算listpack所占大小即字节数 */
    node->sz = lpBytes(zl);

    /* 向quicklist的尾节点后插入节点 */
    _quicklistInsertNodeAfter(quicklist, quicklist->tail, node);
    /* 累加节点数量 */
    quicklist->count += node->count;
}
```

### __quicklistDelNode

快速列表删除节点元素

```c
REDIS_STATIC void __quicklistDelNode(quicklist *quicklist,
                                     quicklistNode *node) {
    /* Update the bookmark if any */
    /* 检查是否存在书签（bookmark）指向当前要删除的节点（node） */
    quicklistBookmark *bm = _quicklistBookmarkFindByNode(quicklist, node);
    if (bm) {
        /* 该节点要被删除，故指向删除节点的下一个节点 */
        bm->node = node->next;
        /* if the bookmark was to the last node, delete it. */
        /* 如果书签指向的是最后一个节点（last node），则删除该书签 */
        if (!bm->node)
            _quicklistBookmarkDelete(quicklist, bm);
    }
    /* 将当前节点的下一个节点的前驱指针指向当前节点的前驱节点 */
    if (node->next)
        node->next->prev = node->prev;
    /* 将当前节点的前驱节点的后继指针指向当前节点的后继节点 */
    if (node->prev)
        node->prev->next = node->next;
    /* 如果当前节点是尾节点，则更新尾节点为当前节点的前驱节点 */
    if (node == quicklist->tail) {
        quicklist->tail = node->prev;
    }
    /* 如果当前节点是头节点，则更新头节点为当前节点的后继节点 */
    if (node == quicklist->head) {
        quicklist->head = node->next;
    }

    /* Update len first, so in __quicklistCompress we know exactly len */
    /* 先更新快速列表的长度len，以确保在__quicklistCompress函数中能准确获取到len */
    quicklist->len--;
    /* 更新快速列表的元素总数count，减去当前删除的节点中的元素数量 */
    quicklist->count -= node->count;

    /* If we deleted a node within our compress depth, we
     * now have compressed nodes needing to be decompressed. */
    /* 如果在压缩深度范围内删除了一个节点，需要对已压缩的节点进行解压缩操作，保证压缩深度 */ 
    __quicklistCompress(quicklist, NULL);
    /* 释放当前节点的条目所占用的内存 */
    zfree(node->entry);
    /* 释放当前节点所占用的内存 */
    zfree(node);
}
```
