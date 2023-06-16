# zset

## 方法

### zzlFind

```c
unsigned char *zzlFind(unsigned char *lp, sds ele, double *score) {
    unsigned char *eptr, *sptr;
    /* lpFirst函数会返回紧凑列表lp中的第一个节点的指针，如果紧凑列表为空，那么调用该函数会返回一个空指针
     *
     */
    if ((eptr = lpFirst(lp)) == NULL) return NULL;
    eptr = lpFind(lp, eptr, (unsigned char*)ele, sdslen(ele), 1);
    if (eptr) {
        sptr = lpNext(lp,eptr);
        serverAssert(sptr != NULL);

        /* Matching element, pull out score. */
        if (score != NULL) *score = zzlGetScore(sptr);
        return eptr;
    }

    return NULL;
}
```

### zsetAdd

```c
int zsetAdd(robj *zobj, double score, sds ele, int in_flags, int *out_flags, double *newscore) {
    /* Turn options into simple to check vars. */
    /* 检查是否设置了增量标志 */
    int incr = (in_flags & ZADD_IN_INCR) != 0;
    /* 检查是否设置了NX标志 */
    int nx = (in_flags & ZADD_IN_NX) != 0;
    /* 检查是否设置了XX标志 */
    int xx = (in_flags & ZADD_IN_XX) != 0;
    /* 检查是否设置了GT标志 */
    int gt = (in_flags & ZADD_IN_GT) != 0;
    /* 检查是否设置了LT标志 */
    int lt = (in_flags & ZADD_IN_LT) != 0;
    /* 我们将返回我们的响应标志 */
    *out_flags = 0; /* We'll return our response flags. */
    /* 声明一个用于保存新元素的分数的变量 */
    double curscore;

    /* NaN as input is an error regardless of all the other parameters. */
    /* 判断 score 是否合法，不合法直接 return */
    if (isnan(score)) {
        /* 设置输出标志ZADD_OUT_NAN */
        *out_flags = ZADD_OUT_NAN;
        return 0;
    }

    /* Update the sorted set according to its encoding. */
    /* 当zobj是OBJ_ENCODING_LISTPACK类型时，即紧凑列表 */
    if (zobj->encoding == OBJ_ENCODING_LISTPACK) {
        unsigned char *eptr;
        /* 从紧凑列表找出元素ele的指针eptr */
        if ((eptr = zzlFind(zobj->ptr,ele,&curscore)) != NULL) {
            /* NX? Return, same element already exists. */
            if (nx) {
                *out_flags |= ZADD_OUT_NOP;
                return 1;
            }

            /* Prepare the score for the increment if needed. */
            if (incr) {
                score += curscore;
                if (isnan(score)) {
                    *out_flags |= ZADD_OUT_NAN;
                    return 0;
                }
            }

            /* GT/LT? Only update if score is greater/less than current. */
            if ((lt && score >= curscore) || (gt && score <= curscore)) {
                *out_flags |= ZADD_OUT_NOP;
                return 1;
            }

            if (newscore) *newscore = score;

            /* Remove and re-insert when score changed. */
            if (score != curscore) {
                zobj->ptr = zzlDelete(zobj->ptr,eptr);
                zobj->ptr = zzlInsert(zobj->ptr,ele,score);
                *out_flags |= ZADD_OUT_UPDATED;
            }
            return 1;
        } else if (!xx) {
            /* check if the element is too large or the list
             * becomes too long *before* executing zzlInsert. */
            if (zzlLength(zobj->ptr)+1 > server.zset_max_listpack_entries ||
                sdslen(ele) > server.zset_max_listpack_value ||
                !lpSafeToAdd(zobj->ptr, sdslen(ele)))
            {
                zsetConvert(zobj,OBJ_ENCODING_SKIPLIST);
            } else {
                zobj->ptr = zzlInsert(zobj->ptr,ele,score);
                if (newscore) *newscore = score;
                *out_flags |= ZADD_OUT_ADDED;
                return 1;
            }
        } else {
            *out_flags |= ZADD_OUT_NOP;
            return 1;
        }
    }

    /* Note that the above block handling listpack would have either returned or
     * converted the key to skiplist. */
    if (zobj->encoding == OBJ_ENCODING_SKIPLIST) {
        zset *zs = zobj->ptr;
        zskiplistNode *znode;
        dictEntry *de;

        de = dictFind(zs->dict,ele);
        if (de != NULL) {
            /* NX? Return, same element already exists. */
            if (nx) {
                *out_flags |= ZADD_OUT_NOP;
                return 1;
            }

            curscore = *(double*)dictGetVal(de);

            /* Prepare the score for the increment if needed. */
            if (incr) {
                score += curscore;
                if (isnan(score)) {
                    *out_flags |= ZADD_OUT_NAN;
                    return 0;
                }
            }

            /* GT/LT? Only update if score is greater/less than current. */
            if ((lt && score >= curscore) || (gt && score <= curscore)) {
                *out_flags |= ZADD_OUT_NOP;
                return 1;
            }

            if (newscore) *newscore = score;

            /* Remove and re-insert when score changes. */
            if (score != curscore) {
                znode = zslUpdateScore(zs->zsl,curscore,ele,score);
                /* Note that we did not removed the original element from
                 * the hash table representing the sorted set, so we just
                 * update the score. */
                dictSetVal(zs->dict, de, &znode->score); /* Update score ptr. */
                *out_flags |= ZADD_OUT_UPDATED;
            }
            return 1;
        } else if (!xx) {
            ele = sdsdup(ele);
            znode = zslInsert(zs->zsl,score,ele);
            serverAssert(dictAdd(zs->dict,ele,&znode->score) == DICT_OK);
            *out_flags |= ZADD_OUT_ADDED;
            if (newscore) *newscore = score;
            return 1;
        } else {
            *out_flags |= ZADD_OUT_NOP;
            return 1;
        }
    } else {
        serverPanic("Unknown sorted set encoding");
    }
    return 0; /* Never reached. */
}
```

