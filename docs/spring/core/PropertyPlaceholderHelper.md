# PropertyPlaceholderHelper

## 属性

```java
    private final String placeholderPrefix;

    private final String placeholderSuffix;

    private final String simplePrefix;

    @Nullable
    private final String valueSeparator;

    private final boolean ignoreUnresolvablePlaceholders;
```

## 构造函数

```java
/**
 * Creates a new {@code PropertyPlaceholderHelper} that uses the supplied prefix and suffix.
 * Unresolvable placeholders are ignored.
 * @param placeholderPrefix the prefix that denotes the start of a placeholder 占位符前缀
 * @param placeholderSuffix the suffix that denotes the end of a placeholder 占位符后缀
 */
public PropertyPlaceholderHelper(String placeholderPrefix, String placeholderSuffix) {
    this(placeholderPrefix, placeholderSuffix, null, true);
}

/**
 * Creates a new {@code PropertyPlaceholderHelper} that uses the supplied prefix and suffix.
 * @param placeholderPrefix the prefix that denotes the start of a placeholder
 * @param placeholderSuffix the suffix that denotes the end of a placeholder
 * @param valueSeparator the separating character between the placeholder variable
 * and the associated default value, if any
 * @param ignoreUnresolvablePlaceholders indicates whether unresolvable placeholders should
 * be ignored ({@code true}) or cause an exception ({@code false})
 */
public PropertyPlaceholderHelper(String placeholderPrefix, String placeholderSuffix,
        @Nullable String valueSeparator, boolean ignoreUnresolvablePlaceholders) {

    Assert.notNull(placeholderPrefix, "'placeholderPrefix' must not be null");
    Assert.notNull(placeholderSuffix, "'placeholderSuffix' must not be null");
    this.placeholderPrefix = placeholderPrefix;
    this.placeholderSuffix = placeholderSuffix;
    // 占位符简写，根据后缀找前缀简写 比如："${}",简写前缀就是"{"
    String simplePrefixForSuffix = wellKnownSimplePrefixes.get(this.placeholderSuffix);
    if (simplePrefixForSuffix != null && this.placeholderPrefix.endsWith(simplePrefixForSuffix)) {
        this.simplePrefix = simplePrefixForSuffix;
    }
    else {
        this.simplePrefix = this.placeholderPrefix;
    }
    this.valueSeparator = valueSeparator;
    this.ignoreUnresolvablePlaceholders = ignoreUnresolvablePlaceholders;
}
```

## 方法

### replacePlaceholders(String value, final Properties properties)

```java
/**
 * Replaces all placeholders of format {@code ${name}} with the corresponding
 * property from the supplied {@link Properties}.
 * @param value the value containing the placeholders to be replaced
 * @param properties the {@code Properties} to use for replacement
 * @return the supplied value with placeholders replaced inline
 */
public String replacePlaceholders(String value, final Properties properties) {
    Assert.notNull(properties, "'properties' must not be null");
    // PlaceholderResolver函数式接口，通过properties::getProperty获取value
    return replacePlaceholders(value, properties::getProperty);
}
```

### replacePlaceholders(String value, PlaceholderResolver placeholderResolver)

```java
/**
 * Replaces all placeholders of format {@code ${name}} with the value returned
 * from the supplied {@link PlaceholderResolver}.
 * @param value the value containing the placeholders to be replaced
 * @param placeholderResolver the {@code PlaceholderResolver} to use for replacement
 * @return the supplied value with placeholders replaced inline
 */
public String replacePlaceholders(String value, PlaceholderResolver placeholderResolver) {
    Assert.notNull(value, "'value' must not be null");
    return parseStringValue(value, placeholderResolver, null);
}
```

### parseStringValue

