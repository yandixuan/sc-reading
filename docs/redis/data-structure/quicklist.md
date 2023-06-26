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
    /* entry 的大小，以字节为单位 */
    size_t sz;             /* entry size in bytes */
    /* listpack 中包含的元素数量 */
    unsigned int count : 16;     /* count of items in listpack */
    /*  编码方式：RAW 或 LZF */
    unsigned int encoding : 2;   /* RAW==1 or LZF==2 */
    /* 内部容器类型：PLAIN 或 PACKED */
    unsigned int container : 2;  /* PLAIN==1 or PACKED==2 */
    /* 记录该节点上一次是否被压缩过 */
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

```c
REDIS_STATIC void __quicklistInsertNode(quicklist *quicklist,
                                        quicklistNode *old_node,
                                        quicklistNode *new_node, int after) {
    if (after) {
        new_node->prev = old_node;
        if (old_node) {
            new_node->next = old_node->next;
            if (old_node->next)
                old_node->next->prev = new_node;
            old_node->next = new_node;
        }
        if (quicklist->tail == old_node)
            quicklist->tail = new_node;
    } else {
        new_node->next = old_node;
        if (old_node) {
            new_node->prev = old_node->prev;
            if (old_node->prev)
                old_node->prev->next = new_node;
            old_node->prev = new_node;
        }
        if (quicklist->head == old_node)
            quicklist->head = new_node;
    }
    /* If this insert creates the only element so far, initialize head/tail. */
    if (quicklist->len == 0) {
        quicklist->head = quicklist->tail = new_node;
    }

    /* Update len first, so in __quicklistCompress we know exactly len */
    quicklist->len++;

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

---

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
