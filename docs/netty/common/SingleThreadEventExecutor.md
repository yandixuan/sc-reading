# SingleThreadEventExecutor

## 成员变量

```java
// 任务执行队列中等待的个数最大为16个
static final int DEFAULT_MAX_PENDING_EXECUTOR_TASKS = Math.max(16,
            SystemPropertyUtil.getInt("io.netty.eventexecutor.maxPendingTasks", Integer.MAX_VALUE));

// 未启动
private static final int ST_NOT_STARTED = 1;
// 已启动
private static final int ST_STARTED = 2;
// 平滑关闭中
private static final int ST_SHUTTING_DOWN = 3;
// 已关闭
private static final int ST_SHUTDOWN = 4;
// 已终止
private static final int ST_TERMINATED = 5;

private static final Runnable NOOP_TASK = new Runnable() {
    @Override
    public void run() {
        // Do nothing.
    }
};

private static final AtomicIntegerFieldUpdater<SingleThreadEventExecutor> STATE_UPDATER =
        AtomicIntegerFieldUpdater.newUpdater(SingleThreadEventExecutor.class, "state");
private static final AtomicReferenceFieldUpdater<SingleThreadEventExecutor, ThreadProperties> PROPERTIES_UPDATER =
        AtomicReferenceFieldUpdater.newUpdater(
                SingleThreadEventExecutor.class, ThreadProperties.class, "threadProperties");
// 待执行任务队列
private final Queue<Runnable> taskQueue;
// 当前执行器允许的线程
private volatile Thread thread;
@SuppressWarnings("unused")
private volatile ThreadProperties threadProperties;
// 具体的线程池
private final Executor executor;
// 线程是否被中断
private volatile boolean interrupted;

private final CountDownLatch threadLock = new CountDownLatch(1);
private final Set<Runnable> shutdownHooks = new LinkedHashSet<Runnable>();
// 如果为true时：添加一个任务就唤醒selector选择器
private final boolean addTaskWakesUp;
private final int maxPendingTasks;
private final RejectedExecutionHandler rejectedExecutionHandler;

private long lastExecutionTime;

@SuppressWarnings({ "FieldMayBeFinal", "unused" })
private volatile int state = ST_NOT_STARTED;

private volatile long gracefulShutdownQuietPeriod;
private volatile long gracefulShutdownTimeout;
private long gracefulShutdownStartTime;

private final Promise<?> terminationFuture = new DefaultPromise<Void>(GlobalEventExecutor.INSTANCE);

```

## 构造函数

