# skiplist

跳跃表，Redis 使用跳跃表作为有序集合键的底层实现之一

## 数据结构

`start from server.h L1331`

### zskiplistNode

有序跳跃列表节点

```c
typedef struct zskiplistNode {
    /* element即元素，SDS类型 */
    sds ele;
    /* 分值，表示该节点的排序权重 */
    double score;
    /* 指向前一个节点的指针 */
    struct zskiplistNode *backward;
    /* 每层索引所包含的信息（层数不确定，因此使用柔性数组形式） */
    struct zskiplistLevel {
        /* 指向该层级下一个节点的指针 */
        struct zskiplistNode *forward;
        /* 表示当前节点与下一个节点之间的跨度，即在当前层级上距离下一个节点的距离。跨度的作用在于当查询或插入时，可以快速地跳过不必要的节点，提高效率 */
        unsigned long span;
    } level[];
} zskiplistNode;
```

### zskiplist

有序跳跃列表

```c
typedef struct zskiplist {
    /* 指向头尾指针 */
    struct zskiplistNode *header, *tail;
    /* 列表长度，即节点数量，不包括头节点 */
    unsigned long length;
    /* 记录跳跃表的层数，也就是表中层高最大的那个结点的层数，注意，表头结点的层高并不计算在内。 */
    int level;
} zskiplist;
```

### zset

有序集合

```c
typedef struct zset {
    /* 字典，用于存储成员到分值的映射关系 */
    dict *dict;
    /* 跳表，用于按照分值大小排序成员，并支持范围查询操作 */
    zskiplist *zsl;
} zset;
```

## 方法

### zslCreateNode

创建跳跃表节点

```c
zskiplistNode *zslCreateNode(int level, double score, sds ele) {
    /* 根据传入的参数 level，为节点分配对应空间，其中 level*sizeof(struct zskiplistLevel) 是为节点索引层预览对应的空间大小。 */
    zskiplistNode *zn =
        zmalloc(sizeof(*zn)+level*sizeof(struct zskiplistLevel));
    /* 根据参数，设置分值、元素对象 */
    zn->score = score;
    zn->ele = ele;
    /* 返回申请到的内存地址指针 */
    return zn;
}
```

### zslCreate

创建跳跃表

```c
/* Create a new skiplist. */
zskiplist *zslCreate(void) {
    int j;
    zskiplist *zsl;
    /* 分配内存 */
    zsl = zmalloc(sizeof(*zsl));
    /* 初始化跳表属性 */
    zsl->level = 1;
    zsl->length = 0;
    /* 创建了一个最大层数为32、分值为 0、关联变量为空指针的新节点，并将其作为头部节点插入到跳跃表中。 */
    zsl->header = zslCreateNode(ZSKIPLIST_MAXLEVEL,0,NULL);
    for (j = 0; j < ZSKIPLIST_MAXLEVEL; j++) {
        zsl->header->level[j].forward = NULL;
        zsl->header->level[j].span = 0;
    }
    /* 头部节点 backward 指针设置为 NULL */
    zsl->header->backward = NULL;
    /* 尾节点指针设置为 NULL */
    zsl->tail = NULL;
    return zsl;
}
```

### zslRandomLevel

跳跃表节点层高随机算法，其中关键参数如下：

- ZSKIPLIST_MAXLEVEL: 32
- ZSKIPLIST_P: 0.25

#### ZSKIPLIST_P

跳跃表节点出现在上层索引节点的概率为0.25，因此只有大约每4个节点才会产生一个上层索引节点，从而保证了跳跃表的空间利用率，在这样的概率下跳跃表的查询效率会略大于O(logN)，但是索引的存储内存却能节省一半。

random()取值在`[0,RAND_MAX]`区间，`random()<threshold`的概率为0.25，层数则提升一层

- level1的概率则为`0.75`
- level2的概率则为`0.75*0.25`
- leveln的概率则为`(1-ZSKIPLIST_P )* ZSKIPLIST_P ^ (n - 1)`

这就是所谓的幂次定律（powerlaw）即越大的数出现的概率。

