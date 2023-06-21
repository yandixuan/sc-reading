# sds(简单动态字符串)

## 数据结构

### sdshdr

`simple dynamic string header`

类型:

- sdshdr5
- sdshdr8
- sdshdr16
- sdshdr32
- sdshdr64

```c
/* Note: sdshdr5 is never used, we just access the flags byte directly.
 * However is here to document the layout of type 5 SDS strings. */
struct __attribute__ ((__packed__)) sdshdr5 {
    /* sdshdr5直接省掉了len字段， 用高5位存放长度，低3位存放类型 */
    unsigned char flags; /* 3 lsb of type, and 5 msb of string length */
    char buf[];
};
struct __attribute__ ((__packed__)) sdshdr8 {
    /* o(1)时间复杂度获取字符串长度，不用去遍历了 */
    /* flag 低三位 存储类型，高5位存储数据长度.2^5=32.因为buf最后以/0结尾. 故最大长度为31.*/
    uint8_t len; /* used */
    /* alloc代表着在不包括SDS头部和结尾的NULL字符的情况下，sds能够存储的字符串的最大容量 */
    uint8_t alloc; /* excluding the header and null terminator */
    /* 无符号字符2字节8位用了低3位高5位未使用，代表sds的类型 */
    unsigned char flags; /* 3 lsb of type, 5 unused bits */
    /* buf为字符数组，真正用来存储字符串 */
    char buf[];
};
struct __attribute__ ((__packed__)) sdshdr16 {
    uint16_t len; /* used */
    uint16_t alloc; /* excluding the header and null terminator */
    unsigned char flags; /* 3 lsb of type, 5 unused bits */
    char buf[];
};
struct __attribute__ ((__packed__)) sdshdr32 {
    uint32_t len; /* used */
    uint32_t alloc; /* excluding the header and null terminator */
    unsigned char flags; /* 3 lsb of type, 5 unused bits */
    char buf[];
};
struct __attribute__ ((__packed__)) sdshdr64 {
    uint64_t len; /* used */
    uint64_t alloc; /* excluding the header and null terminator */
    unsigned char flags; /* 3 lsb of type, 5 unused bits */
    char buf[];
};
```

## flags

sdshdr8以上内存结构中才有flags

`flags`低三位存储类型，`flags & SDS_TYPE_MASK(0111)`取到类型

```c
#define SDS_TYPE_5  0
#define SDS_TYPE_8  1
#define SDS_TYPE_16 2
#define SDS_TYPE_32 3
#define SDS_TYPE_64 4
#define SDS_TYPE_MASK 7
#define SDS_TYPE_BITS 3
```

## 宏

### SDS_HDR_VAR

在c语言宏定义中，##用来将两个token连接为一个token，假如`T=5`，那么`sdshdr##T=sdshdr5`

参数 s 是sdshdr 结构体中的字符串指针，即等价于 buf。如果想得到SDS的起始地址，则用 `buf`的起始地址减 `sdshdr`所占字节数

该表达式得到的是结构体变量 `sdshdr##T` 的起始地址

```c
#define SDS_HDR_VAR(T,s) struct sdshdr##T *sh = (void*)((s)-(sizeof(struct sdshdr##T)));
```

### SDS_HDR

即返回一个 保存字符串 s 的结构体地址

```c
#define SDS_HDR(T,s) ((struct sdshdr##T *)((s)-(sizeof(struct sdshdr##T))))
```

### SDS_TYPE_5_LEN

右移三位，剩下的则代表长度

```c
#define SDS_TYPE_5_LEN(f) ((f)>>SDS_TYPE_BITS)
```

## 函数

### sdslen

获取SDS字符串的长度

```c
static inline size_t sdslen(const sds s)
```

### sdsavail

获取sds字符串空余空间（即alloc - len）

```c
static inline size_t sdsavail(const sds s)
```

### sdssetlen

设置sds字符串长度

```c
static inline void sdssetlen(sds s, size_t newlen)
```

### sdsinclen

增加sds字符串长度

