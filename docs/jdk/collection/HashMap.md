# HashMap

[参考](https://blog.csdn.net/reliveIT/article/details/82960063)

在阅读源码的时候一直有个问题很困惑就是 HashMap 已经继承了 AbstractMap 而 AbstractMap 类实现了 Map 接口，
那为什么 HashMap 还要在实现 Map 接口呢？同样在 ArrayList 中 LinkedList 中都是这种结构。

:::tip 其他
据 java 集合框架的创始人 Josh Bloch 描述，这样的写法是一个失误。在 java 集合框架中，类似这样的写法很多，最开始写 java 集合框架的时候，
他认为这样写，在某些地方可能是有价值的，直到他意识到错了。显然的，JDK 的维护者，后来不认为这个小小的失误值得去修改，所以就这样存在下来了。
:::

```java
    public class HashMap<K,V> extends AbstractMap<K,V>
        implements Map<K,V>, Cloneable, Serializable {
        ...代码部分省略
    }
```

:::tip 在源码中开头中的第二段注释
Ideally, under random hashCodes, the frequency of nodes in bins follows a Poisson distribution(<http://en.wikipedia.org/wiki/Poisson_distribution>)
with a parameter of about 0.5 on average for the default resizing threshold of 0.75, although with a large variance because of resizing granularity.

在理想的随机 hashCodes 下，容器中节点的频率遵循泊松分布[参考](http://en.wikipedia.org/wiki/Poisson_distribution)，对于 0.75 的默认调整阈值，泊松分布的概率质量函数中参数 λ（事件发生的平均次数）的值约为 0.5，尽管 λ 的值会因为 load factor 值的调整而产生较大变化。

:::

这一段注释（甚至是 HashMap 开头的这一大段注释都和 load factor 无关）不是说设置 load factor 为 0.75 的原因，
而是说在默认调整阈值为 0.75 的情况下，泊松分布概率质量函数中的参数 λ=0.5， 带入泊松分布公式，即
长度为 length 的数组中 hash 地放入 0.75\*length 数量的数据，数组中某一个下标放入 k 个数据的概率如下：

- 0: 0.60653066
- 1: 0.30326533
- 2: 0.07581633
- 3: 0.01263606
- 4: 0.00157952
- 5: 0.00015795
- 6: 0.00001316
- 7: 0.00000094
- 8: 0.00000006

这一段乃至 HashMap 开头的一大段注释都没有解释 load factory 默认值是 0.75 的原因，而是说 load factor 的值会影响泊松分布 PMF 函数公式中的参数 λ 的值，例如 load factor=0.75f 时 λ=0.5。按照泊松分布公式来看，
期望放入 bin 中数据的数量 k=8，e 是一个无理常数，λ 的值受 load factor 的值的影响
（泊松分布是用来估算在 一段特定时间或空间内发生成功事件的数量的概率，即在长度为 length 的数组中 hash 地放入 0.75\*length 数量的数据，数组中某一个下标放入 k 个数据的概率）。

- 这一段注释的内容和目的都是为了解释在 java8 HashMap 中引入 Tree Bin（也就是放入数据的每个数组 bin 从链表 node 转换为 red-black tree node）的原因

```text
举个例子说明，HashMap默认的table[].length=16，在长度为16的HashMap中放入12（0.75*length）个数据，某一个bin中存放了8个节点的概率是0.00000006
- 扩容一次，16*2=32，在长度为32的HashMap中放入24个数据，某一个bin中存放了8个节点的概率是0.00000006
- 再扩容一次，32*2=64，在长度为64的HashMap中放入48个数据，某一个bin中存放了8个节点的概率是0.00000006
所以，当某一个bin的节点大于等于8个的时候，就可以从链表node转换为treeNode，其性价比是值得的。
```

[TreeNode红黑树](./TreeNode)

## 属性

```java
    /**
     * 默认初始化容量 16 (长度必须是2的幂次方)
     * The default initial capacity - MUST be a power of two.
     */
    static final int DEFAULT_INITIAL_CAPACITY = 1 << 4; // aka 16

    /**
     * 最大容量
     * The maximum capacity, used if a higher value is implicitly specified
     * by either of the constructors with arguments.
     * MUST be a power of two <= 1<<30.
     */
    static final int MAXIMUM_CAPACITY = 1 << 30;

    /**
     * 扩容因子
     * 负载因子太小了浪费空间并且会发生更多次数的resize，太大了哈希冲突增加会导致性能不好，所以0.75只是一个折中的选择
     * The load factor used when none specified in constructor.
     */
    static final float DEFAULT_LOAD_FACTOR = 0.75f;

    /**
     * 当桶(bucket)上的结点数大于这个值时会转成红黑树
     * The bin count threshold for using a tree rather than list for a
     * bin.  Bins are converted to trees when adding an element to a
     * bin with at least this many nodes. The value must be greater
     * than 2 and should be at least 8 to mesh with assumptions in
     * tree removal about conversion back to plain bins upon
     * shrinkage.
     */
    static final int TREEIFY_THRESHOLD = 8;

    /**
     * 当桶(bucket)上的结点数小于这个值时树转链表
     * The bin count threshold for untreeifying a (split) bin during a
     * resize operation. Should be less than TREEIFY_THRESHOLD, and at
     * most 6 to mesh with shrinkage detection under removal.
     */
    static final int UNTREEIFY_THRESHOLD = 6;

    /**
     * 桶中结构转化为红黑树对应的table的最小大小
     * The smallest table capacity for which bins may be treeified.
     * (Otherwise the table is resized if too many nodes in a bin.)
     * Should be at least 4 * TREEIFY_THRESHOLD to avoid conflicts
     * between resizing and treeification thresholds.
     */
    static final int MIN_TREEIFY_CAPACITY = 64;

    /**
     * 存储元素的数组
     */
    transient Node<K,V>[] table;
    /**
     * 存放具体元素的集
     */
    transient Set<Map.Entry<K,V>> entrySet;
    /**
     * 存放元素的个数
     */
    transient int size;
    /**
     * 每次扩容和更改map结构的计数器
     */
    transient int modCount;
```

## 构造方法

```java
    // 默认构造方法
    public HashMap() {
        this.loadFactor = DEFAULT_LOAD_FACTOR; // all other fields defaulted
    }
    // 传入初始化容量
    public HashMap(int initialCapacity) {
        // 使用默认的负载因子
        this(initialCapacity, DEFAULT_LOAD_FACTOR);
    }

    public HashMap(int initialCapacity, float loadFactor) {
        if (initialCapacity < 0)
            // 初始化容量小于0 抛出参数异常
            throw new IllegalArgumentException("Illegal initial capacity: " +
                                               initialCapacity);
        // 保证容量不超过 MAXIMUM_CAPACITY
        if (initialCapacity > MAXIMUM_CAPACITY)
            initialCapacity = MAXIMUM_CAPACITY;
        // 检查负载因子
        if (loadFactor <= 0 || Float.isNaN(loadFactor))
            throw new IllegalArgumentException("Illegal load factor: " +
                                               loadFactor);
        this.loadFactor = loadFactor;
        // 初始化 扩容临界值
        this.threshold = tableSizeFor(initialCapacity);
    }
    // 根据传入的 map 进行初始化
    public HashMap(Map<? extends K, ? extends V> m) {
        this.loadFactor = DEFAULT_LOAD_FACTOR;
        putMapEntries(m, false);
    }
```

## 方法

### tableSizeFor

计算大于等于容量最小的 2 次幂

```java
    static final int tableSizeFor(int cap) {
        // 这里减一是为了防止传入的cap本身就是2的幂次方导致计算完后是传入的2倍
        int n = cap - 1;
        n |= n >>> 1;
        n |= n >>> 2;
        n |= n >>> 4;
        n |= n >>> 8;
        n |= n >>> 16;
        return (n < 0) ? 1 : (n >= MAXIMUM_CAPACITY) ? MAXIMUM_CAPACITY : n + 1;
    }
```

### putMapEntries

```java
    final void putMapEntries(Map<? extends K, ? extends V> m, boolean evict) {
        int s = m.size();
        if (s > 0) {
            if (table == null) { // pre-size
                // 如果table为空则要初始化
                // HashMap底层的table在 entry_count > table_size * load_factor
                // 为了不让 HashMap 扩容，需要 table_size >= entry_count / load_factor
                // 公式((float)s / loadFactor) + 1.0F中的size是使用float计算的，+1.0F是因为((float)s / loadFactor)使用float计算，
                // 在转换成整数的时候会进行舍入，为了保证最终计算出来的size足够大不至于触发扩容，所以进行了+ 1.0F操作
                float ft = ((float)s / loadFactor) + 1.0F;
                int t = ((ft < (float)MAXIMUM_CAPACITY) ?
                         (int)ft : MAXIMUM_CAPACITY);
                if (t > threshold)
                    // 这里的threshold成员实际存放的值是capacity的值。因为在table还没有初始化时（table还是null），
                    // 用户给定的capacity会暂存到threshold成员上去（毕竟HashMap没有一个成员叫做capacity，capacity是作为table数组的大小而隐式存在的）
                    threshold = tableSizeFor(t);
            }
            else if (s > threshold)
                // 说明传入map的size都已经大于当前map的threshold了，即当前map肯定是装不下两个map的并集的，所以这里必须要执行resize操作
                resize();
            for (Map.Entry<? extends K, ? extends V> e : m.entrySet()) {
                K key = e.getKey();
                V value = e.getValue();
                // 循环putVal
                putVal(hash(key), key, value, false, evict);
            }
        }
    }

```

### hash

[参考自](https://blog.csdn.net/yueaini10000/article/details/108869022)

`扰动函数`

- 一定要尽可能降低 hash 碰撞，越分散越好
- 算法一定要尽可能高效，因为这是高频操作, 因此采用位运算

:::tip 提示
因为 key.hashCode()函数调用的是 key 键值类型自带的哈希函数，返回 int 型散列值。int 值范围为 -2147483648~2147483647 ，
前后加起来大概 40 亿的映射空间。只要哈希函数映射得比较均匀松散，一般应用是很难出现碰撞的。但问题是一个 40 亿长度的数组，内存是放不下的。
你想，如果 HashMap 数组的初始大小才 16，用之前需要对数组的长度取模运算，得到的余数才能用来访问数组下标。
:::

右位移 16 位，正好是 32bit 的一半，自己的高半区和低半区做异或，就是为了混合原始哈希码的高位和低位，以此来加大低位的随机性。
而且混合后的低位掺杂了高位的部分特征，这样高位的信息也被变相保留下来。

```java
    static final int hash(Object key) {
        int h;
        return (key == null) ? 0 : (h = key.hashCode()) ^ (h >>> 16);
    }

```

### putVal

```java
    final V putVal(int hash, K key, V value, boolean onlyIfAbsent,
                   boolean evict) {

        Node<K,V>[] tab; Node<K,V> p; int n, i;
        // 先赋值 tab=table，n=tab.length（n指数组长度）
        // 数组未初始化或者为空
        if ((tab = table) == null || (n = tab.length) == 0)
            // 调用 resize 扩容
            n = (tab = resize()).length;
        if ((p = tab[i = (n - 1) & hash]) == null)
            // 没有hash冲突
            tab[i] = newNode(hash, key, value, null);
        else {
            Node<K,V> e; K k;
            // put进来的key 如果 hash值冲突 并且key值相等或者对象equal是一样的
            if (p.hash == hash &&
                ((k = p.key) == key || (key != null && key.equals(k))))
                // 直接e指向p
                e = p;
            else if (p instanceof TreeNode)
                // r如果p是TreeNode实例那么调用TreeNode 的putTreeVal
                e = ((TreeNode<K,V>)p).putTreeVal(this, tab, hash, key, value);
            else {
                // 这里要统计链表的数量，好控制树化
                for (int binCount = 0; ; ++binCount) {
                    if ((e = p.next) == null) {
                        // 往链表的下一个塞入Node
                        p.next = newNode(hash, key, value, null);
                        // 如果 链表的数量达到临界值，进行树化
                        if (binCount >= TREEIFY_THRESHOLD - 1) // -1 for 1st
                            treeifyBin(tab, hash);
                        break;
                    }
                    if (e.hash == hash &&
                        ((k = e.key) == key || (key != null && key.equals(k))))
                        break;
                    p = e;
                }
            }
            if (e != null) { // existing mapping for key
                V oldValue = e.value;
                if (!onlyIfAbsent || oldValue == null)
                    e.value = value;
                afterNodeAccess(e);
                return oldValue;
            }
        }
        ++modCount;
        if (++size > threshold)
            resize();
        afterNodeInsertion(evict);
        return null;
    }
```

### resize

:::tip 知识点
数组的索引计算方式是：hash & oldCap-1

扩容后数组容量是2oldCap，数组的索引计算的方式是：hash & 2oldCap-1(该bucket的位置上肯定会存在不同hash的节点，肯定需要重新定位新的位置)

以odlCap=8(1000)为例子,节点在数组中的位置为(e.hash & (oldCap-1)) 依旧取决于从右往左数的三位

扩容后节点在数组中的位置为(e.hash & (2oldCap-1))也取决于从右往左数的四位

若`e.hash & oldCap==0`，那么`hash`的第四位为0，由于上面得出的结论：扩容后的位置取决于(2oldCap-1)的前4位故位置不变

若`e.hash & oldCap!=0`，那么`hash`的第四位为1，由于上面得出的结论：扩容后的位置取决于(2oldCap-1)的前4位，但是oldCap的2倍相当于左移了一位刚好4位，相当于索引加了`oldCap`故得出结论当
`e.hash & oldCap!=0`时，节点的新位置为`newTab[旧索引+oldCap]`，这也是为什么rehash时链表要分出2条高低位的链子的原因了。
:::

```java

    final Node<K,V>[] resize() {
        // 获取Node数组
        Node<K,V>[] oldTab = table;
        // 旧容量
        int oldCap = (oldTab == null) ? 0 : oldTab.length;
        // 旧阈值
        int oldThr = threshold;
        int newCap, newThr = 0;
        if (oldCap > 0) {
            if (oldCap >= MAXIMUM_CAPACITY) {
                threshold = Integer.MAX_VALUE;
                return oldTab;
            }
            else if ((newCap = oldCap << 1) < MAXIMUM_CAPACITY &&
                     oldCap >= DEFAULT_INITIAL_CAPACITY)
                newThr = oldThr << 1; // double threshold
        }
        else if (oldThr > 0) // initial capacity was placed in threshold
            // 旧容量为0，但是旧阈值大于0，说明这个值是 map初始化容量值暂存的
            newCap = oldThr;
        else {
            // zero initial threshold signifies using defaults
            // 当oldThr==0时，也就是使用无参构造函数时
            // 初始容量：16，阈值 16*0.75 = 12
            newCap = DEFAULT_INITIAL_CAPACITY;
            newThr = (int)(DEFAULT_LOAD_FACTOR * DEFAULT_INITIAL_CAPACITY);
        }
        if (newThr == 0) {
            // 当oldThr代表的是容量的时候，是没有阈值的，需要我们重新计算
            float ft = (float)newCap * loadFactor;
            // 如果负载因子不是0.75，时别的小数呢？阈值向下取整，保证到达阈值一定能resize
            // 同理上面 map参数初始化，根据map.size计算容量向上取整，保证达到既定容量不会触发resize
            newThr = (newCap < MAXIMUM_CAPACITY && ft < (float)MAXIMUM_CAPACITY ?
                      (int)ft : Integer.MAX_VALUE);
        }
        threshold = newThr;
        @SuppressWarnings({"rawtypes","unchecked"})
        // 根据新容量创建数组
        Node<K,V>[] newTab = (Node<K,V>[])new Node[newCap];
        // table指向扩容后的新数组
        table = newTab;
        // 如果oldTab不为空，那我们要拷贝数据
        if (oldTab != null) {
            // 遍历oldTab
            for (int j = 0; j < oldCap; ++j) {
                Node<K,V> e;
                // Node【e】指向当前循环节点（在构造Node节点对象时，hash已经计算好了）
                if ((e = oldTab[j]) != null) {
                    // oldTab相应下表数据置null，GC
                    oldTab[j] = null;
                    if (e.next == null)
                        // 如果Node不是链表
                        // e.hash & (newCap -1) 计算对应下标，这里也就印证了为什么容量要是2的幂次方
                        // e.hash % length 当 length 为 2幂次方时 操作等价于 e.hash & (newCap-1)
                        newTab[e.hash & (newCap - 1)] = e;
                    else if (e instanceof TreeNode)
                        // 如果节点是红黑树节点
                        ((TreeNode<K,V>)e).split(this, newTab, j, oldCap);
                    else { // preserve order
                        // 如果节点是链表
                        // 分出高，低位链表
                        Node<K,V> loHead = null, loTail = null;
                        Node<K,V> hiHead = null, hiTail = null;
                        Node<K,V> next;
                        do {
                            next = e.next;
                            // 判断是不是原数组的位置
                            if ((e.hash & oldCap) == 0) {
                                if (loTail == null)
                                    loHead = e;
                                else
                                    loTail.next = e;
                                loTail = e;
                            }
                            else {
                                if (hiTail == null)
                                    hiHead = e;
                                else
                                    hiTail.next = e;
                                hiTail = e;
                            }
                        } while ((e = next) != null);
                        // 如果低位链表尾节点不为空，
                        if (loTail != null) {
                            loTail.next = null;
                            // 插入原来相应的位置
                            newTab[j] = loHead;
                        }
                        // 如果低位链表尾节点不为空，
                        if (hiTail != null) {
                            hiTail.next = null;
                            // 指向新的位置
                            newTab[j + oldCap] = hiHead;
                        }
                    }
                }
            }
        }
        return newTab;
    }
```

### treeifyBin

如果元素数组为空 或者 数组长度小于 树结构化的最小限制
MIN_TREEIFY_CAPACITY 默认值 64，对于这个值可以理解为：如果元素数组长度小于这个值，没有必要去进行结构转换
当一个数组位置上集中了多个键值对，那是因为这些 key 的 hash 值和数组长度取模之后结果相同。（并不是因为这些 key 的 hash 值相同）
因为 hash 值相同的概率不高，所以可以通过扩容的方式，来使得最终这些 key 的 hash 值在和新的数组长度取模之后，拆分到多个数组位置上。

```java
    final void treeifyBin(Node<K, V>[] tab, int hash) {
        int n, index;
        Node<K, V> e;
        if (tab == null || (n = tab.length) < MIN_TREEIFY_CAPACITY) {
            resize();
        } else if ((e = tab[index = (n - 1) & hash]) != null) {
            TreeNode<K, V> hd = null, tl = null;
            do {
                TreeNode<K, V> p = replacementTreeNode(e, null);
                if (tl == null) {
                    hd = p;
                } else {
                    p.prev = tl;
                    tl.next = p;
                }
                tl = p;
            } while ((e = e.next) != null);
            if ((tab[index] = hd) != null) {
                hd.treeify(tab);
            }
        }
    }

```

### removeNode

删除节点

```java
    /**
     * Implements Map.remove and related methods.
     *
     * @param hash hash for key
     * @param key the key
     * @param value the value to match if matchValue, else ignored
     * @param matchValue if true only remove if value is equal
     * @param movable if false do not move other nodes while removing
     * @return the node, or null if none
     */
    final Node<K,V> removeNode(int hash, Object key, Object value,
                               boolean matchValue, boolean movable) {
        Node<K,V>[] tab; Node<K,V> p; int n, index;
        // 如果table数组不为空 且 长度大于0 且 key所对应的节点对象不为空
        if ((tab = table) != null && (n = tab.length) > 0 &&
            // 顺便 tab指向table n指向数组长度 p指向节点对象
            (p = tab[index = (n - 1) & hash]) != null) {
            // 定义要返回node,下一个遍历节点e，key k，value v
            Node<K,V> node = null, e; K k; V v;
            // 如果当前节点的hash key 以及 key类型一致 将p赋值给node
            if (p.hash == hash &&
                ((k = p.key) == key || (key != null && key.equals(k))))
                node = p;
            // 如果e 不为空 那么就说明该hash值对应的节点已经拉链了
            else if ((e = p.next) != null) {
                // 如果 p 是 TreeNode的实例
                if (p instanceof TreeNode)
                    // TreeNode#getTreeNode获取node节点
                    node = ((TreeNode<K,V>)p).getTreeNode(hash, key);
                else {
                    // 最后只能是链表了
                    // 循环找链表
                    do {
                        if (e.hash == hash &&
                            ((k = e.key) == key ||
                             (key != null && key.equals(k)))) {
                            node = e;
                            break;
                        }
                        p = e;
                    } while ((e = e.next) != null);
                }
            }
            // 如果node 不为空 且 根据 matchValue 来判断是否需要值匹配 （值可能是对象也可能是基础类型）
            if (node != null && (!matchValue || (v = node.value) == value ||
                                 (value != null && value.equals(v)))) {
                // 如果是TreeNode类型
                if (node instanceof TreeNode)
                    ((TreeNode<K,V>)node).removeTreeNode(this, tab, movable);
                // 如果p就是Node 直接 tab[index]指向node.next 反正也是null
                else if (node == p)
                    tab[index] = node.next;
                // 链表更简单 p.next指向node.next就行了
                else
                    p.next = node.next;
                // 修改次数++
                // size--
                ++modCount;
                --size;
                // LinkedHashMap才会执行的方法，这里空实现
                afterNodeRemoval(node);
                // 返回node
                return node;
            }
        }
        // 返回null
        return null;
    }
```
