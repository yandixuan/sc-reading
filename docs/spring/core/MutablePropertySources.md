# MutablePropertySources

PropertySources聚合了PropertySource,提供了property的多数据源访问。其中MutablePropertySources是PropertySources的默认实现

## 属性

```java
// PropertySource的集合
private final List<PropertySource<?>> propertySourceList = new CopyOnWriteArrayList<>();
```

## 方法

重点摘几个方法说明

```java

// 移除 propertySource
protected void removeIfPresent(PropertySource<?> propertySource) {
    this.propertySourceList.remove(propertySource);
}

public void addFirst(PropertySource<?> propertySource) {
    // 因为是共享变量 可能存在多线程环境下进行修改
    // jvm层锁定对象
    synchronized (this.propertySourceList) {
        removeIfPresent(propertySource);
        // 在第一个位置设置
        this.propertySourceList.add(0, propertySource);
    }
}

public void addLast(PropertySource<?> propertySource) {
    synchronized (this.propertySourceList) {
        // 移除该对象 
        removeIfPresent(propertySource);
        // 本身add就是在数组最后一位添加
        this.propertySourceList.add(propertySource);
    }
}

public PropertySource<?> remove(String name) {
    synchronized (this.propertySourceList) {
        // 获取name的位置 从而删除元素
        int index = this.propertySourceList.indexOf(PropertySource.named(name));
        return (index != -1 ? this.propertySourceList.remove(index) : null);
    }
}
```