```c
static inline void sdsinclen(sds s, size_t inc)
```

### sdsalloc

获取sds字符串容量

sdsalloc() = sdsavail() + sdslen()

```c
static inline size_t sdsalloc(const sds s)
```

### sdssetalloc

设置sds字符串容量

```c
static inline void sdssetalloc(sds s, size_t newlen)
```

### sdsHdrSize

根据类型返回sdshdr结构体的大小

```c
static inline int sdsHdrSize(char type)
```

### sdsReqType

根据字符串的长度确定SDS的类型

```c
static inline char sdsReqType(size_t string_size)
```

### sdsTypeMaxSize

根据SDS的类型，返回容纳字符串的最大长度

```c
static inline size_t sdsTypeMaxSize(char type)
```

### _sdsnewlen

在堆内存为SDS申请内存地址，填充相应数据。

`sdsnewlen` 和 `sdstrynewlen` 共同调用该方法，区别是`trymalloc`传入的值不同。

- trymalloc:
  - 1: 内存申请如果失败，则返回NULL
  - 0: 内存申请如果失败，则终止程序

```c
sds _sdsnewlen(const void *init, size_t initlen, int trymalloc) {
    void *sh;
    // sds实际上就是char*类型
    sds s;
    /* 根据initlen选择 SDS_TYPE */
    char type = sdsReqType(initlen);
    /* Empty strings are usually created in order to append. Use type 8
     * since type 5 is not good at this. */
    /* 长度小于44 会使用 createEmbeddedStringObject 会强制使用SDS_TYPE_8
     * 长度大于44 createRawStringObject 肯定不会是 SDS_TYPE_5 
     * 所以这里是防止 SDS_TYPE_5的出现
     */  
    if (type == SDS_TYPE_5 && initlen == 0) type = SDS_TYPE_8;
    // 获取结构体的大小好进行分配内存
    int hdrlen = sdsHdrSize(type);
    unsigned char *fp; /* flags pointer. */
    size_t usable;
    /* C语言中为了不同平台间数值类型的可移植性,使用size_t代替int等类型,而这里initlen就是size_t的类型
     * 这里的assert是避免initlen + hdrlen + 1之后溢出变成负数 */
    assert(initlen + hdrlen + 1 > initlen); /* Catch size_t overflow */
    /* 根据传进来值判断是zmalloc还是tryzmalloc方法（申请储存空间，返回地址指针）
     * 申请 sdshdr初始化大小 + 字符串长度 + 1大小的存储空间(+1为了保存结束符"\0") */
    sh = trymalloc?
        s_trymalloc_usable(hdrlen+initlen+1, &usable) :
        s_malloc_usable(hdrlen+initlen+1, &usable);
    // 如果分配完内存发现是NULL的话就返回NULL
    if (sh == NULL) return NULL;
    /* 指向字符串的指针，该参数如果传"SDS_NOINIT",则不进行初始化sh指针指向的空间，如果传NULL，则将sh指针指向的空间初始化为0 */
    if (init==SDS_NOINIT)
        init = NULL;
    else if (!init)
        memset(sh, 0, hdrlen+initlen+1);
    // buf[]的指针地址   
    s = (char*)sh+hdrlen;
    // flag地址的指针
    fp = ((unsigned char*)s)-1;
    // 字符串可用容量
    usable = usable-hdrlen-1;
    // 保证usable满足字符串的长度
    if (usable > sdsTypeMaxSize(type))
        usable = sdsTypeMaxSize(type);
    switch(type) {
        case SDS_TYPE_5: {
            *fp = type | (initlen << SDS_TYPE_BITS);
            break;
        }
        case SDS_TYPE_8: {
            // 这里是新定义了一个相对应类型的sh
            SDS_HDR_VAR(8,s);
            // 设置长度
            sh->len = initlen;
            // 该类型所包含的字符串支持的最大长度
            sh->alloc = usable;
            // 设置类型
            *fp = type;
            break;
        }
        case SDS_TYPE_16: {
            SDS_HDR_VAR(16,s);
            sh->len = initlen;
            sh->alloc = usable;
            *fp = type;
            break;
        }
        case SDS_TYPE_32: {
            SDS_HDR_VAR(32,s);
            sh->len = initlen;
            sh->alloc = usable;
            *fp = type;
            break;
        }
        case SDS_TYPE_64: {
            SDS_HDR_VAR(64,s);
            sh->len = initlen;
            sh->alloc = usable;
            *fp = type;
            break;
        }
    }
    // 如果init有值，则执行memcpy复制数据
    if (initlen && init)
        memcpy(s, init, initlen);
    // 设置终止符,这里并不会有两个'\0',因为前面只复制了initlen个字符
    s[initlen] = '\0';
    return s;
}
```