```c
int zslRandomLevel(void) {
    /* 阈值常量 */
    static const int threshold = ZSKIPLIST_P*RAND_MAX;
    /* 默认层数为1 */
    int level = 1;
    /* 当随机值小于阈值时增加层数，即有1/4的概率往上提一层 */
    while (random() < threshold)
        level += 1;
    /* 返回最终层数（最大不超过ZSKIPLIST_MAXLEVEL） */
    return (level<ZSKIPLIST_MAXLEVEL) ? level : ZSKIPLIST_MAXLEVEL;
}
```

### zslInsert

向跳跃表插入节点

```c
zskiplistNode *zslInsert(zskiplist *zsl, double score, sds ele) {
    /* update数组记录插入结点在每层上的前驱结点 */
    zskiplistNode *update[ZSKIPLIST_MAXLEVEL], *x;
    /* rank数组则记录该结点在跳跃表中的排名
     * 表头节点排名为0，所以查找到插入节点位置时，经过的节点数量之和就是其排名 */
    unsigned long rank[ZSKIPLIST_MAXLEVEL];
    int i, level;

    serverAssert(!isnan(score));
    /* x指向跳跃表的头节点 */
    x = zsl->header;
    /* 从最高层依次向下遍历 */
    for (i = zsl->level-1; i >= 0; i--) {
        /* store rank that is crossed to reach the insert position */
        /* 最高层对应在rank数组中的排名值为0，其他层的排名值为上一层对应的排名值 */
        rank[i] = i == (zsl->level-1) ? 0 : rank[i+1];
        /* 在当前层存在下一个节点 && 
         * 当前层下一个节点的分值小于插入节点的分值 || 当分值相等时，插入节点的元素大于下一节点元素
         * 满足上述条件时，说明还需要向后查找插入位置 */
        while (x->level[i].forward &&
                (x->level[i].forward->score < score ||
                    (x->level[i].forward->score == score &&
                    sdscmp(x->level[i].forward->ele,ele) < 0)))
        {   /* 统计经过当前层高查找过的节点跨度之和 
             * 那么rank[0]就是节点对应的跨度，rank[0] + 1 就是新插入节点的实际排名 */
            rank[i] += x->level[i].span;
            /* 节点指针游标后移,继续往后查找插入位置 */
            x = x->level[i].forward;
        }
        /* 本层遍历完，无论是循环自然结束还是找到适合score的区间，x都为插入节点在本层的前驱节点 */
        update[i] = x;
    }
    /* we assume the element is not already inside, since we allow duplicated
     * scores, reinserting the same element should never happen since the
     * caller of zslInsert() should test in the hash table if the element is
     * already inside or not. */
    /* 随机得出新节点的层高 */ 
    level = zslRandomLevel();
    /* 如果新节点的层数大于跳跃表的最高层数，多出的层就需要设置 */
    if (level > zsl->level) {
        /* 将该层的 rank（排名）初始化为 0，因为该层中还没有任何节点
         * 将该层的前驱指针 update[] 设置为头节点 zsl->header，因为这个新层中还没有其它的节点
         * 将该层的 span（跨度）设置为原有链表的长度 zsl->length，即该层中包含了所有原有的节点 */
        for (i = zsl->level; i < level; i++) {
            rank[i] = 0;
            update[i] = zsl->header;
            update[i]->level[i].span = zsl->length;
        }
        /* 更新跳跃表的最高层数 */
        zsl->level = level;
    }
    /* 创建跳跃表节点 */
    x = zslCreateNode(level,score,ele);
    for (i = 0; i < level; i++) {
        /* 在当前层插入新节点(这里和链表插入节点的做法类似) */
        x->level[i].forward = update[i]->level[i].forward;
        update[i]->level[i].forward = x;

        /* update span covered by update[i] as x is inserted here */
        /* 需要计算新增节点每一层的跨度
         * 后继节点的排名为：1+rank[i]+update[i]->level[i].span 
         * 新增节点的排名为：rank[0] + 1
         * 新节点的跨度为二者之差，即  update[i]->level[i].span - (rank[0] - rank[i]) */
        x->level[i].span = update[i]->level[i].span - (rank[0] - rank[i]);
        /* 需要计算新增节点的前驱节点每一层的跨度
         * 新增节点的排名：rank[0] + 1
         * 前驱节点的排名为：rank[i]
         * 新增节点的前驱节点的跨度为二者之差，即 rank[0] + 1 - rank[i] */
        update[i]->level[i].span = (rank[0] - rank[i]) + 1;
    }

    /* increment span for untouched levels */
    /* 高出的层，新增节点的前驱是头节点，头节点的跨度是距离尾部的长度，因为新增了一个节点，所以跨度加1 */
    for (i = level; i < zsl->level; i++) {
        update[i]->level[i].span++;
    }
    /* 如果新增节点的前驱为头节点，则新插入节点是最小节点即头节点
     * 设置节点的 backward 指针为 NULL */
    x->backward = (update[0] == zsl->header) ? NULL : update[0];
    /* 如果 x 在第 0 层上已经存在后继节点，那么需要将该后继节点的 backward 指针指向 x，以确保链表的连通性 */
    if (x->level[0].forward)
        x->level[0].forward->backward = x;
    /* 否则说明x是最后一个节点更新tail指针 */
    else
        zsl->tail = x;
    /* 跳跃表节点数量增加 */
    zsl->length++;
    /* 返回节点 */
    return x;
}
```

