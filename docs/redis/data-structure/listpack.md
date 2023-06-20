# listpack

紧凑列表(listpack是一块连续的内存，不用前后项指针，节省内存)

## 内存结构

>listpack memory structure:

![listpack](/listpack.svg)

- `总字节数`：4字节，用于表示紧凑列表所占用的字节的总数，通过这个字段中存储的偏移量，可以快速定位到紧凑列表的结尾，以实现对列表的反向遍历。
- `entry数量`：2字节，用于存储当前紧凑列表中元素节点的个数。
- `结束符`：1字节，结束标志，即0xFF。

---

>entry memory structure:

![listpack_entry](/listpack_entry.svg)

:::tip
`encoding`表示当前元素节点的类型，是长度可变的字段，从1个字节到9个字节，但是它的编码类型都在第一个字节内。如果存储的是数字，那么会将数值存储在后续字节中；如果存储的是字符串，那么字符串数据的长度存储在后续字节中。

`entry_len`表示entry编码长度+元素长度，在反向遍历时通过读取`entry_len`可以知道指针向前移动的偏移量

那么反向遍历时如何判断 entry-len 是否结束了呢？这就依赖于 entry-len 的编码方式了。entry-len 每个字节的最高位，是用来表示当前字节是否为 entry-len 的最后一个字节，这里存在两种情况，分别是：

- 最高位为 1，表示 entry-len 还没有结束，当前字节的左边字节仍然表示 entry-len 的内容；
- 最高位为 0，表示当前字节已经是 entry-len 最后一个字节了。
:::

>`encoding`的解析

`encoding`定义位于 `listpack.c` `L55-L95`

```c
/* 长度: 1字节
 * 内存结构: [0XXXX XXXX]
 * 作用: 用后7位存储整数值 */
#define LP_ENCODING_7BIT_UINT 0
/* 长度: 1字节
 * 内存结构: 10XXX XXXX]
 * 作用: 用后6位存储字符串长度 */
#define LP_ENCODING_6BIT_STR 0x80
/* 长度：2字节
 * 内存结构: [110X XXXX][one byte]
 * 使用第一个字节的后5位及1字节存储整数 */
#define LP_ENCODING_13BIT_INT 0xC0
/* 长度：2字节
 * 内存结构: [1110 XXXX][one byte]
 * 使用第一个字节的后4位及1字节存储字符串长度 */
#define LP_ENCODING_12BIT_STR 0xE0
/* 长度：3字节
 * 内存结构: [1111 0001][two byte]
 * 使用后2字节存储16位整数 */
#define LP_ENCODING_16BIT_INT 0xF1
/* 长度：4字节
 * 内存结构: [1111 0010][three byte]
 * 使用后3字节存储24位整数 */
#define LP_ENCODING_24BIT_INT 0xF2
/* 长度：5字节
 * 内存结构: [1111 0011][four byte]
 * 使用后4字节存储32位整数 */
#define LP_ENCODING_32BIT_INT 0xF3
/* 长度：9字节
 * 内存结构: [1111 0100][eight byte]
 * 使用后8字节存储64位整数 */
#define LP_ENCODING_64BIT_INT 0xF4
/* 长度：5字节
 * 内存结构: [1111 0000][four byte]
 * 使用后4字节存储字符串长度 */
#define LP_ENCODING_32BIT_STR 0xF0
```

## 相关宏

### LP_ENCODING_IS_7BIT_UINT

判断节点编码类型是否是`LP_ENCODING_IS_7BIT`类型

LP_ENCODING_7BIT_UINT，1字节，内存结构`[0XXX XXXX]`，编码类型是`0`

LP_ENCODING_7BIT_UINT_MASK必须为`[1000 0000]`即`0x80`，二者相`&`才能取到类型编码`0`

后续类型编码依次递推`10`,`110`,`1110`...也就逐一不分析了。

```c
#define LP_ENCODING_IS_7BIT_UINT(byte) (((byte)&LP_ENCODING_7BIT_UINT_MASK)==LP_ENCODING_7BIT_UINT)
```

---

### LP_ENCODING_6BIT_STR_LEN

获取`LP_ENCODING_6BIT_STR`类型节点的字符串长度