### sdsnew

新建一个SDS对象

```c
sds sdsnew(const char *init) {
    size_t initlen = (init == NULL) ? 0 : strlen(init);
    return sdsnewlen(init, initlen);
}
```

### sdsdup

复制SDS对象

```c
sds sdsdup(const sds s) {
    return sdsnewlen(s, sdslen(s));
}
```

### _sdsMakeRoomFor

在保持现有字符串内容不变的情况下，为将要添加的新数据量分配足够的空间

- greedy: 是否贪婪
  - 1: 申请添加新数据量后总长度的2倍空间
  - 0: 申请添加新数据量后总长度的空间，不额外申请多余的空间

```c
sds _sdsMakeRoomFor(sds s, size_t addlen, int greedy) {
    void *sh, *newsh;
    // 获取sds可用空间
    size_t avail = sdsavail(s);
    size_t len, newlen, reqlen;
    // 定义新类型、获取旧sds类型
    char type, oldtype = s[-1] & SDS_TYPE_MASK;
    int hdrlen;
    size_t usable;

    /* Return ASAP if there is enough space left. */
    /* 可用空间足够则不用扩容 */
    if (avail >= addlen) return s;
    /* 获取字符串长度 */
    len = sdslen(s);
    /* 获取sds内存地址起始位置，s是buf的指针地址 */
    sh = (char*)s-sdsHdrSize(oldtype);
    /* 计算新的字符串长度 */
    reqlen = newlen = (len+addlen);
    // 防止长度溢出
    assert(newlen > len);   /* Catch size_t overflow */
    /* 根据greedy判断是否需要额外扩展空间 */
    if (greedy == 1) {
        if (newlen < SDS_MAX_PREALLOC)
            newlen *= 2;
        else
            newlen += SDS_MAX_PREALLOC;
    }
    /* 根据新的字符串长度取得对于的sds类型 */ 
    type = sdsReqType(newlen);

    /* Don't use type 5: the user is appending to the string and type 5 is
     * not able to remember empty space, so sdsMakeRoomFor() must be called
     * at every appending operation. */
    /* 至少使用SDS_TYPE_8这个类型 */
    if (type == SDS_TYPE_5) type = SDS_TYPE_8;
    /* 获取struct的大小 */
    hdrlen = sdsHdrSize(type);
    /* 防止溢出 */
    assert(hdrlen + newlen + 1 > reqlen);  /* Catch size_t overflow */
    if (oldtype==type) {
        /* 类型不变，直接 realloc */
        newsh = s_realloc_usable(sh, hdrlen+newlen+1, &usable);
        if (newsh == NULL) return NULL;
        /* 内存申请完后，sds的指针地址肯定要重新算 */
        s = (char*)newsh+hdrlen;
    } else {
        /* Since the header size changes, need to move the string forward,
         * and can't use realloc */
        newsh = s_malloc_usable(hdrlen+newlen+1, &usable);
        if (newsh == NULL) return NULL;
        /* 从旧地址拷贝字符串 */
        memcpy((char*)newsh+hdrlen, s, len+1);
        /* 释放旧地址的内存空间 */
        s_free(sh);
        /* 设置相关参数 */
        s = (char*)newsh+hdrlen;
        s[-1] = type;
        sdssetlen(s, len);
    }
    usable = usable-hdrlen-1;
    if (usable > sdsTypeMaxSize(type))
        usable = sdsTypeMaxSize(type);
    /* 设置SDS容量 */    
    sdssetalloc(s, usable);
    return s;
}
```

