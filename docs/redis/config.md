# config

## 头文件

## 全局变量

```c
/* 定义了全局的运行时配置字典，字典类型是 sdsHashDictType */
dict *configs = NULL; /* Runtime config values */
```

## 方法

### registerConfigValue

向configs字典中添加新的配置项

```c
/* Create a new config by copying the passed in config. Returns 1 on success
 * or 0 when their was already a config with the same name.. */
int registerConfigValue(const char *name, const standardConfig *config, int alias) {
    /* 分配新的内存空间，并将config内容复制到新的内存空间中 */
    standardConfig *new = zmalloc(sizeof(standardConfig));
    memcpy(new, config, sizeof(standardConfig));
    /* 如果是别名
     * flags使用二进制位来表示config的类型，所以这里 或操作 ALIAS_CONFIG
     * 并将config别名作为新的name，将config原始name作为新的alias */
    if (alias) {
        new->flags |= ALIAS_CONFIG;
        new->name = config->alias;
        new->alias = config->name;
    }
    /* 将新的配置项加入字典，使用sds类型的name作为key，new为value 
     * 如果添加成功，返回DICT_OK */
    return dictAdd(configs, sdsnew(name), new) == DICT_OK;
}
```

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
        /* 如果返回OK则什么都不做，否则输出错误信息，及终止程序执行 */
        serverAssert(ret);

        /* Aliases are the same as their primary counter parts, but they
         * also have a flag indicating they are the alias. */
        /* 将配置的别名也注册进配置字典中 */ 
        if (config->alias) {
            int ret = registerConfigValue(config->alias, config, ALIAS_CONFIG);
            serverAssert(ret);
        }
    }
}
```