`LP_ENCODING_6BIT_STR`1字节，2位存储编码类型，6位存储符串长度长度值

`(p)[0] & 0x3F(0011 1111)`可得字符串所占字节数

```c
#define LP_ENCODING_6BIT_STR_LEN(p) ((p)[0] & 0x3F)
```

### LP_ENCODING_12BIT_STR_LEN

获取`LP_ENCODING_12BIT_STR`类型节点的字符串长度

`LP_ENCODING_12BIT_STR`2字节，4位存储编码类型，后面4位及一个字节用来存储字符串长度值

`(p)[0] & 0xF(0000 1111)`取得后4位再左移8位加上后一个字节的值即p[1]，得出正确字符串长度值

```c
#define LP_ENCODING_12BIT_STR_LEN(p) ((((p)[0] & 0xF) << 8) | (p)[1])
```

### LP_ENCODING_32BIT_STR_LEN

获取`LP_ENCODING_32BIT_STR`类型节点的字符串长度

`LP_ENCODING_32BIT`5字节，1字节存储编码类型，后面5字节用来存储字符串长度值

`字节序是小端模式`即最高位在最右边，p[4]左移24位，依次类推相加可得正确字符串长度值

```c
#define LP_ENCODING_32BIT_STR_LEN(p) (((uint32_t)(p)[1]<<0) | \
                                      ((uint32_t)(p)[2]<<8) | \
                                      ((uint32_t)(p)[3]<<16) | \
                                      ((uint32_t)(p)[4]<<24))
```

### lpGetTotalBytes

读取紧凑列表前4个字节，获取listpack占用字节数（存储方式为小端模式）

- big endian: 按照从低地址到高地址的顺序存放数据的高位字节到低位字节

- little endian: 按照从低地址到高地址的顺序存放据的低位字节到高位字节

`(p)[3]`即最高位，左移24位才是正确数值，依次类推然后通过 `|(或)`进行值的累加

```c
#define lpGetTotalBytes(p)           (((uint32_t)(p)[0]<<0) | \
                                      ((uint32_t)(p)[1]<<8) | \
                                      ((uint32_t)(p)[2]<<16) | \
                                      ((uint32_t)(p)[3]<<24))
```

## 函数

### lpNew

创建一个新的listpack，元素为0：`<hdr_size>+<element_num>+<EOF_flag>`

```c
unsigned char *lpNew(size_t capacity) {
    /* LP_HDR_SIZE + 1 = 7, 最小分配7个字节的空间 */
    unsigned char *lp = lp_malloc(capacity > LP_HDR_SIZE+1 ? capacity : LP_HDR_SIZE+1);
    if (lp == NULL) return NULL;
    /* 设置listpack总容量大小 */
    lpSetTotalBytes(lp,LP_HDR_SIZE+1);
    /* 设置元素个数0 */
    lpSetNumElements(lp,0);
    /* lp[6]即第7个字节，设置为0XFF */
    lp[LP_HDR_SIZE] = LP_EOF;
    return lp;
}
```

### lpEncodeGetType

计算ele的实际encoding，如果传入enclen指针则返回编码长度+元素长度值（char占一个字节）

```c
static inline int lpEncodeGetType(unsigned char *ele, uint32_t size, unsigned char *intenc, uint64_t *enclen) {
    int64_t v;
    /* 尝试将字符串转成数值
     * 返回1代表使用LP_ENCODING_INT编码
     * 返回0代表使用LP_ENCODING_STRING编码 */
    if (lpStringToInt64((const char*)ele, size, &v)) {
        /* lpEncodeIntegerGetType根据elel转成的v值决定填如何充编码数组intenc
         * 算出编码长度+元素长度，赋值给指针enclen */
        lpEncodeIntegerGetType(v, intenc, enclen);
        return LP_ENCODING_INT;
    } else {
        /* LP_ENCODING_6BIT_STR，能表示最大长度为2^6-1 = 63，1字节
         * LP_ENCODING_12BIT_STR，能表示最大长度为2^12-1 = 4096，2字节
         * LP_ENCODING_32BIT_STR，能表示最大长度为2^32-1，5字节
         * 由于Redis规定存储字符串就3种类型，字节长度则if-else判断一下啦 */
        if (size < 64) *enclen = 1+size;
        else if (size < 4096) *enclen = 2+size;
        else *enclen = 5+(uint64_t)size;
        return LP_ENCODING_STRING;
    }
}
```

