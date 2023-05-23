# DefaultPromise

```java
public class DefaultPromise<V> extends AbstractFuture<V> implements Promise<V> {
  
}
```

:::tip 重要
`Promise` 是可写的 future, 因为 `java.util.concurrent.Future` 不支持写操作，因此 `Netty` 使用 `Promise` 扩展了 `java.util.concurrent.Future`,
可以对异步操作结果进行设置；可以对异步操作结果设置监听器
:::

[Future](./Future)

[Promise](./Promise)

## 成员变量

```java

  private static final int MAX_LISTENER_STACK_DEPTH = Math.min(8,
          SystemPropertyUtil.getInt("io.netty.defaultPromise.maxListenerStackDepth", 8));
  // 结果更新器，用于CAS更新结果result的值
  @SuppressWarnings("rawtypes")
  private static final AtomicReferenceFieldUpdater<DefaultPromise, Object> RESULT_UPDATER =
          AtomicReferenceFieldUpdater.newUpdater(DefaultPromise.class, Object.class, "result");
  // 用于填充result的值，当设置结果result传入null，Promise执行成功，用这个值去表示成功的结果
  private static final Object SUCCESS = new Object();
  // 用于填充result的值，表示Promise不能被取消
  private static final Object UNCANCELLABLE = new Object();
  // 持有当前任务 因异常取消的异常堆栈信息
  private static final CauseHolder CANCELLATION_CAUSE_HOLDER = new CauseHolder(
          StacklessCancellationException.newInstance(DefaultPromise.class, "cancel(...)"));
  // 异常栈信息元素数组        
  private static final StackTraceElement[] CANCELLATION_STACK = CANCELLATION_CAUSE_HOLDER.cause.getStackTrace();

  // 任务结果
  private volatile Object result;
  // 事件执行器，可以理解为单个调度线程
  private final EventExecutor executor;
  /**
    * One or more listeners. Can be a {@link GenericFutureListener} or a {@link DefaultFutureListeners}.
    * If {@code null}, it means either 1) no listeners were added yet or 2) all listeners were notified.
    *
    * Threading - synchronized(this). We must support adding listeners when there is no EventExecutor.
    */
  // 监听器集合，可能是单个GenericFutureListener实例或者DefaultFutureListeners（监听器集合）实例  
  private Object listeners;
  /**
    * Threading - synchronized(this). We are required to hold the monitor to use Java's underlying wait()/notifyAll().
    */
  // 等待获取结果的线程数量  
  private short waiters;

  /**
    * Threading - synchronized(this). We must prevent concurrent notification and FIFO listener notification if the
    * executor changes.
    */
  // 标记是否正在回调监听器  
  private boolean notifyingListeners;
```

### 内部类

```java
// 私有静态内部类，用于存放Throwable实例，也就是持有异常的原因的实例对象
private static final class CauseHolder {
    final Throwable cause;
    CauseHolder(Throwable cause) {
        this.cause = cause;
    }
}

// 私有静态内部类，用于覆盖CancellationException的栈信息为前面定义的CANCELLATION_STACK，同时覆盖了toString()返回CancellationException的全类名
private static final class StacklessCancellationException extends CancellationException {

    private static final long serialVersionUID = -2974906711413716191L;

    private StacklessCancellationException() { }

    // Override fillInStackTrace() so we not populate the backtrace via a native call and so leak the
    // Classloader.
    @Override
    public Throwable fillInStackTrace() {
        return this;
    }

    static StacklessCancellationException newInstance(Class<?> clazz, String method) {
        return ThrowableUtil.unknownStackTrace(new StacklessCancellationException(), clazz, method);
    }
}
```

## 构造方法

```java

```

## 方法

### setSuccess

设置结果值，如果CAS失败就抛出异常

