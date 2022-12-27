# PriorityQueue

PriorityQueue是基于堆的 有限队列，这个队列里面的元素按照顺序排列，排序规则可以是元素自己的排序规则，也可以在创建堆的时候创建一个比较器，用这个比较器的规则进行排序

## 属性

```java
    // 初始默认容量11
    private static final int DEFAULT_INITIAL_CAPACITY = 11;
    /**
     * Priority queue represented as a balanced binary heap: the two
     * children of queue[n] are queue[2*n+1] and queue[2*(n+1)].  The
     * priority queue is ordered by comparator, or by the elements'
     * natural ordering, if comparator is null: For each node n in the
     * heap and each descendant d of n, n <= d.  The element with the
     * lowest value is in queue[0], assuming the queue is nonempty.
     */
    // Object数组存储元素。 
    transient Object[] queue; // non-private to simplify nested class access

    /**
     * The number of elements in the priority queue.
     */
    // 元素的数量 
    private int size = 0;

    /**
     * The comparator, or null if priority queue uses elements'
     * natural ordering.
     */
    // 比较器 
    private final Comparator<? super E> comparator;

    /**
     * The number of times this priority queue has been
     * <i>structurally modified</i>.  See AbstractList for gory details.
     */
    // 被修改的次数
    transient int modCount = 0; // non-private to simplify nested class access
```

## 构造函数

```java
    /**
     * Creates a {@code PriorityQueue} with the default initial
     * capacity (11) that orders its elements according to their
     * {@linkplain Comparable natural ordering}.
     */
    public PriorityQueue() {
        this(DEFAULT_INITIAL_CAPACITY, null);
    }

    /**
     * Creates a {@code PriorityQueue} with the specified initial
     * capacity that orders its elements according to their
     * {@linkplain Comparable natural ordering}.
     *
     * @param initialCapacity the initial capacity for this priority queue
     * @throws IllegalArgumentException if {@code initialCapacity} is less
     *         than 1
     */
    public PriorityQueue(int initialCapacity) {
        this(initialCapacity, null);
    }

    /**
     * Creates a {@code PriorityQueue} with the default initial capacity and
     * whose elements are ordered according to the specified comparator.
     *
     * @param  comparator the comparator that will be used to order this
     *         priority queue.  If {@code null}, the {@linkplain Comparable
     *         natural ordering} of the elements will be used.
     * @since 1.8
     */
    public PriorityQueue(Comparator<? super E> comparator) {
        this(DEFAULT_INITIAL_CAPACITY, comparator);
    }

    /**
     * Creates a {@code PriorityQueue} with the specified initial capacity
     * that orders its elements according to the specified comparator.
     *
     * @param  initialCapacity the initial capacity for this priority queue
     * @param  comparator the comparator that will be used to order this
     *         priority queue.  If {@code null}, the {@linkplain Comparable
     *         natural ordering} of the elements will be used.
     * @throws IllegalArgumentException if {@code initialCapacity} is
     *         less than 1
     */
    public PriorityQueue(int initialCapacity,
                         Comparator<? super E> comparator) {
        // Note: This restriction of at least one is not actually needed,
        // but continues for 1.5 compatibility
        if (initialCapacity < 1)
            throw new IllegalArgumentException();
        this.queue = new Object[initialCapacity];
        this.comparator = comparator;
    }

    /**
     * Creates a {@code PriorityQueue} containing the elements in the
     * specified collection.  If the specified collection is an instance of
     * a {@link SortedSet} or is another {@code PriorityQueue}, this
     * priority queue will be ordered according to the same ordering.
     * Otherwise, this priority queue will be ordered according to the
     * {@linkplain Comparable natural ordering} of its elements.
     *
     * @param  c the collection whose elements are to be placed
     *         into this priority queue
     * @throws ClassCastException if elements of the specified collection
     *         cannot be compared to one another according to the priority
     *         queue's ordering
     * @throws NullPointerException if the specified collection or any
     *         of its elements are null
     */
    // 从其他集合初始化 PriorityQueue
    @SuppressWarnings("unchecked")
    public PriorityQueue(Collection<? extends E> c) {
        if (c instanceof SortedSet<?>) {
            SortedSet<? extends E> ss = (SortedSet<? extends E>) c;
            this.comparator = (Comparator<? super E>) ss.comparator();
            initElementsFromCollection(ss);
        }
        else if (c instanceof PriorityQueue<?>) {
            PriorityQueue<? extends E> pq = (PriorityQueue<? extends E>) c;
            this.comparator = (Comparator<? super E>) pq.comparator();
            initFromPriorityQueue(pq);
        }
        else {
            this.comparator = null;
            initFromCollection(c);
        }
    }
    /**
     * Creates a {@code PriorityQueue} containing the elements in the
     * specified priority queue.  This priority queue will be
     * ordered according to the same ordering as the given priority
     * queue.
     *
     * @param  c the priority queue whose elements are to be placed
     *         into this priority queue
     * @throws ClassCastException if elements of {@code c} cannot be
     *         compared to one another according to {@code c}'s
     *         ordering
     * @throws NullPointerException if the specified priority queue or any
     *         of its elements are null
     */
    @SuppressWarnings("unchecked")
    public PriorityQueue(PriorityQueue<? extends E> c) {
        this.comparator = (Comparator<? super E>) c.comparator();
        initFromPriorityQueue(c);
    }

    /**
     * Creates a {@code PriorityQueue} containing the elements in the
     * specified sorted set.   This priority queue will be ordered
     * according to the same ordering as the given sorted set.
     *
     * @param  c the sorted set whose elements are to be placed
     *         into this priority queue
     * @throws ClassCastException if elements of the specified sorted
     *         set cannot be compared to one another according to the
     *         sorted set's ordering
     * @throws NullPointerException if the specified sorted set or any
     *         of its elements are null
     */
    @SuppressWarnings("unchecked")
    public PriorityQueue(SortedSet<? extends E> c) {
        this.comparator = (Comparator<? super E>) c.comparator();
        initElementsFromCollection(c);
    }    
```

