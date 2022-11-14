# NioEventLoop

事件循环执行器

## 属性

```java
  // selector 在 select 发生事件后，会把事件相关的 key 放入 selectedKeys 集合，当事件处理完后不会主动的从 selectedKeys 集合中删除，所以需要自行删除。
  // 记录socketChannel从Selector上注销的个数 达到256个 则需要将无效selectKey从SelectedKeys集合中清除掉
  private static final int CLEANUP_INTERVAL = 256; // XXX Hard-coded value, but won't need customization.
  // 是否禁用selectionKeySet优化
  private static final boolean DISABLE_KEY_SET_OPTIMIZATION =
          SystemPropertyUtil.getBoolean("io.netty.noKeySetOptimization", false);

  private static final int MIN_PREMATURE_SELECTOR_RETURNS = 3;
  // 标识Selector空轮询的阈值，当超过这个阈值的话则需要重构Selector
  // epoll bug，它会导致Selector空轮询，最终导致CPU 100%
  private static final int SELECTOR_AUTO_REBUILD_THRESHOLD;

  private final IntSupplier selectNowSupplier = new IntSupplier() {
      @Override
      public int get() throws Exception {
          return selectNow();
      }
  };

  // Workaround for JDK NIO bug.
  //
  // See:
  // - https://bugs.openjdk.java.net/browse/JDK-6427854 for first few dev (unreleased) builds of JDK 7
  // - https://bugs.openjdk.java.net/browse/JDK-6527572 for JDK prior to 5.0u15-rev and 6u10
  // - https://github.com/netty/netty/issues/203
  static {
      if (PlatformDependent.javaVersion() < 7) {
          final String key = "sun.nio.ch.bugLevel";
          final String bugLevel = SystemPropertyUtil.get(key);
          if (bugLevel == null) {
              try {
                  AccessController.doPrivileged(new PrivilegedAction<Void>() {
                      @Override
                      public Void run() {
                          System.setProperty(key, "");
                          return null;
                      }
                  });
              } catch (final SecurityException e) {
                  logger.debug("Unable to get/set System Property: " + key, e);
              }
          }
      }
      // 但是如果指定的io.netty.selectorAutoRebuildThreshold小于3在Netty中被视为关闭了该功能
      int selectorAutoRebuildThreshold = SystemPropertyUtil.getInt("io.netty.selectorAutoRebuildThreshold", 512);
      if (selectorAutoRebuildThreshold < MIN_PREMATURE_SELECTOR_RETURNS) {
          selectorAutoRebuildThreshold = 0;
      }

      SELECTOR_AUTO_REBUILD_THRESHOLD = selectorAutoRebuildThreshold;

      if (logger.isDebugEnabled()) {
          logger.debug("-Dio.netty.noKeySetOptimization: {}", DISABLE_KEY_SET_OPTIMIZATION);
          logger.debug("-Dio.netty.selectorAutoRebuildThreshold: {}", SELECTOR_AUTO_REBUILD_THRESHOLD);
      }
  }

  /**
    * The NIO {@link Selector}.
    */
  private Selector selector;
  private Selector unwrappedSelector;
  private SelectedSelectionKeySet selectedKeys;

  private final SelectorProvider provider;

  private static final long AWAKE = -1L;
  private static final long NONE = Long.MAX_VALUE;

  // nextWakeupNanos is:
  //    AWAKE            when EL is awake
  //    NONE             when EL is waiting with no wakeup scheduled
  //    other value T    when EL is waiting with wakeup scheduled at time T
  private final AtomicLong nextWakeupNanos = new AtomicLong(AWAKE);

  private final SelectStrategy selectStrategy;

  private volatile int ioRatio = 50;
  private int cancelledKeys;
  private boolean needsToSelectAgain;
```

### openSelector

`SelectorTuple`只是包装了原生的Selector、优化过的Selector