[setSuccess0](./DefaultPromise#setsuccess0)

```java
  @Override
  public Promise<V> setSuccess(V result) {
      if (setSuccess0(result)) {
          return this;
      }
      throw new IllegalStateException("complete already: " + this);
  }

```

### trySuccess

顾名思义，尝试设置success。不抛出错误

```java
  @Override
  public boolean trySuccess(V result) {
      return setSuccess0(result);
  }
```

### setSuccess0

CAS设置result

```java
private boolean setSuccess0(V result) {
    return setValue0(result == null ? SUCCESS : result);
}
```

### setValue0

```java
private boolean setValue0(Object objResult) {
    // 对于成功来说有2种转变状态
    // null==>成功
    // 不可以取消==>成功
    // 所以尝试2种CAS设置result值
    if (RESULT_UPDATER.compareAndSet(this, null, objResult) ||
        RESULT_UPDATER.compareAndSet(this, UNCANCELLABLE, objResult)) {
        // 判断等待结果的线程数量存在调用`notifyListeners`  
        if (checkNotifyWaiters()) {
            // 调用 已经注册的监听器
            notifyListeners();
        }
        return true;
    }
    // cas失败返回false
    return false;
}
```

### notifyListeners

唤醒监听器

[由于封装或者人为编码异常等原因，监听器的回调可能出现基于多个Promise形成的链,造成StackOverflow](https://github.com/netty/netty/pull/5302)

```java
  private void notifyListeners() {
      // 获取Promise对应线程执行器（单线程）
      EventExecutor executor = executor();
      // 事件执行器必须在事件循环中，也就是executor.inEventLoop()为true的时候才启用递归栈深度保护
      if (executor.inEventLoop()) {
          // 获取当前线程绑定的InternalThreadLocalMap实例，这里类似于ThreadLocal
          final InternalThreadLocalMap threadLocals = InternalThreadLocalMap.get();
          // 获取当前线程的监听器调用栈深度
          final int stackDepth = threadLocals.futureListenerStackDepth();
          // 最大调用战深度 默认 `io.netty.defaultPromise.maxListenerStackDepth`配置，默认为8
          // 如果存在Promise嵌套执行，那么每个Promise都会调用`notifyListeners`方法 会形成递归调用加深栈调用的深度
          if (stackDepth < MAX_LISTENER_STACK_DEPTH) {
              threadLocals.setFutureListenerStackDepth(stackDepth + 1);
              try {
                  notifyListenersNow();
              } finally {
                  threadLocals.setFutureListenerStackDepth(stackDepth);
              }
              return;
          }
      }

      // 如果监听器调用栈深度超过阈值MAX_LISTENER_STACK_DEPTH，则直接每次通知监听器当成一个新的异步任务处理
      // 这里就是兜底的方法
      safeExecute(executor, new Runnable() {
          @Override
          public void run() {
              notifyListenersNow();
          }
      });
  }
```

### notifyListenersNow

notifyListenersNow在多线程环境下可能由多个线程调用，所以要加同步代码块

```java
  private void notifyListenersNow() {
      Object listeners;
      // 因为notifyListener0没加锁
      // 取出listener进行通知要加锁
      synchronized (this) {
          // Only proceed if there are listeners to notify and we are not already notifying listeners.
          if (notifyingListeners || this.listeners == null) {
              return;
          }
          notifyingListeners = true;
          listeners = this.listeners;
          this.listeners = null;
      }
      // 这里用死循环来控制，因为在通知期间可能还有listener加入。不断循环直到没有listener为止
      for (;;) {
          // listeners是Object对象类型
          // 1个用的是 GenericFutureListener
          // 多个是 DefaultFutureListeners
          // 所以存在类型判断
          if (listeners instanceof DefaultFutureListeners) {
              notifyListeners0((DefaultFutureListeners) listeners);
          } else {
              notifyListener0(this, (GenericFutureListener<?>) listeners);
          }
          // 
          synchronized (this) {
              if (this.listeners == null) {
                  // Nothing can throw from within this method, so setting notifyingListeners back to false does not
                  // need to be in a finally block.
                  notifyingListeners = false;
                  return;
              }
              listeners = this.listeners;
              this.listeners = null;
          }
      }
  }
```

### notifyListeners0

```java
  private void notifyListeners0(DefaultFutureListeners listeners) {
      GenericFutureListener<?>[] a = listeners.listeners();
      int size = listeners.size();
      for (int i = 0; i < size; i ++) {
          notifyListener0(this, a[i]);
      }
  }
```

### notifyListener0

就是一个监听者的回调，会catch异常

```java
  private static void notifyListener0(Future future, GenericFutureListener l) {
      try {
          l.operationComplete(future);
      } catch (Throwable t) {
          if (logger.isWarnEnabled()) {
              logger.warn("An exception was thrown by " + l.getClass().getName() + ".operationComplete()", t);
          }
      }
  }
```

### setFailure

### tryFailure

### setUncancellable

### isSuccess

### isCancellable

### cause

```java

@Override
public Throwable cause() {
    // 根据result结果获取异常
    return cause0(result);
}

private Throwable cause0(Object result) {
    // 如果不是CauseHolder的实例即没有异常返回null
    if (!(result instanceof CauseHolder)) {
        return null;
    }
    // 如果result是 CANCELLATION_CAUSE_HOLDER这个对象说明当前任务被取消了
    if (result == CANCELLATION_CAUSE_HOLDER) {
        // 将LeanCancellationException异常丢入CauseHolder对象中去，CAS更新 CANCELLATION_CAUSE_HOLDER对象
        // 
        CancellationException ce = new LeanCancellationException();
        if (RESULT_UPDATER.compareAndSet(this, CANCELLATION_CAUSE_HOLDER, new CauseHolder(ce))) {
            return ce;
        }
        // 因为result的引用的就是 `CANCELLATION_CAUSE_HOLDER`对象即返回result即可
        result = this.result;
    }
    // 任务执行出现异常返回cause属性
    return ((CauseHolder) result).cause;
}
```

### addListener

```java
@Override
public Promise<V> addListener(GenericFutureListener<? extends Future<? super V>> listener) {
    checkNotNull(listener, "listener");

    synchronized (this) {
        addListener0(listener);
    }
    // 如果任务执行完了
    if (isDone()) {
        // 手动进行通知
        notifyListeners();
    }

    return this;
}
```

### addListeners

```java
@Override
public Promise<V> addListeners(GenericFutureListener<? extends Future<? super V>>... listeners) {
    checkNotNull(listeners, "listeners");

    synchronized (this) {
        for (GenericFutureListener<? extends Future<? super V>> listener : listeners) {
            if (listener == null) {
                break;
            }
            // 判断类型今天添加 单个/多个就是DefaultFutureListeners
            addListener0(listener);
        }
    }
    // 如果任务执行完了
    if (isDone()) {
        // 手动进行通知
        notifyListeners();
    }

    return this;
}
```

### removeListener

加上同步块，可能由多个线程进行参与

都是调用`removeListener0`完成

```java
  @Override
  public Promise<V> removeListener(final GenericFutureListener<? extends Future<? super V>> listener) {
      checkNotNull(listener, "listener");

      synchronized (this) {
          // 也是单个/多个的判断；多个就是DefaultFutureListeners
          removeListener0(listener);
      }

      return this;
  }
```

### removeListeners

加上同步块，可能由多个线程进行参与

都是调用`removeListener0`完成

```java
  @Override
  public Promise<V> removeListeners(final GenericFutureListener<? extends Future<? super V>>... listeners) {
      checkNotNull(listeners, "listeners");

      synchronized (this) {
          for (GenericFutureListener<? extends Future<? super V>> listener : listeners) {
              if (listener == null) {
                  break;
              }
              removeListener0(listener);
          }
      }

      return this;
  }
```

### await

如果线程中断则抛出异常

```java
    @Override
    public Promise<V> await() throws InterruptedException {
        // 完成了即返回Promise
        if (isDone()) {
            return this;
        }
        // 线程的中断标识是true，然后调用wait的时候，立刻抛异常
        // 所以这里清除标记提前抛出异常
        if (Thread.interrupted()) {
            throw new InterruptedException(toString());
        }
        /**
         * 如果调用await的线程是EventLoop的线程，就是自己的话，自己等待自己唤醒 就死锁了。没人唤醒了
         */
        checkDeadLock();

        synchronized (this) {
            while (!isDone()) {
                // 计数器+1
                incWaiters();
                try {
                    // 通过object的锁机制进行，阻塞
                    wait();
                } finally {
                    // 唤醒后 计数器-1
                    decWaiters();
                }
            }
        }
        return this;
    }
```

### awaitUninterruptibly

等待Future完成不可中断，future完成后 给当前线程打上中断标记

```java
    @Override
    public Promise<V> awaitUninterruptibly() {
        if (isDone()) {
            return this;
        }

        checkDeadLock();

        boolean interrupted = false;
        synchronized (this) {
            while (!isDone()) {
                incWaiters();
                try {
                    wait();
                } catch (InterruptedException e) {
                    // Interrupted while waiting.
                    interrupted = true;
                } finally {
                    decWaiters();
                }
            }
        }
        /**
         * 当你捕获InterruptException并吞下它时，你基本上阻止任何更高级别的方法/线程组注意到中断。这可能会导致问题。
         * 通过调用Thread.currentThread().interrupt()，你可以设置线程的中断标志，因此更高级别的中断处理程序会注意到它并且可以正确处它。
         */  
        if (interrupted) {
            Thread.currentThread().interrupt();
        }

        return this;
    }
```

### await0

```java
private boolean await0(long timeoutNanos, boolean interruptable) throws InterruptedException {
    // 完成返回结果
    if (isDone()) {
        return true;
    }
    // 如果timeoutNanos小于0理解立即返回 `isDone()`
    if (timeoutNanos <= 0) {
        return isDone();
    }

    // 如果线程可中断，并且被打上标记 立即抛出异常
    if (interruptable && Thread.interrupted()) {
        throw new InterruptedException(toString());
    }
    // 检查死锁
    checkDeadLock();

    // Start counting time from here instead of the first line of this method,
    // to avoid/postpone performance cost of System.nanoTime().
    // 记录开始时间
    final long startTime = System.nanoTime();
    synchronized (this) {
        boolean interrupted = false;
        try {
            long waitTime = timeoutNanos;
            while (!isDone() && waitTime > 0) {
                incWaiters();
                try {
                    // 调用Object.wait(timeout,nanos) 
                    wait(waitTime / 1000000, (int) (waitTime % 1000000));
                } catch (InterruptedException e) {
                    if (interruptable) {
                        throw e;
                    } else {
                        interrupted = true;
                    }
                } finally {
                    decWaiters();
                }
                // Check isDone() in advance, try to avoid calculating the elapsed time later.
                if (isDone()) {
                    return true;
                }
                // Calculate the elapsed time here instead of in the while condition,
                // try to avoid performance cost of System.nanoTime() in the first loop of while.
                // 还剩多少事件
                waitTime = timeoutNanos - (System.nanoTime() - startTime);
            }
            // 等待时间结束了，返回`isDone`
            return isDone();
        } finally {
            /**
             * https://www.javaroad.cn/articles/1536
             * 当你捕获InterruptException并吞下它时，你基本上阻止任何更高级别的方法/线程组注意到中断。这可能会导致问题。
             * 通过调用Thread.currentThread().interrupt()，你可以设置线程的中断标志，因此更高级别的中断处理程序会注意到它并且可以正确处它。
             */    
            if (interrupted) {
                Thread.currentThread().interrupt();
            }
        }
    }
}
```
