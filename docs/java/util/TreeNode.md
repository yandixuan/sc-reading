# TreeNode

是红黑树也同时是双向链表

```java
static final class TreeNode<K,V> extends LinkedHashMap.Entry<K,V> {}
```

## 属性

```java
// 父节点
TreeNode<K,V> parent;  // red-black tree links
// 左子节点
TreeNode<K,V> left;
// 右子节点
TreeNode<K,V> right;
// treeNode是一个双向链表，prev、next在构建TreeNode时已经构建好，方便从红黑树转成链表node用的
TreeNode<K,V> prev;    // needed to unlink next upon deletion
// 是否是红色
boolean red;
```

## 构造方法

```java
    TreeNode(int hash, K key, V val, Node<K,V> next) {
        super(hash, key, val, next);
    }
```

## 方法

### split

[参考](https://blog.csdn.net/u010425839/article/details/106620440/)

```java
    final void split(HashMap<K,V> map, Node<K,V>[] tab, int index, int bit) {
        TreeNode<K,V> b = this;
        // Relink into lo and hi lists, preserving order
        TreeNode<K,V> loHead = null, loTail = null;
        TreeNode<K,V> hiHead = null, hiTail = null;
        int lc = 0, hc = 0;
        // 这个for循环就是对从e节点开始对整个红黑树做遍历
        for (TreeNode<K,V> e = b, next; e != null; e = next) {
            // 取e的下一节点赋值给next遍历
            next = (TreeNode<K,V>)e.next;
            // 取好e的下一节点后，把它赋值为空，方便GC回收
            e.next = null;
            if ((e.hash & bit) == 0) {
                // 索引位置不变时
                if ((e.prev = loTail) == null)
                    loHead = e;
                else
                    loTail.next = e;
                loTail = e;
                // 做个计数，看下拉出低位链表下会有几个元素
                ++lc;
            }
            else {
                if ((e.prev = hiTail) == null)
                    hiHead = e;
                else
                    hiTail.next = e;
                hiTail = e;
                // 做个计数，看下拉出高位链表下会有几个元素
                ++hc;
            }
        }
        // 如果低位链表首节点不为null，说明有这个链表存在
        if (loHead != null) {
            // 如果链表下的元素小于等于6
            if (lc <= UNTREEIFY_THRESHOLD)
                //那就从红黑树转链表了，低位链表，迁移到新数组中下标不变，还是等于原数组到下标
                tab[index] = loHead.untreeify(map);
            else {
                // 低位链表，迁移到新数组中下标不变，还是等于原数组到下标，把低位链表整个拉到这个下标下，做个赋值
                tab[index] = loHead;
                 // 如果高位首节点不为空，说明原来的红黑树已经被拆分成两个链表了
                if (hiHead != null) // (else is already treeified)
                    // 那么就需要构建低位一个新的红黑树了
                    loHead.treeify(tab);
            }
        }
        // 如果高位链表首节点不为null，说明有这个链表存在
        if (hiHead != null) {
            // 如果链表下的元素小于等于6
            if (hc <= UNTREEIFY_THRESHOLD)
                // 那就从红黑树转链表了，高位链表，迁移到新数组中的下标=【旧数组+旧数组长度】
                tab[index + bit] = hiHead.untreeify(map);
            else {
                // 高位链表，迁移到新数组中的下标=【旧数组+旧数组长度】
                tab[index + bit] = hiHead;
                if (loHead != null)
                    // 如果低位首节点不为空，说明原来的红黑树已经被拆分成两个链表了
                    hiHead.treeify(tab);
            }
        }
    }
```

### untreeify

```java
    final Node<K,V> untreeify(HashMap<K,V> map) {
        // this是链表头节点
        Node<K,V> hd = null, tl = null;
        for (Node<K,V> q = this; q != null; q = q.next) {
            // 将TreeNode 换成链表的 Node
            Node<K,V> p = map.replacementNode(q, null);
            if (tl == null)
                hd = p;
            else
                tl.next = p;
            tl = p;
        }
        return hd;
    }
```

### treeify

```java
    final void treeify(Node<K,V>[] tab) {
        TreeNode<K,V> root = null;
        for (TreeNode<K,V> x = this, next; x != null; x = next) {
            // 获取下个节点
            next = (TreeNode<K,V>)x.next;
            // 因为是重新生成树，所以 x的left，right都置空
            x.left = x.right = null;
            if (root == null) {
                // 第一次root肯定是空
                x.parent = null;
                x.red = false;
                root = x;
            }
            else {
                // key值
                K k = x.key;
                // x节点的hash值
                int h = x.hash;
                Class<?> kc = null;
                // 从根节点遍历插入节点
                for (TreeNode<K,V> p = root;;) {
                    // dir代表差值
                    // ph代表父亲节点hash值
                    int dir, ph;
                    K pk = p.key;
                    if ((ph = p.hash) > h)
                        dir = -1;
                    else if (ph < h)
                        dir = 1;

                    /*
                     * 如果两个节点的key的hash值相等，那么还要通过其他方式再进行比较
                     * 如果当前链表节点的key实现了comparable接口，并且当前树节点和链表节点是相同Class的实例，那么通过comparable的方式再比较两者。
                     * 如果还是相等，最后再通过tieBreakOrder比较一次
                     */
                    else if ((kc == null &&
                              (kc = comparableClassFor(k)) == null) ||
                             (dir = compareComparables(kc, k, pk)) == 0)
                        dir = tieBreakOrder(k, pk);
                    // 保存当前树节点
                    TreeNode<K,V> xp = p;
                    if ((p = (dir <= 0) ? p.left : p.right) == null) {
                        // 当前链表节点 作为 当前树节点的子节点
                        x.parent = xp;
                        if (dir <= 0)
                            xp.left = x;
                        else
                            xp.right = x;
                        // 插入节点之后需要调整红黑树平衡
                        root = balanceInsertion(root, x);
                        break;
                    }
                }
            }
        }
        moveRootToFront(tab, root);
    }

```

### balanceInsertion

```java
    static <K, V> TreeNode<K, V> balanceInsertion(TreeNode<K, V> root,
                                                  TreeNode<K, V> x) {
        // 插入节点默认为红色
        x.red = true;
        // 这里定义了4个变量
        // xp：当前节点的父节点、xpp：爷爷节点、xppl：左叔叔节点、xppr：右叔叔节点
        for (TreeNode<K, V> xp, xpp, xppl, xppr; ; ) {
            // 如果父节点为空、说明当前没有根节点
            if ((xp = x.parent) == null) {
                x.red = false;
                // 将x返回过去成为根节点
                return x;
            } else if (!xp.red || (xpp = xp.parent) == null) {
                // 如果xp是根节点，不需要调整over
                return root;
            }
            // 如果父节点是爷爷节点的左孩子
            if (xp == (xppl = xpp.left)) {
                // 爷爷的右子树不为空，并且是红色节点
                if ((xppr = xpp.right) != null && xppr.red) {
                    // 父亲和叔叔节点染黑，爷爷节点染红，指针回溯至爷爷节点接着调整
                    xppr.red = false;
                    xp.red = false;
                    xpp.red = true;
                    x = xpp;
                } else {
                    // 如果右叔叔为空 或者 为黑色
                    if (x == xp.right) {
                        // x节点是右子树
                        // 将x的父节点进行左旋，指针x指向xp
                        root = rotateLeft(root, x = xp);
                        // 重新获取 xp,xpp节点
                        xpp = (xp = x.parent) == null ? null : xp.parent;
                    }
                    // x，xp,xpp在一条线上了 ，xp染黑其余染红，右旋xpp
                    if (xp != null) {
                        xp.red = false;
                        if (xpp != null) {
                            xpp.red = true;
                            root = rotateRight(root, xpp);
                        }
                    }
                }
            } else {
                // 如果父节点是爷爷节点的右孩子
                if (xppl != null && xppl.red) {
                    xppl.red = false;
                    xp.red = false;
                    xpp.red = true;
                    x = xpp;
                } else {
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

```

### putTreeVal

```java
    final TreeNode<K, V> putTreeVal(HashMap<K, V> map, Node<K, V>[] tab,
                                        int h, K k, V v) {
        Class<?> kc = null;
        // 是否找到节点标志
        boolean searched = false;
        TreeNode<K, V> root = (parent != null) ? root() : this;
        for (TreeNode<K, V> p = root; ; ) {
            int dir, ph;
            K pk;
            if ((ph = p.hash) > h) {
                dir = -1;
            } else if (ph < h) {
                dir = 1;
            } else if ((pk = p.key) == k || (k != null && k.equals(pk))) {
                // 这里直接找到了节点
                return p;
            } else if ((kc == null &&
                    (kc = comparableClassFor(k)) == null) ||
                    (dir = compareComparables(kc, k, pk)) == 0) {
                // 说明进入下面这个判断的条件是 hash相同 但是equal不同
                // 没有实现Comparable<C>接口或者 实现该接口 并且 k与pk Comparable比较结果相同
                if (!searched) {
                    TreeNode<K, V> q, ch;
                    searched = true;
                    // 在左右子树递归的寻找 是否有key的hash相同  并且equals相同的节点
                    if (((ch = p.left) != null &&
                            (q = ch.find(h, k, kc)) != null) ||
                            ((ch = p.right) != null &&
                                    (q = ch.find(h, k, kc)) != null)) {
                        // 找到了就返回
                        return q;
                    }
                }
                dir = tieBreakOrder(k, pk);
            }
            // 说明红黑树中没有与之equals相等的  那就必须进行插入操作
            // 打破平衡的方法的 分出大小 结果 只有-1 1
            // 到这里已经找到了要插入节点P
            // 将xp指向p（父节点）
            TreeNode<K, V> xp = p;
            if ((p = (dir <= 0) ? p.left : p.right) == null) {
                Node<K, V> xpn = xp.next;
                // 实例化TreeNode
                TreeNode<K, V> x = map.newTreeNode(h, k, v, xpn);
                if (dir <= 0) {
                    xp.left = x;
                } else {
                    xp.right = x;
                }
                // 连接前后，树父母关系
                xp.next = x;
                x.parent = x.prev = xp;
                if (xpn != null) {
                    ((TreeNode<K, V>) xpn).prev = x;
                }
                moveRootToFront(tab, balanceInsertion(root, x));
                return null;
            }
        }
    }
```

### removeTreeNode

[参考](https://juejin.cn/post/6844903681003913223#heading-7)

```java
    // 删除树节点（节点同时是树表也是链表）
    final void removeTreeNode(HashMap<K,V> map, Node<K,V>[] tab,
                              boolean movable) {
        // 定义数组长度n
        int n;
        // 如果数组空或者长度0即退出
        if (tab == null || (n = tab.length) == 0)
            return;
        // 根据TreeNode的hash值算出它所在树的数组下标
        int index = (n - 1) & hash;
        /**
         * first-头节点，数组存放数据索引位置存在存放的节点值
         * root-根节点,红黑树的根节点，正常情况下二者是相等的
         * rl-root节点的左孩子节点,succ-后节点,pred-前节点
         */
        TreeNode<K,V> first = (TreeNode<K,V>)tab[index], root = first, rl;
        /**
         * 维护双向链表（map在红黑树数据存储的过程中，除了维护红黑树之外还对双向链表进行了维护）
         * 从链表中将该节点删除
         * 如果前驱节点为空，说明删除节点是头节点，删除之后，头节点直接指向了删除节点的后继节点
         */
        TreeNode<K,V> succ = (TreeNode<K,V>)next, pred = prev;
        if (pred == null)
            // 如果pred是空，那么first指向succ tab[index] 也指向succ
            tab[index] = first = succ;
        else
            // 否则 ped.next指向succ
            pred.next = succ;
        if (succ != null)
            // 如果 succ不是空，修改succ的prev关系
            succ.prev = pred;
        // 如果头节点（即根节点）为空，说明该节点删除后，红黑树为空，直接返回
        if (first == null)
            return;
        // 如果父节点不为空，说明删除后，调用root方法重新获取当前树的根节点
        if (root.parent != null)
            root = root.root();
        /**
         * 当以下三个条件任一满足时，当满足红黑树条件时，说明该位置元素的长度少于6（UNTREEIFY_THRESHOLD），需要对该位置元素链表化
         * 1、root == null：根节点为空，树节点数量为0
         * 2、root.right == null：右孩子为空，树节点数量最多为2
         * 3、(rl = root.left) == null || rl.left == null)：
         *      (rl = root.left) == null：左孩子为空，树节点数最多为2
         *      rl.left == null：左孩子的左孩子为NULL，树节点数最多为6
         */
        if (root == null
            || (movable
                && (root.right == null
                    || (rl = root.left) == null
                    || rl.left == null))) {
            // 链表化，因为前面对链表节点完成了删除操作，故在这里完成之后直接返回，即可完成节点的删除
            tab[index] = first.untreeify(map);  // too small
            return;
        }
        /**
         * p-调用此方法的节点（待删除节点），pl-待删除节点的左子节点，pr-待删除节点的右子节点，replacement-替换节点
         * 以下是对红黑树进行维护
         */
        TreeNode<K,V> p = this, pl = left, pr = right, replacement;
        // 1、删除节点有两个子节点
        if (pl != null && pr != null) {
            // 第一步：找到当前节点的后继节点（注意与后驱节点的区别，值大于当前节点值的最小节点，以右子树为根节点，查找它对用的最左节点）
            TreeNode<K,V> s = pr, sl;
            while ((sl = s.left) != null) // find successor
                s = sl;
            // 第二步：交换后继节点和删除节点的颜色，最终的删除是删除后继节点，故平衡是否是以后继节点的颜色来
            boolean c = s.red; s.red = p.red; p.red = c; // swap colors
            // sr-后继节点的右孩子（后继节点是肯定不存在左孩子的，如果存在的话，那么它肯定不是后继节点）
            TreeNode<K,V> sr = s.right;
            // pp-待删除节点的父节点
            TreeNode<K,V> pp = p.parent;
            // 第三步：修改当前节点和后继节点的父节点
            // 如果后继节点与当前节点的右孩子相等，类似于右孩子只有一个节点
            if (s == pr) { // p was s's direct parent
                // 交换两个节点的位置，父节点变子节点，子节点变父节点
                p.parent = s;
                s.right = p;
            }
            else {
                // 待删除节点的右节点有左孩子
                // 记录sp-后继节点的父节点
                TreeNode<K,V> sp = s.parent;
                // 互换p 和 后继节点s
                //后继节点存在父节点，则让待删除节点替代后继节点
                if ((p.parent = sp) != null) {
                    // 如果后继节点是其父节点的左孩子，修改父节点左孩子值
                    if (s == sp.left)
                        sp.left = p;
                    else
                    // 如果后继节点是其父节点的右孩子，修改父节点右孩子值
                        sp.right = p;
                }
                // 修改后继节点的右孩子值，如果不为null，同时指定其父节点的值(s是没有左节点的)
                if ((s.right = pr) != null)
                    pr.parent = s;
            }
            // 待删除节点左孩子为null
            p.left = null;
            // 后继节点存在右节点，则让其成为待删除节点的右节点
            if ((p.right = sr) != null)
                // 相对应，待删除节点成为其父节点
                sr.parent = p;
            //待删除节点存在左节点，则让其成为后继节点的左节点
            if ((s.left = pl) != null)
                // 相对应，后继节点成为其父节点
                pl.parent = s;
            // 待删除节点不存在父节点，则后继节点父节点为null
            if ((s.parent = pp) == null)
                // 后继节点成为根节点
                root = s;
            // 待删除节点存在父节点，且待删除节点是其左节点
            else if (p == pp.left)
                // 后继节点作为其左节点
                pp.left = s;
            else
                // 后继节点作为其右节点
                pp.right = s;
            // 后继节点存在右节点，则替代节点为该节点
            if (sr != null)
                replacement = sr;
            else
                // 替代节点为待删除节点(等于未找到)
                replacement = p;
        }
        // 待删除节点只有左节点
        else if (pl != null)
            replacement = pl;
        // 待删除节点只有右节点
        else if (pr != null)
            replacement = pr;
        else
            // 待删除节点为叶子节点
            replacement = p;
        // 替代节点不为待删除节点，则先进行节点删除，然后进行平衡调整
        if (replacement != p) {
            TreeNode<K,V> pp = replacement.parent = p.parent;
            if (pp == null)
                root = replacement;
            else if (p == pp.left)
                pp.left = replacement;
            else
                pp.right = replacement;
            p.left = p.right = p.parent = null;
        }

        TreeNode<K,V> r = p.red ? root : balanceDeletion(root, replacement);
        // 替代节点为待删除节点，则先进行平衡调整，然后进行节点删除
        if (replacement == p) {  // detach
            TreeNode<K,V> pp = p.parent;
            p.parent = null;
            if (pp != null) {
                if (p == pp.left)
                    pp.left = null;
                else if (p == pp.right)
                    pp.right = null;
            }
        }
        if (movable)
            // 将红黑树根节点移动到数组索引位置
            moveRootToFront(tab, r);
    }
```