### lpEncodeBacklen

根据`entry`编码字节+元素长度字节，算出`entry-total-len(用backlen[5]数组进行copy)`字段所占字节数

如果传入`backlen`指针，根据`backlen`长度规则填充buf数组

```c
static inline unsigned long lpEncodeBacklen(unsigned char *buf, uint64_t l) {
    /* backlen
     * 1字节: 1个标志位占用，最大值2^7-1=127
     * 2字节: 2个标志位占用，最大值2^14-1=16383
     * 3字节: 3个标志位占用，最大值2^21-1=2097151
     * 4字节: 4个标志位占用，最大值2^28-1=268435455
     * 5字节: 5个标志位占用，最大值2^35-1=34359738367
     * 对于`LP_ENCODING_12BIT_STR`类型，使用后4个字节存储字符串长度最大值即2^32-1
     * 由此知道backlen数组最大5字节，所以下面的判断也就只到5字节
     */
    if (l <= 127) {
        if (buf) buf[0] = l;
        return 1;
    } else if (l < 16383) {
        /* 2字节
         * 小端字节序
         * buf[0] = l>>7 内存高位存储数据高位字节数据
         * (l&127)|128 --> 取低7位，再补上标记位表示prev字节还存有长度值 */
        if (buf) {
            buf[0] = l>>7;
            buf[1] = (l&127)|128;
        }
        return 2;
    } else if (l < 2097151) {
        if (buf) {
            buf[0] = l>>14;
            buf[1] = ((l>>7)&127)|128;
            buf[2] = (l&127)|128;
        }
        return 3;
    } else if (l < 268435455) {
        if (buf) {
            buf[0] = l>>21;
            buf[1] = ((l>>14)&127)|128;
            buf[2] = ((l>>7)&127)|128;
            buf[3] = (l&127)|128;
        }
        return 4;
    } else {
        if (buf) {
            buf[0] = l>>28;
            buf[1] = ((l>>21)&127)|128;
            buf[2] = ((l>>14)&127)|128;
            buf[3] = ((l>>7)&127)|128;
            buf[4] = (l&127)|128;
        }
        return 5;
    }
}
```

### lpDecodeBacklen

根据`entry_len`的内存值，算出`entry`的长度

127、128二进制

- 127: 0111 1111
- 128: 1000 0000

```c
static inline uint64_t lpDecodeBacklen(unsigned char *p) {
    /* 这里传入的指针p，属于上一个entry节点p的最后一字节地址
     * 所以p--，读取的便是低位字节 */
    uint64_t val = 0;
    uint64_t shift = 0;
    do {
        /* 小端字节序，按照从低地址到高地址的顺序存放据的低位字节到高位字节
         * 取后7位数值，然后左移shift位，所以shift每次递增7位，val值累加，循环结束后val值才是正确长度 */
        val |= (uint64_t)(p[0] & 127) << shift;
        /* p[0] & 128 == 0，表示当前字节最高位为0，即entry长度读取结束，即退出循环 */
        if (!(p[0] & 128)) break;
        shift += 7;
        p--;
        if (shift > 28) return UINT64_MAX;
    } while(1);
    return val;
}
```

### lpEncodeString

根据字符串的len，去设置encoding和元素内容

```c
static inline void lpEncodeString(unsigned char *buf, unsigned char *s, uint32_t len) {
    if (len < 64) {
        buf[0] = len | LP_ENCODING_6BIT_STR;
        memcpy(buf+1,s,len);
    } else if (len < 4096) {
        buf[0] = (len >> 8) | LP_ENCODING_12BIT_STR;
        buf[1] = len & 0xff;
        memcpy(buf+2,s,len);
    } else {
        buf[0] = LP_ENCODING_32BIT_STR;
        buf[1] = len & 0xff;
        buf[2] = (len >> 8) & 0xff;
        buf[3] = (len >> 16) & 0xff;
        buf[4] = (len >> 24) & 0xff;
        memcpy(buf+5,s,len);
    }
}
```