```java
private SelectorTuple openSelector() {
    final Selector unwrappedSelector;
    try {
        // 获取系统对应的提供的selector实现(epoll——linux、poll——MacOS)
        unwrappedSelector = provider.openSelector();
    } catch (IOException e) {
        throw new ChannelException("failed to open a new selector", e);
    }
    // 是否禁止了selectorKey的优化
    if (DISABLE_KEY_SET_OPTIMIZATION) {
        return new SelectorTuple(unwrappedSelector);
    }
    // 加载sun.nio.ch.SelectorImpl的class信息
    Object maybeSelectorImplClass = AccessController.doPrivileged(new PrivilegedAction<Object>() {
        @Override
        public Object run() {
            try {
                return Class.forName(
                        "sun.nio.ch.SelectorImpl",
                        false,
                        PlatformDependent.getSystemClassLoader());
            } catch (Throwable cause) {
                return cause;
            }
        }
    });

    if (!(maybeSelectorImplClass instanceof Class) ||
        // ensure the current selector implementation is what we can instrument.
        // 确保当前的selector的实现类能被我们加强
        !((Class<?>) maybeSelectorImplClass).isAssignableFrom(unwrappedSelector.getClass())) {
        if (maybeSelectorImplClass instanceof Throwable) {
            Throwable t = (Throwable) maybeSelectorImplClass;
            logger.trace("failed to instrument a special java.util.Set into: {}", unwrappedSelector, t);
        }
        // 如果不能加强，返回原生未包装的selector
        return new SelectorTuple(unwrappedSelector);
    }
    // 如果是异常，直接不进行下一步的selector优化
    // 如果是Class且是系统所提供的selector的class，则进行Netty的selector优化
    final Class<?> selectorImplClass = (Class<?>) maybeSelectorImplClass;
    // 使用Netty的自定义实现的selectedKeySet(本质是一个数组)提升了迭代效率
    final SelectedSelectionKeySet selectedKeySet = new SelectedSelectionKeySet();

    Object maybeException = AccessController.doPrivileged(new PrivilegedAction<Object>() {
        @Override
        public Object run() {
            try {
                // 反射获取`selectedKeys`、`publicSelectedKeys`字段
                Field selectedKeysField = selectorImplClass.getDeclaredField("selectedKeys");
                Field publicSelectedKeysField = selectorImplClass.getDeclaredField("publicSelectedKeys");
                // JDK9模块化以后，因sun.nio.ch模块的不可见性，反射会进行检查可访问性会抛异常
                // --add-exports java.base/sun.nio.ch=ALL-UNNAMED，增加这个参数，以解决模块化后不可见的问题
                // 所以如果9版本以上并且存在Unsafe类使用unsafe类设置unwrappedSelector的`selectedKeys`、`publicSelectedKeys`字段
                if (PlatformDependent.javaVersion() >= 9 && PlatformDependent.hasUnsafe()) {
                    // Let us try to use sun.misc.Unsafe to replace the SelectionKeySet.
                    // This allows us to also do this in Java9+ without any extra flags.
                    long selectedKeysFieldOffset = PlatformDependent.objectFieldOffset(selectedKeysField);
                    long publicSelectedKeysFieldOffset =
                            PlatformDependent.objectFieldOffset(publicSelectedKeysField);

                    if (selectedKeysFieldOffset != -1 && publicSelectedKeysFieldOffset != -1) {
                        PlatformDependent.putObject(
                                unwrappedSelector, selectedKeysFieldOffset, selectedKeySet);
                        PlatformDependent.putObject(
                                unwrappedSelector, publicSelectedKeysFieldOffset, selectedKeySet);
                        return null;
                    }
                    // We could not retrieve the offset, lets try reflection as last-resort.
                }
                // 否则使用反射进行操作，替换待优化的Field
                Throwable cause = ReflectionUtil.trySetAccessible(selectedKeysField, true);
                if (cause != null) {
                    return cause;
                }
                cause = ReflectionUtil.trySetAccessible(publicSelectedKeysField, true);
                if (cause != null) {
                    return cause;
                }
                // 进行相关的selectedKeys替换，替换为Netty的实现
                selectedKeysField.set(unwrappedSelector, selectedKeySet);
                publicSelectedKeysField.set(unwrappedSelector, selectedKeySet);
                return null;
            } catch (NoSuchFieldException e) {
                return e;
            } catch (IllegalAccessException e) {
                return e;
            }
        }
    });
    // 如果在优化过程中出现错误，则直接不做优化
    if (maybeException instanceof Exception) {
        selectedKeys = null;
        Exception e = (Exception) maybeException;
        logger.trace("failed to instrument a special java.util.Set into: {}", unwrappedSelector, e);
        return new SelectorTuple(unwrappedSelector);
    }
    // 返回已优化过的selector，由于已将selectedKeySet替换进了JDK的selector实现中，因此所有的操作都会反应在selectedKeySet中
    selectedKeys = selectedKeySet;
    logger.trace("instrumented a special java.util.Set into: {}", unwrappedSelector);
    return new SelectorTuple(unwrappedSelector,
                              new SelectedSelectionKeySetSelector(unwrappedSelector, selectedKeySet));
}
```

