# sds(简单动态字符串)

[参考](https://juejin.cn/post/6980974661664407582#heading-7)

## 头部声明文件

```c
#ifndef __SDS_H
#define __SDS_H

#define SDS_MAX_PREALLOC (1024*1024)
extern const char *SDS_NOINIT;

#include <sys/types.h>
#include <stdarg.h>
#include <stdint.h>

typedef char *sds;
/* Simple Dynamic String(动态字符串) */
/* __attribute__ ((__packed__)) 取消内存对齐，或者说是1字节对齐 */

/* Note: sdshdr5 is never used, we just access the flags byte directly.
 * However is here to document the layout of type 5 SDS strings. */
struct __attribute__ ((__packed__)) sdshdr5 {
    /* sdshdr5直接省掉了len字段， 用高5位存放长度，低3位存放类型 */
    unsigned char flags; /* 3 lsb of type, and 5 msb of string length */
    char buf[];
};
struct __attribute__ ((__packed__)) sdshdr8 {
    // o(1)时间复杂度获取字符串长度，不用去遍历了
    /*flag 低三位 存储类型;  高5位 存储数据长度.  2^5=32.  因为buf最后以/0结尾. 故最大长度为31.*/
    uint8_t len; /* used */
    // alloc代表着在不包括SDS头部和结尾的NULL字符的情况下，sds能够存储的字符串的最大容量
    uint8_t alloc; /* excluding the header and null terminator */
    // 无符号字符2字节8位用了低3位高5位未使用，代表sds的类型
    unsigned char flags; /* 3 lsb of type, 5 unused bits */
    // buf为字符数组，真正用来存储字符串
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

#define SDS_TYPE_5  0
#define SDS_TYPE_8  1
#define SDS_TYPE_16 2
#define SDS_TYPE_32 3
#define SDS_TYPE_64 4
#define SDS_TYPE_MASK 7
#define SDS_TYPE_BITS 3
/**
 * 中连接符##用来将两个token连接为一个token
 * SDS_HDR(8,s) -----> ((struct sdshdr8 *)((s) - (sizeof(struct sdshdr8))))
 * struct sdshdr 结构体中的最后一个 char buf[] 被称为 flexible array member() ，在计算结构体大小的时候是不记入在内的
 * s-sizeof(struct sdshdr##T) ----> 即获取到指向结构体的首地址的指针
 * 定义并初始化一个相应类型的结构体指针变量，它指向一个已存在的这个类型的结构体内存
 */
#define SDS_HDR_VAR(T,s) struct sdshdr##T *sh = (void*)((s)-(sizeof(struct sdshdr##T)));
/*
 * 宏
 * 返回指向结构体的首地址的地址
 */
#define SDS_HDR(T,s) ((struct sdshdr##T *)((s)-(sizeof(struct sdshdr##T))))
#define SDS_TYPE_5_LEN(f) ((f)>>SDS_TYPE_BITS)

static inline size_t sdslen(const sds s) {
    unsigned char flags = s[-1];
    switch(flags&SDS_TYPE_MASK) {
        case SDS_TYPE_5:
            return SDS_TYPE_5_LEN(flags);
        case SDS_TYPE_8:
            /* 获取结构体的属性len即sds字符串长度*/
            return SDS_HDR(8,s)->len;
        case SDS_TYPE_16:
            return SDS_HDR(16,s)->len;
        case SDS_TYPE_32:
            return SDS_HDR(32,s)->len;
        case SDS_TYPE_64:
            return SDS_HDR(64,s)->len;
    }
    return 0;
}
/* 获取sds字符串空余空间（即alloc - len） */
static inline size_t sdsavail(const sds s) {
    unsigned char flags = s[-1];
    switch(flags&SDS_TYPE_MASK) {
        case SDS_TYPE_5: {
            return 0;
        }
        case SDS_TYPE_8: {
            SDS_HDR_VAR(8,s);
            return sh->alloc - sh->len;
        }
        case SDS_TYPE_16: {
            SDS_HDR_VAR(16,s);
            return sh->alloc - sh->len;
        }
        case SDS_TYPE_32: {
            SDS_HDR_VAR(32,s);
            return sh->alloc - sh->len;
        }
        case SDS_TYPE_64: {
            SDS_HDR_VAR(64,s);
            return sh->alloc - sh->len;
        }
    }
    return 0;
}
/* 设置sds字符串长度 */
static inline void sdssetlen(sds s, size_t newlen) {
    unsigned char flags = s[-1];
    switch(flags&SDS_TYPE_MASK) {
        case SDS_TYPE_5:
            {
                unsigned char *fp = ((unsigned char*)s)-1;
                *fp = SDS_TYPE_5 | (newlen << SDS_TYPE_BITS);
            }
            break;
        case SDS_TYPE_8:
            SDS_HDR(8,s)->len = newlen;
            break;
        case SDS_TYPE_16:
            SDS_HDR(16,s)->len = newlen;
            break;
        case SDS_TYPE_32:
            SDS_HDR(32,s)->len = newlen;
            break;
        case SDS_TYPE_64:
            SDS_HDR(64,s)->len = newlen;
            break;
    }
}
/*  增加sds字符串长度 */
static inline void sdsinclen(sds s, size_t inc) {
    unsigned char flags = s[-1];
    switch(flags&SDS_TYPE_MASK) {
        case SDS_TYPE_5:
            {
                unsigned char *fp = ((unsigned char*)s)-1;
                unsigned char newlen = SDS_TYPE_5_LEN(flags)+inc;
                *fp = SDS_TYPE_5 | (newlen << SDS_TYPE_BITS);
            }
            break;
        case SDS_TYPE_8:
            SDS_HDR(8,s)->len += inc;
            break;
        case SDS_TYPE_16:
            SDS_HDR(16,s)->len += inc;
            break;
        case SDS_TYPE_32:
            SDS_HDR(32,s)->len += inc;
            break;
        case SDS_TYPE_64:
            SDS_HDR(64,s)->len += inc;
            break;
    }
}
/* 获取sds字符串容量 */
/* sdsalloc() = sdsavail() + sdslen() */
static inline size_t sdsalloc(const sds s) {
    unsigned char flags = s[-1];
    switch(flags&SDS_TYPE_MASK) {
        case SDS_TYPE_5:
            return SDS_TYPE_5_LEN(flags);
        case SDS_TYPE_8:
            return SDS_HDR(8,s)->alloc;
        case SDS_TYPE_16:
            return SDS_HDR(16,s)->alloc;
        case SDS_TYPE_32:
            return SDS_HDR(32,s)->alloc;
        case SDS_TYPE_64:
            return SDS_HDR(64,s)->alloc;
    }
    return 0;
}
/* 设置sds字符串容量 */
static inline void sdssetalloc(sds s, size_t newlen) {
    unsigned char flags = s[-1];
    switch(flags&SDS_TYPE_MASK) {
        case SDS_TYPE_5:
            /* Nothing to do, this type has no total allocation info. */
            break;
        case SDS_TYPE_8:
            SDS_HDR(8,s)->alloc = newlen;
            break;
        case SDS_TYPE_16:
            SDS_HDR(16,s)->alloc = newlen;
            break;
        case SDS_TYPE_32:
            SDS_HDR(32,s)->alloc = newlen;
            break;
        case SDS_TYPE_64:
            SDS_HDR(64,s)->alloc = newlen;
            break;
    }
}

sds sdsnewlen(const void *init, size_t initlen);
sds sdstrynewlen(const void *init, size_t initlen);
sds sdsnew(const char *init);
sds sdsempty(void);
sds sdsdup(const sds s);
void sdsfree(sds s);
sds sdsgrowzero(sds s, size_t len);
sds sdscatlen(sds s, const void *t, size_t len);
sds sdscat(sds s, const char *t);
sds sdscatsds(sds s, const sds t);
sds sdscpylen(sds s, const char *t, size_t len);
sds sdscpy(sds s, const char *t);

sds sdscatvprintf(sds s, const char *fmt, va_list ap);
#ifdef __GNUC__
sds sdscatprintf(sds s, const char *fmt, ...)
    __attribute__((format(printf, 2, 3)));
#else
sds sdscatprintf(sds s, const char *fmt, ...);
#endif

sds sdscatfmt(sds s, char const *fmt, ...);
sds sdstrim(sds s, const char *cset);
void sdssubstr(sds s, size_t start, size_t len);
void sdsrange(sds s, ssize_t start, ssize_t end);
void sdsupdatelen(sds s);
void sdsclear(sds s);
int sdscmp(const sds s1, const sds s2);
sds *sdssplitlen(const char *s, ssize_t len, const char *sep, int seplen, int *count);
void sdsfreesplitres(sds *tokens, int count);
void sdstolower(sds s);
void sdstoupper(sds s);
sds sdsfromlonglong(long long value);
sds sdscatrepr(sds s, const char *p, size_t len);
sds *sdssplitargs(const char *line, int *argc);
sds sdsmapchars(sds s, const char *from, const char *to, size_t setlen);
sds sdsjoin(char **argv, int argc, char *sep);
sds sdsjoinsds(sds *argv, int argc, const char *sep, size_t seplen);
int sdsneedsrepr(const sds s);

/* Callback for sdstemplate. The function gets called by sdstemplate
 * every time a variable needs to be expanded. The variable name is
 * provided as variable, and the callback is expected to return a
 * substitution value. Returning a NULL indicates an error.
 */
typedef sds (*sdstemplate_callback_t)(const sds variable, void *arg);
sds sdstemplate(const char *template, sdstemplate_callback_t cb_func, void *cb_arg);

/* Low level functions exposed to the user API */
sds sdsMakeRoomFor(sds s, size_t addlen);
sds sdsMakeRoomForNonGreedy(sds s, size_t addlen);
void sdsIncrLen(sds s, ssize_t incr);
sds sdsRemoveFreeSpace(sds s, int would_regrow);
sds sdsResize(sds s, size_t size, int would_regrow);
size_t sdsAllocSize(sds s);
void *sdsAllocPtr(sds s);

/* Export the allocator used by SDS to the program using SDS.
 * Sometimes the program SDS is linked to, may use a different set of
 * allocators, but may want to allocate or free things that SDS will
 * respectively free or allocate. */
void *sds_malloc(size_t size);
void *sds_realloc(void *ptr, size_t size);
void sds_free(void *ptr);

#ifdef REDIS_TEST
int sdsTest(int argc, char *argv[], int flags);
#endif

#endif

```

## 方法

### sdsHdrSize

根据类型返回sdshdr结构体的大小

```c
static inline int sdsHdrSize(char type) {
    switch(type&SDS_TYPE_MASK) {
        case SDS_TYPE_5:
            return sizeof(struct sdshdr5);
        case SDS_TYPE_8:
            return sizeof(struct sdshdr8);
        case SDS_TYPE_16:
            return sizeof(struct sdshdr16);
        case SDS_TYPE_32:
            return sizeof(struct sdshdr32);
        case SDS_TYPE_64:
            return sizeof(struct sdshdr64);
    }
    return 0;
}
```

### sdsReqType

根据字符串的大小确定SDS_TYPE

```c
static inline char sdsReqType(size_t string_size) {
    if (string_size < 1<<5)
        return SDS_TYPE_5;
    if (string_size < 1<<8)
        return SDS_TYPE_8;
    if (string_size < 1<<16)
        return SDS_TYPE_16;
#if (LONG_MAX == LLONG_MAX)
    if (string_size < 1ll<<32)
        return SDS_TYPE_32;
    return SDS_TYPE_64;
#else
    return SDS_TYPE_32;
#endif
}
```

### sdsTypeMaxSize

根据SDS_TYPE返字符串最大长度

```c
static inline size_t sdsTypeMaxSize(char type) {
    if (type == SDS_TYPE_5)
        return (1<<5) - 1;
    if (type == SDS_TYPE_8)
        return (1<<8) - 1;
    if (type == SDS_TYPE_16)
        return (1<<16) - 1;
#if (LONG_MAX == LLONG_MAX)
    if (type == SDS_TYPE_32)
        return (1ll<<32) - 1;
#endif
    return -1; /* this is equivalent to the max SDS_TYPE_64 or SDS_TYPE_32 */
}

```

### _sdsnewlen

创建新的sds，trymalloc参数

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

### _sdsMakeRoomFor

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
    // 可用空间足够则不用扩容
    if (avail >= addlen) return s;
    // 获取字符串长度
    len = sdslen(s);
    // 获取sds内存地址起始位置，s是buf的指针地址
    sh = (char*)s-sdsHdrSize(oldtype);
    // 计算新的字符串长度
    reqlen = newlen = (len+addlen);
    // 防止长度溢出
    assert(newlen > len);   /* Catch size_t overflow */
    /** 根据greedy判断是否需要额外扩展空间 */
    if (greedy == 1) {
        if (newlen < SDS_MAX_PREALLOC)
            newlen *= 2;
        else
            newlen += SDS_MAX_PREALLOC;
    }
    // 根据新的字符串长度取得对于的sds类型
    type = sdsReqType(newlen);

    /* Don't use type 5: the user is appending to the string and type 5 is
     * not able to remember empty space, so sdsMakeRoomFor() must be called
     * at every appending operation. */
    // 至少使用SDS_TYPE_8这个类型
    if (type == SDS_TYPE_5) type = SDS_TYPE_8;
    // 获取struct的大小
    hdrlen = sdsHdrSize(type);
    // 防止溢出
    assert(hdrlen + newlen + 1 > reqlen);  /* Catch size_t overflow */
    if (oldtype==type) {
        // 类型不变，直接 realloc
        newsh = s_realloc_usable(sh, hdrlen+newlen+1, &usable);
        if (newsh == NULL) return NULL;
        s = (char*)newsh+hdrlen;
    } else {
        /* Since the header size changes, need to move the string forward,
         * and can't use realloc */
        newsh = s_malloc_usable(hdrlen+newlen+1, &usable);
        if (newsh == NULL) return NULL;
        memcpy((char*)newsh+hdrlen, s, len+1);
        s_free(sh);
        s = (char*)newsh+hdrlen;
        s[-1] = type;
        sdssetlen(s, len);
    }
    usable = usable-hdrlen-1;
    if (usable > sdsTypeMaxSize(type))
        usable = sdsTypeMaxSize(type);
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
    // 如果sds类型不变或者是长度缩小导致type变小则使用realloc
    int use_realloc = (oldtype==type || (type < oldtype && type > SDS_TYPE_8));
    // 新的整体容量：struct长度+字符串长度+结束符'\0'
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
        // 根据newLen申请内存，返回新的地址指针
        newsh = s_malloc(newlen);
        if (newsh == NULL) return NULL;
        /* (char*)newsh+hdrlen代表新的buf地址 
         * s指针代表旧buf的地址，复制到新的地址 */
        memcpy((char*)newsh+hdrlen, s, len);
        // 释放旧的内存
        s_free(sh);
        // 获取buf指针地址
        s = (char*)newsh+hdrlen;
        // 设置类型
        s[-1] = type;
    }
    // 长度设置0
    s[len] = 0;
    // 设置字符串有效长度及字符串整体长度
    sdssetlen(s, len);
    sdssetalloc(s, size);
    // 返回buf地址指针
    return s;
}
```
