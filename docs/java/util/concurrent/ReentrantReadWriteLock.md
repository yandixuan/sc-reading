# ReentrantReadWriteLock

[文章参考](https://www.cnblogs.com/huangrenhui/p/12738046.html)

## 内部类

### Sync

AQS 的状态 state 是 32 位（int 类型）的，辦成两份，读锁用高 16 位，表示持有读锁的线程数（sharedCount），写锁低 16 位，
表示写锁的重入次数 （exclusiveCount）。状态值为 0 表示锁空闲，sharedCount 不为 0 表示分配了读锁，exclusiveCount 不为 0 表示分配了写锁，
sharedCount 和 exclusiveCount 一般不会同时不为 0，只有当线程占用了写锁，该线程可以重入获取读锁，反之不成立。

```java

    abstract static class Sync extends AbstractQueuedSynchronizer {
        private static final long serialVersionUID = 6317671515068378041L;

        /*
         * Read vs write count extraction constants and functions.
         * Lock state is logically divided into two unsigned shorts:
         * The lower one representing the exclusive (writer) lock hold count,
         * and the upper the shared (reader) hold count.
         */
        // 高16位为读锁，低16位为写锁
        static final int SHARED_SHIFT   = 16;
        // 由于读锁用高位部分，所以读锁个数加1，其实是状态值加 2^16
        static final int SHARED_UNIT    = (1 << SHARED_SHIFT);
        // 写锁的可重入的最大次数、读锁允许的最大数量（其实就是读锁初始值减1）
        static final int MAX_COUNT      = (1 << SHARED_SHIFT) - 1;
        // 写锁的掩码，用于状态的低16位有效值
        static final int EXCLUSIVE_MASK = (1 << SHARED_SHIFT) - 1;

        /** Returns the number of shared holds represented in count  */
        // 读锁计数，当前持有读锁的线程数
        static int sharedCount(int c)    { return c >>> SHARED_SHIFT; }
        /** Returns the number of exclusive holds represented in count  */
        // 写锁的计数，也就是它的重入次数（与低16位1111...与运算，也就是重入次数）
        static int exclusiveCount(int c) { return c & EXCLUSIVE_MASK; }

        /**
         * A counter for per-thread read hold counts.
         * Maintained as a ThreadLocal; cached in cachedHoldCounter
         */
        /**
         * 每个线程特定的 read 持有计数。存放在ThreadLocal，不需要是线程安全的。
         */
        static final class HoldCounter {
            int count = 0;
            // Use id, not reference, to avoid garbage retention
            final long tid = getThreadId(Thread.currentThread());
        }

        /**
         * ThreadLocal subclass. Easiest to explicitly define for sake
         * of deserialization mechanics.
         */
        /**
         * 重写的目的就是为了放置get为null
         * 采用继承是为了重写 initialValue 方法，这样就不用进行这样的处理：
         * 如果ThreadLocal没有当前线程的计数，则new一个，再放进ThreadLocal里。
         * 可以直接调用 get。
         */
        static final class ThreadLocalHoldCounter
            extends ThreadLocal<HoldCounter> {
            public HoldCounter initialValue() {
                return new HoldCounter();
            }
        }

        /**
         * The number of reentrant read locks held by current thread.
         * Initialized only in constructor and readObject.
         * Removed whenever a thread's read hold count drops to 0.
         */
        /**
         * 保存当前线程重入读锁的次数的容器。在读锁重入次数为 0 时移除。
         */
        private transient ThreadLocalHoldCounter readHolds;

        /**
         * The hold count of the last thread to successfully acquire
         * readLock. This saves ThreadLocal lookup in the common case
         * where the next thread to release is the last one to
         * acquire. This is non-volatile since it is just used
         * as a heuristic, and would be great for threads to cache.
         *
         * <p>Can outlive the Thread for which it is caching the read
         * hold count, but avoids garbage retention by not retaining a
         * reference to the Thread.
         *
         * <p>Accessed via a benign data race; relies on the memory
         * model's final field and out-of-thin-air guarantees.
         */
        /**
         * 最近一个成功获取读锁的线程的计数。这省却了ThreadLocal查找，
         * 通常情况下，下一个释放线程是最后一个获取线程。这不是 volatile 的，
         * 因为它仅用于试探的，线程进行缓存也是可以的
         * （因为判断是否是当前线程是通过线程id来比较的）。
         */
        private transient HoldCounter cachedHoldCounter;

        /**
         * firstReader is the first thread to have acquired the read lock.
         * firstReaderHoldCount is firstReader's hold count.
         *
         * <p>More precisely, firstReader is the unique thread that last
         * changed the shared count from 0 to 1, and has not released the
         * read lock since then; null if there is no such thread.
         *
         * <p>Cannot cause garbage retention unless the thread terminated
         * without relinquishing its read locks, since tryReleaseShared
         * sets it to null.
         *
         * <p>Accessed via a benign data race; relies on the memory
         * model's out-of-thin-air guarantees for references.
         *
         * <p>This allows tracking of read holds for uncontended read
         * locks to be very cheap.
         */
        private transient Thread firstReader = null;
        private transient int firstReaderHoldCount;

        Sync() {
            readHolds = new ThreadLocalHoldCounter();
            setState(getState()); // ensures visibility of readHolds
        }

        /*
         * Acquires and releases use the same code for fair and
         * nonfair locks, but differ in whether/how they allow barging
         * when queues are non-empty.
         */

        /**
         * Returns true if the current thread, when trying to acquire
         * the read lock, and otherwise eligible to do so, should block
         * because of policy for overtaking other waiting threads.
         */
        abstract boolean readerShouldBlock();

        /**
         * Returns true if the current thread, when trying to acquire
         * the write lock, and otherwise eligible to do so, should block
         * because of policy for overtaking other waiting threads.
         */
        abstract boolean writerShouldBlock();

        /*
         * Note that tryRelease and tryAcquire can be called by
         * Conditions. So it is possible that their arguments contain
         * both read and write holds that are all released during a
         * condition wait and re-established in tryAcquire.
         */

        protected final boolean tryRelease(int releases) {
            // 当前线程是否是锁的占有者
            if (!isHeldExclusively())
                throw new IllegalMonitorStateException();
            // 减值
            int nextc = getState() - releases;
            // 是否释放锁的标志
            boolean free = exclusiveCount(nextc) == 0;
            if (free)
                // 将占有线程清空
                setExclusiveOwnerThread(null);
            setState(nextc);
            return free;
        }

        /**
         * 获取写锁的实现
         */
        protected final boolean tryAcquire(int acquires) {
            /*
             * Walkthrough:
             * 1. If read count nonzero or write count nonzero
             *    and owner is a different thread, fail.
             * 2. If count would saturate, fail. (This can only
             *    happen if count is already nonzero.)
             * 3. Otherwise, this thread is eligible for lock if
             *    it is either a reentrant acquire or
             *    queue policy allows it. If so, update state
             *    and set owner.
             */
            // 获取当前线程
            Thread current = Thread.currentThread();
            // 获取同步状态
            int c = getState();
            // 获取写锁的重入次数
            int w = exclusiveCount(c);
            // 锁状态不为0
            if (c != 0) {
                // (Note: if c != 0 and w == 0 then shared count != 0)
                /*
                 * 1. c != 0 && w==0 说明写锁为0，读锁不为0，由于读写互斥，那么获取写锁失败 return fasle
                 * 2. c !=0  && current != getExclusiveOwnerThread() 说明写锁不为0，但是当前线程不是独占线程，即写写互斥，return fasle
                 */
                if (w == 0 || current != getExclusiveOwnerThread())
                    return false;
                // 如果写锁重入次数大于最大值，抛异常
                if (w + exclusiveCount(acquires) > MAX_COUNT)
                    throw new Error("Maximum lock count exceeded");
                // 获取写锁，增加状态值
                // Reentrant acquire
                setState(c + acquires);
                return true;
            }
            // writerShouldBlock判断当前是否应该阻塞，同时CAS设置同步状态，设置失败说明获取锁失败
            // writerShouldBlock的实现，便是公平与非公平的核心实现
            if (writerShouldBlock() ||
                !compareAndSetState(c, c + acquires))
                return false;
            // 当前线程为锁的独占
            setExclusiveOwnerThread(current);
            return true;
        }

        protected final boolean tryReleaseShared(int unused) {
            Thread current = Thread.currentThread();
            if (firstReader == current) {
                // assert firstReaderHoldCount > 0;
                if (firstReaderHoldCount == 1)
                    firstReader = null;
                else
                    firstReaderHoldCount--;
            } else {
                HoldCounter rh = cachedHoldCounter;
                if (rh == null || rh.tid != getThreadId(current))
                    rh = readHolds.get();
                int count = rh.count;
                if (count <= 1) {
                    readHolds.remove();
                    if (count <= 0)
                        throw unmatchedUnlockException();
                }
                --rh.count;
            }
            for (;;) {
                int c = getState();
                int nextc = c - SHARED_UNIT;
                if (compareAndSetState(c, nextc))
                    // Releasing the read lock has no effect on readers,
                    // but it may allow waiting writers to proceed if
                    // both read and write locks are now free.
                    return nextc == 0;
            }
        }

        private IllegalMonitorStateException unmatchedUnlockException() {
            return new IllegalMonitorStateException(
                "attempt to unlock read lock, not locked by current thread");
        }

        /**
         * 读锁获取
         */
        protected final int tryAcquireShared(int unused) {
            /*
             * Walkthrough:
             * 1. If write lock held by another thread, fail.
             * 2. Otherwise, this thread is eligible for
             *    lock wrt state, so ask if it should block
             *    because of queue policy. If not, try
             *    to grant by CASing state and updating count.
             *    Note that step does not check for reentrant
             *    acquires, which is postponed to full version
             *    to avoid having to check hold count in
             *    the more typical non-reentrant case.
             * 3. If step 2 fails either because thread
             *    apparently not eligible or CAS fails or count
             *    saturated, chain to version with full retry loop.
             */
            // 获取当前线程
            Thread current = Thread.currentThread();
            // 获取锁状态值
            int c = getState();
            // 如果写锁线程数 != 0 ，且独占锁不是当前线程则返回失败，可能存在写锁到读锁的降级
            if (exclusiveCount(c) != 0 &&
                getExclusiveOwnerThread() != current)
                return -1;
            // 读锁数量
            int r = sharedCount(c);
            /**
             * readerShouldBlock():读锁是否需要等待（公平锁原则）
             * r < MAX_COUNT：持有线程小于最大数（65535）
             * compareAndSetState(c, c + SHARED_UNIT)：设置读取锁状态
             */
            if (!readerShouldBlock() &&
                r < MAX_COUNT &&
                compareAndSetState(c, c + SHARED_UNIT)) {
                if (r == 0) {
                    // 设置第一个读线程
                    firstReader = current;
                    // 读线程占用的资源数为1
                    firstReaderHoldCount = 1;
                // 当前线程为第一个读线程，表示第一个读锁线程重入
                } else if (firstReader == current) {
                    // 占用资源数加1
                    firstReaderHoldCount++;
                } else {
                    // 读锁数量不为0并且不为当前线程
                    HoldCounter rh = cachedHoldCounter;
                    // 计数器为空或者计数器的tid不为当前正在运行的线程的tid
                    if (rh == null || rh.tid != getThreadId(current))
                        // 获取当前线程对应的计数器
                        cachedHoldCounter = rh = readHolds.get();
                    // 计数为0
                    else if (rh.count == 0)
                        // 加入到readHolds中
                        readHolds.set(rh);
                    // 计数+1
                    rh.count++;
                }
                return 1;
            }
            // 如果读锁获取失败，调用该方法进行CAS循环获取
            return fullTryAcquireShared(current);
        }

        /**
         * Full version of acquire for reads, that handles CAS misses
         * and reentrant reads not dealt with in tryAcquireShared.
         */
         final int fullTryAcquireShared(Thread current) {
            /*
             * This code is in part redundant with that in
             * tryAcquireShared but is simpler overall by not
             * complicating tryAcquireShared with interactions between
             * retries and lazily reading hold counts.
             */
            HoldCounter rh = null;
            for (;;) {
                // 获取锁当前状态值
                int c = getState();
                // 如果写入锁被线程持有
                if (exclusiveCount(c) != 0) {
                    // 并且写入锁的持有者不是当前线程，则返回-1，获取锁失败
                    if (getExclusiveOwnerThread() != current)
                        return -1;
                    // else we hold the exclusive lock; blocking here
                    // would cause deadlock.
                // 根据公平模式来决定是否阻塞当前线程
                } else if (readerShouldBlock()) {
                    // Make sure we're not acquiring read lock reentrantly
                    if (firstReader == current) {
                        // assert firstReaderHoldCount > 0;
                    } else {
                        if (rh == null) {
                            rh = cachedHoldCounter;
                            if (rh == null || rh.tid != getThreadId(current)) {
                                rh = readHolds.get();
                                if (rh.count == 0)
                                    readHolds.remove();
                            }
                        }
                        if (rh.count == 0)
                            return -1;
                    }
                }
                if (sharedCount(c) == MAX_COUNT)
                    throw new Error("Maximum lock count exceeded");
                // 尝试CAS设置同步状态
                // 后续操作和tryAquireShared基本一致
                if (compareAndSetState(c, c + SHARED_UNIT)) {
                    if (sharedCount(c) == 0) {
                        firstReader = current;
                        firstReaderHoldCount = 1;
                    } else if (firstReader == current) {
                        firstReaderHoldCount++;
                    } else {
                        if (rh == null)
                            rh = cachedHoldCounter;
                        if (rh == null || rh.tid != getThreadId(current))
                            rh = readHolds.get();
                        else if (rh.count == 0)
                            readHolds.set(rh);
                        rh.count++;
                        cachedHoldCounter = rh; // cache for release
                    }
                    return 1;
                }
            }
        }

        /**
         * Performs tryLock for write, enabling barging in both modes.
         * This is identical in effect to tryAcquire except for lack
         * of calls to writerShouldBlock.
         */
        final boolean tryWriteLock() {
            Thread current = Thread.currentThread();
            int c = getState();
            if (c != 0) {
                int w = exclusiveCount(c);
                if (w == 0 || current != getExclusiveOwnerThread())
                    return false;
                if (w == MAX_COUNT)
                    throw new Error("Maximum lock count exceeded");
            }
            if (!compareAndSetState(c, c + 1))
                return false;
            setExclusiveOwnerThread(current);
            return true;
        }

        /**
         * Performs tryLock for read, enabling barging in both modes.
         * This is identical in effect to tryAcquireShared except for
         * lack of calls to readerShouldBlock.
         */
        final boolean tryReadLock() {
            Thread current = Thread.currentThread();
            for (;;) {
                int c = getState();
                if (exclusiveCount(c) != 0 &&
                    getExclusiveOwnerThread() != current)
                    return false;
                int r = sharedCount(c);
                if (r == MAX_COUNT)
                    throw new Error("Maximum lock count exceeded");
                if (compareAndSetState(c, c + SHARED_UNIT)) {
                    if (r == 0) {
                        firstReader = current;
                        firstReaderHoldCount = 1;
                    } else if (firstReader == current) {
                        firstReaderHoldCount++;
                    } else {
                        HoldCounter rh = cachedHoldCounter;
                        if (rh == null || rh.tid != getThreadId(current))
                            cachedHoldCounter = rh = readHolds.get();
                        else if (rh.count == 0)
                            readHolds.set(rh);
                        rh.count++;
                    }
                    return true;
                }
            }
        }

        protected final boolean isHeldExclusively() {
            // While we must in general read state before owner,
            // we don't need to do so to check if current thread is owner
            return getExclusiveOwnerThread() == Thread.currentThread();
        }

        // Methods relayed to outer class

        final ConditionObject newCondition() {
            return new ConditionObject();
        }

        final Thread getOwner() {
            // Must read state before owner to ensure memory consistency
            return ((exclusiveCount(getState()) == 0) ?
                    null :
                    getExclusiveOwnerThread());
        }

        final int getReadLockCount() {
            return sharedCount(getState());
        }

        final boolean isWriteLocked() {
            return exclusiveCount(getState()) != 0;
        }

        final int getWriteHoldCount() {
            return isHeldExclusively() ? exclusiveCount(getState()) : 0;
        }

        final int getReadHoldCount() {
            if (getReadLockCount() == 0)
                return 0;

            Thread current = Thread.currentThread();
            if (firstReader == current)
                return firstReaderHoldCount;

            HoldCounter rh = cachedHoldCounter;
            if (rh != null && rh.tid == getThreadId(current))
                return rh.count;

            int count = readHolds.get().count;
            if (count == 0) readHolds.remove();
            return count;
        }

        /**
         * Reconstitutes the instance from a stream (that is, deserializes it).
         */
        private void readObject(java.io.ObjectInputStream s)
            throws java.io.IOException, ClassNotFoundException {
            s.defaultReadObject();
            readHolds = new ThreadLocalHoldCounter();
            setState(0); // reset to unlocked state
        }

        final int getCount() { return getState(); }
    }
```