### run

```java
@Override
protected void run() {
    int selectCnt = 0;
    // 无限循环
    for (;;) {
        try {
            int strategy;
            try {
                /**
                 * 计算出Selector的策略
                 * SelectStrategy.SELECT值为-1
                 * SelectStrategy.CONTINUE值为-2
                 * SelectStrategy.BUSY_WAIT值为-3
                 * 在`DefaultSelectStrategy`中，如果hasTasks()为true，就会走`selector.selectNow()`（非阻塞选择）结果是>=0不会进switch-case分支
                 * 否则返回`SelectStrategy.SELECT`
                 */ 
                strategy = selectStrategy.calculateStrategy(selectNowSupplier, hasTasks());
                switch (strategy) {
                case SelectStrategy.CONTINUE:
                    continue;

                case SelectStrategy.BUSY_WAIT:
                    // fall-through to SELECT since the busy-wait is not supported with NIO

                case SelectStrategy.SELECT:
                    // 下一次定时任务触发截止时间，-1代表没有定时任务
                    long curDeadlineNanos = nextScheduledTaskDeadlineNanos();
                    if (curDeadlineNanos == -1L) {
                        curDeadlineNanos = NONE; // nothing on the calendar
                    }
                    // 更新nextWakeupNanos为最近一次定时任务截止时间
                    nextWakeupNanos.set(curDeadlineNanos);
                    try {
                        // 再次判断没有任务
                        if (!hasTasks()) {
                            // 这里根据curDeadlineNanos进行阻塞或非阻塞
                            strategy = select(curDeadlineNanos);
                        }
                    } finally {
                        // This update is just to help block unnecessary selector wakeups
                        // so use of lazySet is ok (no race condition)
                        // 执行到这里说明Reactor已经从Selector上被唤醒了
                        // 设置Reactor的状态为苏醒状态AWAKE
                        // lazySet优化不必要的volatile操作，不使用内存屏障，不保证写操作的可见性（单线程不需要保证）
                        // 这里不需要其他其他线程立刻发现值的修改，所以lazySet就够了
                        nextWakeupNanos.lazySet(AWAKE);
                    }
                    // fall through
                default:
                }
            } catch (IOException e) {
                // If we receive an IOException here its because the Selector is messed up. Let's rebuild
                // the selector and retry. https://github.com/netty/netty/issues/8566
                rebuildSelector0();
                selectCnt = 0;
                handleLoopException(e);
                continue;
            }
            // 解决空轮询bug，递增select次数
            selectCnt++;
            cancelledKeys = 0;
            needsToSelectAgain = false;
            // 由于NioEventLoop需要处理IO事件与非IO事件，为了确保二者都能够得到足够的CPU时间运行
            // 控制处理io事件的事件占用比例，默认是百分之50，一半时间用来处理io事件，一半时间用来处理任务
            final int ioRatio = this.ioRatio;
            boolean ranTasks;
            // I/O执行比率为100%,则先执行I/O就绪事件，再执行其他任务
            if (ioRatio == 100) {
                try {
                    // I/O 就绪事件不为0，这处理I/O事件
                    if (strategy > 0) {
                        processSelectedKeys();
                    }
                } finally {
                    // Ensure we always run tasks.
                    // 最后再执行所有任务
                    ranTasks = runAllTasks();
                }
            } else if (strategy > 0) {
                // 记录I/O事件的开始时间
                final long ioStartTime = System.nanoTime();
                try {
                    processSelectedKeys();
                } finally {
                    // Ensure we always run tasks.
                    // ioTime代表I/O事件执行的时间
                    final long ioTime = System.nanoTime() - ioStartTime;
                    // 比如ioRatio为80%，那么任务就执行20%；所有 (100 - ioRatio) / ioRatio = 1/4
                    // 那么加入I/O事件的执行为20秒，那么任务最多为5秒
                    ranTasks = runAllTasks(ioTime * (100 - ioRatio) / ioRatio);
                }
            } else {
                // 如果没有I/O就绪事件，那么执行任务最多64个
                ranTasks = runAllTasks(0); // This will run the minimum number of tasks
            }
            // ranTasks代表执行了任务
            if (ranTasks || strategy > 0) {
                if (selectCnt > MIN_PREMATURE_SELECTOR_RETURNS && logger.isDebugEnabled()) {
                    logger.debug("Selector.select() returned prematurely {} times in a row for Selector {}.",
                            selectCnt - 1, selector);
                }
                // 如果是任务或是I/O事件，重置 selectCnt
                selectCnt = 0;
                // 如果触发了select空轮询，处理空轮询bug后，再重置selectCnt
            } else if (unexpectedSelectorWakeup(selectCnt)) { // Unexpected wakeup (unusual case)
                selectCnt = 0;
            }
        } catch (CancelledKeyException e) {
            // Harmless exception - log anyway
            if (logger.isDebugEnabled()) {
                logger.debug(CancelledKeyException.class.getSimpleName() + " raised by a Selector {} - JDK bug?",
                        selector, e);
            }
        } catch (Error e) {
            throw e;
        } catch (Throwable t) {
            handleLoopException(t);
        } finally {
            // Always handle shutdown even if the loop processing threw an exception.
            try {
                // 判断eventLoop是否处于关闭中
                if (isShuttingDown()) {
                    closeAll();
                    if (confirmShutdown()) {
                        return;
                    }
                }
            } catch (Error e) {
                throw e;
            } catch (Throwable t) {
                handleLoopException(t);
            }
        }
    }
}
``

### processSelectedKeys

处理I/O就绪事件

```java
private void processSelectedKeys() {
    // selectedKeys不为空说明讲过netty优化过，走优化过SelectedSelectionKeySet的逻辑
    if (selectedKeys != null) {
        processSelectedKeysOptimized();
    } else {
        processSelectedKeysPlain(selector.selectedKeys());
    }
}
```

### processSelectedKeysOptimized

```java
private void processSelectedKeysOptimized() {
    // 对数组进行循环
    for (int i = 0; i < selectedKeys.size; ++i) {
        // 取出对象，帮助数组GC
        final SelectionKey k = selectedKeys.keys[i];
        // null out entry in the array to allow to have it GC'ed once the Channel close
        // See https://github.com/netty/netty/issues/2363
        selectedKeys.keys[i] = null;
        // 获取SelectionKey关联的Channel对象
        final Object a = k.attachment();

        if (a instanceof AbstractNioChannel) {
            processSelectedKey(k, (AbstractNioChannel) a);
        } else {
            // 一般不会走这个分支，除非用户主打注册`NioTask`到selector
            @SuppressWarnings("unchecked")
            NioTask<SelectableChannel> task = (NioTask<SelectableChannel>) a;
            processSelectedKey(k, task);
        }
        // 如果selector上channel取消的过多
        // 那不用循环重置元素了，直接将i+1及后面的元素置空，使用Arrays.fill
        if (needsToSelectAgain) {
            // null out entries in the array to allow to have it GC'ed once the Channel close
            // See https://github.com/netty/netty/issues/2363
            selectedKeys.reset(i + 1);
            // 立即执行一次非阻塞`selectorNow()`,将就绪的I/0事件赋值到selectedKeys上
            // 同时更改`needsToSelectAgain`标志为false
            selectAgain();
            // 重置循环索引i，继续处理I/O事件
            i = -1;
        }
    }
}
```

### processSelectedKey

```java

