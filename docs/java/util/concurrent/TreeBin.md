# TreeBin

[`ConcurrentHashMap内部类`](./ConcurrentHashMap)

---

TreeBin 并不是红黑树的存储节点，TreeBin 通过 root 属性维护红黑树的根结点，因为红黑树在旋转的时候，
根结点可能会被它原来的子节点替换掉，在这个时间点，如果有其他线程要写这棵红黑树就会发生线程不安全问题，
所以在 ConcurrentHashMap 中 TreeBin 通过 waiter 属性维护当前使用这棵红黑树的线程，来防止其他线程的进入

```java

    static final class TreeBin<K,V> extends Node<K,V> {
        // 维护树根节点
        TreeNode<K,V> root;
        // 链表头节点
        volatile TreeNode<K,V> first;
        // 最近一个设置waiter标识的线程
        volatile Thread waiter;
        // 锁状态标识
        volatile int lockState;
        // values for lockState
        // 写锁 写是独占状态，以散列表来看，真正进入到TreeBin中的写线程 同一时刻 只有一个线程
        static final int WRITER = 1; // set while holding write lock
        // 等待者状态（写线程在等待），当TreeBin中有读线程目前正在读取数据时，写线程无法修改数据
        static final int WAITER = 2; // set when waiting for write lock
        // 读锁 读锁是共享，同一时刻可以有多个线程 同时进入到 TreeBin对象中获取数据
        static final int READER = 4; // increment value for setting read lock

        /**
         * Tie-breaking utility for ordering insertions when equal
         * hashCodes and non-comparable. We don't require a total
         * order, just a consistent insertion rule to maintain
         * equivalence across rebalancings. Tie-breaking further than
         * necessary simplifies testing a bit.
         */
        static int tieBreakOrder(Object a, Object b) {
            int d;
            if (a == null || b == null ||
                (d = a.getClass().getName().
                 compareTo(b.getClass().getName())) == 0)
                d = (System.identityHashCode(a) <= System.identityHashCode(b) ?
                     -1 : 1);
            return d;
        }

        /**
         * 根据TreeNode节点B初始化 TreeBin
         * Creates bin with initial set of nodes headed by b.
         */
        TreeBin(TreeNode<K,V> b) {
            // TreeBin节点hash值为 TREEBIN 即-2
            super(TREEBIN, null, null, null);
            // 链表起始节点为TreeNode b
            this.first = b;
            // 根节点r置空
            TreeNode<K,V> r = null;
            for (TreeNode<K,V> x = b, next; x != null; x = next) {
                // 先获取b的下一个节点
                next = (TreeNode<K,V>)x.next;
                // 将x的左右子节点强行置空
                x.left = x.right = null;
                // 条件成立：说明当前红黑树 是一个空树，那么设置插入元素 为根节点
                if (r == null) {
                    x.parent = null;
                    // 根节点为黑色
                    x.red = false;
                    r = x;
                }
                else {
                    // 非第一次循环，都会进入else分支，此时红黑树已经有数据了
                    // k 表示 插入节点的key
                    K k = x.key;
                    // h 表示 插入节点的hash
                    int h = x.hash;
                    // kc 表示 插入节点key的class类型
                    Class<?> kc = null;
                    // 遍历红黑树插入节点
                    for (TreeNode<K,V> p = r;;) {
                        // 临时遍历ph为被比较节点hash值
                        int dir, ph;
                        K pk = p.key;
                        // 树节点左边
                        if ((ph = p.hash) > h)
                            dir = -1;
                        // 树节点右边
                        else if (ph < h)
                            dir = 1;
                        // 如果 插入节点的类型为null且 kc没有实现Comparable接口或 k与pk相同（也包含kc的class类为null或k,pk的clas类型不相同）任意满足其一
                        // 的话都会根据2者的内存hashcode决定是树的左边还是右边
                        else if ((kc == null &&
                                  (kc = comparableClassFor(k)) == null) ||
                                 (dir = compareComparables(kc, k, pk)) == 0)
                            dir = tieBreakOrder(k, pk);
                            TreeNode<K,V> xp = p;
                        // 如果p的左边、或右边没有子节点了那么么进行插入节点
                        if ((p = (dir <= 0) ? p.left : p.right) == null) {
                            // 父子节点互相连接
                            x.parent = xp;
                            if (dir <= 0)
                                xp.left = x;
                            else
                                xp.right = x;
                            // 插入的节点可能会破坏红黑树特性，调用插入调整方法
                            r = balanceInsertion(r, x);
                            // 结束遍历红黑树的循环，继续遍历链表
                            break;
                        }
                    }
                }
            }
            // 将根节点设置成r
            this.root = r;
            // 递归检查红黑树的正确性（注意：assert关键字是受java启动项配置的，-ea 开启）
            assert checkInvariants(root);
        }

        /**
         * Acquires write lock for tree restructuring.
         */
        private final void lockRoot() {
            // 直接尝试CAS的将lockState从0变成WRITER（1）状态，即从没有锁变成获取了写锁的状态，只尝试一次，没有循环。
            if (!U.compareAndSwapInt(this, LOCKSTATE, 0, WRITER))
                //如果 CAS失败，那么调用contendedLock方法，继续获取直到成功才返回
                contendedLock(); // offload to separate method
        }

        /**
         * Releases write lock for tree restructuring.
         */
        private final void unlockRoot() {
            lockState = 0;
        }

        /**
         * Possibly blocks awaiting root lock.
         */
        private final void contendedLock() {
            // 初始化一个waiting标志，默认为false，开启一个死循环
            boolean waiting = false;
            for (int s;;) {
               /**
                * 这里的 ~WAITER，即~2，即表示 -3 是一个固定值
                *  2的二进制：0000 0000 0000 0000 0000 0000 0000 0010
                * ~2的二进制：1111 1111 1111 1111 1111 1111 1111 1101（补码）
                * 显然~2是负数，读取规则取反+1为
                *           1000 0000 0000 0000 0000 0000 0000 0011（即-3）
                * 这里只是告知 ~2==-3而已没有实际意义
                * 因此 lockState为0(二进制数全是0)或者2(二进制数为10)时，lockState与 ~WAITER的结果才为 0（倒推法就可知）
                * lockState为0时，表示没有任何线程获取任何锁；
                * locKState为2时，表示只有一个写线程在等待获取锁，这也就是前面讲的find方法中，最后一个读线程释放了读锁并且还有写线程等待获取写锁的情况，实际上就是该线程
                */
                if (((s = lockState) & ~WAITER) == 0) {
                    if (U.compareAndSwapInt(this, LOCKSTATE, s, WRITER)) {
                        //条件成立：说明写线程 抢占锁成功
                         if (waiting)
                            // 如果waiting标志位为true，那么将waiter清空，因为waiter是waiting为true时设置的，表示此时没有写线程在等待写锁
                            waiter = null;
                        return;
                    }
                }
                /**
                 * 否则，判断 s & WAITER==0
                 * WAITER固定为2
                 * 如果s & WAITER为0，即需要s & 2 =0，那么s(lockState)必须为1或者大于2的数，比如4、8等等
                 * 由于不存在写并发（外面对写操作加上了synchronized锁），因此lockState一定属于大于2的数，比如4、8等等
                 * 这表示有线程获取到了读锁，此时写线程应该等待
                 */
                else if ((s & WAITER) == 0) {
                     // 尝试将lockState设置为s | WAITER  ，这里的s|WAITER就相当于s+WAITER，即将此时的lockState加上2，表示有写线程在等待获取写锁
                    if (U.compareAndSwapInt(this, LOCKSTATE, s, s | WAITER)) {
                        waiting = true;
                        // waiter设置为当前线程
                        waiter = Thread.currentThread();
                    }
                }
                /**
                 * 根据标志判断是否阻塞自己
                 * 此时写线程不再继续执行代码，而是等待被唤醒
                 * 如果被唤醒，那么可能是因为最后一个读锁也被释放了，或者是因为被中断，那么继续循环获取锁
                 * 该循环的唯一出口就是获取到了写锁该循环的唯一出口就是获取到了写锁
                 */
                else if (waiting)
                    LockSupport.park(this);
            }
        }

        /**
         * 读节点
         * Returns matching node or null if none. Tries to search
         * using tree comparisons from root, but continues linear
         * search when lock not available.
         */
        final Node<K,V> find(int h, Object k) {
            // key首要条件不能null
            if (k != null) {
                // 从first节点开始遍历，直到节点为null才停止循环
                for (Node<K,V> e = first; e != null; ) {
                    int s; K ek;
                    // WAITER|WRITER 等同于 WAITER+WRITER=1+2=3 ==>0011
                    // lockState & 0011 != 0 条件成立：说明当前TreeBin 有写等待线程 或者 写操作线程正在加锁
                    if (((s = lockState) & (WAITER|WRITER)) != 0) {
                        // 找到key直接返回e
                        if (e.hash == h &&
                            ((ek = e.key) == k || (ek != null && k.equals(ek))))
                            return e;
                        // 无法读树那么就根据链表结构依次读取，好处就是不会阻塞读取的过程
                        e = e.next;
                    }
                    // 前置条件：当前TreeBin中 写等待线程 或者 写线程 都没有
                    // 条件成立：说明添加读锁成功 每个线程都会给 LOCKSTATE+4
                    else if (U.compareAndSwapInt(this, LOCKSTATE, s,
                                                 s + READER)) {
                        // 获取到读锁，那么就从根节点遍历，TreeBin只是封装了锁，实际上找数据节点还是委托给了TreeNode来找
                        TreeNode<K,V> r, p;
                        try {
                            p = ((r = root) == null ? null :
                                 r.findTreeNode(h, k, null));
                        } finally {
                            Thread w;
                            // U.getAndAddInt(this, LOCKSTATE, -READER) == (READER|WAITER)
                            // 1.当前线程查询红黑树结束，释放当前线程的读锁 就是让 lockstate 值 - 4
                            // (READER|WAITER) = 0110 => 表示当前只有一个线程在读，且“有一个写线程在等待”
                            // 当前读线程为 TreeBin中的最后一个读线程。
                            // getAndAddInt含义是返回当前值，并不是修改值所以进入if的是最后一个读线程了，所以我们要唤醒等待写线程了
                            if (U.getAndAddInt(this, LOCKSTATE, -READER) ==
                                (READER|WAITER) && (w = waiter) != null)
                                // 如果是最后一个读线程，并且有写线程因为读锁而阻塞，要告诉写线程可以尝试获取写锁了。
                                LockSupport.unpark(w);
                        }
                        return p;
                    }
                }
            }
            return null;
        }

        /**
         * Finds or adds a node.
         * @return null if added
         */
        final TreeNode<K,V> putTreeVal(int h, K k, V v) {
            Class<?> kc = null;
            boolean searched = false;
            for (TreeNode<K,V> p = root;;) {
                int dir, ph; K pk;
                if (p == null) {
                    first = root = new TreeNode<K,V>(h, k, v, null, null);
                    break;
                }
                else if ((ph = p.hash) > h)
                    dir = -1;
                else if (ph < h)
                    dir = 1;
                else if ((pk = p.key) == k || (pk != null && k.equals(pk)))
                    return p;
                else if ((kc == null &&
                          (kc = comparableClassFor(k)) == null) ||
                         (dir = compareComparables(kc, k, pk)) == 0) {
                    if (!searched) {
                        TreeNode<K,V> q, ch;
                        searched = true;
                        if (((ch = p.left) != null &&
                             (q = ch.findTreeNode(h, k, kc)) != null) ||
                            ((ch = p.right) != null &&
                             (q = ch.findTreeNode(h, k, kc)) != null))
                            return q;
                    }
                    dir = tieBreakOrder(k, pk);
                }

                TreeNode<K,V> xp = p;
                if ((p = (dir <= 0) ? p.left : p.right) == null) {
                    TreeNode<K,V> x, f = first;
                    first = x = new TreeNode<K,V>(h, k, v, f, xp);
                    if (f != null)
                        f.prev = x;
                    if (dir <= 0)
                        xp.left = x;
                    else
                        xp.right = x;
                    if (!xp.red)
                        x.red = true;
                    else {
                        // 在这里准备插入节点，给根节点加锁
                        lockRoot();
                        try {
                            // 插入平衡调整完后，重新赋值root节点，可能在调整的过程中根节点发生了变化
                            root = balanceInsertion(root, x);
                        } finally {
                            // 解锁根节点
                            unlockRoot();
                        }
                    }
                    break;
                }
            }
            assert checkInvariants(root);
            return null;
        }

        /**
         * Removes the given node, that must be present before this
         * call.  This is messier than typical red-black deletion code
         * because we cannot swap the contents of an interior node
         * with a leaf successor that is pinned by "next" pointers
         * that are accessible independently of lock. So instead we
         * swap the tree linkages.
         *
         * @return true if now too small, so should be untreeified
         */
        final boolean removeTreeNode(TreeNode<K,V> p) {
            // 读过HashMap的我们知道，TreeNode 即包含树关系也包含链表关系
            // 那么unlink节点p在链表中的关系
            TreeNode<K,V> next = (TreeNode<K,V>)p.next;
            TreeNode<K,V> pred = p.prev;  // unlink traversal pointers
            TreeNode<K,V> r, rl;
            if (pred == null)
                first = next;
            else
                pred.next = next;
            if (next != null)
                next.prev = pred;
            if (first == null) {
                root = null;
                return true;
            }
            if ((r = root) == null || r.right == null || // too small
                (rl = r.left) == null || rl.left == null)
                return true;
            // 一旦上面进入return true的分支说明节点过少，树要退化为链表
            // 锁住树的根节点，删除节点跟HashMap流程一致没啥好说的
            lockRoot();
            try {
                TreeNode<K,V> replacement;
                TreeNode<K,V> pl = p.left;
                TreeNode<K,V> pr = p.right;
                if (pl != null && pr != null) {
                    TreeNode<K,V> s = pr, sl;
                    while ((sl = s.left) != null) // find successor
                        s = sl;
                    boolean c = s.red; s.red = p.red; p.red = c; // swap colors
                    TreeNode<K,V> sr = s.right;
                    TreeNode<K,V> pp = p.parent;
                    if (s == pr) { // p was s's direct parent
                        p.parent = s;
                        s.right = p;
                    }
                    else {
                        TreeNode<K,V> sp = s.parent;
                        if ((p.parent = sp) != null) {
                            if (s == sp.left)
                                sp.left = p;
                            else
                                sp.right = p;
                        }
                        if ((s.right = pr) != null)
                            pr.parent = s;
                    }
                    p.left = null;
                    if ((p.right = sr) != null)
                        sr.parent = p;
                    if ((s.left = pl) != null)
                        pl.parent = s;
                    if ((s.parent = pp) == null)
                        r = s;
                    else if (p == pp.left)
                        pp.left = s;
                    else
                        pp.right = s;
                    if (sr != null)
                        replacement = sr;
                    else
                        replacement = p;
                }
                else if (pl != null)
                    replacement = pl;
                else if (pr != null)
                    replacement = pr;
                else
                    replacement = p;
                if (replacement != p) {
                    TreeNode<K,V> pp = replacement.parent = p.parent;
                    if (pp == null)
                        r = replacement;
                    else if (p == pp.left)
                        pp.left = replacement;
                    else
                        pp.right = replacement;
                    p.left = p.right = p.parent = null;
                }

                root = (p.red) ? r : balanceDeletion(r, replacement);

                if (p == replacement) {  // detach pointers
                    TreeNode<K,V> pp;
                    if ((pp = p.parent) != null) {
                        if (p == pp.left)
                            pp.left = null;
                        else if (p == pp.right)
                            pp.right = null;
                        p.parent = null;
                    }
                }
            } finally {
                unlockRoot();
            }
            assert checkInvariants(root);
            return false;
        }

        /* ------------------------------------------------------------ */
        // Red-black tree methods, all adapted from CLR

        static <K,V> TreeNode<K,V> rotateLeft(TreeNode<K,V> root,
                                              TreeNode<K,V> p) {
            TreeNode<K,V> r, pp, rl;
            if (p != null && (r = p.right) != null) {
                if ((rl = p.right = r.left) != null)
                    rl.parent = p;
                if ((pp = r.parent = p.parent) == null)
                    (root = r).red = false;
                else if (pp.left == p)
                    pp.left = r;
                else
                    pp.right = r;
                r.left = p;
                p.parent = r;
            }
            return root;
        }

        static <K,V> TreeNode<K,V> rotateRight(TreeNode<K,V> root,
                                               TreeNode<K,V> p) {
            TreeNode<K,V> l, pp, lr;
            if (p != null && (l = p.left) != null) {
                if ((lr = p.left = l.right) != null)
                    lr.parent = p;
                if ((pp = l.parent = p.parent) == null)
                    (root = l).red = false;
                else if (pp.right == p)
                    pp.right = l;
                else
                    pp.left = l;
                l.right = p;
                p.parent = l;
            }
            return root;
        }

        static <K,V> TreeNode<K,V> balanceInsertion(TreeNode<K,V> root,
                                                    TreeNode<K,V> x) {
            x.red = true;
            for (TreeNode<K,V> xp, xpp, xppl, xppr;;) {
                if ((xp = x.parent) == null) {
                    x.red = false;
                    return x;
                }
                else if (!xp.red || (xpp = xp.parent) == null)
                    return root;
                if (xp == (xppl = xpp.left)) {
                    if ((xppr = xpp.right) != null && xppr.red) {
                        xppr.red = false;
                        xp.red = false;
                        xpp.red = true;
                        x = xpp;
                    }
                    else {
                        if (x == xp.right) {
                            root = rotateLeft(root, x = xp);
                            xpp = (xp = x.parent) == null ? null : xp.parent;
                        }
                        if (xp != null) {
                            xp.red = false;
                            if (xpp != null) {
                                xpp.red = true;
                                root = rotateRight(root, xpp);
                            }
                        }
                    }
                }
                else {
                    if (xppl != null && xppl.red) {
                        xppl.red = false;
                        xp.red = false;
                        xpp.red = true;
                        x = xpp;
                    }
                    else {
                        if (x == xp.left) {
                            root = rotateRight(root, x = xp);
                            xpp = (xp = x.parent) == null ? null : xp.parent;
                        }
                        if (xp != null) {
                            xp.red = false;
                            if (xpp != null) {
                                xpp.red = true;
                                root = rotateLeft(root, xpp);
                            }
                        }
                    }
                }
            }
        }

        static <K,V> TreeNode<K,V> balanceDeletion(TreeNode<K,V> root,
                                                   TreeNode<K,V> x) {
            for (TreeNode<K,V> xp, xpl, xpr;;)  {
                if (x == null || x == root)
                    return root;
                else if ((xp = x.parent) == null) {
                    x.red = false;
                    return x;
                }
                else if (x.red) {
                    x.red = false;
                    return root;
                }
                else if ((xpl = xp.left) == x) {
                    if ((xpr = xp.right) != null && xpr.red) {
                        xpr.red = false;
                        xp.red = true;
                        root = rotateLeft(root, xp);
                        xpr = (xp = x.parent) == null ? null : xp.right;
                    }
                    if (xpr == null)
                        x = xp;
                    else {
                        TreeNode<K,V> sl = xpr.left, sr = xpr.right;
                        if ((sr == null || !sr.red) &&
                            (sl == null || !sl.red)) {
                            xpr.red = true;
                            x = xp;
                        }
                        else {
                            if (sr == null || !sr.red) {
                                if (sl != null)
                                    sl.red = false;
                                xpr.red = true;
                                root = rotateRight(root, xpr);
                                xpr = (xp = x.parent) == null ?
                                    null : xp.right;
                            }
                            if (xpr != null) {
                                xpr.red = (xp == null) ? false : xp.red;
                                if ((sr = xpr.right) != null)
                                    sr.red = false;
                            }
                            if (xp != null) {
                                xp.red = false;
                                root = rotateLeft(root, xp);
                            }
                            x = root;
                        }
                    }
                }
                else { // symmetric
                    if (xpl != null && xpl.red) {
                        xpl.red = false;
                        xp.red = true;
                        root = rotateRight(root, xp);
                        xpl = (xp = x.parent) == null ? null : xp.left;
                    }
                    if (xpl == null)
                        x = xp;
                    else {
                        TreeNode<K,V> sl = xpl.left, sr = xpl.right;
                        if ((sl == null || !sl.red) &&
                            (sr == null || !sr.red)) {
                            xpl.red = true;
                            x = xp;
                        }
                        else {
                            if (sl == null || !sl.red) {
                                if (sr != null)
                                    sr.red = false;
                                xpl.red = true;
                                root = rotateLeft(root, xpl);
                                xpl = (xp = x.parent) == null ?
                                    null : xp.left;
                            }
                            if (xpl != null) {
                                xpl.red = (xp == null) ? false : xp.red;
                                if ((sl = xpl.left) != null)
                                    sl.red = false;
                            }
                            if (xp != null) {
                                xp.red = false;
                                root = rotateRight(root, xp);
                            }
                            x = root;
                        }
                    }
                }
            }
        }

        /**
         * Recursive invariant check
         */
        static <K,V> boolean checkInvariants(TreeNode<K,V> t) {
            TreeNode<K,V> tp = t.parent, tl = t.left, tr = t.right,
                tb = t.prev, tn = (TreeNode<K,V>)t.next;
            if (tb != null && tb.next != t)
                return false;
            if (tn != null && tn.prev != t)
                return false;
            if (tp != null && t != tp.left && t != tp.right)
                return false;
            if (tl != null && (tl.parent != t || tl.hash > t.hash))
                return false;
            if (tr != null && (tr.parent != t || tr.hash < t.hash))
                return false;
            if (t.red && tl != null && tl.red && tr != null && tr.red)
                return false;
            if (tl != null && !checkInvariants(tl))
                return false;
            if (tr != null && !checkInvariants(tr))
                return false;
            return true;
        }
        // Unsafe实例
        private static final sun.misc.Unsafe U;
        // lockState在内存中的偏移量
        private static final long LOCKSTATE;
        static {
            try {
                U = sun.misc.Unsafe.getUnsafe();
                Class<?> k = TreeBin.class;
                // 获取偏移量
                LOCKSTATE = U.objectFieldOffset
                    (k.getDeclaredField("lockState"));
            } catch (Exception e) {
                throw new Error(e);
            }
        }
    }

```