### sdsResize

调整sds容量

```c
sds sdsResize(sds s, size_t size, int would_regrow) {
    void *sh, *newsh;
    char type, oldtype = s[-1] & SDS_TYPE_MASK;
    int hdrlen, oldhdrlen = sdsHdrSize(oldtype);
    size_t len = sdslen(s);
    // struct在内存中的开始地址
    sh = (char*)s-oldhdrlen;

    /* Return ASAP if the size is already good. */
    if (sdsalloc(s) == size) return s;

    /* Truncate len if needed. */
    // len缩短成size
    if (size < len) len = size;

    /* Check what would be the minimum SDS header that is just good enough to
     * fit this string. */
    // 根据长度得到相应类型
    type = sdsReqType(size);
    if (would_regrow) {
        /* Don't use type 5, it is not good for strings that are expected to grow back. */
        if (type == SDS_TYPE_5) type = SDS_TYPE_8;
    }
    hdrlen = sdsHdrSize(type);

    /* If the type is the same, or can hold the size in it with low overhead
     * (larger than SDS_TYPE_8), we just realloc(), letting the allocator
     * to do the copy only if really needed. Otherwise if the change is
     * huge, we manually reallocate the string to use the different header
     * type. */
    /* 如果sds类型不变或者是长度缩小导致type变小则使用realloc */
    int use_realloc = (oldtype==type || (type < oldtype && type > SDS_TYPE_8));
    /* 新的整体容量：struct长度+字符串长度+结束符'\0' */
    size_t newlen = use_realloc ? oldhdrlen+size+1 : hdrlen+size+1;
    int alloc_already_optimal = 0;
    // https://github.com/redis/redis/pull/11766
    #if defined(USE_JEMALLOC)
        /* je_nallocx returns the expected allocation size for the newlen.
         * We aim to avoid calling realloc() when using Jemalloc if there is no
         * change in the allocation size, as it incurs a cost even if the
         * allocation size stays the same. */
        /* nallocx()函数不分配内存，但它执行与mallocx()函数相同的大小计算，并返回等效mallocx()函数调用产生的分配的实际大小，
         * 如果输入超过支持的最大大小类或对齐，则返回0。如果大小为0，则行为未定义 
         * 如果大小不变则避免调用s_realloc方法带来的开销 */
        alloc_already_optimal = (je_nallocx(newlen, 0) == zmalloc_size(sh));
    #endif
    
    if (use_realloc && !alloc_already_optimal) {
        // 重新分配容量
        newsh = s_realloc(sh, newlen);
        if (newsh == NULL) return NULL;
        // 指向buf
        s = (char*)newsh+oldhdrlen;
    } else if (!alloc_already_optimal) {
        /* https://stackoverflow.com/questions/1401234/differences-between-using-realloc-vs-free-malloc-functions 
         * 字符串放大时，malloc+free的性能好点 */
        /* 根据newLen申请内存，返回新的地址指针 */
        newsh = s_malloc(newlen);
        if (newsh == NULL) return NULL;
        /* (char*)newsh+hdrlen代表新的buf地址 
         * s指针代表旧buf的地址，复制到新的地址 */
        memcpy((char*)newsh+hdrlen, s, len);
        /* 释放旧的内存 */
        s_free(sh);
        /* 获取buf指针地址 */
        s = (char*)newsh+hdrlen;
        /* 设置类型 */
        s[-1] = type;
    }
    /* 长度设置0 */
    s[len] = 0;
    /* 设置字符串有效长度及字符串整体长度 */
    sdssetlen(s, len);
    sdssetalloc(s, size);
    /* 返回buf地址指针 */
    return s;
}
```

### sdsIncrLen

调整SDS字符串的数据长度即sds->len

