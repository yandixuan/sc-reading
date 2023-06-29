# list

列表命令的实现

## 命令

### PUSH

<VPLink icon="i-carbon-code" title="实现" url="#pushGenericCommand"/>

```c
/* LPUSH <key> <element> [<element> ...] */
void lpushCommand(client *c) {
    pushGenericCommand(c,LIST_HEAD,0);
}

/* RPUSH <key> <element> [<element> ...] */
void rpushCommand(client *c) {
    pushGenericCommand(c,LIST_TAIL,0);
}

/* LPUSHX <key> <element> [<element> ...] */
void lpushxCommand(client *c) {
    pushGenericCommand(c,LIST_HEAD,1);
}

/* RPUSHX <key> <element> [<element> ...] */
void rpushxCommand(client *c) {
    pushGenericCommand(c,LIST_TAIL,1);
}
```

## 函数

### listTypeTryConvertListpack

`OBJ_ENCODING_LISTPACK`->`OBJ_ENCODING_QUICKLIST`

<VPLink icon="i-carbon-code" title="quicklistNodeExceedsLimit" url="../data-structure/quicklist#quicklistNodeExceedsLimit"/>

```c
static void listTypeTryConvertListpack(robj *o, robj **argv, int start, int end,
                                       beforeConvertCB fn, void *data)
{   /* 确保对象的编码类型是 LISTPACK */
    serverAssert(o->encoding == OBJ_ENCODING_LISTPACK);

    size_t add_bytes = 0;
    size_t add_length = 0;
    /* 如果传入了要添加的元素数组 */
    if (argv) {
        /* 遍历参数 */
        for (int i = start; i <= end; i++) {
            /* 跳过非 sds 编码的对象（不是字符串） */
            if (!sdsEncodedObject(argv[i]))
                continue;
            /* 计算要添加的元素的总字节数 */    
            add_bytes += sdslen(argv[i]->ptr);
        }
        /* 计算要添加的元素数量 */
        add_length = end - start + 1;
    }
    /* 判断LISTPACK是否超过转变QUICKLIST的临界值 */
    if (quicklistNodeExceedsLimit(server.list_max_listpack_size,
            lpBytes(o->ptr) + add_bytes, lpLength(o->ptr) + add_length))
    {
        /* Invoke callback before conversion. */
        /* 在转换之前调用回调函数（如果有） */
        if (fn) fn(data);
        /* 创建新的 quicklist 对象 */
        quicklist *ql = quicklistCreate();
        /* 设置 quicklist 的选项：列表最大长度和压缩深度 */
        quicklistSetOptions(ql, server.list_max_listpack_size, server.list_compress_depth);

        /* Append listpack to quicklist if it's not empty, otherwise release it. */
        if (lpLength(o->ptr))
            /* 如果原列表还有元素，将原列表的 listpack 添加到新的 quicklist 中 */
            quicklistAppendListpack(ql, o->ptr);
        else
            /* 释放listpack所占用有的内存空间 */
            lpFree(o->ptr);
        /* 更新对象的指针为新的 quicklist，并将编码方式设置为 QUICKLIST */    
        o->ptr = ql;
        o->encoding = OBJ_ENCODING_QUICKLIST;
    }
}
```

### listTypeTryConvertQuicklist

<VPLink icon="i-carbon-code" title="quicklistNodeLimit" url="../data-structure/quicklist#quicklistNodeLimit"/>

```c
static void listTypeTryConvertQuicklist(robj *o, int shrinking, beforeConvertCB fn, void *data) {
    serverAssert(o->encoding == OBJ_ENCODING_QUICKLIST);

    size_t sz_limit;
    unsigned int count_limit;
    quicklist *ql = o->ptr;

    /* A quicklist can be converted to listpack only if it has only one packed node. */
    if (ql->len != 1 || ql->head->container != QUICKLIST_NODE_CONTAINER_PACKED)
        return;

    /* Check the length or size of the quicklist is below the limit. */
    quicklistNodeLimit(server.list_max_listpack_size, &sz_limit, &count_limit);
    if (shrinking) {
        sz_limit /= 2;
        count_limit /= 2;
    }
    if (ql->head->sz > sz_limit || ql->count > count_limit) return;

    /* Invoke callback before conversion. */
    if (fn) fn(data);

    /* Extract the listpack from the unique quicklist node,
     * then reset it and release the quicklist. */
    o->ptr = ql->head->entry;
    ql->head->entry = NULL;
    quicklistRelease(ql);
    o->encoding = OBJ_ENCODING_LISTPACK;
}
```

### listTypeTryConversionRaw

检查列表是否需要转换为适当的编码

- robj: 列表对象
- lct:
  - LIST_CONV_AUTO: 在我们构建新列表后使用，我们想让函数决定该列表的最佳编码
  - LIST_CONV_GROWING: 在将元素添加到列表之前或之后使用，考虑`listpack`->`quicklist`
  - LIST_CONV_SHRINKING: 在从列表中删除元素后使用，考虑`quicklist`->`listpack`
