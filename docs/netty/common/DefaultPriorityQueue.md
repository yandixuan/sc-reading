# DefaultPriorityQueue

一个具有优先级排序功能的队列

```java
public final class DefaultPriorityQueue<T extends PriorityQueueNode> extends AbstractQueue<T>
                                                                     implements PriorityQueue<T> {

}                                                                      
```

## 属性

```java
  //比较器，用来比较元素优先级(大小)
  private final Comparator<T> comparator;
  //存储队列中元素的数组
  private T[] queue;
  //队列中元素的数量
  private int size;
```

## 方法

### offer

向queue中添加元素

```java
@Override
public boolean offer(T e) {
  // 如果当前元素的index不是INDEX_NOT_IN_QUEUE，说明已经加入过队列
  if (e.priorityQueueIndex(this) != INDEX_NOT_IN_QUEUE) {
      // 抛出异常
      throw new IllegalArgumentException("e.priorityQueueIndex(): " + e.priorityQueueIndex(this) +
              " (expected: " + INDEX_NOT_IN_QUEUE + ") + e: " + e);
  }
  
  // Check that the array capacity is enough to hold values by doubling capacity.
  if (size >= queue.length) {
      // Use a policy which allows for a 0 initial capacity. Same policy as JDK's priority queue, double when
      // "small", then grow by 50% when "large".
      // 这里采用的策略是小的时候增大一倍，如果大的时候则增大50%
      queue = Arrays.copyOf(queue, queue.length + ((queue.length < 64) ?
                                                    (queue.length + 2) :
                                                    (queue.length >>> 1)));
  }
  // 加入到队列（先赋值后++)
  bubbleUp(size++, e);
  return true;
}
```

### poll

从队列取出第一个元素

```java
@Override
public T poll() {
    if (size == 0) {
        return null;
    }
    // 取出第一个任务
    T result = queue[0];
    // 将任务标志为不在队列中
    result.priorityQueueIndex(this, INDEX_NOT_IN_QUEUE);
    // 取出最后一个元素 相当于删除最后一个节点
    T last = queue[--size];
    queue[size] = null;
    // 不存在节点了，就无须进行交换维持小顶堆
    if (size != 0) { // Make sure we don't add the last element back.
        // 默认last为堆顶位置然后进行沉降维持小顶堆特性
        bubbleDown(0, last);
    }

    return result;
}
```

### peek

取出队列的第一个元素，没有返回null

```java
@Override
public T peek() {
    return (size == 0) ? null : queue[0];
}
```

### clear

### contains

```java
@Override
public boolean contains(Object o) {
    if (!(o instanceof PriorityQueueNode)) {
        return false;
    }
    PriorityQueueNode node = (PriorityQueueNode) o;
    return contains(node, node.priorityQueueIndex(this));
}

@Override
public boolean containsTyped(T node) {
    return contains(node, node.priorityQueueIndex(this));
}

private boolean contains(PriorityQueueNode node, int i) {
    return i >= 0 && i < size && node.equals(queue[i]);
}
```

### bubbleUp

这里排序的方式是用小顶堆实现的

