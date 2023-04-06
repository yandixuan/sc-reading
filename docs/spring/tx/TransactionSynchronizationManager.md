# TransactionSynchronizationManager

事务同步管理器

## 属性

```java
    // 事务资源
    // 一个ThreadLocal属性，用于存放线程当前使用的数据库资源
    // value是一个Map<Object, Object>，key为某个数据源DataSource ，value实际上就是连接ConnectionHolder
    private static final ThreadLocal<Map<Object, Object>> resources =
            new NamedThreadLocal<>("Transactional resources");
    // 一个ThreadLocal属性，用于存放线程当前激活的事务同步器TransactionSynchronization
    // 每个线程都可以开启多个事物同步，用于在处理事务的各个阶段进行自定义扩展或者回调
    // TransactionSynchronization的同步回调功能类似于此前学习的@TransactionalEventListener
    private static final ThreadLocal<Set<TransactionSynchronization>> synchronizations =
            new NamedThreadLocal<>("Transaction synchronizations");
    // 一个ThreadLocal属性，用于存放线程当前的事务的名称
    private static final ThreadLocal<String> currentTransactionName =
            new NamedThreadLocal<>("Current transaction name");
    // 一个ThreadLocal属性，用于存放线程当前的事务的只读状态
    private static final ThreadLocal<Boolean> currentTransactionReadOnly =
            new NamedThreadLocal<>("Current transaction read-only status");
    // 一个ThreadLocal属性，用于存放线程当前的当前事务的隔离级别
    private static final ThreadLocal<Integer> currentTransactionIsolationLevel =
            new NamedThreadLocal<>("Current transaction isolation level");
    // 一个ThreadLocal属性，用于存放线程当前是否开启了事务
    private static final ThreadLocal<Boolean> actualTransactionActive =
            new NamedThreadLocal<>("Actual transaction active");
```

## 方法

### hasResource

```java
/**
 * Check if there is a resource for the given key bound to the current thread.
 * @param key the key to check (usually the resource factory)
 * @return if there is a value bound to the current thread
 * @see ResourceTransactionManager#getResourceFactory()
 */
public static boolean hasResource(Object key) {
    // 如有必要，解开给定的资源句柄，否则按原样返回给定的句柄，常用于从各种代理对象中获取原始对象
    Object actualKey = TransactionSynchronizationUtils.unwrapResourceIfNecessary(key);
    // 真正获取当前绑定的资源
    Object value = doGetResource(actualKey);
    return (value != null);
}
```

### doGetResource

```java
/**
 * Actually check the value of the resource that is bound for the given key.
 */
@Nullable
private static Object doGetResource(Object actualKey) {
    Map<Object, Object> map = resources.get();
    if (map == null) {
        return null;
    }
    // 根据key获取value
    Object value = map.get(actualKey);
    // Transparently remove ResourceHolder that was marked as void...
    // ResourceHolder 且 ResourceHolder isVoid==true 标志资源为空
    if (value instanceof ResourceHolder && ((ResourceHolder) value).isVoid()) {
        // 移除key 
        map.remove(actualKey);
        // Remove entire ThreadLocal if empty...
        if (map.isEmpty()) {
            // 如果map为空了 移除threadLocal
            resources.remove();
        }
        value = null;
    }
    // 返回值
    return value;
}
```

### bindResource

```java
/**
 * Bind the given resource for the given key to the current thread.
 * @param key the key to bind the value to (usually the resource factory)
 * @param value the value to bind (usually the active resource object)
 * @throws IllegalStateException if there is already a value bound to the thread
 * @see ResourceTransactionManager#getResourceFactory()
 */
public static void bindResource(Object key, Object value) throws IllegalStateException {
    // 尝试取出实际对象
    Object actualKey = TransactionSynchronizationUtils.unwrapResourceIfNecessary(key);
    Assert.notNull(value, "Value must not be null");
    Map<Object, Object> map = resources.get();
    // set ThreadLocal Map if none found
    if (map == null) {
        map = new HashMap<>();
        // threadLocal set value 初始化一次
        resources.set(map);
    }
    // map塞值
    Object oldValue = map.put(actualKey, value);
    // Transparently suppress a ResourceHolder that was marked as void...
    // ResourceHolder 且 ResourceHolder isVoid==true 标志资源为空
    if (oldValue instanceof ResourceHolder && ((ResourceHolder) oldValue).isVoid()) {
        oldValue = null;
    }
    // 如果oldValue不是空 说明oldValue已经跟当前线程绑定
    if (oldValue != null) {
        throw new IllegalStateException(
                "Already value [" + oldValue + "] for key [" + actualKey + "] bound to thread");
    }
}
```

### unbindResource

```java
/**
 * Unbind a resource for the given key from the current thread.
 * @param key the key to unbind (usually the resource factory)
 * @return the previously bound value (usually the active resource object)
 * @throws IllegalStateException if there is no value bound to the thread
 * @see ResourceTransactionManager#getResourceFactory()
 */
public static Object unbindResource(Object key) throws IllegalStateException {
    Object actualKey = TransactionSynchronizationUtils.unwrapResourceIfNecessary(key);
    // 解绑当前资源
    Object value = doUnbindResource(actualKey);
    if (value == null) {
        throw new IllegalStateException("No value for key [" + actualKey + "] bound to thread");
    }
    return value;
}
```

### doUnbindResource

```java
/**
 * Actually remove the value of the resource that is bound for the given key.
 */
@Nullable
private static Object doUnbindResource(Object actualKey) {
    //
    Map<Object, Object> map = resources.get();
    if (map == null) {
        return null;
    }
    Object value = map.remove(actualKey);
    // Remove entire ThreadLocal if empty...
    if (map.isEmpty()) {
        // threadLocal清空下防止内存泄漏
        resources.remove();
    }
    // Transparently suppress a ResourceHolder that was marked as void...
    if (value instanceof ResourceHolder && ((ResourceHolder) value).isVoid()) {
        value = null;
    }
    return value;
}
```

### initSynchronization

初始化同步事务，就是将synchronizations覆盖成空的LinkedHashSet

```java
/**
* Activate transaction synchronization for the current thread.
* Called by a transaction manager on transaction begin.
* @throws IllegalStateException if synchronization is already active
*/
public static void initSynchronization() throws IllegalStateException {
    if (isSynchronizationActive()) {
        throw new IllegalStateException("Cannot activate transaction synchronization - already active");
    }
    synchronizations.set(new LinkedHashSet<>());
}
```

### getSynchronizations

获取事务同步列表

```java
/**
 * Return an unmodifiable snapshot list of all registered synchronizations
 * for the current thread.
 * @return unmodifiable List of TransactionSynchronization instances
 * @throws IllegalStateException if synchronization is not active
 * @see TransactionSynchronization
 */
public static List<TransactionSynchronization> getSynchronizations() throws IllegalStateException {
    Set<TransactionSynchronization> synchs = synchronizations.get();
    if (synchs == null) {
        throw new IllegalStateException("Transaction synchronization is not active");
    }
    // Return unmodifiable snapshot, to avoid ConcurrentModificationExceptions
    // while iterating and invoking synchronization callbacks that in turn
    // might register further synchronizations.
    if (synchs.isEmpty()) {
        return Collections.emptyList();
    }
    else {
        // Sort lazily here, not in registerSynchronization.
        List<TransactionSynchronization> sortedSynchs = new ArrayList<>(synchs);
        // 根据ordered接口排序
        OrderComparator.sort(sortedSynchs);
        // 返回不可变List
        return Collections.unmodifiableList(sortedSynchs);
    }
}
```
