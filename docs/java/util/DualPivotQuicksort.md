# DualPivotQuicksort

双轴快速排序

[参考](https://www.cnblogs.com/zyzdisciple/p/8098854.html)

![流程图](/DualPivotQuicksort.png)

## 属性

```java
    /*
     * Tuning parameters.
     */

    /**
     * 待合并的序列的最大数量
     * The maximum number of runs in merge sort.
     */
    private static final int MAX_RUN_COUNT = 67;

    /**
     * 待合并的序列的最大长度
     * The maximum length of run in merge sort.
     */
    private static final int MAX_RUN_LENGTH = 33;

    /**
     * 如果参与排序的数组长度小于这个值，优先使用快速排序而不是归并排序
     * If the length of an array to be sorted is less than this
     * constant, Quicksort is used in preference to merge sort.
     */
    private static final int QUICKSORT_THRESHOLD = 286;

    /**
     * 如果参与排序的数组长度小于这个值，优先考虑插入排序，而不是快速排序
     * If the length of an array to be sorted is less than this
     * constant, insertion sort is used in preference to Quicksort.
     */
    private static final int INSERTION_SORT_THRESHOLD = 47;

    /**
     * If the length of a byte array to be sorted is greater than this
     * constant, counting sort is used in preference to insertion sort.
     */
    private static final int COUNTING_SORT_THRESHOLD_FOR_BYTE = 29;

    /**
     * 对于char或者short而言，如果数组长度大于这个数值，那么计数排序效率会比较高
     * If the length of a short or char array to be sorted is greater
     * than this constant, counting sort is used in preference to Quicksort.
     */
    private static final int COUNTING_SORT_THRESHOLD_FOR_SHORT_OR_CHAR = 3200;
```

## 方法

### sort

```java
/**
 * Sorts the specified range of the array using the given
 * workspace array slice if possible for merging
 *
 * @param a the array to be sorted
 * @param left the index of the first element, inclusive, to be sorted
 * @param right the index of the last element, inclusive, to be sorted
 * @param work a workspace array (slice)
 * @param workBase origin of usable space in work array
 * @param workLen usable size of work array
 */
static void sort(int[] a, int left, int right,
                    int[] work, int workBase, int workLen) {
    // Use Quicksort on small arrays
    // 286是java设定的一个阈值,当数组长度小于此值时, 系统将不再考虑merge sort
    // 直接将参数传入本类中的另一个私有sort方法进行排序
    if (right - left < QUICKSORT_THRESHOLD) {
        sort(a, left, right, true);
        return;
    }

   /*
    * run[i] 意味着第i个有序数列开始的位置，（升序或者降序）
    * Index run[i] is the start of i-th run
    * (ascending or descending sequence).
    */
    int[] run = new int[MAX_RUN_COUNT + 1];
    int count = 0; run[0] = left;
    // 检查数组是不是已经接近有序状态
    // Check if the array is nearly sorted
    for (int k = left; k < right; run[count] = k) {
        if (a[k] < a[k + 1]) { // ascending
            // 升序
            while (++k <= right && a[k - 1] <= a[k]);
        } else if (a[k] > a[k + 1]) { // descending
            // 降序
            while (++k <= right && a[k - 1] >= a[k]);
            // 如果是降序的，找出高位，低位把数列倒置
            for (int lo = run[count] - 1, hi = k; ++lo < --hi; ) {
                int t = a[lo]; a[lo] = a[hi]; a[hi] = t;
            }
        } else { // equal
            for (int m = MAX_RUN_LENGTH; ++k <= right && a[k - 1] == a[k]; ) {
                // 数列中有至少MAX_RUN_LENGTH的数据相等的时候，直接使用快排
                if (--m == 0) {
                    sort(a, left, right, true);
                    return;
                }
            }
        }

           /*
            * 数组并非高度有序，使用快速排序，因为数组中有序数列的个数超过了MAX_RUN_COUNT
            * The array is not highly structured,
            * use Quicksort instead of merge sort.
            */
        if (++count == MAX_RUN_COUNT) {
            sort(a, left, right, true);
            return;
        }
    }
    
    // Check special cases
    // Implementation note: variable "right" is increased by 1.
    // 检查特殊情况
    // 最后一个有序数列到right位置不包括right，所以还剩最后一个元素
    if (run[count] == right++) { // The last run contains one element
        // 最后一个元素为最后一个有序数列
        run[++count] = right;
    } else if (count == 1) { // The array is already sorted
        // 整个数组中只有一个有序数列，说明数组已经有序啦，不需要排序了
        return;
    }

    // Determine alternation base for merge
    byte odd = 0;
    // sort方法没有返回值，所以我们希望归并结束时，刚好数据由辅助数组复制到原数组。因此需要根据有序子序列个数计算出需要归并的次数
    for (int n = 1; (n <<= 1) < count; odd ^= 1);

    // Use or create temporary array b for merging
    // 临时数组
    int[] b;                 // temp array; alternates with a
    int ao, bo;              // array offsets from 'left'
    int blen = right - left; // space needed for b
    // 入参的work变量就是用作辅助数组，数组可用空间可以不从0索引开始，但必须连续；workBase表示起始地址，workLen表示可用长度。传入的工作数组可能为空，此时可以自己创建一个。
    if (work == null || workLen < blen || workBase + blen > work.length) {
        work = new int[blen];
        workBase = 0;
    }
    // 偶数次归并
    if (odd == 0) {
        System.arraycopy(a, left, work, workBase, blen);
        b = a;
        bo = 0;
        a = work;
        ao = workBase - left;
    } else {
        b = work;
        ao = 0;
        bo = workBase - left;
    }

    // Merging
    // 进行数轮合并操作，直至run的数量为1
    for (int last; count > 1; count = last) {
        // 遍历数组，合并相邻的两个升序序列
        for (int k = (last = 0) + 2; k <= count; k += 2) {
            
            int hi = run[k], mi = run[k - 1];
            for (int i = run[k - 2], p = i, q = mi; i < hi; ++i) {
                // 合并run[k-2] 与 run[k-1]两个序列(进行归并排序)
                if (q >= hi || p < mi && a[p + ao] <= a[q + ao]) {
                    b[i + bo] = a[p++ + ao];
                } else {
                    b[i + bo] = a[q++ + ao];
                }
            }
            // 生成第二轮归并的索引
            run[++last] = hi;
        }
        // 如果栈的长度为奇数，那么把最后落单的有序数列copy到b中
        if ((count & 1) != 0) {
            for (int i = right, lo = run[count - 1]; --i >= lo;
                b[i + bo] = a[i + ao]
            );
            run[++last] = right;
        }
        // 临时数组，与原始数组对调，保持a做原始数组，b 做目标数组
        int[] t = a; a = b; b = t;
        int o = ao; ao = bo; bo = o;
    }
}


/**
    * Sorts the specified range of the array by Dual-Pivot Quicksort.
    *
    * @param a the array to be sorted
    * @param left the index of the first element, inclusive, to be sorted
    * @param right the index of the last element, inclusive, to be sorted
    * @param leftmost indicates if this part is the leftmost in the range
    */
private static void sort(int[] a, int left, int right, boolean leftmost) {
    int length = right - left + 1;

    // Use insertion sort on tiny arrays
    // 数组长度是否小于47,若小于则直接使用插入排序
    if (length < INSERTION_SORT_THRESHOLD) {
        /**
         * leftmost代表的是本次传入的数组是否是从最初的int[] a的最左侧left开始的, 
         * 因为本方法在整个排序过程中可能会针对数组的不同部分被多次调用, 因此leftmost有可能为false
         */
        if (leftmost) {
           /*
            * 经典的插入排序算法，不带哨兵。做了优化，在leftmost情况下使用
            * Traditional (without sentinel) insertion sort,
            * optimized for server VM, is used in case of
            * the leftmost part.
            */
            for (int i = left, j = i; i < right; j = ++i) {
                // 要插入的元素即要空出的位置
                int ai = a[i + 1];
                // 从i位置即j向前找比ai小的元素
                while (ai < a[j]) {
                    /**
                     * 如果a[j]大于ai即交换位置
                     * 第一次进入循环体时，a[j+1]==ai
                     * 由于a[j+1]是空缺位置，将a[j]塞入a[j+1]的位置
                     * 递减j
                     */
                    a[j + 1] = a[j];
                    if (j-- == left) {
                        break;
                    }
                }
                // 
                /**
                 * 1.找到元素ai>a[j]
                 * 2.空位置移动到了左边界位置
                 * 将要插入元素放入空位置处
                 */
                a[j + 1] = ai;
            }
        } else {
               /*
                * 首先跨过开头的升序的部分
                * Skip the longest ascending sequence.
                */
            do {
                if (left >= right) {
                    // 走到这里说明序列有序直接返回
                    return;
                }
            } while (a[++left] >= a[left - 1]);

               /*
                * 这里用到了成对插入排序方法，它比简单的插入排序算法效率要高一些
                * 因为这个分支执行的条件是左边是有元素的
                * 所以可以直接从left开始往前查找
                * Every element from adjoining part plays the role
                * of sentinel, therefore this allows us to avoid the
                * left range check on each iteration. Moreover, we use
                * the more optimized algorithm, so called pair insertion
                * sort, which is faster (in the context of Quicksort)
                * than traditional implementation of insertion sort.
                */
            for (int k = left; ++left <= right; k = ++left) {
                // 取前2个元素
                int a1 = a[k], a2 = a[left];
                // 确保a1大于a2
                if (a1 < a2) {
                    a2 = a1; a1 = a[left];
                }
                // 首先是插入大的数值a1，将a1与k之前的数字一一比较，直到数值小于a1为止，把a1插入到合适的位置，注意：这里的相隔距离为2，因为要预留出a2的位置
                while (a1 < a[--k]) {
                    a[k + 2] = a[k];
                }
                // 上面的循环会先递减k一次，(++k+1)即为右边的空位。塞入a1
                a[++k + 1] = a1;
                // k现在定位到空位置的第一个，继续向前比较找到合适插入位置
                while (a2 < a[--k]) {
                    // k+1即为第一个空位，交换空位
                    a[k + 1] = a[k];
                }
                // 向控位置插入a2
                a[k + 1] = a2;
            }
            int last = a[right];
            // 最后循环找到最后一个数
            // 这里两两插入，如果是奇数，最后会剩一个，单独处理
            while (last < a[--right]) {
                a[right + 1] = a[right];
            }
            a[right + 1] = last;
        }
        return;
    }

    // Inexpensive approximation of length / 7
    // 过位运算获取数组长度的1/7的近似值(位运算无法精确表示1/7)
    int seventh = (length >> 3) + (length >> 6) + 1;

   /*
    * Sort five evenly spaced elements around (and including) the
    * center element in the range. These elements will be used for
    * pivot selection as described below. The choice for spacing
    * these elements was empirically determined to work well on
    * a wide variety of inputs.
    */
    /**
     * 取序列中五个靠近中间位置的元素，这五个位置的间隔为length/7, 对这五个元素进行排序，这些元素最终会被用来做轴
     * 这样选轴就会使轴的大小比较均匀合理
     */
    // 获取本数组中间位置的索引e3
    int e3 = (left + right) >>> 1; // The midpoint
    int e2 = e3 - seventh;
    int e1 = e2 - seventh;
    int e4 = e3 + seventh;
    int e5 = e4 + seventh;

    // Sort these elements using insertion sort
    // 将这五个索引对应的值用插入算法进行有小到大的排序后, 再放回五个索引的位置
    if (a[e2] < a[e1]) { int t = a[e2]; a[e2] = a[e1]; a[e1] = t; }

    if (a[e3] < a[e2]) { int t = a[e3]; a[e3] = a[e2]; a[e2] = t;
        if (t < a[e1]) { a[e2] = a[e1]; a[e1] = t; }
    }
    if (a[e4] < a[e3]) { int t = a[e4]; a[e4] = a[e3]; a[e3] = t;
        if (t < a[e2]) { a[e3] = a[e2]; a[e2] = t;
            if (t < a[e1]) { a[e2] = a[e1]; a[e1] = t; }
        }
    }
    if (a[e5] < a[e4]) { int t = a[e5]; a[e5] = a[e4]; a[e4] = t;
        if (t < a[e3]) { a[e4] = a[e3]; a[e3] = t;
            if (t < a[e2]) { a[e3] = a[e2]; a[e2] = t;
                if (t < a[e1]) { a[e2] = a[e1]; a[e1] = t; }
            }
        }
    }

    // Pointers
    // 中间区域的首个元素的位置
    int less  = left;  // The index of the first element of center part
    // 右边区域的首个元素的位置
    int great = right; // The index before the first element of right part
    // 若满足下面这个条件，则以e2和e4进行双轴快排，否则以e3进行单轴快排
    if (a[e1] != a[e2] && a[e2] != a[e3] && a[e3] != a[e4] && a[e4] != a[e5]) {
       /*
        * Use the second and fourth of the five sorted elements as pivots.
        * These values are inexpensive approximations of the first and
        * second terciles of the array. Note that pivot1 <= pivot2.
        */
        // 利用第2与第4个元素作为双轴，注意到pivot1 <= pivot2
        int pivot1 = a[e2];
        int pivot2 = a[e4];

       /*
        * The first and the last elements to be sorted are moved to the
        * locations formerly occupied by the pivots. When partitioning
        * is complete, the pivots are swapped back into their final
        * positions, and excluded from subsequent sorting.
        */

        /**
         * 下面这两个循环会直接跳过left与right这两个位置的元素，因此需要将left于right放到中间的某两个位置上，
         * 而e2和e4位置上的元素已经被保存为pivot1和pivot2了，因此可以将left和right的元素放在这两个位置
         * 因此排序的部分就是a[left...right]中除了pivot1和pivot2的所有元素
         */
        a[e2] = a[left];
        a[e4] = a[right];

       /*
        * Skip elements, which are less or greater than pivot values.
        * 跳过一些队首的小于pivot1的值，跳过队尾的大于pivot2的值
        */
        while (a[++less] < pivot1);
        while (a[--great] > pivot2);

       /*
        * Partitioning:
        *
        *   left part           center part                   right part
        * +--------------------------------------------------------------+
        * |  < pivot1  |  pivot1 <= && <= pivot2  |    ?    |  > pivot2  |
        * +--------------------------------------------------------------+
        *               ^                          ^       ^
        *               |                          |       |
        *              less                        k     great
        *
        * Invariants:
        *
        *              all in (left, less)   < pivot1
        *    pivot1 <= all in [less, k)     <= pivot2
        *              all in (great, right) > pivot2
        *
        * Pointer k is the first index of ?-part.
        */
        outer:
        for (int k = less - 1; ++k <= great; ) {
            int ak = a[k];
            if (ak < pivot1) { // Move a[k] to left part
                // ak比pivot1小，因此放入left part中
                // 即a[k]与a[less]互换
                a[k] = a[less];
                /*
                * Here and below we use "a[i] = b; i++;" instead
                * of "a[i++] = b;" due to performance issue.
                */
                a[less] = ak;
                // less指针位置+1
                ++less;
            } else if (ak > pivot2) { // Move a[k] to right part
                // ak比pivot2大，因此放入right part中
                // 首先将great向左移动，找到一个a[great]<=pivot2的元素
                while (a[great] > pivot2) {
                    if (great-- == k) {
                        break outer;
                    }
                }
                if (a[great] < pivot1) { // a[great] <= pivot2
                    // a[k]<pivot1：a[k]属于left part，a[less]和a[k]交换，执行less++, k++
                    a[k] = a[less];
                    a[less] = a[great];
                    ++less;
                } else { // pivot1 <= a[great] <= pivot2
                    // pivot1<=a[great]<=pivot2，则交换a[k]和a[great]即可，然后k++, great--
                    a[k] = a[great];
                }
                /*
                * Here and below we use "a[i] = b; i--;" instead
                * of "a[i--] = b;" due to performance issue.
                */
                a[great] = ak;
                --great;
            }
        }
        // 把两个放在外面的轴放回他们应该在的位置上
        // Swap pivots into their final positions
        a[left]  = a[less  - 1]; a[less  - 1] = pivot1;
        a[right] = a[great + 1]; a[great + 1] = pivot2;

        // Sort left and right parts recursively, excluding known pivots
        // 递归对left part、right part排序（不包括轴所以加减2才是正确递归区间）
        sort(a, left, less - 2, leftmost);
        sort(a, great + 2, right, false);

        /*
        * If center part is too large (comprises > 4/7 of the array),
        * swap internal pivot values to ends.
        */
        // 若该值为true则center part长度是否超出原数组长度4/7
        if (less < e1 && e5 < great) {
            /*
            * Skip elements, which are equal to pivot values.
            * 如果center part较大，则问题很可能出现在边界条件=上，即center part中有大量相等元素。
            * 可以通过排除与pivot1和pivot2相等的元素，大幅减少center part中需要排序的长度
            */
            while (a[less] == pivot1) {
                ++less;
            }

            while (a[great] == pivot2) {
                --great;
            }

            /*
            * Partitioning:
            *
            *   left part         center part                  right part
            * +----------------------------------------------------------+
            * | == pivot1 |  pivot1 < && < pivot2  |    ?    | == pivot2 |
            * +----------------------------------------------------------+
            *              ^                        ^       ^
            *              |                        |       |
            *             less                      k     great
            *
            * Invariants:
            *
            *              all in (*,  less) == pivot1
            *     pivot1 < all in [less,  k)  < pivot2
            *              all in (great, *) == pivot2
            *
            * Pointer k is the first index of ?-part.
            */
            outer:
            for (int k = less - 1; ++k <= great; ) {
                int ak = a[k];
                if (ak == pivot1) { // Move a[k] to left part
                    // 移到左边（靠近pivot1即不需要排序了）
                    a[k] = a[less];
                    a[less] = ak;
                    ++less;
                } else if (ak == pivot2) { // Move a[k] to right part
                    /**
                     * 如果ak等于右轴，那么就需要great左移一个不等于右轴的位置与a[k]进行交换
                     * 但是a[great]又分2种情况
                     * 1.a[great]等于左轴即交换a[k]与a[less]互换，a[k]放入a[great]位置处，less++,--great
                     * 2.a[great]处于 pivot1、pivot2之间即交换a[k]与a[great],less++,--great
                     */
                    // 移到右边（靠近pivot1即不需要排序了）
                    while (a[great] == pivot2) {
                        if (great-- == k) {
                            break outer;
                        }
                    }
                    if (a[great] == pivot1) { // a[great] < pivot2
                        a[k] = a[less];
                        /*
                        * Even though a[great] equals to pivot1, the
                        * assignment a[less] = pivot1 may be incorrect,
                        * if a[great] and pivot1 are floating-point zeros
                        * of different signs. Therefore in float and
                        * double sorting methods we have to use more
                        * accurate assignment a[less] = a[great].
                        */
                        a[less] = pivot1;
                        ++less;
                    } else { // pivot1 < a[great] < pivot2
                        a[k] = a[great];
                    }
                    a[great] = ak;
                    --great;
                }
            }
        }
        // 递归排序center-part区间
        // Sort center part recursively
        sort(a, less, great, false);

    } else { // Partitioning with one pivot
        /*
        * Use the third of the five sorted elements as pivot.
        * This value is inexpensive approximation of the median.
        */
        // 选取e3进行单轴快排
        int pivot = a[e3];

        /*
        * Partitioning degenerates to the traditional 3-way
        * (or "Dutch National Flag") schema:
        *
        *   left part    center part              right part
        * +-------------------------------------------------+
        * |  < pivot  |   == pivot   |     ?    |  > pivot  |
        * +-------------------------------------------------+
        *              ^              ^        ^
        *              |              |        |
        *             less            k      great
        *
        * Invariants:
        *
        *   all in (left, less)   < pivot
        *   all in [less, k)     == pivot
        *   all in (great, right) > pivot
        *
        * Pointer k is the first index of ?-part.
        */
        for (int k = less; k <= great; ++k) {
            // a[k]等于轴则指针k++
            if (a[k] == pivot) {
                continue;
            }
            int ak = a[k];
            if (ak < pivot) { // Move a[k] to left part
                // a[k]应该在左边部分即交换a[less]、a[k];less指针位置++
                a[k] = a[less];
                a[less] = ak;
                ++less;
            } else { // a[k] > pivot - Move a[k] to right part
                // 将a[k]移到到右边部分
                // 需要将great指针--，找到a[great]<pivot的元素进行交换
                while (a[great] > pivot) {
                    --great;
                }
                if (a[great] < pivot) { // a[great] <= pivot
                    // 如果a[great]小于轴则交换a[less]、a[great]，less指针位置++
                    a[k] = a[less];
                    a[less] = a[great];
                    ++less;
                } else { // a[great] == pivot
                    /*
                    * Even though a[great] equals to pivot, the
                    * assignment a[k] = pivot may be incorrect,
                    * if a[great] and pivot are floating-point
                    * zeros of different signs. Therefore in float
                    * and double sorting methods we have to use
                    * more accurate assignment a[k] = a[great].
                    */
                    // a[great]等于轴，即直接让a[k]等于轴再把a[k]移到great位置处即可
                    a[k] = pivot;
                }
                a[great] = ak;
                // great指针--
                --great;
            }
        }

        /*
        * Sort left and right parts recursively.
        * All elements from center part are equal
        * and, therefore, already sorted.
        */
        // 递归排序左右2部分元素
        sort(a, left, less - 1, leftmost);
        sort(a, great + 1, right, false);
    }
}
```