![小顶堆](/Min-Heap-with-nodes-marked.png)
`

- 每个结点的左孩子为下标i的2倍加1：left child(i) = `i * 2 + 1`；每个结点的右孩子为下标i的2倍加2：`right child(i) = i * 2 + 2`
- 每个结点的父亲结点为下标的二分之一：parent(i) = `i / 2`，注意这里是整数除，2和3除以2都为1，大家可以验证一下；

```java
private void bubbleUp(int k, T node) {
    // k代表node的索引位置
    // node代表要向上冒泡维的节点
    while (k > 0) {
        /**
         * k是数组长度
         * k-1是最后一个元素的index
         * iparent是父节点的index
         */
        int iParent = (k - 1) >>> 1;
        // 根据iParent取值
        T parent = queue[iParent];

        // If the bubbleUp node is less than the parent, then we have found a spot to insert and still maintain
        // min-heap properties.
        /**
         * 小顶堆，如果比父节点大就break
         * netty中的任务由`ScheduledFutureTask`实现根据任务的截止时间进行排序，形成小顶堆
         */
        if (comparator.compare(node, parent) >= 0) {
            break;
        }

        // Bubble the parent down.
        // 如果node比parent小 即不满足小顶堆
        // 即parent节点与k处的node交换
        queue[k] = parent;
        // 设置node的priorityQueueIndex
        parent.priorityQueueIndex(this, k);

        // Move k up the tree for the next iteration.
        // 下次从iParent位置开始与父节点比较直到node比parent
        k = iParent;
    }

    // We have found where node should live and still satisfy the min-heap property, so put it in the queue.
    // 从循环退出之后，当前肯定满足小顶堆
    // 设置node在queue中的index
    queue[k] = node;
    node.priorityQueueIndex(this, k);
}
```

### bubbleDown

```java
private void bubbleDown(int k, T node) {
    // k代表node的索引位置
    // node代表向下冒泡的节点
    final int half = size >>> 1;
    // half代表最后一个节点对应的父节点，当k==half时代表树没节点了
    while (k < half) {
        // Compare node to the children of index k.
        // 找到k节点对应的左节点索引
        int iChild = (k << 1) + 1;
        // 左子节点 也是比对节点
        T child = queue[iChild];

        // Make sure we get the smallest child to compare against.
        // 右子节点索引
        int rightChild = iChild + 1;

        // 右子节点可能不存在要保证不越界
        // 要保证小顶堆 所以要比较左右节点
        // 如果左子节点比右子节点大
        if (rightChild < size && comparator.compare(child, queue[rightChild]) > 0) {
            // 比对节点换成右子节点
            child = queue[iChild = rightChild];
        }
        // If the bubbleDown node is less than or equal to the smallest child then we will preserve the min-heap
        // property by inserting the bubbleDown node here.
        // 如果node小于比对节点 就结束了
        if (comparator.compare(node, child) <= 0) {
            break;
        }

        // Bubble the child up.
        // 如果node节点比对比子节点要大
        queue[k] = child;
        // 父子节点替换
        child.priorityQueueIndex(this, k);
        // 下次开始从iChild位置判断左右子节点进行下沉
        // Move down k down the tree for the next iteration.
        k = iChild;
    }

    // We have found where node should live and still satisfy the min-heap property, so put it in the queue.
    // 设置堆顶节点位置
    queue[k] = node;
    node.priorityQueueIndex(this, k);
}
```

### removeTyped

```java
@Override
public boolean removeTyped(T node) {
    // 获取node在队列中的索引
    int i = node.priorityQueueIndex(this);
    // 判断node是否在队列中
    if (!contains(node, i)) {
        return false;
    }
    // 因为要移除，设置节点标志不在队列中
    node.priorityQueueIndex(this, INDEX_NOT_IN_QUEUE);
    // 如果size为0，或者当前节点的索引是最后一个节点 直接将数组对应索引置null，返回true即可
    if (--size == 0 || size == i) {
        // If there are no node left, or this is the last node in the array just remove and return.
        queue[i] = null;
        return true;
    }

    // Move the last element where node currently lives in the array.
    // 将待删除的节点与最后一个节点互换
    // 将最后一个节点设置成move要移动的
    T moved = queue[i] = queue[size];
    queue[size] = null;
    // priorityQueueIndex will be updated below in bubbleUp or bubbleDown

    // Make sure the moved node still preserves the min-heap properties.
    // 比较删除节点和待移动节点的大小决定 向上冒泡还是向下冒泡
    if (comparator.compare(node, moved) < 0) {
        bubbleDown(i, moved);
    } else {
        bubbleUp(i, moved);
    }
    return true;
}
```

### priorityChanged

当node节点的截止时间发生变化需要向上或向下冒泡

```java
@Override
public void priorityChanged(T node) {
    // 获取索引
    int i = node.priorityQueueIndex(this);
    // 判断节点是否在队列中
    if (!contains(node, i)) {
        return;
    }

    // Preserve the min-heap property by comparing the new priority with parents/children in the heap.
    if (i == 0) {
        bubbleDown(i, node);
    } else {
        // Get the parent to see if min-heap properties are violated.
        int iParent = (i - 1) >>> 1;
        T parent = queue[iParent];
        if (comparator.compare(node, parent) < 0) {
            bubbleUp(i, node);
        } else {
            bubbleDown(i, node);
        }
    }
}
```