### lpCurrentEncodedSizeUnsafe

返回紧凑列表节点(指针p)的长度，包扩编码字节+元素字节，不包括`element-tot-len`

<VPLink icon="i-carbon-code" title="相关宏" url="#LP_ENCODING_IS_7BIT_UINT"/>

```c
static inline uint32_t lpCurrentEncodedSizeUnsafe(unsigned char *p) {
    /* 依次判断entry的编码类型，获取编码+元素长度共占用字节数 */
    if (LP_ENCODING_IS_7BIT_UINT(p[0])) return 1;
    /* LP_ENCODING_6BIT_STR，编码占1字节，
     * LP_ENCODING_6BIT_STR_LEN宏获取字符串所占字节长度
     * 相加即节点所占字节数 */
    if (LP_ENCODING_IS_6BIT_STR(p[0])) return 1+LP_ENCODING_6BIT_STR_LEN(p);
    if (LP_ENCODING_IS_13BIT_INT(p[0])) return 2;
    if (LP_ENCODING_IS_16BIT_INT(p[0])) return 3;
    if (LP_ENCODING_IS_24BIT_INT(p[0])) return 4;
    if (LP_ENCODING_IS_32BIT_INT(p[0])) return 5;
    if (LP_ENCODING_IS_64BIT_INT(p[0])) return 9;
    if (LP_ENCODING_IS_12BIT_STR(p[0])) return 2+LP_ENCODING_12BIT_STR_LEN(p);
    if (LP_ENCODING_IS_32BIT_STR(p[0])) return 5+LP_ENCODING_32BIT_STR_LEN(p);
    /* 如果节点值0xFF即结束符，占1字节 */
    if (p[0] == LP_EOF) return 1;
    return 0;
}

```

### lpSkip

传入当前entry节点起始地址，跳过当前entry节点，即得到下一个节点的地址起始值

```c
unsigned char *lpSkip(unsigned char *p) {
    /* 读取p[0](编码类型),计算节点编码类型+内容所占字节之和 */
    unsigned long entrylen = lpCurrentEncodedSizeUnsafe(p);
    /* lpEncodeBacklen算出backlen所占字节
     * 再进行累加，entrylen就代表整个entry节点所占字节数
     */
    entrylen += lpEncodeBacklen(NULL,entrylen);
    /* 跳过当前entry节点，即下一个节点 */
    p += entrylen;
    return p;
}
```

### lpInsert

紧凑列表的插入(删除、添加方法的最终入口)

> 参数解释

- lp: listpack的指针
- elestr: 要插入列表的字符串元素的地址。如果不插入字符串元素，可以传入NULL
- eleint: 要插入列表的整数元素的地址。如果不插入整数元素，可以传入NULL
- size: 要插入元素的大小（字节数）
- p: 指向待插入位置的列表元素的地址
- where: 指定插入位置的方式，可取的值为
  - LP_BEFORE: 在p所指定的元素之前插入新元素
  - LP_AFTER: 在p所指定的元素之后插入新元素
  - LP_REPLACE: 替换掉p所指定的元素
- newp: 一个指向指针的指针，用于接收插入/替换后新元素的地址