```java
protected String parseStringValue(
        String value, PlaceholderResolver placeholderResolver, @Nullable Set<String> visitedPlaceholders) {
    // 前缀的索引位置  
    int startIndex = value.indexOf(this.placeholderPrefix);
    // 如果不包含指定前缀，那就原样返回
    if (startIndex == -1) {
        return value;
    }

    StringBuilder result = new StringBuilder(value);
    while (startIndex != -1) {
        // 先找到对应后缀的下标 
        int endIndex = findPlaceholderEndIndex(result, startIndex);
        // 不为-1即找到了suffix
        if (endIndex != -1) {
            // 截取前缀占位符和后缀占位符之间的字符串placeholder
            String placeholder = result.substring(startIndex + this.placeholderPrefix.length(), endIndex);
            String originalPlaceholder = placeholder;
            // 初始化 visitedPlaceholders
            if (visitedPlaceholders == null) {
                visitedPlaceholders = new HashSet<>(4);
            }
            // 将当前的占位符存到set集合中，如果set集合有了，就会添加失败
            // 就会报错，循环引用错误，比如${a},这个a的值依然是${a}
            // 这样就陷入了无限解析了，根本停不下来
            // 所以 visitedPlaceholders 是为了防止无限解析而设计的
            if (!visitedPlaceholders.add(originalPlaceholder)) {
                throw new IllegalArgumentException(
                        "Circular placeholder reference '" + originalPlaceholder + "' in property definitions");
            }
            /**
            * 然后开始递归解析目标字符串，因为目标字符串可能也包含占位符，
            * 比如 ${a${b}}
            */
            // Recursive invocation, parsing placeholders contained in the placeholder key.
            placeholder = parseStringValue(placeholder, placeholderResolver, visitedPlaceholders);
            // Now obtain the value for the fully resolved key...
            // 解析器查找占位符对应的值
            String propVal = placeholderResolver.resolvePlaceholder(placeholder);
            if (propVal == null && this.valueSeparator != null) {
                // 如果为null，那么查找这个propVal是否为：`key:默认值`的字符串
                int separatorIndex = placeholder.indexOf(this.valueSeparator);
                if (separatorIndex != -1) {
                // 如果propVal为xx:yyy，那么key值为xx，默认值是yyy
                String actualPlaceholder = placeholder.substring(0, separatorIndex);
                String defaultValue = placeholder.substring(separatorIndex + this.valueSeparator.length());
                propVal = placeholderResolver.resolvePlaceholder(actualPlaceholder);
                    if (propVal == null) {
                        propVal = defaultValue;
                    }
                }
            }
            if (propVal != null) {
                // 这个值可能也有占位符，继续递归解析
                // Recursive invocation, parsing placeholders contained in the
                // previously resolved placeholder value.
                propVal = parseStringValue(propVal, placeholderResolver, visitedPlaceholders);
                // 得到了占位符对应的值后替换掉占位符
                result.replace(startIndex, endIndex + this.placeholderSuffix.length(), propVal);
                if (logger.isTraceEnabled()) {
                    logger.trace("Resolved placeholder '" + placeholder + "'");
                }
                // 继续查找是否还有后续的占位符
                startIndex = result.indexOf(this.placeholderPrefix, startIndex + propVal.length());
            }
            // 如果propValue为null，那么就说明这个占位符没有值，如果设置为忽略。那么继续向后解析
            // 否则报错
            else if (this.ignoreUnresolvablePlaceholders) {
                // Proceed with unprocessed value.
                startIndex = result.indexOf(this.placeholderPrefix, endIndex + this.placeholderSuffix.length());
            }
            else {
                throw new IllegalArgumentException("Could not resolve placeholder '" +
                        placeholder + "'" + " in value \"" + value + "\"");
            }
            // 解析成功就删除set集合中对应的占位符
            visitedPlaceholders.remove(originalPlaceholder);
        }
        else {
            startIndex = -1;
        }
    }
    return result.toString();
}
```

### findPlaceholderEndIndex

```java
private int findPlaceholderEndIndex(CharSequence buf, int startIndex) {
    // 获取前缀后面一个字符的索引
    int index = startIndex + this.placeholderPrefix.length();
    // withinNestedPlaceholder这个参数控制当我们获取到占位符后缀的时候是选择直接返回还是继续去获取占位符后缀
    int withinNestedPlaceholder = 0;
    while (index < buf.length()) {
        // str在index索引位置是否和placeholderSuffix匹配
        if (StringUtils.substringMatch(buf, index, this.placeholderSuffix)) {
            // 如果 withinNestedPlaceholder大于0 存在 嵌套 placeholder
            if (withinNestedPlaceholder > 0) {
                // 递减 
                withinNestedPlaceholder--;
                // index加上 placeholderSuffix的长度
                index = index + this.placeholderSuffix.length();
            }
            else {
                return index;
            }
        }
        // 该方法使用来找prefix对应的suffix的index，对于`${xxxx}`来说只用对应到 `{`
        // 存在嵌套placeholder，即withinNestedPlaceholder++
        else if (StringUtils.substringMatch(buf, index, this.simplePrefix)) {
            withinNestedPlaceholder++;
            index = index + this.simplePrefix.length();
        }
        else {
            index++;
        }
    }
    // 没找到
    return -1;
}
```