private void processSelectedKey(SelectionKey k, AbstractNioChannel ch) {
    final AbstractNioChannel.NioUnsafe unsafe = ch.unsafe();
    // SelectionKey无效的处理
    // 当key被取消,或者通道被关闭,或者selector被关闭,都将导致此key无效
    if (!k.isValid()) {
        final EventLoop eventLoop;
        try {
            // 获取通道对应eventLoop
            eventLoop = ch.eventLoop();
        } catch (Throwable ignored) {
            // If the channel implementation throws an exception because there is no event loop, we ignore this
            // because we are only trying to determine if ch is registered to this event loop and thus has authority
            // to close ch.
            return;
        }
        // Only close ch if ch is still registered to this EventLoop. ch could have deregistered from the event loop
        // and thus the SelectionKey could be cancelled as part of the deregistration process, but the channel is
        // still healthy and should not be closed.
        // See https://github.com/netty/netty/issues/5125
        // 必须是注册在当前eventLoop的channel才去调用close方法关闭通道
        if (eventLoop == this) {
            // close the channel if the key is not valid anymore
            // 关闭通道
            unsafe.close(unsafe.voidPromise());
        }
        return;
    }

    try {
        /**
         * 获取SelectKey的预操作符
         * SelectionKey.OP_READ=1（二进制为 00000001）
         * SelectionKey.OP_WRITE=4（二进制为 00000100）
         * SelectionKey.OP_CONNECT=8（二进制为 00001000）
         * SelectionKey.OP_ACCEPT=16（二进制为 00010000）
         * SelectionKey中可以只用1个整形数字来表示多个注册的事件，所以根据对应的位进行位与操作不为0就代表有该事件
         */
        int readyOps = k.readyOps();
        // We first need to call finishConnect() before try to trigger a read(...) or write(...) as otherwise
        // the NIO JDK channel implementation may throw a NotYetConnectedException.
        // 连接准备就绪
        if ((readyOps & SelectionKey.OP_CONNECT) != 0) {
            // remove OP_CONNECT as otherwise Selector.select(..) will always return without blocking
            // See https://github.com/netty/netty/issues/924
            // 获取感兴趣的事件集合
            int ops = k.interestOps();
            /**
             * 将SelectionKey.OP_CONNECT事件从SelectionKey所感兴趣的事件中移除，这样Selector就不会再去监听该连接的SelectionKey.
             * OP_CONNECT事件了。否则Selector.select(..)不会进行阻塞的
             * 
             * 将SelectionKey.OP_CONNECT事件取反，与ops进行位与操作这样就排除`SelectionKey.OP_CONNECT`事件
             */
            ops &= ~SelectionKey.OP_CONNECT;
            k.interestOps(ops);
            // 调用unsafe的`finishConnect`
            unsafe.finishConnect();
        }

        // Process OP_WRITE first as we may be able to write some queued buffers and so free memory.
        // 写事件
        if ((readyOps & SelectionKey.OP_WRITE) != 0) {
            // Call forceFlush which will also take care of clear the OP_WRITE once there is nothing left to write
            ch.unsafe().forceFlush();
        }

        // Also check for readOps of 0 to workaround possible JDK bug which may otherwise lead
        // to a spin loop
        // 读事件准备就绪
        // 把OP_READ和OP_ACCEPT统一使用Unsafe的read来处理
        // 对于 readyOps == 0 的解释是解决JDK的循环bug[https://github.com/netty/netty/issues/1836]
        if ((readyOps & (SelectionKey.OP_READ | SelectionKey.OP_ACCEPT)) != 0 || readyOps == 0) {
            unsafe.read();
        }
    } catch (CancelledKeyException ignored) {
        // 报错就关闭channel
        unsafe.close(unsafe.voidPromise());
    }
}
```

### select

```java
private int select(long deadlineNanos) throws IOException {
    if (deadlineNanos == NONE) {
        // 这里会阻塞selector直到有就绪事件返回（相当于阻塞在I/O上了）
        return selector.select();
    }
    // Timeout will only be 0 if deadline is within 5 microsecs
    // 如果deadlineNanos小于5微秒，则为0,，否则取整为1毫秒
    long timeoutMillis = deadlineToDelayNanos(deadlineNanos + 995000L) / 1000000L;
    // 如果timeoutMillis大于0，就阻塞selector同样的时间
    // 如果等于0说明有最近的延时任务，即不阻塞线程调用`selector.selectNow()`
    return timeoutMillis <= 0 ? selector.selectNow() : selector.select(timeoutMillis);
}
```

### cancel

```java
void cancel(SelectionKey key) {
    key.cancel();
    cancelledKeys ++;
    // 当从selector中移除的socketChannel数量达到256个，设置needsToSelectAgain为true
    // 在io.netty.channel.nio.NioEventLoop.processSelectedKeysPlain 中重新做一次轮询，将失效的selectKey移除，
    // 以保证selectKeySet的有效性
    if (cancelledKeys >= CLEANUP_INTERVAL) {
        cancelledKeys = 0;
        needsToSelectAgain = true;
    }
}
```

### processSelectedKeysPlain

```java