```java
/**
 * Create a new instance
 *
 * @param parent            the {@link EventExecutorGroup} which is the parent of this instance and belongs to it
 * @param threadFactory     the {@link ThreadFactory} which will be used for the used {@link Thread}
 * @param addTaskWakesUp    {@code true} if and only if invocation of {@link #addTask(Runnable)} will wake up the
 *                          executor thread
 */

/**
 * parent: 属于哪个EventExecutorGroup
 * threadFactory: 线程工厂
 * addTaskWakesUp：true `addTask(Runnable)`会唤醒执行器线程
 */ 
protected SingleThreadEventExecutor(
        EventExecutorGroup parent, ThreadFactory threadFactory, boolean addTaskWakesUp) {
    this(parent, new ThreadPerTaskExecutor(threadFactory), addTaskWakesUp);
}

/**
 * Create a new instance
 *
 * @param parent            the {@link EventExecutorGroup} which is the parent of this instance and belongs to it
 * @param threadFactory     the {@link ThreadFactory} which will be used for the used {@link Thread}
 * @param addTaskWakesUp    {@code true} if and only if invocation of {@link #addTask(Runnable)} will wake up the
 *                          executor thread
 * @param maxPendingTasks   the maximum number of pending tasks before new tasks will be rejected.
 * @param rejectedHandler   the {@link RejectedExecutionHandler} to use.
 */
protected SingleThreadEventExecutor(
        EventExecutorGroup parent, ThreadFactory threadFactory,
        boolean addTaskWakesUp, int maxPendingTasks, RejectedExecutionHandler rejectedHandler) {
    this(parent, new ThreadPerTaskExecutor(threadFactory), addTaskWakesUp, maxPendingTasks, rejectedHandler);
}

/**
 * Create a new instance
 *
 * @param parent            the {@link EventExecutorGroup} which is the parent of this instance and belongs to it
 * @param executor          the {@link Executor} which will be used for executing
 * @param addTaskWakesUp    {@code true} if and only if invocation of {@link #addTask(Runnable)} will wake up the
 *                          executor thread
 */
protected SingleThreadEventExecutor(EventExecutorGroup parent, Executor executor, boolean addTaskWakesUp) {
    this(parent, executor, addTaskWakesUp, DEFAULT_MAX_PENDING_EXECUTOR_TASKS, RejectedExecutionHandlers.reject());
}

/**
 * Create a new instance
 *
 * @param parent            the {@link EventExecutorGroup} which is the parent of this instance and belongs to it
 * @param executor          the {@link Executor} which will be used for executing
 * @param addTaskWakesUp    {@code true} if and only if invocation of {@link #addTask(Runnable)} will wake up the
 *                          executor thread
 * @param maxPendingTasks   the maximum number of pending tasks before new tasks will be rejected.
 * @param rejectedHandler   the {@link RejectedExecutionHandler} to use.
 */
protected SingleThreadEventExecutor(EventExecutorGroup parent, Executor executor,
                                    boolean addTaskWakesUp, int maxPendingTasks,
                                    RejectedExecutionHandler rejectedHandler) {
    super(parent);
    this.addTaskWakesUp = addTaskWakesUp;
    this.maxPendingTasks = Math.max(16, maxPendingTasks);
    this.executor = ThreadExecutorMap.apply(executor, this);
    taskQueue = newTaskQueue(this.maxPendingTasks);
    rejectedExecutionHandler = ObjectUtil.checkNotNull(rejectedHandler, "rejectedHandler");
}

protected SingleThreadEventExecutor(EventExecutorGroup parent, Executor executor,
                                    boolean addTaskWakesUp, Queue<Runnable> taskQueue,
                                    RejectedExecutionHandler rejectedHandler) {
    super(parent);
    this.addTaskWakesUp = addTaskWakesUp;
    this.maxPendingTasks = DEFAULT_MAX_PENDING_EXECUTOR_TASKS;
    // 这里对runnable做了个代理，将当前执行的eventExecutor绑定到FastThreadLocal中
    this.executor = ThreadExecutorMap.apply(executor, this);
    this.taskQueue = ObjectUtil.checkNotNull(taskQueue, "taskQueue");
    this.rejectedExecutionHandler = ObjectUtil.checkNotNull(rejectedHandler, "rejectedHandler");
}
```

## 方法

### newTaskQueue

```java
/**
 * @deprecated Please use and override {@link #newTaskQueue(int)}.
 */
@Deprecated
protected Queue<Runnable> newTaskQueue() {
    return newTaskQueue(maxPendingTasks);
}

/**
 * Create a new {@link Queue} which will holds the tasks to execute. This default implementation will return a
 * {@link LinkedBlockingQueue} but if your sub-class of {@link SingleThreadEventExecutor} will not do any blocking
 * calls on the this {@link Queue} it may make sense to {@code @Override} this and return some more performant
 * implementation that does not support blocking operations at all.
 */
protected Queue<Runnable> newTaskQueue(int maxPendingTasks) {
    // 默认使用的是JDK的阻塞队列
    // 实际上用的是JcTool的非阻塞队列进行覆盖的（netty追求极致的性能）
    return new LinkedBlockingQueue<Runnable>(maxPendingTasks);
}
```

### addTask

```java
protected void addTask(Runnable task) {
    // 检查非空
    ObjectUtil.checkNotNull(task, "task");

    if (!offerTask(task)) {
        reject(task);
    }
}
```

### offerTask

```java
final boolean offerTask(Runnable task) {
    // 如果执行器处于关闭状态，禁止向任务队列添加任务    
    if (isShutdown()) {
        reject();
    }
    // 向队列插入任务，返回结果
    return taskQueue.offer(task);
}
```

### runAllTasks()

不断从定时任务队列获取即将过期任务放入taskQueue，然后

