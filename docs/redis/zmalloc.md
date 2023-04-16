# zmalloc(内存分配)

## 头文件

HAVE_MALLOC_SIZE 如果定义了HAVE_MALLOC_SIZE，也就是申请内存中前几个字节是用于存储申请内存的大小

### 宏

```c
/*
 * 通过这个首指针，我们需要知道它的连续空间的大小，才能进行内存统计，某些低版本的 tcmalloc / jemalloc 不支持通过给定指针获取它申请的内存块的大小，
 * 如果能够通过接口获得这个大小，那么我们就定义宏 HAVE_MALLOC_SIZE 为 1，并且定义 zmalloc_size 为相应的接口函数
 * 
 * 如果定义了宏HAVE_MALLOC_SIZE，那么 PREFIX_SIZE的长度为0。其他的情况下，都会多分配至少8字节的长度的内存空间
 */
#ifdef HAVE_MALLOC_SIZE
#define PREFIX_SIZE (0)
#else
/* Use at least 8 bits alignment on all systems. */
#if SIZE_MAX < 0xffffffffffffffffull
#define PREFIX_SIZE 8
#else
#define PREFIX_SIZE (sizeof(size_t))
#endif
#endif

/* 使用 tc_malloc/je_malloc 替换libc中malloc/free的实现 */
/* Explicitly override malloc/free etc when using tcmalloc. */
#if defined(USE_TCMALLOC)
#define malloc(size) tc_malloc(size)
#define calloc(count,size) tc_calloc(count,size)
#define realloc(ptr,size) tc_realloc(ptr,size)
#define free(ptr) tc_free(ptr)
#elif defined(USE_JEMALLOC)
#define malloc(size) je_malloc(size)
#define calloc(count,size) je_calloc(count,size)
#define realloc(ptr,size) je_realloc(ptr,size)
#define free(ptr) je_free(ptr)
#define mallocx(size,flags) je_mallocx(size,flags)
#define dallocx(ptr,flags) je_dallocx(ptr,flags)
#endif

```

## 方法

### zmalloc_usable

```c
/* Allocate memory or panic.
 * '*usable' is set to the usable size if non NULL. */
void *zmalloc_usable(size_t size, size_t *usable) {
    // 调用 ztryrealloc_usable() 方法进行内存分配
    void *ptr = ztrymalloc_usable(size, usable);
    // 如果指针不存, 则报内存溢出 终止程序
    if (!ptr) zmalloc_oom_handler(size);
    // 返回申请到的内存地址指针
    return ptr;
}
```

### ztrymalloc_usable

```c

/* Try allocating memory, and return NULL if failed.
 * '*usable' is set to the usable size if non NULL. */
void *ztrymalloc_usable(size_t size, size_t *usable) {
    /* Possible overflow, return NULL, so that the caller can panic or handle a failed allocation. */
    // 大于可用空间的一半直接返回空
    if (size >= SIZE_MAX/2) return NULL;
    // 申请开辟内存空间并且返回指针
    void *ptr = malloc(MALLOC_MIN_SIZE(size)+PREFIX_SIZE);

    if (!ptr) return NULL;
#ifdef HAVE_MALLOC_SIZE
    // 如果 HAVE_MALLOC_SIZE 定义
    // 通过 zmalloc_size 得出分配内存大小
    size = zmalloc_size(ptr);
    // 更新内存统计
    update_zmalloc_stat_alloc(size);
    // 如果有指定 usable 指针, 则设置
    if (usable) *usable = size;
    // 返回分配的指针
    return ptr;
#else
    // 设置 PREFIX_SIZE 的值为 size
    *((size_t*)ptr) = size;
    // 更新内存统计
    update_zmalloc_stat_alloc(size+PREFIX_SIZE);
    // 如果有指定 usable 指针, 则设置
    if (usable) *usable = size;
    // 计算出真正的指针, 也就是跳过PREFIX_SIZE大小后的内存首地址
    return (char*)ptr+PREFIX_SIZE;
#endif
}
```

### ztryrealloc_usable

zrealloc 函数用来修改内存大小。具体的流程基本是分配新的内存大小，然后把老的内存数据拷贝过去，之后释放原有的内存。

```c
/* Try reallocating memory, and return NULL if failed.
 * '*usable' is set to the usable size if non NULL. */
void *ztryrealloc_usable(void *ptr, size_t size, size_t *usable) {
// 如果没有定于 MALLOC_SIZE 函数
#ifndef HAVE_MALLOC_SIZE
    // 旧的指针的原始指针(从PREFIX_SIZE的地址开始)
    void *realptr;
#endif
    size_t oldsize;
    void *newptr;

    /* not allocating anything, just redirect to free. */
    // 重新分配的长度0但是指针不为空即释放这块内存
    if (size == 0 && ptr != NULL) {
        zfree(ptr);
        // 如果传了usable指针，则将usable置0
        if (usable) *usable = 0;
        return NULL;
    }
    /* Not freeing anything, just redirect to malloc. */
    if (ptr == NULL)
        // 如果指针为空即重新申请开辟内存空间
        return ztrymalloc_usable(size, usable);

    /* Possible overflow, return NULL, so that the caller can panic or handle a failed allocation. */
    // 可能溢出则释放指针对于的内存
    if (size >= SIZE_MAX/2) {
        zfree(ptr);
        if (usable) *usable = 0;
        return NULL;
    }

#ifdef HAVE_MALLOC_SIZE
    /* 如果存在MALLOC_SIZE方法，直接获取这块内存的大小*/
    oldsize = zmalloc_size(ptr);
    /*
     * 如果ptr指向的空间之后有足够的空间可以追加，则直接追加，返回的是p原来的起始地址
     * 如果p指向的空间之后没有足够的空间可以追加，则realloc函数会重新找一个新的内存区域，重新开辟一块size个字节的动态内存空间，并且把原来内存空间的数据拷贝回来，
     * 释放旧的内存空间还给操作系统，最后返回新开辟的内存空间的起始地址 */
    newptr = realloc(ptr,size);
    // 指针为空则清空
    if (newptr == NULL) {
        // 存在usable指针，则设置指针地址对于的值为0
        if (usable) *usable = 0;
        // 返回空
        return NULL;
    }
    // 内存统计减去旧的内存大小
    update_zmalloc_stat_free(oldsize);
    // 获取新地址的内存大小
    size = zmalloc_size(newptr);
    // 内存统计加上新的内存大小
    update_zmalloc_stat_alloc(size);
    // 如果usable指针不为空则设置值
    if (usable) *usable = size;
    return newptr;
#else
    // 如果没有定义MALLOC_SIZE方法，减去PREFIX_SIZE得到真正的内存地址
    realptr = (char*)ptr-PREFIX_SIZE;
    // 获取prefix的值
    oldsize = *((size_t*)realptr);
    // 重新申请内存
    newptr = realloc(realptr,size+PREFIX_SIZE);
    if (newptr == NULL) {
        if (usable) *usable = 0;
        return NULL;
    }
    // PREFIX_SIZE地址设置新的值
    *((size_t*)newptr) = size;
    // 内存统计减去旧的内存大小
    update_zmalloc_stat_free(oldsize);
    // 内存统计加上新的内存大小
    update_zmalloc_stat_alloc(size);
    if (usable) *usable = size;
    // 返回sds对应的指针地址
    return (char*)newptr+PREFIX_SIZE;
#endif
}
```
