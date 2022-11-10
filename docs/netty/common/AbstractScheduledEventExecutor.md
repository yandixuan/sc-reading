# AbstractScheduledEventExecutor

对`EventExecutor`对周期任务执行的抽象实现

```java
public abstract class AbstractScheduledEventExecutor extends AbstractEventExecutor {

}
```

## 属性

```java
// 根据ScheduledFutureTask的到期时间比较大小
// 到期时间长的大
private static final Comparator<ScheduledFutureTask<?>> SCHEDULED_FUTURE_TASK_COMPARATOR =
            new Comparator<ScheduledFutureTask<?>>() {
                @Override
                public int compare(ScheduledFutureTask<?> o1, ScheduledFutureTask<?> o2) {
                    return o1.compareTo(o2);
                }
            };
// 类装载时间
private static final long START_TIME = System.nanoTime();

// WAKEUP_TASK是个标记任务为了线程能正常退出
static final Runnable WAKEUP_TASK = new Runnable() {
       @Override
       public void run() { } // Do nothing
    };
// 周期任务执行队列
PriorityQueue<ScheduledFutureTask<?>> scheduledTaskQueue;

// 下一个任务的id
long nextTaskId;
```

## 方法

### deadlineToDelayNanos

计算距离deadlineNanos还剩多少时间（调用ScheduledFutureTask的方法）

```java
    /**
     * Given an arbitrary deadline {@code deadlineNanos}, calculate the number of nano seconds from now
     * {@code deadlineNanos} would expire.
     * @param deadlineNanos An arbitrary deadline in nano seconds.
     * @return the number of nano seconds from now {@code deadlineNanos} would expire.
     */
    protected static long deadlineToDelayNanos(long deadlineNanos) {
        return ScheduledFutureTask.deadlineToDelayNanos(defaultCurrentTimeNanos(), deadlineNanos);
    }
```

### initialNanoTime

`AbstractScheduledEventExecutor`这个类装载的时间

```java
    /**
     * The initial value used for delay and computations based upon a monatomic time source.
     * @return initial value used for delay and computations based upon a monatomic time source.
     */
    protected static long initialNanoTime() {
        return START_TIME;
    }
```

### ScheduledExecutorService里的实现

```java
    @Override
    public ScheduledFuture<?> schedule(Runnable command, long delay, TimeUnit unit) {
        // 检查空
        ObjectUtil.checkNotNull(command, "command");
        ObjectUtil.checkNotNull(unit, "unit");
        if (delay < 0) {
            delay = 0;
        }
        // 交由子类实现
        validateScheduled0(delay, unit);

        return schedule(new ScheduledFutureTask<Void>(
                this,
                command,
                deadlineNanos(getCurrentTimeNanos(), unit.toNanos(delay))));
    }

    @Override
    public <V> ScheduledFuture<V> schedule(Callable<V> callable, long delay, TimeUnit unit) {
        ObjectUtil.checkNotNull(callable, "callable");
        ObjectUtil.checkNotNull(unit, "unit");
        if (delay < 0) {
            delay = 0;
        }
        validateScheduled0(delay, unit);

        return schedule(new ScheduledFutureTask<V>(
                this, callable, deadlineNanos(getCurrentTimeNanos(), unit.toNanos(delay))));
    }

    @Override
    public ScheduledFuture<?> scheduleAtFixedRate(Runnable command, long initialDelay, long period, TimeUnit unit) {
        ObjectUtil.checkNotNull(command, "command");
        ObjectUtil.checkNotNull(unit, "unit");
        if (initialDelay < 0) {
            throw new IllegalArgumentException(
                    String.format("initialDelay: %d (expected: >= 0)", initialDelay));
        }
        if (period <= 0) {
            throw new IllegalArgumentException(
                    String.format("period: %d (expected: > 0)", period));
        }
        validateScheduled0(initialDelay, unit);
        validateScheduled0(period, unit);

        return schedule(new ScheduledFutureTask<Void>(
                this, command, deadlineNanos(getCurrentTimeNanos(), unit.toNanos(initialDelay)), unit.toNanos(period)));
    }

    @Override
    public ScheduledFuture<?> scheduleWithFixedDelay(Runnable command, long initialDelay, long delay, TimeUnit unit) {
        ObjectUtil.checkNotNull(command, "command");
        ObjectUtil.checkNotNull(unit, "unit");
        if (initialDelay < 0) {
            throw new IllegalArgumentException(
                    String.format("initialDelay: %d (expected: >= 0)", initialDelay));
        }
        if (delay <= 0) {
            throw new IllegalArgumentException(
                    String.format("delay: %d (expected: > 0)", delay));
        }

        validateScheduled0(initialDelay, unit);
        validateScheduled0(delay, unit);

        return schedule(new ScheduledFutureTask<Void>(
                this, command, deadlineNanos(getCurrentTimeNanos(), unit.toNanos(initialDelay)), -unit.toNanos(delay)));
    }
```

### schedule

```java
private <V> ScheduledFuture<V> schedule(final ScheduledFutureTask<V> task) {
  // 判断调用线程是否属于EventLoop
  if (inEventLoop()) {
      // 把任务丢到队列中去
      scheduleFromEventLoop(task);
  } else {
      // 如果不属于EventLoop的线程
      // 获取任务的截止时间
      final long deadlineNanos = task.deadlineNanos();
      // task will add itself to scheduled task queue when run if not expired
      // 在任务提交前的调用
      if (beforeScheduledTaskSubmitted(deadlineNanos)) {
          // 用eventExecutor线程立即去执行这个定时任务
          execute(task);
      } else {
          // 与execute类似，但不保证任务会在执行非延迟任务或执行程序关闭之前运行，默认实现只是委托给execute(Runnable)
          lazyExecute(task);
          // Second hook after scheduling to facilitate race-avoidance
          // afterScheduledTaskSubmitted表示在任务提交后的调用
          if (afterScheduledTaskSubmitted(deadlineNanos)) {
              // 唤醒阻塞队列
              execute(WAKEUP_TASK);
          }
      }
  }

  return task;
}
```

### scheduleFromEventLoop

```java
final void scheduleFromEventLoop(final ScheduledFutureTask<?> task) {
    // nextTaskId a long and so there is no chance it will overflow back to 0
    // 设置taskId 并且自增给下一个task用
    // 把任务放入小顶堆队列中
    scheduledTaskQueue().add(task.setId(++nextTaskId));
}
```

### scheduledTaskQueue

```java
PriorityQueue<ScheduledFutureTask<?>> scheduledTaskQueue() {
  // 惰性初始化
  if (scheduledTaskQueue == null) {
      // 使用`DefaultPriorityQueue`小顶堆队列 优化排序时间每次拿到截止时间最小的任务
      scheduledTaskQueue = new DefaultPriorityQueue<ScheduledFutureTask<?>>(
              SCHEDULED_FUTURE_TASK_COMPARATOR,
              // Use same initial capacity as java.util.PriorityQueue
              11);
  }
  return scheduledTaskQueue;
}
```

### removeScheduled

```java
final void removeScheduled(final ScheduledFutureTask<?> task) {
    assert task.isCancelled();
    if (inEventLoop()) {
        scheduledTaskQueue().removeTyped(task);
    } else {
        // task will remove itself from scheduled task queue when it runs
        lazyExecute(task);
    }
}
```