```c
void sdsIncrLen(sds s, ssize_t incr) {
    /* 获取sds的flag */
    unsigned char flags = s[-1];
    size_t len;
    /* 不同的SDS类型，走不同的分支 */
    switch(flags&SDS_TYPE_MASK) {
        case SDS_TYPE_5: {
            unsigned char *fp = ((unsigned char*)s)-1;
            unsigned char oldlen = SDS_TYPE_5_LEN(flags);
            assert((incr > 0 && oldlen+incr < 32) || (incr < 0 && oldlen >= (unsigned int)(-incr)));
            *fp = SDS_TYPE_5 | ((oldlen+incr) << SDS_TYPE_BITS);
            len = oldlen+incr;
            break;
        }
        case SDS_TYPE_8: {
            /* SDS 对象头的指针 */
            SDS_HDR_VAR(8,s);
            /* 保证增加的长度或减少的长度不超过 */
            assert((incr >= 0 && sh->alloc-sh->len >= incr) || (incr < 0 && sh->len >= (unsigned int)(-incr)));
            len = (sh->len += incr);
            break;
        }
        case SDS_TYPE_16: {
            SDS_HDR_VAR(16,s);
            assert((incr >= 0 && sh->alloc-sh->len >= incr) || (incr < 0 && sh->len >= (unsigned int)(-incr)));
            len = (sh->len += incr);
            break;
        }
        case SDS_TYPE_32: {
            SDS_HDR_VAR(32,s);
            assert((incr >= 0 && sh->alloc-sh->len >= (unsigned int)incr) || (incr < 0 && sh->len >= (unsigned int)(-incr)));
            len = (sh->len += incr);
            break;
        }
        case SDS_TYPE_64: {
            SDS_HDR_VAR(64,s);
            assert((incr >= 0 && sh->alloc-sh->len >= (uint64_t)incr) || (incr < 0 && sh->len >= (uint64_t)(-incr)));
            len = (sh->len += incr);
            break;
        }
        default: len = 0; /* Just to avoid compilation warnings. */
    }
    /* 设置新的 null byte，标记字符串结束 */
    s[len] = '\0';
}
```

### sdscatlen

sds字符串连接

:::tip 参数

- 需要被连接的SDS字符串
- 需要连接的内容起始地址
- 其内容的长度
:::

```c
sds sdscatlen(sds s, const void *t, size_t len) {
    size_t curlen = sdslen(s);

    s = sdsMakeRoomFor(s,len);
    if (s == NULL) return NULL;
    memcpy(s+curlen, t, len);
    sdssetlen(s, curlen+len);
    s[curlen+len] = '\0';
    return s;
}
```

### sdssplitargs

将字符串分割，它会默认按\n、空格、\t、\r、0以及双引号和单引号进行分割

