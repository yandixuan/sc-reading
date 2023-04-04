# PropertySourcesPropertyResolver

继承[AbstractPropertyResolver](./AbstractPropertyResolver)实现`ConfigurablePropertyResolver`(可配置属性解析器)接口

## 属性

```java
    @Nullable
    private final PropertySources propertySources;
```

## 方法

### getProperty

```java
@Nullable
protected <T> T getProperty(String key, Class<T> targetValueType, boolean resolveNestedPlaceholders) {
    if (this.propertySources != null) {
        // 遍历 propertySources
        for (PropertySource<?> propertySource : this.propertySources) {
            if (logger.isTraceEnabled()) {
                logger.trace("Searching for key '" + key + "' in PropertySource '" +
                    propertySource.getName() + "'");
            }
            // 根据key从propertySource获取值
            Object value = propertySource.getProperty(key);
            if (value != null) {
                // 如果resolveNestedPlaceholders为true且value是字符串那么继续解析嵌套的占位符
                if (resolveNestedPlaceholders && value instanceof String) {
                    value = resolveNestedPlaceholders((String) value);
                }
                logKeyFound(key, propertySource, value);
                // 转换为对应类型
                return convertValueIfNecessary(value, targetValueType);
            }
        }
    }
    if (logger.isTraceEnabled()) {
        logger.trace("Could not find key '" + key + "' in any property source");
    }
    return null;
}
```
