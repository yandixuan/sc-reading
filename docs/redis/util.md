# util

## getRandomBytes

生成随机字节

```c
/* Get random bytes, attempts to get an initial seed from /dev/urandom and
 * the uses a one way hash function in counter mode to generate a random
 * stream. However if /dev/urandom is not available, a weaker seed is used.
 *
 * This function is not thread safe, since the state is global. */
void getRandomBytes(unsigned char *p, size_t len) {
    /* Global state. */
    static int seed_initialized = 0;
    static unsigned char seed[64]; /* 512 bit internal block size. */
    static uint64_t counter = 0; /* The counter we hash with the seed. */

    if (!seed_initialized) {
        /* Initialize a seed and use SHA1 in counter mode, where we hash
         * the same seed with a progressive counter. For the goals of this
         * function we just need non-colliding strings, there are no
         * cryptographic security needs. */
        /* 从/dev/urandom中获取随机数 */ 
        FILE *fp = fopen("/dev/urandom","r");
        /* fread从给定输入流stream读取64字节1次到数组buffer中 */
        if (fp == NULL || fread(seed,sizeof(seed),1,fp) != 1) {
            /* Revert to a weaker seed, and in this case reseed again
             * at every call.*/
            /* fallback，使用弱种子 */
            for (unsigned int j = 0; j < sizeof(seed); j++) {
                struct timeval tv;
                gettimeofday(&tv,NULL);
                pid_t pid = getpid();
                seed[j] = tv.tv_sec ^ tv.tv_usec ^ pid ^ (long)fp;
            }
        } else {
            seed_initialized = 1;
        }
        if (fp) fclose(fp);
    }

    while(len) {
        /* This implements SHA256-HMAC. */
        /* 定义局部变量，其实就是在栈中通过移动栈指针来给程序提供一个内存空间和这个局部变量名绑定。 
         * 因为这段内存空间在栈上，而栈内存是反复使用的（脏的，上次用完没清零的），所以说使用栈来实现的局部变量定义时如果不显式初始化，值就是脏的 */
        unsigned char digest[SHA256_BLOCK_SIZE];
        unsigned char kxor[64];
        unsigned int copylen =
            len > SHA256_BLOCK_SIZE ? SHA256_BLOCK_SIZE : len;

        /* IKEY: key xored with 0x36. */
        /* 将种子拷贝到kxor中 */
        memcpy(kxor,seed,sizeof(kxor));
        /* 对于kxor每个元素，进行异或操作 */
        for (unsigned int i = 0; i < sizeof(kxor); i++) kxor[i] ^= 0x36;

        /* Obtain HASH(IKEY||MESSAGE). */
        SHA256_CTX ctx;
        sha256_init(&ctx);
        /* 将kxor添加到hash的输入中 */
        sha256_update(&ctx,kxor,sizeof(kxor));
        /* 将计数器添加到输入中 */
        sha256_update(&ctx,(unsigned char*)&counter,sizeof(counter));
        sha256_final(&ctx,digest);

        /* OKEY: key xored with 0x5c. */
        /* 将种子拷贝到kxor中 */
        memcpy(kxor,seed,sizeof(kxor));
        /* 对于kxor每个元素，进行异或操作 */
        for (unsigned int i = 0; i < sizeof(kxor); i++) kxor[i] ^= 0x5C;

        /* Obtain HASH(OKEY || HASH(IKEY||MESSAGE)). */
        sha256_init(&ctx);
        /* 将kxor添加到hash的输入中 */
        sha256_update(&ctx,kxor,sizeof(kxor));
        /* 将HASH(IKEY||MESSAGE)添加到输入中 */
        sha256_update(&ctx,digest,SHA256_BLOCK_SIZE);
        /* 最终获得哈希值 */
        sha256_final(&ctx,digest);
        /* 为下一次迭代增加计数器。*/
        /* Increment the counter for the next iteration. */
        counter++;
        /* 将哈希值拷贝到p中 */
        memcpy(p,digest,copylen);
        /* 减少还需要生成的字节数 */
        len -= copylen;
        /* 指向下一个存储位置 */
        p += copylen;
    }
}
```
