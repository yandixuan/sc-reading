# BeanDefinitionLoader

## 方法

### load(Object source)

source can be: a class name, package name, or an XML resource location

所以有下面对应的if else 分支

```java
private void load(Object source) {
  Assert.notNull(source, "Source must not be null");
  if (source instanceof Class<?>) {
   load((Class<?>) source);
   return;
  }
  if (source instanceof Resource) {
   load((Resource) source);
   return;
  }
  if (source instanceof Package) {
   load((Package) source);
   return;
  }
  if (source instanceof CharSequence) {
   load((CharSequence) source);
   return;
  }
  throw new IllegalArgumentException("Invalid source type " + source.getClass());
}
```

### load(Class<?> source)

```java
private void load(Class<?> source) {
  // 对应groovy的判断
  if (isGroovyPresent() && GroovyBeanDefinitionSource.class.isAssignableFrom(source)) {
   // Any GroovyLoaders added in beans{} DSL can contribute beans here
   GroovyBeanDefinitionSource loader = BeanUtils.instantiateClass(source, GroovyBeanDefinitionSource.class);
   ((GroovyBeanDefinitionReader) this.groovyReader).beans(loader.getBeans());
  }
  // class 不是 匿名类，groovy闭包，没有构造函数才能进行读取
  if (isEligible(source)) {
   // 使用 AnnotatedBeanDefinitionReader 将source注册成bean
   this.annotatedReader.register(source);
  }
}
```