### zslDeleteNode

跳跃表删除节点

```c
void zslDeleteNode(zskiplist *zsl, zskiplistNode *x, zskiplistNode **update) {
    int i;
    /* 从0层开始遍历 */
    for (i = 0; i < zsl->level; i++) {
        /* 如果删除节点在当前层的前驱节点不指向待删除节点，那么它到 x 的跨度不会受到影响，所以只需简单地将其在当前层级上的层次跨度减一即可
         * 否则则需要更新x前驱节点的跨度，及删除x节点后，更新前驱后继节点的指向关系 */
        if (update[i]->level[i].forward == x) {
            /* 删除节点x后，需要修改当前层x节点前驱的跨度，即减1 */
            update[i]->level[i].span += x->level[i].span - 1;
            update[i]->level[i].forward = x->level[i].forward;
        } else {
            update[i]->level[i].span -= 1;
        }
    }
    /* 如果 x 在第 0 层上已经存在后继节点，那么需要将该后继节点的 backward 指针指向 x 的后继节点，以确保链表的连通性 */
    if (x->level[0].forward) {
        x->level[0].forward->backward = x->backward;
    } else {
        /* 如果在第0层后继节点不存在，那么更新tail指针为x的前驱节点（因为x节点是最后一个删除了，那么tail指针肯定得指向x的前驱节点） */
        zsl->tail = x->backward;
    }
    /* 如果删除节点之后跳跃表中最高层级的节点数变为 0，则说明当前的高度过高，可以进行降低高度的操作。 */
    while(zsl->level > 1 && zsl->header->level[zsl->level-1].forward == NULL)
        zsl->level--;
    zsl->length--;
}
```

### zslDelete

跳跃表删除节点

```c
int zslDelete(zskiplist *zsl, double score, sds ele, zskiplistNode **node) {
    /* update数组记录要删除的节点在每一层的前驱 */
    zskiplistNode *update[ZSKIPLIST_MAXLEVEL], *x;
    int i;

    x = zsl->header;
    /* 从最高层向下找删除节点元素ele、分值score在每层的前驱节点 */
    for (i = zsl->level-1; i >= 0; i--) {
        while (x->level[i].forward &&
                (x->level[i].forward->score < score ||
                    (x->level[i].forward->score == score &&
                     sdscmp(x->level[i].forward->ele,ele) < 0)))
        {   /* 下个节点 */
            x = x->level[i].forward;
        }
        /* 设置删除节点在每层的前驱节点 */
        update[i] = x;
    }
    /* We may have multiple elements with the same score, what we need
     * is to find the element with both the right score and object. */
    /* 找到删除节点在0层时对应的后继结点，方便删除（跟链表的删除是一样的） */
    x = x->level[0].forward;
    /* 同样的分值可能会对应不用的元素，只有分值和元素值都相当的才是要删除的节点 */
    if (x && score == x->score && sdscmp(x->ele,ele) == 0) {
        /* x为要删除的节点 */
        zslDeleteNode(zsl, x, update);
        /* node指向被删除的节点的地址，如果地址为null则释放删除节点占用的内存 */
        if (!node)
            zslFreeNode(x);
        else
            *node = x;
        return 1;
    }
    return 0; /* not found */
}
```