## 方法

### initFromCollection

```java
  /**
    * Initializes queue array with elements from the given Collection.
    *
    * @param c the collection
    */
  private void initFromCollection(Collection<? extends E> c) {
      initElementsFromCollection(c);
      // 堆化
      heapify();
  }
```

### initElementsFromCollection

```java
    private void initElementsFromCollection(Collection<? extends E> c) {
        // 把集合c转换为一个Object数组
        Object[] a = c.toArray();
        // 确保a是object类型数组
        if (c.getClass() != ArrayList.class)
            a = Arrays.copyOf(a, a.length, Object[].class);
        // 对数组的类型以及数组中间的元素进行检查，查看是否有null的，如果有就抛出异常，
        // 如果没有就把当前创建的优先队列对象的queue指向a
        int len = a.length;
        if (len == 1 || this.comparator != null)
            for (int i = 0; i < len; i++)
                if (a[i] == null)
                    throw new NullPointerException();
        this.queue = a;
        this.size = a.length;
    }
```

### heapify

```java
    /**
     * Establishes the heap invariant (described above) in the entire tree,
     * assuming nothing about the order of the elements prior to the call.
     */
    @SuppressWarnings("unchecked")
    private void heapify() {
        /**
         * 建堆的过程就是从非叶子结点开始，自底向上地将每个结点执行一次下降操作
         * 完全二叉树的非最后一个非叶子点index满足关系：index=length/2-1
         */
        for (int i = (size >>> 1) - 1; i >= 0; i--)
            siftDown(i, (E) queue[i]);
    }
```

### siftDown

节点下降操作

```java
    /**
     * Inserts item x at position k, maintaining heap invariant by
     * demoting x down the tree repeatedly until it is less than or
     * equal to its children or is a leaf.
     *
     * @param k the position to fill
     * @param x the item to insert
     */
    private void siftDown(int k, E x) {
        if (comparator != null)
            // 有比较器的时候用这个
            siftDownUsingComparator(k, x);
        else
            // 没有比较器的时候用这个
            siftDownComparable(k, x);
    }
```

### siftDownUsingComparator