### zaddGenericCommand

`ZADD`和`ZINCRBY`函数处理入口

:::tip zadd flags

- ZADD_IN_NONE：不应用任何选项
- ZADD_IN_INCR：当新添加的元素已经存在时，会在原有分数基础上增加分数，而不是覆盖原有分数。
- ZADD_IN_NX：只添加集合中不存在的元素，如果元素已经存在则不做操作。
- ZADD_IN_XX：只操作已经存在于集合中的元素，如果元素不存在则不做操作。
- ZADD_IN_GT：只有新的得分比旧的得分高的时候才会更新现有元素。
- ZADD_IN_LT：只有新的得分比旧的得分低的时候才会更新现有元素。
:::

```c
/* This generic command implements both ZADD and ZINCRBY. */
void zaddGenericCommand(client *c, int flags) {
    /* 错误信息，用于当添加的值不是一个数字时报错 */
    static char *nanerr = "resulting score is not a number (NaN)";
    /* 获取键值（string类型的robj） */
    robj *key = c->argv[1];
    /* Redis 中用来存储有序集合的对象类型 */
    robj *zobj;
    /* key对象 */
    sds ele;
    /* score 表示当前处理元素的得分； scores数组表示每个新成员的得分 */
    double score = 0, *scores = NULL;
    /* j 表示当前处理元素在成员列表中的索引位置；elements 表示成员数量
     * ch 代表命令行参数 CH 是否被设置 */
    int j, elements, ch = 0;
    int scoreidx = 0;
    /* The following vars are used in order to track what the command actually
     * did during the execution, to reply to the client and to trigger the
     * notification of keyspace change. */
    /* 下面这些变量用于跟踪 Redis 执行命令时实际上完成的操作，以便向客户端回复并触发键空间变化的通知 */
    /* 添加的新元素计数 */
    int added = 0;      /* Number of new elements added. */
    /* 更新的元素计数 */
    int updated = 0;    /* Number of elements with updated score. */
    /* 已处理的元素计数，当 XX 等选项被设置时，该变量可能保持为0，不会增加 */
    int processed = 0;  /* Number of elements processed, may remain zero with
                           options like XX. */

    /* Parse options. At the end 'scoreidx' is set to the argument position
     * of the score of the first score-element pair. */
    /* eg: ZADD key [NX | XX] [GT | LT] [CH] [INCR] score member [score member...] 
     * 所以从索引下标2开始解析options */ 
    scoreidx = 2;
    while(scoreidx < c->argc) {
        char *opt = c->argv[scoreidx]->ptr;
        if (!strcasecmp(opt,"nx")) flags |= ZADD_IN_NX;
        else if (!strcasecmp(opt,"xx")) flags |= ZADD_IN_XX;
        /* 返回添加或更新的元素数量 */
        else if (!strcasecmp(opt,"ch")) ch = 1; /* Return num of elements added or updated. */
        /* 当ZADD指定这个选项时，成员的操作就等同ZINCRBY命令，对成员的分数进行递增操作 */
        else if (!strcasecmp(opt,"incr")) flags |= ZADD_IN_INCR;
        else if (!strcasecmp(opt,"gt")) flags |= ZADD_IN_GT;
        else if (!strcasecmp(opt,"lt")) flags |= ZADD_IN_LT;
        else break;
        scoreidx++;
    }

    /* Turn options into simple to check vars. */
    /* ZADD 命令的选项标志解析成对应的布尔值 */
    int incr = (flags & ZADD_IN_INCR) != 0;
    int nx = (flags & ZADD_IN_NX) != 0;
    int xx = (flags & ZADD_IN_XX) != 0;
    int gt = (flags & ZADD_IN_GT) != 0;
    int lt = (flags & ZADD_IN_LT) != 0;

    /* After the options, we expect to have an even number of args, since
     * we expect any number of score-element pairs. */
    /* 每解析一次options，scoreidx都会递增，参数数量减去scoreidx应该是ZADD元素数量的2倍 */ 
    elements = c->argc-scoreidx;
    /* 判断元素数量的合法性 */
    if (elements % 2 || !elements) {
        addReplyErrorObject(c,shared.syntaxerr);
        return;
    }
    /* 除以2才是元素数量 */
    elements /= 2; /* Now this holds the number of score-element pairs. */

    /* Check for incompatible options. */
    /* nx和xx不能同时出现 */
    if (nx && xx) {
        addReplyError(c,
            "XX and NX options at the same time are not compatible");
        return;
    }
    /*  GT、LT 和 NX 互斥， GT和LT互斥 */
    if ((gt && nx) || (lt && nx) || (gt && lt)) {
        addReplyError(c,
            "GT, LT, and/or NX options at the same time are not compatible");
        return;
    }
    /* Note that XX is compatible with either GT or LT */
    /* 如果在同时使用了 INCR 选项，并且传入了多个成员和分值对，则抛出错误并返回。因为 INCR 选项只能用于单个成员和分值对的更新，不能用于多个成员和分值对的批量更新。 */
    if (incr && elements > 1) {
        addReplyError(c,
            "INCR option supports a single increment-element pair");
        return;
    }

    /* Start parsing all the scores, we need to emit any syntax error
     * before executing additions to the sorted set, as the command should
     * either execute fully or nothing at all. */
    /* 为scores数组申请内存 */ 
    scores = zmalloc(sizeof(double)*elements);
    for (j = 0; j < elements; j++) {
        /* 从一个 Redis 对象中提取 double 类型数值。如果提取成功，则将结果存储到scores数组对应索引处；
         * 否则，会向客户端发送错误消息，并跳转到 cleanup 标签处执行内存释放操作，返回 NULL */
        if (getDoubleFromObjectOrReply(c,c->argv[scoreidx+j*2],&scores[j],NULL)
            != C_OK) goto cleanup;
    }

    /* Lookup the key and create the sorted set if does not exist. */
    /* 根据key去db中查找，如果没有则创建一个 */
    zobj = lookupKeyWrite(c->db,key);
    /* 检查zobj的类型是否为`OBJ_ZSET` */
    if (checkType(c,zobj,OBJ_ZSET)) goto cleanup;
    /* 如果 zset 对象不存在 */
    if (zobj == NULL) {
        /* 如果请求中带有 XX 选项，则不进行任何操作并直接返回客户端 */
        if (xx) goto reply_to_client; /* No key + XX option: nothing to do. */
        /* 如果服务器配置中指定的 listpack 最大元素数量为 0，或者当前元素长度超过了该值则使用skiplist结构 
         * 否则使用紧凑的 listpack 数据结构 */
        if (server.zset_max_listpack_entries == 0 ||
            server.zset_max_listpack_value < sdslen(c->argv[scoreidx+1]->ptr))
        {
            zobj = createZsetObject();
        } else {
            zobj = createZsetListpackObject();
        }
        /* 在当前数据库对象中添加新的 zset 对象 */
        dbAdd(c->db,key,zobj);
    }
    /* 遍历 scores 数组中的元素 */
    for (j = 0; j < elements; j++) {
        /* 定义新的score值 */
        double newscore;
        /* 取出第j个元素的score值 */
        score = scores[j];
        int retflags = 0;
        /* 取出本次循环的有序集合成员值 */
        ele = c->argv[scoreidx+1+j*2]->ptr;
        /* 将新的score和成员值插入到有序集合中 */
        int retval = zsetAdd(zobj, score, ele, flags, &retflags, &newscore);
        /* 如果返回值为0，表示插入失败 */
        if (retval == 0) {
            addReplyError(c,nanerr);
            goto cleanup;
        }
        /* 如果插入成功且该成员之前不存在，那么added加1 */
        if (retflags & ZADD_OUT_ADDED) added++;
        /* 如果插入成功且该成员之前存在，那么updated加1 */
        if (retflags & ZADD_OUT_UPDATED) updated++;
        /* 如果插入成功，但score并没有更新时，processed加1 */
        if (!(retflags & ZADD_OUT_NOP)) processed++;
        /* 更新score分值，当使用 ZINCRBY 命令或 INCR 选项时，我们用score变量来返回结果 */
        score = newscore;
    }
    /* 计算添加或更新的个数并累加到数据库dirty计数器中 */
    server.dirty += (added+updated);

reply_to_client:
    /* 当使用 ZINCRBY 命令或 INCR 选项时，如果有成员插入或更新成功，则通过 addReplyDouble() 返回新的 score 值；
     * 如果没有成员操作成功，则通过 addReplyNull() 返回空值。否则，当使用 ZADD 命令时，返回添加或更新的成员数量。 */
    if (incr) { /* ZINCRBY or INCR option. */
        if (processed)
            addReplyDouble(c,score);
        else
            addReplyNull(c);
    } else { /* ZADD. */
        addReplyLongLong(c,ch ? added+updated : added);
    }

cleanup:
    /* 释放scores数组的内存空间
     * 最后，如果有新增或更新的数据，则需要进行相应的数据库信号通知。此处通过 signalModifiedKey() 来标记所更新数据对应的键已经被修改，
     * 并通过 notifyKeyspaceEvent() 发送键空间事件通知，告知其他应用程序相应的操作已完成。 */
    zfree(scores);
    if (added || updated) {
        signalModifiedKey(c,c->db,key);
        notifyKeyspaceEvent(NOTIFY_ZSET,
            incr ? "zincr" : "zadd", key, c->db->id);
    }
}
```
