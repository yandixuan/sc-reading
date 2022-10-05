# PropertySource

顾名思义就是属性源的意思,再具体一点就是对获取键值对资源的抽象类

## 属性

```java
// name 应该就是唯一标志
protected final String name;

// 因为数据源有多种形式可能是Map,properties,yaml文件等 所以使用泛型
protected final T source;
```