```c
sds *sdssplitargs(const char *line, int *argc) {
    const char *p = line;
    /* 申请当前字符串、分割数组指针 */
    char *current = NULL;
    char **vector = NULL;

    *argc = 0;
    while(1) {
        /* skip blanks */
        /* 把字符串开头的所有空格都省略掉 */
        while(*p && isspace(*p)) p++;
        if (*p) {
            /* get a token */
            /* 去除完空格之后，line仍不为空串，开始处理 */
            /* inq为1说明是双引号字符串 */
            int inq=0;  /* set to 1 if we are in "quotes" */
            /* insq为1说明是单引号字符串 */
            int insq=0; /* set to 1 if we are in 'single quotes' */
            int done=0;
            /* 如果current指向NULL,则将current指向一个新的空SDS对象 */
            if (current == NULL) current = sdsempty();
            while(!done) {
                /* 进入了双引号区域 */
                if (inq) {
                    /* 如果是\\xa5 类似的格式，那么必定是不可见字符的ascii值 */
                    if (*p == '\\' && *(p+1) == 'x' &&
                                             is_hex_digit(*(p+2)) &&
                                             is_hex_digit(*(p+3)))
                    {
                        unsigned char byte;
                        /* 获取ascii值 */
                        byte = (hex_digit_to_int(*(p+2))*16)+
                                hex_digit_to_int(*(p+3));
                        /* 转化成字符 拼接到 当前参数字符串 */        
                        current = sdscatlen(current,(char*)&byte,1);
                        /* 跳过3个字符 */
                        p += 3;
                      /* 如果是转义符的其它情况，那么再向后获一个 */  
                    } else if (*p == '\\' && *(p+1)) {
                        char c;
                        /* 跳过1个字符 */
                        p++;
                        switch(*p) {
                        case 'n': c = '\n'; break;
                        case 'r': c = '\r'; break;
                        case 't': c = '\t'; break;
                        case 'b': c = '\b'; break;
                        case 'a': c = '\a'; break;
                        default: c = *p; break;
                        }
                        /* 将这个转义字符拼接到当前参数字符串中 */
                        current = sdscatlen(current,&c,1);
                    } else if (*p == '"') {
                        /* closing quote must be followed by a space or
                         * nothing at all. */
                        /* 关闭的引号后面必须为空字符或者没有任何东西(即已经结束)，否则跳转到错误语句 */ 
                        if (*(p+1) && !isspace(*(p+1))) goto err;
                        /* 如果这个参数是正常的，那么到了关闭引号这里就是结束了，意味着一个参数字符串完成了 */
                        done=1;
                    } else if (!*p) {
                        /* unterminated quotes */
                        /* !*p 表示已经结尾了，但是还没有找到结尾引号，所以需要错误处理 */
                        goto err;
                    } else {
                        /* 其他情况，正常拼接一个字符 */
                        current = sdscatlen(current,p,1);
                    }
                  /* 进入了单引号区域 */  
                } else if (insq) {
                    if (*p == '\\' && *(p+1) == '\'') {
                        p++;
                        /* 拼接单引号 */
                        current = sdscatlen(current,"'",1);
                    } else if (*p == '\'') {
                        /* closing quote must be followed by a space or
                         * nothing at all. */
                        /* 这里同双引号部分的逻辑 */ 
                        if (*(p+1) && !isspace(*(p+1))) goto err;
                        done=1;
                    } else if (!*p) {
                        /* unterminated quotes */
                        goto err;
                    } else {
                        current = sdscatlen(current,p,1);
                    }
                } else {
                    switch(*p) {
                    /* 碰到，空格、换行符、回车符、制表符、空字节符，推入数组 */
                    case ' ':
                    case '\n':
                    case '\r':
                    case '\t':
                    case '\0':
                        done=1;
                        break;
                    /*  */    
                    case '"':
                        inq=1;
                        break;
                    /*  */    
                    case '\'':
                        insq=1;
                        break;
                    default:
                        current = sdscatlen(current,p,1);
                        break;
                    }
                }
                /* 指针移到下个字符串 */
                if (*p) p++;
            }
            /* add the token to the vector */
            /* 分配指向参数字符串的字符串指针数组（vector存的是SDS地址指针） */
            vector = s_realloc(vector,((*argc)+1)*sizeof(char*));
            /* 将当前获取的参数字符串存储到相应位置 */
            vector[*argc] = current;
            /* 返回参数的个数+1 */
            (*argc)++;
            /* 一个已经完成，将当前指针清空，获取下一个参数字符串 */
            current = NULL;
        } else {
            /* Even on empty input string return something not NULL. */
            /* 即使是空的输入字符串 也返回空的数组 */
            if (vector == NULL) vector = s_malloc(sizeof(void*));
            /* 已经到结尾，返回所有的参数字符串 */ 
            return vector;
        }
    }

err:
    while((*argc)--)
        /* 挨个释放内存空间 */
        sdsfree(vector[*argc]);
    /* 释放指针数组的内存空间 */    
    s_free(vector);
    /* 释放当前参数字符串的内存空间 */
    if (current) sdsfree(current);
    /* 参数各位设置为0 */
    *argc = 0;
    return NULL;
}
```