### zslIsInRange

判断跳跃表中是否有节点处于范围range中。这里有个前提，所有节点的score都相等。

```c
/* Returns if there is a part of the zset is in range. */
int zslIsInRange(zskiplist *zsl, zrangespec *range) {
    zskiplistNode *x;

    /* Test for ranges that will always be empty. */
    /* 测试rang的合法性
     * 1.最小值大于最大值
     * 2.最小值和最大值相等，同时又满足 “不包括最小值” 或 “不包括最大值” 的情况下，就可以认为这个范围是空的
     * 则返回空 */
    if (range->min > range->max ||
            (range->min == range->max && (range->minex || range->maxex)))
        return 0;
    x = zsl->tail;
    /* 如果跳跃表尾的节点比rang的最小值还小，说明zset没有满足范围的节点 */
    if (x == NULL || !zslValueGteMin(x->score,range))
        return 0;
    x = zsl->header->level[0].forward;
    /* 如果跳跃表头的节点比rang的最大值还大，说明zset没有满足范围的节点 */
    if (x == NULL || !zslValueLteMax(x->score,range))
        return 0;
    /* 如果以上检查都通过了，则说明跳跃表中至少存在一个节点在指定范围内，返回 1 */
    return 1;
}
```

### zslFirstInRange

返回跳跃表中处于范围range中的第一个节点

```c
zskiplistNode *zslFirstInRange(zskiplist *zsl, zrangespec *range) {
    zskiplistNode *x;
    int i;

    /* If everything is out of range, return early. */
    /* 跳跃表中没有节点处于范围range内 */
    if (!zslIsInRange(zsl,range)) return NULL;

    x = zsl->header;
    for (i = zsl->level-1; i >= 0; i--) {
        /* Go forward while *OUT* of range. */
        /* 找到最后一个小于range最小值的节点 */ 
        while (x->level[i].forward &&
            !zslValueGteMin(x->level[i].forward->score,range))
                x = x->level[i].forward;
    }

    /* This is an inner range, so the next node cannot be NULL. */
    /* 那么x的后继节点则是第一个处于范围内的节点，但是可能下一个节点不在区间内 */
    x = x->level[0].forward;
    serverAssert(x != NULL);

    /* Check if score <= max. */
    /* 所以这里还需要判断节点的score值是<=范围的最大值的，即在范围内 */
    if (!zslValueLteMax(x->score,range)) return NULL;
    return x;
}

```

### zslLastInRange

zslLastInRange返回跳跃表中处于范围range中的最后一个节点

```c
zskiplistNode *zslLastInRange(zskiplist *zsl, zrangespec *range) {
    zskiplistNode *x;
    int i;

    /* If everything is out of range, return early. */
    if (!zslIsInRange(zsl,range)) return NULL;

    x = zsl->header;
    for (i = zsl->level-1; i >= 0; i--) {
        /* Go forward while *IN* range. */
        /* 找到小于等于range最大值的最后一个节点 */
        while (x->level[i].forward &&
            zslValueLteMax(x->level[i].forward->score,range))
                x = x->level[i].forward;
    }

    /* This is an inner range, so this node cannot be NULL. */
    serverAssert(x != NULL);

    /* Check if score >= min. */
    /* 由于我们找的是小于等于range最大值的最后一个节点，我们得确保节点是在区间内，即判断节点score大于等于range的最小值 */
    if (!zslValueGteMin(x->score,range)) return NULL;
    return x;
}
```