```

### closeAll

```java
private void closeAll() {
    // 再次调用`selectNow`
    selectAgain();
    // 返回当前所有注册在selector中channel的selectionKey
    Set<SelectionKey> keys = selector.keys();
    Collection<AbstractNioChannel> channels = new ArrayList<AbstractNioChannel>(keys.size());
    for (SelectionKey k: keys) {
        // 这里取出的附件就是NioServerSocketChannel
        Object a = k.attachment();
        if (a instanceof AbstractNioChannel) {
            channels.add((AbstractNioChannel) a);
        } else {
            // NioTask
            k.cancel();
            @SuppressWarnings("unchecked")
            NioTask<SelectableChannel> task = (NioTask<SelectableChannel>) a;
            invokeChannelUnregistered(task, k, null);
        }
    }
    // 遍历集合
    for (AbstractNioChannel ch: channels) {
        // 调用Channel的unsafe方法进行关闭
        ch.unsafe().close(ch.unsafe().voidPromise());
    }
}
```

### beforeScheduledTaskSubmitted

```java
@Override
protected boolean beforeScheduledTaskSubmitted(long deadlineNanos) {
    // Note this is also correct for the nextWakeupNanos == -1 (AWAKE) case
    // nextWakeupNanos.get()： -1（线程处于唤醒状态） 或 阻塞到的时间
    // 如果 deadlineNanos大于下一次唤醒select的时间就不需要唤醒，反之需要进行唤醒
    return deadlineNanos < nextWakeupNanos.get();
}

```

### afterScheduledTaskSubmitted

```java
@Override
protected boolean afterScheduledTaskSubmitted(long deadlineNanos) {
    // Note this is also correct for the nextWakeupNanos == -1 (AWAKE) case
    return deadlineNanos < nextWakeupNanos.get();
}
```
