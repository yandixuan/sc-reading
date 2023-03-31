# config

## 宏

## 方法

### initConfigValues

初始化配置的默认值，并且将配置填充在运行时字典中
（通过 CONFIG GET 命令获取服务器实例的所有配置参数及其当前值，或者通过 CONFIG SET 命令修改配置参数的当前值）

```c
void initConfigValues() {
    /* 创建SDS字符串作为键值的散列表 */
    configs = dictCreate(&sdsHashDictType);
    /* Redis默认配置的数组。它包含了 Redis 中大部分参数的默认值。
     * 当Redis启动时，它将使用该数组中定义的默认值来初始化自己的配置参数。
     * sizeof(static_configs) / sizeof(standardConfig) 表示元素个数 
     * dictCreate创建了个新的字典，所以需要 dictExpand方法进行扩容才能填充元素
     */
    dictExpand(configs, sizeof(static_configs) / sizeof(standardConfig));
    /* 遍历静态配置数组 */
    for (standardConfig *config = static_configs; config->name != NULL; config++) {
        /* 如果配置接口有初始化操作，执行初始化操作 */
        if (config->interface.init) config->interface.init(config);
        /* Add the primary config to the dictionary. */
        /* 将主配置值添加到字典中 */
        int ret = registerConfigValue(config->name, config, 0);
        serverAssert(ret);

        /* Aliases are the same as their primary counter parts, but they
         * also have a flag indicating they are the alias. */
        if (config->alias) {
            int ret = registerConfigValue(config->alias, config, ALIAS_CONFIG);
            serverAssert(ret);
        }
    }
}
```
