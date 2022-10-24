# AbstractAspectJAdvisorFactory

## AspectJAnnotation

内部类

```java
  static {
   // 做个类型映射 
   annotationTypeMap.put(Pointcut.class, AspectJAnnotationType.AtPointcut);
   annotationTypeMap.put(Around.class, AspectJAnnotationType.AtAround);
   annotationTypeMap.put(Before.class, AspectJAnnotationType.AtBefore);
   annotationTypeMap.put(After.class, AspectJAnnotationType.AtAfter);
   annotationTypeMap.put(AfterReturning.class, AspectJAnnotationType.AtAfterReturning);
   annotationTypeMap.put(AfterThrowing.class, AspectJAnnotationType.AtAfterThrowing);
  }
```

### 构造方法

```java
  public AspectJAnnotation(A annotation) {
   this.annotation = annotation;
   // 从映射Map获取枚举类型
   this.annotationType = determineAnnotationType(annotation);
   try {
    // 获取注解上的表达式
    this.pointcutExpression = resolveExpression(annotation);
    // 获取注解的argNames 参数的名称
    Object argNames = AnnotationUtils.getValue(annotation, "argNames");
    this.argumentNames = (argNames instanceof String ? (String) argNames : "");
   }
   catch (Exception ex) {
    throw new IllegalArgumentException(annotation + " is not a valid AspectJ annotation", ex);
   }
  }
```