- argv: 参数列表
- start: 起始参数索引
- end: 结束参数索引
- fn: 在执行转换之前调用的回调函数，它是一个函数指针，可以是 beforeConvertCB 类型的函数或 NULL
- data: 传递给回调函数的用户数据指针

```c
static void listTypeTryConversionRaw(robj *o, list_conv_type lct,
                                     robj **argv, int start, int end,
                                     beforeConvertCB fn, void *data)
{
    if (o->encoding == OBJ_ENCODING_QUICKLIST) {
        /* 如果列表对象的编码方式是 QUICKLIST */
        if (lct == LIST_CONV_GROWING) return; /* Growing has nothing to do with quicklist */
        /* 如果转换类型是 GROWING，则无需处理 */
        listTypeTryConvertQuicklist(o, lct == LIST_CONV_SHRINKING, fn, data);
        /* 调用 listTypeTryConvertQuicklist 函数进行 Quicklist 编码转换 */
    } else if (o->encoding == OBJ_ENCODING_LISTPACK) {
        /* 如果列表对象的编码方式是 LISTPACK */
        if (lct == LIST_CONV_SHRINKING) return; /* Shrinking has nothing to do with listpack */
        /* 如果转换类型是 SHRINKING，则无需处理 */
        listTypeTryConvertListpack(o, argv, start, end, fn, data);
        /* listTypeTryConvertListpack 函数进行 Listpack 编码转换 */
    } else {
        serverPanic("Unknown list encoding");
    }
}
```

### listTypePush

```c
void listTypePush(robj *subject, robj *value, int where) {
    if (subject->encoding == OBJ_ENCODING_QUICKLIST) {
        int pos = (where == LIST_HEAD) ? QUICKLIST_HEAD : QUICKLIST_TAIL;
        if (value->encoding == OBJ_ENCODING_INT) {
            char buf[32];
            ll2string(buf, 32, (long)value->ptr);
            quicklistPush(subject->ptr, buf, strlen(buf), pos);
        } else {
            quicklistPush(subject->ptr, value->ptr, sdslen(value->ptr), pos);
        }
    } else if (subject->encoding == OBJ_ENCODING_LISTPACK) {
        if (value->encoding == OBJ_ENCODING_INT) {
            subject->ptr = (where == LIST_HEAD) ?
                lpPrependInteger(subject->ptr, (long)value->ptr) :
                lpAppendInteger(subject->ptr, (long)value->ptr);
        } else {
            subject->ptr = (where == LIST_HEAD) ?
                lpPrepend(subject->ptr, value->ptr, sdslen(value->ptr)) :
                lpAppend(subject->ptr, value->ptr, sdslen(value->ptr));
        }
    } else {
        serverPanic("Unknown list encoding");
    }
}
```

### pushGenericCommand

`LPUSH/RPUSH/LPUSHX/RPUSHX`命令的主要实现

- `where`: 插入位置
  - `LIST_HEAD`: 从头部推入，即`LPUSH`
  - `LIST_TAIL`: 从尾部推入，即`RPUSH`
- `xx`:
  - 1: push if key exists
  - 0: otherwise

以`LIST_CONV_GROWING`模式调用 <VPLink inline-block icon="i-carbon-code" url="#pushGenericCommand" title="listTypeTryConversionRaw"/>

```c
void pushGenericCommand(client *c, int where, int xx) {
    int j;
    /* argv[1]: key
     * 在数据库中查找键 c->argv[1] 并获得对应的对象 */
    robj *lobj = lookupKeyWrite(c->db, c->argv[1]);
    /* 检查对象类型是否为列表，如果不是则返回 */
    if (checkType(c,lobj,OBJ_LIST)) return;
    /* 如果对象不存在 */
    if (!lobj) {
        /* 如果是`L/RUSHX`则直接返回，因为key存在 */
        if (xx) {
            addReply(c, shared.czero);
            return;
        }
        /* 因为是新的对象，可以创建一个紧凑列表对象节约内存 */
        lobj = createListListpackObject();
        /* 将新创建的列表对象添加到数据库中 */
        dbAdd(c->db,c->argv[1],lobj);
    }
    /* 根据计算列表对象添加完参数后的长度或是内存，是否需要更变编码类型，如果需要则转换类型，否则什么也不做 */
    listTypeTryConversionAppend(lobj,c->argv,2,c->argc-1,NULL,NULL);
    /* 对参数进行循环 */
    for (j = 2; j < c->argc; j++) {
        /* 列表根据插入位置压入参数 */
        listTypePush(lobj,c->argv[j],where);
        /* 更新数据库dirty计数器 */
        server.dirty++;
    }
    /* 发送列表对象的长度作为回复 */
    addReplyLongLong(c, listTypeLength(lobj));
    /* 根据 where 参数选择相应的事件名称 */
    char *event = (where == LIST_HEAD) ? "lpush" : "rpush";
    /* 标记键已被修改 */
    signalModifiedKey(c,c->db,c->argv[1]);
    /* 发送通知，通知事件为列表操作以及对应的键和数据库 ID */
    notifyKeyspaceEvent(NOTIFY_LIST,event,c->argv[1],c->db->id);
}
```