```java
/**
  * Poll all tasks from the task queue and run them via {@link Runnable#run()} method.
  *
  * @return {@code true} if and only if at least one task was run
  */
protected boolean runAllTasks() {
    assert inEventLoop();
    boolean fetchedAll;
    boolean ranAtLeastOne = false;
    // 死循环
    do {
        fetchedAll = fetchFromScheduledTaskQueue();
        if (runAllTasksFrom(taskQueue)) {
            ranAtLeastOne = true;
        }
        // fetchedAll为false终止循环
    } while (!fetchedAll); // keep on processing until we fetched all scheduled tasks.

    if (ranAtLeastOne) {
        lastExecutionTime = getCurrentTimeNanos();
    }
    afterRunningAllTasks();
    return ranAtLeastOne;
}
```

### fetchFromScheduledTaskQueue

```java
private boolean fetchFromScheduledTaskQueue() {
    // 定时任务队列为空就返回true
    if (scheduledTaskQueue == null || scheduledTaskQueue.isEmpty()) {
        return true;
    }
    // 获取当前系统相对时间
    long nanoTime = getCurrentTimeNanos();
    for (;;) {
        Runnable scheduledTask = pollScheduledTask(nanoTime);
        if (scheduledTask == null) {
            return true;
        }
        // 如果任务队列容量满了无法添加任务即将定时任务重新放回定时任务队列
        if (!taskQueue.offer(scheduledTask)) {
            // No space left in the task queue add it back to the scheduledTaskQueue so we pick it up again.
            scheduledTaskQueue.add((ScheduledFutureTask<?>) scheduledTask);
            // 返回false继续`runAllTasks`的循环
            return false;
        }
    }
}
```

### pollScheduledTask

```java
/**
 * Return the {@link Runnable} which is ready to be executed with the given {@code nanoTime}.
 * You should use {@link #getCurrentTimeNanos()} to retrieve the correct {@code nanoTime}.
 */
protected final Runnable pollScheduledTask(long nanoTime) {
    assert inEventLoop();
    // 取定时任务队列第一个元素，如果系统的相对时间还没到截止时间即返回null
    ScheduledFutureTask<?> scheduledTask = peekScheduledTask();
    if (scheduledTask == null || scheduledTask.deadlineNanos() - nanoTime > 0) {
        return null;
    }
    // 定时任务队列移除第一个元素
    scheduledTaskQueue.remove();
    // 如果定时任务是一次性的 设置已消费
    scheduledTask.setConsumed();
    // 返回任务
    return scheduledTask;
}
```

### runAllTasksFrom

```java
/**
    * Runs all tasks from the passed {@code taskQueue}.
    *
    * @param taskQueue To poll and execute all tasks.
    *
    * @return {@code true} if at least one task was executed.
    */
protected final boolean runAllTasksFrom(Queue<Runnable> taskQueue) {
    Runnable task = pollTaskFrom(taskQueue);
    if (task == null) {
        return false;
    }
    // 死循环
    for (;;) {
        safeExecute(task);
        task = pollTaskFrom(taskQueue);
        if (task == null) {
            return true;
        }
    }
}
```

### pollTaskFrom

```java
protected static Runnable pollTaskFrom(Queue<Runnable> taskQueue) {
    for (;;) {
        Runnable task = taskQueue.poll();
        if (task != WAKEUP_TASK) {
            return task;
        }
    }
}
```

### runAllTasks(long timeoutNanos)

```java


/**
  * Poll all tasks from the task queue and run them via {@link Runnable#run()} method.  This method stops running
  * the tasks in the task queue and returns if it ran longer than {@code timeoutNanos}.
  */
protected boolean runAllTasks(long timeoutNanos) {
    fetchFromScheduledTaskQueue();
    Runnable task = pollTask();
    if (task == null) {
        afterRunningAllTasks();
        return false;
    }

    final long deadline = timeoutNanos > 0 ? getCurrentTimeNanos() + timeoutNanos : 0;
    long runTasks = 0;
    long lastExecutionTime;
    for (;;) {
        safeExecute(task);

        runTasks ++;

        // Check timeout every 64 tasks because nanoTime() is relatively expensive.
        // XXX: Hard-coded value - will make it configurable if it is really a problem.
        if ((runTasks & 0x3F) == 0) {
            lastExecutionTime = getCurrentTimeNanos();
            if (lastExecutionTime >= deadline) {
                break;
            }
        }

        task = pollTask();
        if (task == null) {
            lastExecutionTime = getCurrentTimeNanos();
            break;
        }
    }

    afterRunningAllTasks();
    this.lastExecutionTime = lastExecutionTime;
    return true;
}
```