```java
    private void siftDownUsingComparator(int k, E x) {
        // 根据完全二叉树性质，size / 2就是第一个叶子结点的坐标。
        int half = size >>> 1;
        // 当k>=half时处于叶子节点，无法进行下沉操作
        while (k < half) {
            // 2k+1，即左子节点
            int child = (k << 1) + 1;
            // 取出左子节点
            Object c = queue[child];
            // 取右子节点
            int right = child + 1;
            // 如果右子节点存在，比较左右子结点找出优先级更高的一个
            
            if (right < size &&
                comparator.compare((E) c, (E) queue[right]) > 0)
                // PriorityQueue默认是一个小顶堆,如果左节点比右子节点大则优先使用右子节点
                c = queue[child = right];
            // 如果父节点小于要比较的子节点即结束    
            if (comparator.compare(x, (E) c) <= 0)
                break;
            // 子节点换到父节点
            queue[k] = c;
            k = child;
            // 继续循环处理k节点
        }
        // 将x节点塞入下降的位置k
        queue[k] = x;
    }

```

### siftDownComparable

```java
    private void siftDownComparable(int k, E x) {
        // x强转Comparable进行比较，后续逻辑与比较器一样
        Comparable<? super E> key = (Comparable<? super E>)x;
        int half = size >>> 1;        // loop while a non-leaf
        while (k < half) {
            int child = (k << 1) + 1; // assume left child is least
            Object c = queue[child];
            int right = child + 1;
            if (right < size &&
                ((Comparable<? super E>) c).compareTo((E) queue[right]) > 0)
                c = queue[child = right];
            if (key.compareTo((E) c) <= 0)
                break;
            queue[k] = c;
            k = child;
        }
        queue[k] = key;
    }
```

### siftUp

```java
    /**
     * Inserts item x at position k, maintaining heap invariant by
     * promoting x up the tree until it is greater than or equal to
     * its parent, or is the root.
     *
     * To simplify and speed up coercions and comparisons. the
     * Comparable and Comparator versions are separated into different
     * methods that are otherwise identical. (Similarly for siftDown.)
     *
     * @param k the position to fill
     * @param x the item to insert
     */
    private void siftUp(int k, E x) {
        if (comparator != null)
            siftUpUsingComparator(k, x);
        else
            siftUpComparable(k, x);
    }
```

### siftUpUsingComparator

上升操作

```java
    private void siftUpUsingComparator(int k, E x) {
        while (k > 0) {
            /**
             * 父节点索引为(k-1)/2
             */
            int parent = (k - 1) >>> 1;
            // 父节点
            Object e = queue[parent];
            // 如果子节点大于父节点则不用上升则结束
            if (comparator.compare(x, (E) e) >= 0)
                break;
            // 子节点小于父节则父节点下降
            queue[k] = e;
            // 继续循环判断父节点处x节点是否需要上升，直到根节点
            k = parent;
        }
        // x节点放置k处
        queue[k] = x;
    }
```

### siftUpComparable

```java
    private void siftUpComparable(int k, E x) {
        Comparable<? super E> key = (Comparable<? super E>) x;
        while (k > 0) {
            int parent = (k - 1) >>> 1;
            Object e = queue[parent];
            if (key.compareTo((E) e) >= 0)
                break;
            queue[k] = e;
            k = parent;
        }
        queue[k] = key;
    }
```

### offer

入队元素，即从小顶堆尾部插入元素

```java
    /**
     * Inserts the specified element into this priority queue.
     *
     * @return {@code true} (as specified by {@link Queue#offer})
     * @throws ClassCastException if the specified element cannot be
     *         compared with elements currently in this priority queue
     *         according to the priority queue's ordering
     * @throws NullPointerException if the specified element is null
     */
    public boolean offer(E e) {
        // 如果需要插入的数据为 null 抛异常
        if (e == null)
            throw new NullPointerException();
        modCount++;
        int i = size;
        // 如果队列满了就扩容
        if (i >= queue.length)
            grow(i + 1);
        size = i + 1;
        // 如果队列里尚且没有元素，
        if (i == 0)
            // 就插入到队列头部，也就是堆的根节点
            queue[0] = e;
        else
             // 否则先插入尾部，然后通过shiftUp找到对应位置。
            siftUp(i, e);
        return true;
    }
```

### poll

元素出队即从小顶堆头部取元素

```java
    public E poll() {
        if (size == 0)
            return null;
        // 找到队尾元素索引，同时也自减了size
        int s = --size;
        modCount++;
        // 取出头结点
        E result = (E) queue[0];
        // 用队尾结点替代头结点
        E x = (E) queue[s];
        // 数组索引s处置空，gc
        queue[s] = null;
        if (s != 0)
            // 下拉到合适位置
            siftDown(0, x);
        return result;
    }
```
