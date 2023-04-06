# AbstractPropertyResolver

## 属性

```java
    @Nullable
    private volatile ConfigurableConversionService conversionService;

    @Nullable
    // ignoreUnresolvableNestedPlaceholders=true情况下创建的PropertyPlaceholderHelper实例
    private PropertyPlaceholderHelper nonStrictHelper;

    @Nullable
    // ignoreUnresolvableNestedPlaceholders=false情况下创建的PropertyPlaceholderHelper实例
    private PropertyPlaceholderHelper strictHelper;
    //是否忽略无法处理的嵌套属性占位符，这里是false，也就是遇到无法处理的属性占位符且没有默认值则抛出异常
    private boolean ignoreUnresolvableNestedPlaceholders = false;
    // placeholder 前缀
    private String placeholderPrefix = SystemPropertyUtils.PLACEHOLDER_PREFIX;
    // placeholder 后缀
    private String placeholderSuffix = SystemPropertyUtils.PLACEHOLDER_SUFFIX;
    //属性占位符解析失败的时候配置默认值的分隔符，这里是":"
    @Nullable
    private String valueSeparator = SystemPropertyUtils.VALUE_SEPARATOR;

    private final Set<String> requiredProperties = new LinkedHashSet<>();
```

## 方法

### getConversionService

获取转换类型服务

```java
@Override
public ConfigurableConversionService getConversionService() {
    // Need to provide an independent DefaultConversionService, not the
    // shared DefaultConversionService used by PropertySourcesPropertyResolver.
    ConfigurableConversionService cs = this.conversionService;
    // 双重检查锁.并发实例化问题
    if (cs == null) {
        synchronized (this) {
            cs = this.conversionService;
            if (cs == null) {
                cs = new DefaultConversionService();
                this.conversionService = cs;
            }
        }
    }
    return cs;
}
```

### resolvePlaceholders

```java
@Override
public String resolvePlaceholders(String text) {
    if (this.nonStrictHelper == null) {
        this.nonStrictHelper = createPlaceholderHelper(true);
    }
    return doResolvePlaceholders(text, this.nonStrictHelper);
}
```

### resolveRequiredPlaceholders

```java
@Override
public String resolveRequiredPlaceholders(String text) throws IllegalArgumentException {
    if (this.strictHelper == null) {
        this.strictHelper = createPlaceholderHelper(false);
    }
    return doResolvePlaceholders(text, this.strictHelper);
}
```

### createPlaceholderHelper

`ignoreUnresolvablePlaceholders`: true---> 忽略未解析占位符；false---> 未解析占位符抛出异常

```java
private PropertyPlaceholderHelper createPlaceholderHelper(boolean ignoreUnresolvablePlaceholders) {
    return new PropertyPlaceholderHelper(this.placeholderPrefix, this.placeholderSuffix,
            this.valueSeparator, ignoreUnresolvablePlaceholders);
}

```

### doResolvePlaceholders

```java
private String doResolvePlaceholders(String text, PropertyPlaceholderHelper helper) {
    // 交给 PropertyPlaceholderHelper 去解析占位符
    return helper.replacePlaceholders(text, this::getPropertyAsRawString);
}
```

### convertValueIfNecessary

```java
/**
 * Convert the given value to the specified target type, if necessary.
 * @param value the original property value
 * @param targetType the specified target type for property retrieval
 * @return the converted value, or the original value if no conversion
 * is necessary
 * @since 4.3.5
 */
@SuppressWarnings("unchecked")
@Nullable
protected <T> T convertValueIfNecessary(Object value, @Nullable Class<T> targetType) {
    // targetType为空则直接返回
    if (targetType == null) {
        return (T) value;
    }
    // 获取类型转换服务
    ConversionService conversionServiceToUse = this.conversionService;
    if (conversionServiceToUse == null) {
        // Avoid initialization of shared DefaultConversionService if
        // no standard type conversion is needed in the first place...
        // 如果 value是target的子类直接转型即可
        if (ClassUtils.isAssignableValue(targetType, value)) {
            return (T) value;
        }
        conversionServiceToUse = DefaultConversionService.getSharedInstance();
    }
    // 否则使用转换服务进行转型
    return conversionServiceToUse.convert(value, targetType);
}
```
