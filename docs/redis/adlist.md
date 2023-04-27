# adlist(双端链表)

A generic doubly linked list implementation(一个通用的双端链表实现)

## 头文件

### listNode

链表节点

```c
typedef struct listNode {
    /* 前驱节点 */
    struct listNode *prev;
    /* 后继节点 */
    struct listNode *next;
    /* 泛化类型的指针 */
    void *value;
} listNode;
```

### listIter

链表迭代器

```c
typedef struct listIter {
    /* 指针指向下一次访问的链表节点 */
    listNode *next;
    /* direction 标识当前迭代器的方向是 AL_START_HEAD(从头到尾遍历) 还是 AL_START_TAIL(从尾到头遍历) */
    int direction;
} listIter;
```

### list

双向链表结构

```c
typedef struct list {
    /* 首节点 */
    listNode *head;
    /* 尾节点 */
    listNode *tail;
    /* 对泛化类型 value 进行深拷贝 */
    void *(*dup)(void *ptr);
    /* 对value释放的函数 */
    void (*free)(void *ptr);
    /* 匹配value的函数 */
    int (*match)(void *ptr, void *key);
    unsigned long len;
} list;
```

## 方法

### listCreate

创建一个双端链表

```c
list *listCreate(void)
{
    struct list *list;
    /* 申请内存失败则返回NULL */
    if ((list = zmalloc(sizeof(*list))) == NULL)
        return NULL;
    /* 初始化成员变量 */    
    list->head = list->tail = NULL;
    list->len = 0;
    list->dup = NULL;
    list->free = NULL;
    list->match = NULL;
    return list;
}

```