```c
unsigned char *lpInsert(unsigned char *lp, unsigned char *elestr, unsigned char *eleint,
                        uint32_t size, unsigned char *p, int where, unsigned char **newp)
{   /* intenc 存储编码类型（编码类型、字符长度或数值因类型而定）数组，最大9字节 
     * backlen 编码类型+元素长度，最大5字节 */
    unsigned char intenc[LP_MAX_INT_ENCODING_LEN];
    unsigned char backlen[LP_MAX_BACKLEN_SIZE];
    /* 计算当前编码的字节数 */
    uint64_t enclen; /* The length of the encoded element. */
    /* 如果ele为null说明需要删除，操作则为替换 */
    int delete = (elestr == NULL && eleint == NULL);

    /* when deletion, it is conceptually replacing the element with a
     * zero-length element. So whatever we get passed as 'where', set
     * it to LP_REPLACE. */
    if (delete) where = LP_REPLACE;

    /* If we need to insert after the current element, we just jump to the
     * next element (that could be the EOF one) and handle the case of
     * inserting before. So the function will actually deal with just two
     * cases: LP_BEFORE and LP_REPLACE. */
    /* 如果是在之后插入，则将其转换为向前插入，这样做可以减少些逻辑代码，值得学习 */ 
    if (where == LP_AFTER) {
        /* 跳转到下一个节点 */
        p = lpSkip(p);
        /* 设置为向前插入 */
        where = LP_BEFORE;
        ASSERT_INTEGRITY(lp, p);
    }

    /* Store the offset of the element 'p', so that we can obtain its
     * address again after a reallocation. */
    /* 计算当前p在lp的偏移量 */
    unsigned long poff = p-lp;

    int enctype;
    if (elestr) {
        /* Calling lpEncodeGetType() results into the encoded version of the
        * element to be stored into 'intenc' in case it is representable as
        * an integer: in that case, the function returns LP_ENCODING_INT.
        * Otherwise if LP_ENCODING_STR is returned, we'll have to call
        * lpEncodeString() to actually write the encoded string on place later.
        *
        * Whatever the returned encoding is, 'enclen' is populated with the
        * length of the encoded element. */
        /* 获取元素的编码类型，并填充enclen指针 
         * 也可以把字符串类型的数值用LP_ENCODING_INT存储 */
        enctype = lpEncodeGetType(elestr,size,intenc,&enclen);
        if (enctype == LP_ENCODING_INT) eleint = intenc;
    } else if (eleint) {
        /* 如果eleint不为空，则表示要插入的是整数元素，此时将enctype设置为LP_ENCODING_INT，并将元素的长度赋值给enclen */
        enctype = LP_ENCODING_INT;
        enclen = size; /* 'size' is the length of the encoded integer element. */
    } else {
        /* 如果既没有字符串元素也没有整数元素，则将enctype设置为-1，表示未知类型，将enclen设置为0 */
        enctype = -1;
        enclen = 0;
    }

    /* We need to also encode the backward-parsable length of the element
     * and append it to the end: this allows to traverse the listpack from
     * the end to the start. */
    /* 计算backlen实际所占字节数 */ 
    unsigned long backlen_size = (!delete) ? lpEncodeBacklen(backlen,enclen) : 0;
    /* 再更改前获取lp整体所占字节数 */
    uint64_t old_listpack_bytes = lpGetTotalBytes(lp);
    uint32_t replaced_len  = 0;
    /* 替换节点 */
    if (where == LP_REPLACE) {
        /* 求出节点p的整体长度 */
        replaced_len = lpCurrentEncodedSizeUnsafe(p);
        replaced_len += lpEncodeBacklen(NULL,replaced_len);
        ASSERT_INTEGRITY_LEN(lp, p, replaced_len);
    }
    /* 计算替换节点后，紧凑列表总共使用字节数 */
    uint64_t new_listpack_bytes = old_listpack_bytes + enclen + backlen_size
                                  - replaced_len;
    /* 如果新列表所需的字节数超过了 UINT32_MAX，就返回 NULL。
     * 这是因为在 C 语言中，一个指针最多只能指向 UINT32_MAX 个字节的内存空间。 */
    if (new_listpack_bytes > UINT32_MAX) return NULL;

    /* We now need to reallocate in order to make space or shrink the
     * allocation (in case 'when' value is LP_REPLACE and the new element is
     * smaller). However we do that before memmoving the memory to
     * make room for the new element if the final allocation will get
     * larger, or we do it after if the final allocation will get smaller. */
    /* 定义一个指针，指向原来列表中待修改元素的位置 */
    unsigned char *dst = lp + poff; /* May be updated after reallocation. */

    /* Realloc before: we need more room. */
    /* 如果新列表所需的字节数比原来的列表更多，或者在替换元素时，新元素的长度比旧元素还要短，就需要重新分配内存 
     * lp_malloc_size(lp) 是当前列表数据结构实际分配的内存大小（与 old_listpack_bytes 可能不同） */
    if (new_listpack_bytes > old_listpack_bytes &&
        new_listpack_bytes > lp_malloc_size(lp)) {
        /* 重新分配内存 */
        if ((lp = lp_realloc(lp,new_listpack_bytes)) == NULL) return NULL;
        /* 更新指针 lp 的值，并重新计算指针 dst 的位置 */
        dst = lp + poff;
    }

    /* Setup the listpack relocating the elements to make the exact room
     * we need to store the new one. */
    /* 根据修改操作的类型（LP_BEFORE 或 LP_REPLACE），使用 memmove() 函数将原来列表中的元素移动到新列表的正确位置上，给新元素腾出空间。
     * 如果是插入操作，就把待修改元素之后的元素向后移动；
     * 如果是替换操作，就把待修改元素之后的元素往前移动，从dst开始预留replaced_len长度为了替换 */
    if (where == LP_BEFORE) {
        memmove(dst+enclen+backlen_size,dst,old_listpack_bytes-poff);
    } else { /* LP_REPLACE. */
        memmove(dst+enclen+backlen_size,
                dst+replaced_len,
                old_listpack_bytes-poff-replaced_len);
    }

    /* Realloc after: we need to free space. */
    /* 如果新的 listpack 大小比旧的小，为其重新分配内存 */
    if (new_listpack_bytes < old_listpack_bytes) {
        if ((lp = lp_realloc(lp,new_listpack_bytes)) == NULL) return NULL;
        /* 由于lp指针地址更新了，那么重新计算指针 dst 的位置 */
        dst = lp + poff;
    }

    /* Store the entry. */
    /* 如果 'newp' 参数传入了一个指向 listpack 中某个位置的指针，则将其设置为要插入的 entry 的起始位置 */
    if (newp) {
        *newp = dst;
        /* In case of deletion, set 'newp' to NULL if the next element is
         * the EOF element. */
        /* 如果要删除元素并且下一个元素是 EOF 标记，则将 'newp' 设置为 NULL。*/ 
        if (delete && dst[0] == LP_EOF) *newp = NULL;
    }
    /* 如果不是删除操作，则将新元素添加到 listpack 中 */
    if (!delete) {
        /* 如果元素的编码类型是整数，则将整数值复制到 entry 节点编码类型后面 */
        if (enctype == LP_ENCODING_INT) {
            memcpy(dst,eleint,enclen);
        } else if (elestr) {
            /* 如果元素是字符串，对entry 编码类型+字符串字节数进行设置，再将字符串elestr拷贝到encoding后面 */
            lpEncodeString(dst,elestr,size);
        } else {
            redis_unreachable();
        }
        /* 编码+元素内容设置完了之后，再设置backlen，元素长度+编码长度=enclen，即指针偏移量 */
        dst += enclen;
        /* 将对应backlen数组中，backlen_size长度的内容copy到dst后面*/
        memcpy(dst,backlen,backlen_size);
        dst += backlen_size;
    }

    /* Update header. */
    /* 如果不是替换元素或删除元素，则更新 listpack 中元素的数量 */
    if (where != LP_REPLACE || delete) {
        uint32_t num_elements = lpGetNumElements(lp);
        if (num_elements != LP_HDR_NUMELE_UNKNOWN) {
            if (!delete)
                lpSetNumElements(lp,num_elements+1);
            else
                lpSetNumElements(lp,num_elements-1);
        }
    }
    /* 更新 listpack 的总大小 */
    lpSetTotalBytes(lp,new_listpack_bytes);

#if 0
    /* This code path is normally disabled: what it does is to force listpack
     * to return *always* a new pointer after performing some modification to
     * the listpack, even if the previous allocation was enough. This is useful
     * in order to spot bugs in code using listpacks: by doing so we can find
     * if the caller forgets to set the new pointer where the listpack reference
     * is stored, after an update. */
    unsigned char *oldlp = lp;
    lp = lp_malloc(new_listpack_bytes);
    memcpy(lp,oldlp,new_listpack_bytes);
    if (newp) {
        unsigned long offset = (*newp)-oldlp;
        *newp = lp + offset;
    }
    /* Make sure the old allocation contains garbage. */
    memset(oldlp,'A',new_listpack_bytes);
    lp_free(oldlp);
#endif

    return lp;
}
```
