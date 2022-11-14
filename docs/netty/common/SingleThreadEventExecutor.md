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
        // 如果返回true，说明至少运行了一个任务。反之则没有任务运行
        if (runAllTasksFrom(taskQueue)) {
            ranAtLeastOne = true;
        }
        // fetchedAll为false终止循环
    } while (!fetchedAll); // keep on processing until we fetched all scheduled tasks.

    if (ranAtLeastOne) {
        // 赋值，最近的执行时间
        lastExecutionTime = getCurrentTimeNanos();
    }
    // 提供子类覆盖方法，再所有taskQueue任务执行后进行调用
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
    // 任务可能为空
    Runnable task = pollTaskFrom(taskQueue);
    if (task == null) {
        // 任务为空即返回false
        return false;
    }
    // 死循环
    for (;;) {
        // 执行task的run方法
        safeExecute(task);
        // 继续从任务队列取任务
        task = pollTaskFrom(taskQueue);
        if (task == null) {
            // 没有任务即退出循环    
            return true;
        }
    }
}
```

### pollTaskFrom

```java
protected static Runnable pollTaskFrom(Queue<Runnable> taskQueue) {
    for (;;) {
        // 非阻塞从任务队列取任务，如果队列为空返回null
        Runnable task = taskQueue.poll();
        // 不是WAKEUP_TASK即返回task
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
    // 从定时任务队列取到期任务
    fetchFromScheduledTaskQueue();
    Runnable task = pollTask();
    // 如果没任务，执行尾任务队列的任务
    if (task == null) {
        afterRunningAllTasks();
        return false;
    }
    // 设置任务执行的截止时间，这个`timeoutNanos`是根据I/O比率算出来的
    final long deadline = timeoutNanos > 0 ? getCurrentTimeNanos() + timeoutNanos : 0;
    long runTasks = 0;
    long lastExecutionTime;
    for (;;) {
        // 执行任务
        safeExecute(task);
        // 计数递增
        runTasks ++;

        // Check timeout every 64 tasks because nanoTime() is relatively expensive.
        // XXX: Hard-coded value - will make it configurable if it is really a problem.
        // 64 & (64-1)==0（63的16进制即0x3F）
        // runTasks为64的倍数与0x3F的结果为0，所以是每隔64次任务检查一下时间
        if ((runTasks & 0x3F) == 0) {
            lastExecutionTime = getCurrentTimeNanos();
            // 大于截止时间，说明任务的执行时间到了要退出
            if (lastExecutionTime >= deadline) {
                break;
            }
        }
        // 继续从任务队列拉取任务
        task = pollTask();
        if (task == null) {
            // 设置执行器最近的执行时间
            lastExecutionTime = getCurrentTimeNanos();
            // 没任务了结束循环
            break;
        }
    }
    // 执行尾队列的任务
    afterRunningAllTasks();
    // 赋值
    this.lastExecutionTime = lastExecutionTime;
    return true;
}
```

### shutdownGracefully

线程优雅退出

[AbstractEventExecutorGroup.shutdownGracefully()](./AbstractEventExecutorGroup)

主要是修改状态、赋值静默，超时参数

```java
@Override
public Future<?> shutdownGracefully(long quietPeriod, long timeout, TimeUnit unit) {
    // 静待时间需要>=0
    ObjectUtil.checkPositiveOrZero(quietPeriod, "quietPeriod");
    // 超时时间不能小于静待时间
    if (timeout < quietPeriod) {
        throw new IllegalArgumentException(
                "timeout: " + timeout + " (expected >= quietPeriod (" + quietPeriod + "))");
    }
    ObjectUtil.checkNotNull(unit, "unit");
    // 必须设置时间单位
    if (isShuttingDown()) {
        return terminationFuture();
    }
    // 判断调用方法的线程是否在eventLoop中
    boolean inEventLoop = inEventLoop();
    // 是否唤醒线程
    boolean wakeup;
    int oldState;
    for (;;) {
        // 正在处于关闭中，返回`terminationFuture`
        if (isShuttingDown()) {
            return terminationFuture();
        }
        int newState;
        // 是否进行唤醒
        wakeup = true;
        // 获取执行器当前状态
        oldState = state;
        if (inEventLoop) {
            // 当前执行线程是自己即直接修改状态
            newState = ST_SHUTTING_DOWN;
        } else {
            // 这里是考虑多线程环境下调用shutdownGracefully的情况
            switch (oldState) {
                case ST_NOT_STARTED:
                case ST_STARTED:
                    // 设置新状态为关闭中
                    newState = ST_SHUTTING_DOWN;
                    break;
                default:
                    // 可能一个线程CAS需要改好了状态，但是这个线程卡在了`oldState = state;`处
                    newState = oldState;
                    // 已经有线程在进行唤醒了，此线程不需要唤醒
                    wakeup = false;
            }
        }
        // CAS保证修改状态的原子性
        if (STATE_UPDATER.compareAndSet(this, oldState, newState)) {
            break;
        }
    }
    // 进行赋值
    gracefulShutdownQuietPeriod = unit.toNanos(quietPeriod);
    gracefulShutdownTimeout = unit.toNanos(timeout);
    // 保证线程启动，发生异常会返回true
    if (ensureThreadStarted(oldState)) {
        return terminationFuture;
    }
    // 进行唤醒
    if (wakeup) {
        // 如果需要唤醒，则将WAKEUP_TASK放到队列中，来唤醒线程
        // DefaultEventExecutor中的run方法，就是使用queue.take阻塞式拉取任务
        taskQueue.offer(WAKEUP_TASK);
        if (!addTaskWakesUp) {
            // NioEvenetLoop覆盖了此方法，唤醒阻塞的selector
            wakeup(inEventLoop);
        }
    }
    // 返回future
    return terminationFuture();
}
```

### confirmShutdown

子类在实现模板方法run()时，须调用confirmShutdown()方法，不调用的话会有错误日志

```java
/**
 * Confirm that the shutdown if the instance should be done now!
 */
protected boolean confirmShutdown() {
    // 有的地方调用该方法的时候，没判断执行器的状态，所以判断一次
    if (!isShuttingDown()) {
        return false;
    }
    // 不是eventLoop的线程报异常
    if (!inEventLoop()) {
        throw new IllegalStateException("must be invoked from an event loop");
    }
    // 将每个定时任务设置成取消状态，并且定时任务队列size设置为0
    cancelScheduledTasks();

    if (gracefulShutdownStartTime == 0) {
        // 标记shutdown处理的开始时间
        gracefulShutdownStartTime = getCurrentTimeNanos();
    }
    // 运行tasksQueue或者shutdownHooks中的所有Runnable都处理完成
    if (runAllTasks() || runShutdownHooks()) {
        // 分析了下源码，isShutdown()这个只能是在外部线程调用了shutdown()接口的时候才会有可能成为true
        // 但是现在这个方法已经@Deprecated，所以这个if块是不会进入的
        if (isShutdown()) {
            // Executor shut down - no new tasks anymore.
            // shutdown 成功，没有更多的runnable需要执行
            return true;
        }

        // There were tasks in the queue. Wait a little bit more until no tasks are queued for the quiet period or
        // terminate if the quiet period is 0.
        // See https://github.com/netty/netty/issues/4241
        // quiet period为0即没有静默期，直接返回true
        if (gracefulShutdownQuietPeriod == 0) {
            return true;
        }
        // 还有任务没处理完，添加唤醒任务
        taskQueue.offer(WAKEUP_TASK);
        return false;
    }

    final long nanoTime = getCurrentTimeNanos();
    // runAllTasks() + runShutdownHooks()方法执行时间操作了最大限制
    if (isShutdown() || nanoTime - gracefulShutdownStartTime > gracefulShutdownTimeout) {
        return true;
    }
    // 现在时间与上个任务执行完成的时间差小于quietPeriod时间，继续检测
    if (nanoTime - lastExecutionTime <= gracefulShutdownQuietPeriod) {
        // Check if any tasks were added to the queue every 100ms.
        // TODO: Change the behavior of takeTask() so that it returns on timeout.
        // 唤醒 被 takeTask()阻塞的线程，让线程进入confirmShutdown方法
        taskQueue.offer(WAKEUP_TASK);
        try {
            // 线程睡100ms，看是不是有任务添加
            Thread.sleep(100);
        } catch (InterruptedException e) {
            // Ignore
        }
        // 返回false
        return false;
    }

    // No tasks were added for last quiet period - hopefully safe to shut down.
    // (Hopefully because we really cannot make a guarantee that there will be no execute() calls by a user.)
    // 在静默期没有任务添加了，直接返回true
    return true;
}
```

### execute(Runnable task, boolean immediate)

```java
private void execute(Runnable task, boolean immediate) {
    boolean inEventLoop = inEventLoop();
    // 将task丢入任务队列
    addTask(task);
    // 如果不是eventLoop线程调用则要考虑线程是否启动
    if (!inEventLoop) {
        // 确保线程的启动及状态的修改
        startThread();
        if (isShutdown()) {
            boolean reject = false;
            try {
                if (removeTask(task)) {
                    reject = true;
                }
            } catch (UnsupportedOperationException e) {
                // The task queue does not support removal so the best thing we can do is to just move on and
                // hope we will be able to pick-up the task before its completely terminated.
                // In worst case we will log on termination.
            }
            if (reject) {
                reject();
            }
        }
    }

    if (!addTaskWakesUp && immediate) {
        wakeup(inEventLoop);
    }
}
```

### startThread

```java
private void startThread() {
    // 对应线程是未启动状况下的处理
    if (state == ST_NOT_STARTED) {
        // cas修改
        if (STATE_UPDATER.compareAndSet(this, ST_NOT_STARTED, ST_STARTED)) {
            boolean success = false;
            try {
                // 启动线程
                doStartThread();
                success = true;
            } finally {
                if (!success) {
                    STATE_UPDATER.compareAndSet(this, ST_STARTED, ST_NOT_STARTED);
                }
            }
        }
    }
}
```

### doStartThread

```java
private void doStartThread() {
    assert thread == null;
    executor.execute(new Runnable() {
        @Override
        public void run() {
            // 获取当前线程
            thread = Thread.currentThread();
            // 检测中断线程标记
            if (interrupted) {
                thread.interrupt();
            }

            boolean success = false;
            // 更新最后一次执行时间
            updateLastExecutionTime();
            try {
                // 模板方法由子类实现
                // 在NioEventLoop的实现中即事件循环机制
                SingleThreadEventExecutor.this.run();
                success = true;
            } catch (Throwable t) {
                logger.warn("Unexpected exception from an event executor: ", t);
            } finally {
                // 如果run方法结束，要关闭执行器所以循环+CAS确保状态修改成ST_SHUTTING_DOWN。
                for (;;) {
                    int oldState = state;
                    if (oldState >= ST_SHUTTING_DOWN || STATE_UPDATER.compareAndSet(
                            SingleThreadEventExecutor.this, oldState, ST_SHUTTING_DOWN)) {
                        break;
                    }
                }

                // Check if confirmShutdown() was called at the end of the loop.
                // 打上警告，confirmShutdown()必须在run方法结束前调用
                if (success && gracefulShutdownStartTime == 0) {
                    if (logger.isErrorEnabled()) {
                        logger.error("Buggy " + EventExecutor.class.getSimpleName() + " implementation; " +
                                SingleThreadEventExecutor.class.getSimpleName() + ".confirmShutdown() must " +
                                "be called before run() implementation terminates.");
                    }
                }

                try {
                    // Run all remaining tasks and shutdown hooks. At this point the event loop
                    // is in ST_SHUTTING_DOWN state still accepting tasks which is needed for
                    // graceful shutdown with quietPeriod.
                    // 死循环执行confirmShutdown()以确保任务清空
                    for (;;) {
                        if (confirmShutdown()) {
                            break;
                        }
                    }

                    // Now we want to make sure no more tasks can be added from this point. This is
                    // achieved by switching the state. Any new tasks beyond this point will be rejected.
                    // 死循环+CAS让执行器为终止状态，同时也不再接受任务
                    for (;;) {
                        int oldState = state;
                        if (oldState >= ST_SHUTDOWN || STATE_UPDATER.compareAndSet(
                                SingleThreadEventExecutor.this, oldState, ST_SHUTDOWN)) {
                            break;
                        }
                    }

                    // We have the final set of tasks in the queue now, no more can be added, run all remaining.
                    // No need to loop here, this is the final pass.
                    // 清空任务，shutdowning还是可以继续提交任务的
                    confirmShutdown();
                } finally {
                    try {
                        // 清空资源
                        // NioEventLoop中关闭selector
                        cleanup();
                    } finally {
                        // Lets remove all FastThreadLocals for the Thread as we are about to terminate and notify
                        // the future. The user may block on the future and once it unblocks the JVM may terminate
                        // and start unloading classes.
                        // See https://github.com/netty/netty/issues/6596.
                        // 清空threadLocal
                        FastThreadLocal.removeAll();
                        // 设置执行状态为已终结
                        STATE_UPDATER.set(SingleThreadEventExecutor.this, ST_TERMINATED);
                        // awaitTermination的方法中，会使外部线程阻塞。这里进行线程恢复
                        threadLock.countDown();
                        // 打印任务队列还未执行完的任务数
                        int numUserTasks = drainTasks();
                        if (numUserTasks > 0 && logger.isWarnEnabled()) {
                            logger.warn("An event executor terminated with " +
                                    "non-empty task queue (" + numUserTasks + ')');
                        }
                        // 设置terminationFuture的成功状态
                        terminationFuture.setSuccess(null);
                    }
                }
            }
        }
    });
}
```
