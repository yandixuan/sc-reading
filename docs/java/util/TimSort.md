# TimSort

[参考](https://blog.csdn.net/Ybt_c_index/article/details/114485863)

```java
/**
 * A stable, adaptive, iterative mergesort that requires far fewer than
 * n lg(n) comparisons when running on partially sorted arrays, while
 * offering performance comparable to a traditional mergesort when run
 * on random arrays.  Like all proper mergesorts, this sort is stable and
 * runs O(n log n) time (worst case).  In the worst case, this sort requires
 * temporary storage space for n/2 object references; in the best case,
 * it requires only a small constant amount of space.
 *
 * This implementation was adapted from Tim Peters's list sort for
 * Python, which is described in detail here:
 *
 *   http://svn.python.org/projects/python/trunk/Objects/listsort.txt
 *
 * Tim's C code may be found here:
 *
 *   http://svn.python.org/projects/python/trunk/Objects/listobject.c
 *
 * The underlying techniques are described in this paper (and may have
 * even earlier origins):
 *
 *  "Optimistic Sorting and Information Theoretic Complexity"
 *  Peter McIlroy
 *  SODA (Fourth Annual ACM-SIAM Symposium on Discrete Algorithms),
 *  pp 467-474, Austin, Texas, 25-27 January 1993.
 *
 * While the API to this class consists solely of static methods, it is
 * (privately) instantiable; a TimSort instance holds the state of an ongoing
 * sort, assuming the input array is large enough to warrant the full-blown
 * TimSort. Small arrays are sorted in place, using a binary insertion sort.
 *
 * @author Josh Bloch
 */
class TimSort<T> {
    /**
     * This is the minimum sized sequence that will be merged.  Shorter
     * sequences will be lengthened by calling binarySort.  If the entire
     * array is less than this length, no merges will be performed.
     *
     * This constant should be a power of two.  It was 64 in Tim Peter's C
     * implementation, but 32 was empirically determined to work better in
     * this implementation.  In the unlikely event that you set this constant
     * to be a number that's not a power of two, you'll need to change the
     * {@link #minRunLength} computation.
     *
     * If you decrease this constant, you must change the stackLen
     * computation in the TimSort constructor, or you risk an
     * ArrayOutOfBounds exception.  See listsort.txt for a discussion
     * of the minimum stack length required as a function of the length
     * of the array being sorted and the minimum merge sequence length.
     */
    private static final int MIN_MERGE = 32;

    /**
     * The array being sorted.
     */
    private final T[] a;

    /**
     * The comparator for this sort.
     */
    private final Comparator<? super T> c;

    /**
     * When we get into galloping mode, we stay there until both runs win less
     * often than MIN_GALLOP consecutive times.
     */
    private static final int  MIN_GALLOP = 7;

    /**
     * This controls when we get *into* galloping mode.  It is initialized
     * to MIN_GALLOP.  The mergeLo and mergeHi methods nudge it higher for
     * random data, and lower for highly structured data.
     */
    private int minGallop = MIN_GALLOP;

    /**
     * Maximum initial size of tmp array, which is used for merging.  The array
     * can grow to accommodate demand.
     *
     * Unlike Tim's original C version, we do not allocate this much storage
     * when sorting smaller arrays.  This change was required for performance.
     */
    private static final int INITIAL_TMP_STORAGE_LENGTH = 256;

    /**
     * Temp storage for merges. A workspace array may optionally be
     * provided in constructor, and if so will be used as long as it
     * is big enough.
     */
    private T[] tmp;
    private int tmpBase; // base of tmp array slice
    private int tmpLen;  // length of tmp array slice

    /**
     * A stack of pending runs yet to be merged.  Run i starts at
     * address base[i] and extends for len[i] elements.  It's always
     * true (so long as the indices are in bounds) that:
     *
     *     runBase[i] + runLen[i] == runBase[i + 1]
     *
     * so we could cut the storage for this, but it's a minor amount,
     * and keeping all the info explicit simplifies the code.
     */
    private int stackSize = 0;  // Number of pending runs on stack
    private final int[] runBase;
    private final int[] runLen;

    /**
     * Creates a TimSort instance to maintain the state of an ongoing sort.
     *
     * @param a the array to be sorted
     * @param c the comparator to determine the order of the sort
     * @param work a workspace array (slice)
     * @param workBase origin of usable space in work array
     * @param workLen usable size of work array
     */
    private TimSort(T[] a, Comparator<? super T> c, T[] work, int workBase, int workLen) {
        this.a = a;
        this.c = c;

        // Allocate temp storage (which may be increased later if necessary)
        int len = a.length;
        // 确定临时数组的长度， 如果低于默认值256的2倍， 则空间大小为原始数组a的长度乘以2， 否则为默认长度
        int tlen = (len < 2 * INITIAL_TMP_STORAGE_LENGTH) ?
            len >>> 1 : INITIAL_TMP_STORAGE_LENGTH;
        /**
         * 如果工作数组为空 | 工作数组的长度小于带排序数组的长度 | 工作数组可用偏移量+待排序数组长度超出工作数组长度
         * 则反射new一个新的数组
         */
        if (work == null || workLen < tlen || workBase + tlen > work.length) {
            @SuppressWarnings({"unchecked", "UnnecessaryLocalVariable"})
            T[] newArray = (T[])java.lang.reflect.Array.newInstance
                (a.getClass().getComponentType(), tlen);
            tmp = newArray;
            tmpBase = 0;
            tmpLen = tlen;
        }
        else {
            // 当指定的work数组不为空，且workLen大于计算出的tlen的长度，并且work数组的有效长度大于tlen的长度时，使用指定的临时数组
            tmp = work;
            tmpBase = workBase;
            tmpLen = workLen;
        }

        /*
         * Allocate runs-to-be-merged stack (which cannot be expanded).  The
         * stack length requirements are described in listsort.txt.  The C
         * version always uses the same stack length (85), but this was
         * measured to be too expensive when sorting "mid-sized" arrays (e.g.,
         * 100 elements) in Java.  Therefore, we use smaller (but sufficiently
         * large) stack lengths for smaller arrays.  The "magic numbers" in the
         * computation below must be changed if MIN_MERGE is decreased.  See
         * the MIN_MERGE declaration above for more information.
         * The maximum value of 49 allows for an array up to length
         * Integer.MAX_VALUE-4, if array is filled by the worst case stack size
         * increasing scenario. More explanations are given in section 4 of:
         * http://envisage-project.eu/wp-content/uploads/2015/02/sorting.pdf
         */

        /**
         * 分配将要合并的runs的栈（无法扩展）。栈长度可以参考listsort.txt的描述。
         * C版本总是使用相同的栈长（85），但在java中对于排序中等大小的数组（如100个元素）时过于浪费。
         * 因此，我们对更小的数组使用更小的栈长（但足够大）。
         * 如下计算的“魔法数”在MIN_MERGE减小时需要改变。可以在上述MIN_MERGE中查看更多信息。
         * 最大值49允许数组长度直到Integer.MAX_VALUE-4，用于最坏情况下数组填充的栈长度。
         */
        int stackLen = (len <    120  ?  5 :
                        len <   1542  ? 10 :
                        len < 119151  ? 24 : 49);
        runBase = new int[stackLen];
        runLen = new int[stackLen];
    }

    /*
     * The next method (package private and static) constitutes the
     * entire API of this class.
     */

    /**
     * Sorts the given range, using the given workspace array slice
     * for temp storage when possible. This method is designed to be
     * invoked from public methods (in class Arrays) after performing
     * any necessary array bounds checks and expanding parameters into
     * the required forms.
     *
     * @param a the array to be sorted
     * @param lo the index of the first element, inclusive, to be sorted 排序数组的左边界(包含)
     * @param hi the index of the last element, exclusive, to be sorted 排序数组的右边界(不包含)
     * @param c the comparator to use
     * @param work a workspace array (slice)
     * @param workBase origin of usable space in work array
     * @param workLen usable size of work array
     * @since 1.8
     */
    static <T> void sort(T[] a, int lo, int hi, Comparator<? super T> c,
                         T[] work, int workBase, int workLen) {
        assert c != null && a != null && lo >= 0 && lo <= hi && hi <= a.length;
        // 计算长度
        int nRemaining  = hi - lo;
        // 长度是0或者1 就不需要排序了
        if (nRemaining < 2)
            return;  // Arrays of size 0 and 1 are always sorted

        // If array is small, do a "mini-TimSort" with no merges
        // 小于MIN_MERGE长度的数组就不用归并排序了
        if (nRemaining < MIN_MERGE) {
            // 获取当前数组从开始位置的一段连续递增或者严格递减序列的长度
            // 是因为我们希望最终的序列是递增的，对于递减的序列我们可以反转成为递增的序列
            // lo + initRunLen指定了不满足递增条件的元素的开始顺序，即该位置之前的所有数据都是连续递增的
            int initRunLen = countRunAndMakeAscending(a, lo, hi, c);
            // 我们从该位置开始使用二分查找算法查找在之前有序序列中查找插入位置，进行插入，实现二分插入排序
            binarySort(a, lo, hi, lo + initRunLen, c);
            return;
        }

        /**
         * March over the array once, left to right, finding natural runs,
         * extending short natural runs to minRun elements, and merging runs
         * to maintain stack invariant.
         */
        TimSort<T> ts = new TimSort<>(a, c, work, workBase, workLen);
        /**
         * 在合并序列的时候，如果 run 数量等于或者略小于 2 的幂次方的时候，合并效率最高；如果略大于 2 的幂次方，效率就会显著降低。所以为了提高合并效率，需要尽量控制每个 run 的长度
         * minrun 来表示每个 run 的最小长度，如果长度太短，就用二分插入排序把 run 后面的元素插入到前面的 run 里面
         */
        int minRun = minRunLength(nRemaining);
        do {
            // Identify next run
            // 下一个升序序列的长度
            int runLen = countRunAndMakeAscending(a, lo, hi, c);

            // If run is short, extend to min(minRun, nRemaining)
            if (runLen < minRun) {
                // 如果run长度小于minRun，将其扩展为min(nRemaining,minRun)
                int force = nRemaining <= minRun ? nRemaining : minRun;
                // 如果run的长度小于minRun，那么将该run结束位置之后的元素添加到该run中，使长度满足minRun
                // lo+runLen前的序列是有序的，后半部分无序的序列进行二分插入排序
                binarySort(a, lo, lo + force, lo + runLen, c);
                runLen = force;
            }

            // Push run onto pending-run stack, and maybe merge
            // 将当前run入栈，入栈主要保存当前run的开始位置以及长度
            // runBase是一个数组用来保存每个run的开始位置
            // runLen是一个数组用来保存每个run的长度
            ts.pushRun(lo, runLen);
            // 合并栈
            ts.mergeCollapse();

            // Advance to find next run
            // 改变低位索引
            lo += runLen;
            // 减去run长度
            nRemaining -= runLen;
        } while (nRemaining != 0);

        // Merge all remaining runs to complete sort
        assert lo == hi;
        // 如果栈中剩下的run大于1
        // 如果至少存在3个run并且runLen[n-3]<runLen[n-1]那么将n-3和n-2对应的run进行合并，否则将后两个run进行合并
        ts.mergeForceCollapse();
        assert ts.stackSize == 1;
    }

    /**
     * Sorts the specified portion of the specified array using a binary
     * insertion sort.  This is the best method for sorting small numbers
     * of elements.  It requires O(n log n) compares, but O(n^2) data
     * movement (worst case).
     *
     * If the initial part of the specified range is already sorted,
     * this method can take advantage of it: the method assumes that the
     * elements from index {@code lo}, inclusive, to {@code start},
     * exclusive are already sorted.
     *
     * @param a the array in which a range is to be sorted
     * @param lo the index of the first element in the range to be sorted
     * @param hi the index after the last element in the range to be sorted
     * @param start the index of the first element in the range that is
     *        not already known to be sorted ({@code lo <= start <= hi})
     * @param c comparator to used for the sort
     */
    @SuppressWarnings("fallthrough")
    private static <T> void binarySort(T[] a, int lo, int hi, int start,
                                       Comparator<? super T> c) {
        assert lo <= start && start <= hi;
        // 如果start 从起点开始，做下预处理；也就是原本就是无序的。
        if (start == lo)
            start++;
        // 从start位置开始，对后面的所有元素排序
        for ( ; start < hi; start++) {
            // pivot 代表正在参与排序的值，
            T pivot = a[start];

            // Set left (and right) to the index where a[start] (pivot) belongs
            // 把pivot应当插入的区间的边界设置为left和right
            int left = lo;
            int right = start;
            assert left <= right;
            /*
             * Invariants:
             *   pivot >= all in [lo, left).
             *   pivot <  all in [right, start).
             */
            // 直到left==right结束循环 
            while (left < right) {
                // 取中位数
                int mid = (left + right) >>> 1;
                if (c.compare(pivot, a[mid]) < 0)
                    // 如果a[mid]>pivot则右边界则为right（二分）
                    right = mid;
                else
                    // a[mid]<=pivot则左边界为 mid+1
                    left = mid + 1;
            }
            assert left == right;

            /*
             * The invariants still hold: pivot >= all in [lo, left) and
             * pivot < all in [left, start), so pivot belongs at left.  Note
             * that if there are elements equal to pivot, left points to the
             * first slot after them -- that's why this sort is stable.
             * Slide elements over to make room for pivot.
             */
            // left代表要插入元素的位置则start-left代表要移动的元素 
            int n = start - left;  // The number of elements to move
            // Switch is just an optimization for arraycopy in default case
            // 1-2个元素的移动就不需要System.arraycopy了
            switch (n) {
                // 当n位1~2时，left+1,left向右移动1位
                case 2:  a[left + 2] = a[left + 1];
                case 1:  a[left + 1] = a[left];
                         break;
                // 从left开始n长度的元素向右移动一位         
                default: System.arraycopy(a, left, a, left + 1, n);
            }
            // left位置插入元素即完成一次插入排序
            a[left] = pivot;
        }
    }

    /**
     * Returns the length of the run beginning at the specified position in
     * the specified array and reverses the run if it is descending (ensuring
     * that the run will always be ascending when the method returns).
     *
     * A run is the longest ascending sequence with:
     *
     *    a[lo] <= a[lo + 1] <= a[lo + 2] <= ...
     *
     * or the longest descending sequence with:
     *
     *    a[lo] >  a[lo + 1] >  a[lo + 2] >  ...
     *
     * For its intended use in a stable mergesort, the strictness of the
     * definition of "descending" is needed so that the call can safely
     * reverse a descending sequence without violating stability.
     *
     * @param a the array in which a run is to be counted and possibly reversed
     * @param lo index of the first element in the run
     * @param hi index after the last element that may be contained in the run.
              It is required that {@code lo < hi}.
     * @param c the comparator to used for the sort
     * @return  the length of the run beginning at the specified position in
     *          the specified array
     */
    private static <T> int countRunAndMakeAscending(T[] a, int lo, int hi,
                                                    Comparator<? super T> c) {
        assert lo < hi;
        int runHi = lo + 1;
        if (runHi == hi)
            return 1;

        // Find end of run, and reverse range if descending
        if (c.compare(a[runHi++], a[lo]) < 0) { // Descending
            while (runHi < hi && c.compare(a[runHi], a[runHi - 1]) < 0)
                runHi++;
            reverseRange(a, lo, runHi);
        } else {                              // Ascending
            while (runHi < hi && c.compare(a[runHi], a[runHi - 1]) >= 0)
                runHi++;
        }

        return runHi - lo;
    }

    /**
     * Reverse the specified range of the specified array.
     * 反转数组
     * @param a the array in which a range is to be reversed
     * @param lo the index of the first element in the range to be reversed
     * @param hi the index after the last element in the range to be reversed
     */
    private static void reverseRange(Object[] a, int lo, int hi) {
        hi--;
        while (lo < hi) {
            Object t = a[lo];
            a[lo++] = a[hi];
            a[hi--] = t;
        }
    }

    /**
     * Returns the minimum acceptable run length for an array of the specified
     * length. Natural runs shorter than this will be extended with
     * {@link #binarySort}.
     *
     * Roughly speaking, the computation is:
     *
     *  If n < MIN_MERGE, return n (it's too small to bother with fancy stuff).
     *  Else if n is an exact power of 2, return MIN_MERGE/2.
     *  Else return an int k, MIN_MERGE/2 <= k <= MIN_MERGE, such that n/k
     *   is close to, but strictly less than, an exact power of 2.
     *
     * For the rationale, see listsort.txt.
     *
     * @param n the length of the array to be sorted
     * @return the length of the minimum run to be merged
     */
    // MIN_MERGE/2 <= k <= MIN_MERGE范围的值k，这样可以使的 n/k 接近但严格小于 2 的幂次方 
    private static int minRunLength(int n) {
        assert n >= 0;
        int r = 0;      // Becomes 1 if any 1 bits are shifted off
        // 如果n的低位有任何一位为1，r就会置为1
        while (n >= MIN_MERGE) {
            r |= (n & 1);
            n >>= 1;
        }
        return n + r;
    }

    /**
     * Pushes the specified run onto the pending-run stack.
     *
     * @param runBase index of the first element in the run
     * @param runLen  the number of elements in the run
     */
    private void pushRun(int runBase, int runLen) {
        this.runBase[stackSize] = runBase;
        this.runLen[stackSize] = runLen;
        stackSize++;
    }

    /**
     * Examines the stack of runs waiting to be merged and merges adjacent runs
     * until the stack invariants are reestablished:
     *
     *     1. runLen[i - 3] > runLen[i - 2] + runLen[i - 1]
     *     2. runLen[i - 2] > runLen[i - 1]
     *
     * This method is called each time a new run is pushed onto the stack,
     * so the invariants are guaranteed to hold for i < stackSize upon
     * entry to the method.
     */
   /**
    * 检查等待合并runs的栈，并且合并相邻的runs直到栈不变量被更新为
    *
    *     1. runLen[i - 3] > runLen[i - 2] + runLen[i - 1]
    *     2. runLen[i - 2] > runLen[i - 1]
    *
    * 每当一个新的run被push到栈中都会调用该方法，因此i<stackSize是保证不变量的条件
    * 尽量保证run合并的效率
    */
    private void mergeCollapse() {
        // 只有栈长大于1才会执行合并操作
        while (stackSize > 1) {
            // 取栈顶的第二个run
            int n = stackSize - 2;
            if (n > 0 && runLen[n-1] <= runLen[n] + runLen[n+1]) {
                // 比较第三个run和第一个run的长度（第三个为栈底，第一个为栈顶）
                if (runLen[n - 1] < runLen[n + 1])
                    // 当第三个run的长度小于第一个run，则n为第三个run
                    n--;
                // 否则合并第二个run和第一个run
                mergeAt(n);
            } else if (runLen[n] <= runLen[n + 1]) { // 比较第二个run和第一个run长度
                // 当第二个run的长度小于第一个run长度，n为第二个run即合并第二个run和第一个run
                mergeAt(n);
            } else {
                break; // Invariant is established
            }
        }
    }

    /**
     * Merges all runs on the stack until only one remains.  This method is
     * called once, to complete the sort.
     */
    private void mergeForceCollapse() {
        while (stackSize > 1) {
            int n = stackSize - 2;
            if (n > 0 && runLen[n - 1] < runLen[n + 1])
                n--;
            mergeAt(n);
        }
    }

    /**
     * Merges the two runs at stack indices i and i+1.  Run i must be
     * the penultimate or antepenultimate run on the stack.  In other words,
     * i must be equal to stackSize-2 or stackSize-3.
     *
     * @param i stack index of the first of the two runs to merge
     */
    private void mergeAt(int i) {
        assert stackSize >= 2;
        assert i >= 0;
        assert i == stackSize - 2 || i == stackSize - 3;

        int base1 = runBase[i];
        int len1 = runLen[i];
        int base2 = runBase[i + 1];
        int len2 = runLen[i + 1];
        assert len1 > 0 && len2 > 0;
        assert base1 + len1 == base2;

        /*
         * Record the length of the combined runs; if i is the 3rd-last
         * run now, also slide over the last run (which isn't involved
         * in this merge).  The current run (i+1) goes away in any case.
         */
        // 将第i+1个run合并到第i个run，所以需要更新第i个run的长度 
        runLen[i] = len1 + len2;
        if (i == stackSize - 3) {
            // 假如合并的是倒数第三个run和倒数第二个run(即栈底run)，那么需要将最后一个run的信息往前挪
            runBase[i + 1] = runBase[i + 2];
            runLen[i + 1] = runLen[i + 2];
        }
        stackSize--;

        /*
         * Find where the first element of run2 goes in run1. Prior elements
         * in run1 can be ignored (because they're already in place).
         */
        // 计算第二个run的第一个元素应该应该插入到第一个run中的位置
        // 那么在该位置之前的属于第一个run1的数据就可以不用处理了，因为run1的数据已经是有序的了
        // 即对run1“去头”
        int k = gallopRight(a[base2], a, base1, len1, 0, c);
        assert k >= 0;
        // 忽略前k个元素
        base1 += k;
        // run1长度减k
        len1 -= k;
        if (len1 == 0)
            return;

        /*
         * Find where the last element of run1 goes in run2. Subsequent elements
         * in run2 can be ignored (because they're already in place).
         */
        // 计算run1的最后一个元素，即最大的元素在run2中的插入位置
        // run2中该位置之后的数据就不需要排序了
        // 即对run2“去尾” 
        len2 = gallopLeft(a[base1 + len1 - 1], a, base2, len2, len2 - 1, c);
        assert len2 >= 0;
        if (len2 == 0)
            return;

        // Merge remaining runs, using tmp array with min(len1, len2) elements
        // 合并剩下的runs，使用临时数组，大小为min(len1, len2)
        if (len1 <= len2)
            mergeLo(base1, len1, base2, len2);
        else
            mergeHi(base1, len1, base2, len2);
    }

    /**
     * Locates the position at which to insert the specified key into the
     * specified sorted range; if the range contains an element equal to key,
     * returns the index of the leftmost equal element.
     *
     * @param key the key whose insertion point to search for
     * @param a the array in which to search
     * @param base the index of the first element in the range
     * @param len the length of the range; must be > 0
     * @param hint the index at which to begin the search, 0 <= hint < n.
     *     The closer hint is to the result, the faster this method will run.
     * @param c the comparator used to order the range, and to search
     * @return the int k,  0 <= k <= n such that a[b + k - 1] < key <= a[b + k],
     *    pretending that a[b - 1] is minus infinity and a[b + n] is infinity.
     *    In other words, key belongs at index b + k; or in other words,
     *    the first k elements of a should precede key, and the last n - k
     *    should follow it.
     */
    private static <T> int gallopLeft(T key, T[] a, int base, int len, int hint,
                                      Comparator<? super T> c) {
        assert len > 0 && hint >= 0 && hint < len;
        int lastOfs = 0;
        int ofs = 1;
        if (c.compare(key, a[base + hint]) > 0) {
            // Gallop right until a[base+hint+lastOfs] < key <= a[base+hint+ofs]
            int maxOfs = len - hint;
            while (ofs < maxOfs && c.compare(key, a[base + hint + ofs]) > 0) {
                lastOfs = ofs;
                ofs = (ofs << 1) + 1;
                if (ofs <= 0)   // int overflow
                    ofs = maxOfs;
            }
            if (ofs > maxOfs)
                ofs = maxOfs;

            // Make offsets relative to base
            lastOfs += hint;
            ofs += hint;
        } else { // key <= a[base + hint]
            // Gallop left until a[base+hint-ofs] < key <= a[base+hint-lastOfs]
            final int maxOfs = hint + 1;
            while (ofs < maxOfs && c.compare(key, a[base + hint - ofs]) <= 0) {
                lastOfs = ofs;
                ofs = (ofs << 1) + 1;
                if (ofs <= 0)   // int overflow
                    ofs = maxOfs;
            }
            if (ofs > maxOfs)
                ofs = maxOfs;

            // Make offsets relative to base
            int tmp = lastOfs;
            lastOfs = hint - ofs;
            ofs = hint - tmp;
        }
        assert -1 <= lastOfs && lastOfs < ofs && ofs <= len;

        /*
         * Now a[base+lastOfs] < key <= a[base+ofs], so key belongs somewhere
         * to the right of lastOfs but no farther right than ofs.  Do a binary
         * search, with invariant a[base + lastOfs - 1] < key <= a[base + ofs].
         */
        lastOfs++;
        while (lastOfs < ofs) {
            int m = lastOfs + ((ofs - lastOfs) >>> 1);

            if (c.compare(key, a[base + m]) > 0)
                lastOfs = m + 1;  // a[base + m] < key
            else
                ofs = m;          // key <= a[base + m]
        }
        assert lastOfs == ofs;    // so a[base + ofs - 1] < key <= a[base + ofs]
        return ofs;
    }

    /**
     * Like gallopLeft, except that if the range contains an element equal to
     * key, gallopRight returns the index after the rightmost equal element.
     *
     * @param key the key whose insertion point to search for 需要插入位置的键
     * @param a the array in which to search 执行搜索的数组
     * @param base the index of the first element in the range 范围内第一个元素的索引
     * @param len the length of the range; must be > 0 范围长度，必须>0
     * @param hint the index at which to begin the search, 0 <= hint < n. 开始执行搜索的位置，0 <= hint < n。hint越接近结果，该方法返回的越快。
     *     The closer hint is to the result, the faster this method will run.
     * @param c the comparator used to order the range, and to search 执行排序和搜索的比较器
     * @return the int k,  0 <= k <= n such that a[b + k - 1] <= key < a[b + k]
     */
    // 目的就是计算一个元素在指定数组范围内的插入位置，如果遇到相同的元素，那么返回最右的位置
    // 这里在计算插入位置的时候，偏移量使用翻倍增加，所以叫gallop
    // 这里hint等于0，代表开始搜索的位置
    private static <T> int gallopRight(T key, T[] a, int base, int len,
                                       int hint, Comparator<? super T> c) {
        assert len > 0 && hint >= 0 && hint < len;
        // 偏移量
        int ofs = 1;
        // 上次偏移量
        int lastOfs = 0;
        // 飞驰模式-Galloping
        // key小于hint位置对应的值
        if (c.compare(key, a[base + hint]) < 0) {
            // Gallop left until a[b+hint - ofs] <= key < a[b+hint - lastOfs]
            // 向左飞驰直到 a[b+hint - ofs] <= key < a[b+hint - lastOfs]
            // 最大偏移量，超过了肯定要越界
            int maxOfs = hint + 1;
            // 当右指针小于最大偏移，且key小于基于hint偏移ofs的值时
            while (ofs < maxOfs && c.compare(key, a[base + hint - ofs]) < 0) {
                // 记录上次的偏移量
                lastOfs = ofs;
                // 偏移量*2 + 1
                ofs = (ofs << 1) + 1;
                // 防止右移溢出问题
                if (ofs <= 0)   // int overflow
                    // 如果溢出设置为最大偏移量
                    ofs = maxOfs;
            }
            /**
             * 循环结束
             * 代表着a[b+hint - ofs] <= key | ofs >= maxOfs
             */
            // 偏移量过大也设置成最大偏移量
            if (ofs > maxOfs)
                ofs = maxOfs;
            // 保证偏移基于base
            // Make offsets relative to b
            int tmp = lastOfs;
            // lastOfs左移量、ofs右偏移量
            lastOfs = hint - ofs;
            ofs = hint - tmp;
        } else { // a[b + hint] <= key
            // Gallop right until a[b+hint + lastOfs] <= key < a[b+hint + ofs]
            // 向右飞驰直到 a[b+hint + lastOfs] <= key < a[b+hint + ofs]
            int maxOfs = len - hint;
            while (ofs < maxOfs && c.compare(key, a[base + hint + ofs]) >= 0) {
                lastOfs = ofs;
                ofs = (ofs << 1) + 1;
                if (ofs <= 0)   // int overflow
                    ofs = maxOfs;
            }
            if (ofs > maxOfs)
                ofs = maxOfs;

            // Make offsets relative to b
            lastOfs += hint;
            ofs += hint;
        }
        assert -1 <= lastOfs && lastOfs < ofs && ofs <= len;

        /*
         * Now a[b + lastOfs] <= key < a[b + ofs], so key belongs somewhere to
         * the right of lastOfs but no farther right than ofs.  Do a binary
         * search, with invariant a[b + lastOfs - 1] <= key < a[b + ofs].
         */
       /*
        * 现在 a[b + lastOfs] <= key < a[b + ofs], 因此key在lastOfs的右侧，ofs左侧某个位置
        * 做二分查找，不变量为 a[base + lastOfs - 1] < key <= a[base + ofs] 。
        */
        lastOfs++;
        while (lastOfs < ofs) {
            int m = lastOfs + ((ofs - lastOfs) >>> 1);

            if (c.compare(key, a[base + m]) < 0)
                ofs = m;          // key < a[b + m]
            else
                lastOfs = m + 1;  // a[b + m] <= key
        }
        assert lastOfs == ofs;    // so a[b + ofs - 1] <= key < a[b + ofs]
        // 最后找到key值所在索引
        return ofs;
    }

    /**
     * Merges two adjacent runs in place, in a stable fashion.  The first
     * element of the first run must be greater than the first element of the
     * second run (a[base1] > a[base2]), and the last element of the first run
     * (a[base1 + len1-1]) must be greater than all elements of the second run.
     *
     * For performance, this method should be called only when len1 <= len2;
     * its twin, mergeHi should be called if len1 >= len2.  (Either method
     * may be called if len1 == len2.)
     *
     * @param base1 index of first element in first run to be merged
     * @param len1  length of first run to be merged (must be > 0)
     * @param base2 index of first element in second run to be merged
     *        (must be aBase + aLen)
     * @param len2  length of second run to be merged (must be > 0)
     */

   /**
    * 稳定合并两个相邻runs. 第一个run的首元素必须大于第二个run的第首元素(a[base1] > a[base2]), 
    * 且第一个run的尾元素(a[base1 + len1-1]) 必须大于第二个run的所有元素。
    *
    * 出于性能考虑, 该方法只有在 len1 <= len2 才会被调用;
    * 它的孪生方法, mergeHi 在 len1 >= len2 时调用.  (当 len1 == len2 可调用任一方法.)
    *
    * @param base1 要被合并的第一个run的首元素的索引
    * @param len1  要合并的第一个run的长度（必须>0）
    * @param base2 要合并的第二个run的首元素的索引（等于aBase + aLen）
    * @param len2  要合并的第二个run的长度 (必须 > 0)
    */
    private void mergeLo(int base1, int len1, int base2, int len2) {
        assert len1 > 0 && len2 > 0 && base1 + len1 == base2;

        // Copy first run into temp array
        T[] a = this.a; // For performance
        T[] tmp = ensureCapacity(len1);
        // 临时数组的索引
        int cursor1 = tmpBase; // Indexes into tmp array
        // run2的索引
        int cursor2 = base2;   // Indexes int a
        // run1的索引
        int dest = base1;      // Indexes int a
        // 将run1复制到临时数组
        System.arraycopy(a, base1, tmp, cursor1, len1);

        // Move first element of second run and deal with degenerate cases
        // 因为run2的首元素小于run1的首元素，因此要将run2首元素放到第一个位置
        a[dest++] = a[cursor2++];
        // 处理退化的情况
        if (--len2 == 0) {
            // 当run2只有一个值，则将剩下的run1元素放回所属位置
            System.arraycopy(tmp, cursor1, a, dest, len1);
            return;
        }
        if (len1 == 1) {
            // 因为run1队尾元素大于run2所有元素
            // 当run1只有一个值，将剩下run2的值放到所属位置
            System.arraycopy(a, cursor2, a, dest, len2);
            // 再将run1的元素放入队尾
            a[dest + len2] = tmp[cursor1]; // Last elt of run 1 to end of merge
            return;
        }
        // 出于性能考虑，使用方法的局部变量，而不使用类的实例变量
        Comparator<? super T> c = this.c;  // Use local variable for performance
        // 同上
        int minGallop = this.minGallop;    //  "    "       "     "      "
    outer:
        while (true) {
            // run1连续获胜的次数
            int count1 = 0; // Number of times in a row that first run won
            // run2连续获胜的次数
            int count2 = 0; // Number of times in a row that second run won

            /*
             * 做简单的操作，直到（如果有）一个run开始持续获胜
             * Do the straightforward thing until (if ever) one run starts
             * winning consistently.
             */
            do {
                assert len1 > 1 && len2 > 0;
                // 当run2的值比run1的值小
                if (c.compare(a[cursor2], tmp[cursor1]) < 0) {
                    // 将run2的值放到a的对应位置上
                    a[dest++] = a[cursor2++];
                    // run2连续获胜次数增加
                    count2++;
                    // run1连续获胜次数置零
                    count1 = 0;
                    // 当run2为空，则跳出循环
                    if (--len2 == 0)
                        break outer;
                } else {
                    // 将run1值放到a对应位置上
                    a[dest++] = tmp[cursor1++];
                    count1++;
                    count2 = 0;
                    // 当run1只剩尾元素，跳出循环
                    if (--len1 == 1)
                        break outer;
                }
                // 当run1或run2连续获胜次数小于minGallop时，则继续循环
            } while ((count1 | count2) < minGallop);

            /*
             * One run is winning so consistently that galloping may be a
             * huge win. So try that, and continue galloping until (if ever)
             * neither run appears to be winning consistently anymore.
             */
           /*
            * 当一个run持续获胜则galloping将会获得巨大胜利。
            * 因此尝试galloping, 直到run不再出现连续获胜。
            */ 
            do {
                assert len1 > 1 && len2 > 0;
                // 通过飞驰模式找到run2的值再run1中的位置
                count1 = gallopRight(a[cursor2], tmp, cursor1, len1, 0, c);
                if (count1 != 0) {
                    // 将该位置之前的所有run1中的值复制到a中
                    System.arraycopy(tmp, cursor1, a, dest, count1);
                    // 更新指针
                    dest += count1;
                    cursor1 += count1;
                    len1 -= count1;
                    if (len1 <= 1) // len1 == 1 || len1 == 0
                        break outer;
                }
                // 将run2的值放到a中
                a[dest++] = a[cursor2++];
                // 如果run2为空，则退出循环
                if (--len2 == 0)
                    break outer;
                // 找到run1的值在run2中的位置
                count2 = gallopLeft(tmp[cursor1], a, cursor2, len2, 0, c);
                if (count2 != 0) {
                    // 复制run1对应位置前run2的所有元素到a中
                    System.arraycopy(a, cursor2, a, dest, count2);
                    dest += count2;
                    cursor2 += count2;
                    len2 -= count2;
                    if (len2 == 0)
                        break outer;
                }
                // 将run1的值放到a中
                a[dest++] = tmp[cursor1++];
                // 当run1只剩尾元素，退出循环
                if (--len1 == 1)
                    break outer;
                 // 减少minGallop，使进入飞驰模式更容易
                minGallop--;
                // 当run的连续获胜次数大于MIN_GALLOP时
            } while (count1 >= MIN_GALLOP | count2 >= MIN_GALLOP);
            if (minGallop < 0)
                minGallop = 0;
            // 退出飞驰模式的惩罚
            minGallop += 2;  // Penalize for leaving gallop mode
        }  // End of "outer" loop
        this.minGallop = minGallop < 1 ? 1 : minGallop;  // Write back to field
        // run1只剩尾元素
        if (len1 == 1) {
            assert len2 > 0;
            // 复制剩下的run2元素
            System.arraycopy(a, cursor2, a, dest, len2);
            a[dest + len2] = tmp[cursor1]; //  Last elt of run 1 to end of merge
        } else if (len1 == 0) { // 如果run1为空，抛出异常
            throw new IllegalArgumentException(
                "Comparison method violates its general contract!");
        } else {
            // run2为空，则将run1的所有元素复制到a中
            assert len2 == 0;
            assert len1 > 1;
            System.arraycopy(tmp, cursor1, a, dest, len1);
        }
    }

    /**
     * Like mergeLo, except that this method should be called only if
     * len1 >= len2; mergeLo should be called if len1 <= len2.  (Either method
     * may be called if len1 == len2.)
     *
     * @param base1 index of first element in first run to be merged
     * @param len1  length of first run to be merged (must be > 0)
     * @param base2 index of first element in second run to be merged
     *        (must be aBase + aLen)
     * @param len2  length of second run to be merged (must be > 0)
     */
    private void mergeHi(int base1, int len1, int base2, int len2) {
        assert len1 > 0 && len2 > 0 && base1 + len1 == base2;

        // Copy second run into temp array
        T[] a = this.a; // For performance
        T[] tmp = ensureCapacity(len2);
        int tmpBase = this.tmpBase;
        System.arraycopy(a, base2, tmp, tmpBase, len2);

        int cursor1 = base1 + len1 - 1;  // Indexes into a
        int cursor2 = tmpBase + len2 - 1; // Indexes into tmp array
        int dest = base2 + len2 - 1;     // Indexes into a

        // Move last element of first run and deal with degenerate cases
        a[dest--] = a[cursor1--];
        if (--len1 == 0) {
            System.arraycopy(tmp, tmpBase, a, dest - (len2 - 1), len2);
            return;
        }
        if (len2 == 1) {
            dest -= len1;
            cursor1 -= len1;
            System.arraycopy(a, cursor1 + 1, a, dest + 1, len1);
            a[dest] = tmp[cursor2];
            return;
        }

        Comparator<? super T> c = this.c;  // Use local variable for performance
        int minGallop = this.minGallop;    //  "    "       "     "      "
    outer:
        while (true) {
            int count1 = 0; // Number of times in a row that first run won
            int count2 = 0; // Number of times in a row that second run won

            /*
             * Do the straightforward thing until (if ever) one run
             * appears to win consistently.
             */
            do {
                assert len1 > 0 && len2 > 1;
                if (c.compare(tmp[cursor2], a[cursor1]) < 0) {
                    a[dest--] = a[cursor1--];
                    count1++;
                    count2 = 0;
                    if (--len1 == 0)
                        break outer;
                } else {
                    a[dest--] = tmp[cursor2--];
                    count2++;
                    count1 = 0;
                    if (--len2 == 1)
                        break outer;
                }
            } while ((count1 | count2) < minGallop);

            /*
             * One run is winning so consistently that galloping may be a
             * huge win. So try that, and continue galloping until (if ever)
             * neither run appears to be winning consistently anymore.
             */
            do {
                assert len1 > 0 && len2 > 1;
                count1 = len1 - gallopRight(tmp[cursor2], a, base1, len1, len1 - 1, c);
                if (count1 != 0) {
                    dest -= count1;
                    cursor1 -= count1;
                    len1 -= count1;
                    System.arraycopy(a, cursor1 + 1, a, dest + 1, count1);
                    if (len1 == 0)
                        break outer;
                }
                a[dest--] = tmp[cursor2--];
                if (--len2 == 1)
                    break outer;

                count2 = len2 - gallopLeft(a[cursor1], tmp, tmpBase, len2, len2 - 1, c);
                if (count2 != 0) {
                    dest -= count2;
                    cursor2 -= count2;
                    len2 -= count2;
                    System.arraycopy(tmp, cursor2 + 1, a, dest + 1, count2);
                    if (len2 <= 1)  // len2 == 1 || len2 == 0
                        break outer;
                }
                a[dest--] = a[cursor1--];
                if (--len1 == 0)
                    break outer;
                minGallop--;
            } while (count1 >= MIN_GALLOP | count2 >= MIN_GALLOP);
            if (minGallop < 0)
                minGallop = 0;
            minGallop += 2;  // Penalize for leaving gallop mode
        }  // End of "outer" loop
        this.minGallop = minGallop < 1 ? 1 : minGallop;  // Write back to field

        if (len2 == 1) {
            assert len1 > 0;
            dest -= len1;
            cursor1 -= len1;
            System.arraycopy(a, cursor1 + 1, a, dest + 1, len1);
            a[dest] = tmp[cursor2];  // Move first elt of run2 to front of merge
        } else if (len2 == 0) {
            throw new IllegalArgumentException(
                "Comparison method violates its general contract!");
        } else {
            assert len1 == 0;
            assert len2 > 0;
            System.arraycopy(tmp, tmpBase, a, dest - (len2 - 1), len2);
        }
    }

    /**
     * Ensures that the external array tmp has at least the specified
     * number of elements, increasing its size if necessary.  The size
     * increases exponentially to ensure amortized linear time complexity.
     *
     * @param minCapacity the minimum required capacity of the tmp array
     * @return tmp, whether or not it grew
     */
    private T[] ensureCapacity(int minCapacity) {
        if (tmpLen < minCapacity) {
            // Compute smallest power of 2 > minCapacity
            int newSize = minCapacity;
            newSize |= newSize >> 1;
            newSize |= newSize >> 2;
            newSize |= newSize >> 4;
            newSize |= newSize >> 8;
            newSize |= newSize >> 16;
            newSize++;

            if (newSize < 0) // Not bloody likely!
                newSize = minCapacity;
            else
                newSize = Math.min(newSize, a.length >>> 1);

            @SuppressWarnings({"unchecked", "UnnecessaryLocalVariable"})
            T[] newArray = (T[])java.lang.reflect.Array.newInstance
                (a.getClass().getComponentType(), newSize);
            tmp = newArray;
            tmpLen = newSize;
            tmpBase = 0;
        }
        return tmp;
    }
}
```
