# ScheduledFutureTask

Netty当中的异步任务，把逻辑封装到此类异步完成后获取结果

```java
final class ScheduledFutureTask<V> extends PromiseTask<V> implements ScheduledFuture<V>, PriorityQueueNode {
  
}
```

## 属性

```java
  
  // set once when added to priority queue
  // 任务id（加入到queue中就不会变了）
  private long id;

  // 任务执行的截止时间
  private long deadlineNanos;
  /**
   * 0: 执行一次任务就结束了
   * 大于0：以固定的频率重复执行
   * 小于0：每次任务执行完毕之后，间隔多长时间之后再次执行
   */
  /* 0 - no repeat, >0 - repeat at fixed rate, <0 - repeat with fixed delay */
  private final long periodNanos;
  
  // 当前任务是否在队列中标志
  private int queueIndex = INDEX_NOT_IN_QUEUE;

 
```

## 方法

### delayNanos

返回任务还有多少时间截止，表示要开始执行了

```java
  public long delayNanos() {
      // scheduledExecutor().getCurrentTimeNanos() 获取的是当前时间与类装载时间的差值 
      // 这个差值会随着时间慢慢变长,直到与deadlineNanos相同
      return delayNanos(scheduledExecutor().getCurrentTimeNanos());
  }

  public long delayNanos(long currentTimeNanos) {
      // 随着时间的推移差距和deadlineNanos会慢慢缩小，也就是到任务执行还有多少时间，最小值就是0（需要取出来立即执行了）
      return deadlineToDelayNanos(currentTimeNanos, deadlineNanos);
  }
```

### deadlineToDelayNanos

```java
  static long deadlineToDelayNanos(long currentTimeNanos, long deadlineNanos) {
      return deadlineNanos == 0L ? 0L : Math.max(0L, deadlineNanos - currentTimeNanos);
  }
```

### compareTo

```java
  @Override
  public int compareTo(Delayed o) {
      if (this == o) {
          return 0;
      }

      ScheduledFutureTask<?> that = (ScheduledFutureTask<?>) o;
      // 任务截止时间比较this、that
      // https://blog.csdn.net/u013066244/article/details/78997869
      long d = deadlineNanos() - that.deadlineNanos();
      if (d < 0) {
          // 当前任务时间截止越小 越排前面 即升序排列
          return -1;
      } else if (d > 0) {
          return 1;
      } else if (id < that.id) {
          // 时间相同，比较任务id
          return -1;
      } else {
          assert id != that.id;
          return 1;
      }
  }
```

### run

继承了``

```java
  @Override
  public void run() {
      // java内置关键字用于开发和测试阶段
      // 所以Netty的JMH 设置 -ea参数
      assert executor().inEventLoop();
      try {
          // 距离任务执行时间大于0，就是还没到执行时间，那么丢到scheduledExecutor的周期执行队列中
          if (delayNanos() > 0L) {
              // Not yet expired, need to add or remove from queue
              if (isCancelled()) {
                  // 取消了就移除
                  scheduledExecutor().scheduledTaskQueue().removeTyped(this);
              } else {
                  scheduledExecutor().scheduleFromEventLoop(this);
              }
              return;
          }
          // 如果periodNanos为0执行一次获取结果设置成功状态
          if (periodNanos == 0) {
              // 设置Promise不可取消
              if (setUncancellableInternal()) {
                  // 运行runable 或 callable
                  V result = runTask();
                  // CAS设置任务状态为完成
                  setSuccessInternal(result);
              }
          } else {
              // delayNanos==0的逻辑，要立即执行任务
              // check if is done as it may was cancelled
              // 检查任务没有有取消
              if (!isCancelled()) {
                  // 执行任务
                  runTask();
                  // 判断线程执行器有没有关闭
                  if (!executor().isShutdown()) {
                      // 根据periodNanos 确定任务的下次执行时间
                      if (periodNanos > 0) {
                           // scheduledExecutor().getCurrentTimeNanos()长度等于deadlineNanos，那么 + periodNanos，就是以固定频率去执行
                           // 不会关注任务的执行时间
                           deadlineNanos += periodNanos;
                      } else {
                          // periodNanos小于0
                          // scheduledExecutor().getCurrentTimeNanos()是一个动态长度，每次执行到这里说明任务执行完成了
                          // 更新长度，以当前的长度加一个固定delay，下次继续调度的时候还是去刷新 deadlineNanos长度从而达到了 以任务结束为准+固定delay去周期执行任务
                          deadlineNanos = scheduledExecutor().getCurrentTimeNanos() - periodNanos;
                      }
                      // 检查任务有没有取消
                      if (!isCancelled()) {
                          // 把当前任务加入任务队列
                          scheduledExecutor().scheduledTaskQueue().add(this);
                      }
                  }
              }
          }
      } catch (Throwable cause) {
          setFailureInternal(cause);
      }
  }
```

### cancel

```java
  /**
    * {@inheritDoc}
    *
    * @param mayInterruptIfRunning this value has no effect in this implementation.
    */
  @Override
  public boolean cancel(boolean mayInterruptIfRunning) {
      // 一直向上调用父类cancel方法
      // true：取消成功 false：取消是吧
      boolean canceled = super.cancel(mayInterruptIfRunning);
      if (canceled) {
          // 取消成功则，在scheduledExecutor中移除当前这个ScheduledFutureTask对象
          scheduledExecutor().removeScheduled(this);
      }
      return canceled;
  }
```
