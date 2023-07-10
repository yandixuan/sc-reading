# DeclarativeContract

声明式客户端契约

抽象模板，继承[`BaseContract`](./BaseContract.md)

## 属性

- classAnnotationProcessors: 解析class注解解的析器集合
- methodAnnotationProcessors: 解析method注解的解析器集合
- parameterAnnotationProcessors: 解析parameter注解的解析器集合

<VPLink inline-block icon="i-carbon-document" title="Default" url="./Default"/>会注册解析器

```java
  private final List<GuardedAnnotationProcessor> classAnnotationProcessors = new ArrayList<>();
  private final List<GuardedAnnotationProcessor> methodAnnotationProcessors = new ArrayList<>();
  private final Map<Class<Annotation>, DeclarativeContract.ParameterAnnotationProcessor<Annotation>> parameterAnnotationProcessors =
      new HashMap<>();
```

## AnnotationProcessor

函数式接口，描述了`Processor`该如何工作，而`GuardedAnnotationProcessor`实现了该接口并且实现了`java.util.function.Predicate`接口，用来判断当前Annotation是否需要处理器进行处理。

```java
  // L212-L218
  @FunctionalInterface
  public interface AnnotationProcessor<E extends Annotation> {

    /**
     * @param annotation present on the current element.
     * @param metadata collected so far relating to the current java method.
     */
    void process(E annotation, MethodMetadata metadata);
  }
```

## 函数

### parseAndValidateMetadata

```java
  @Override
  protected final void processAnnotationOnClass(MethodMetadata data, Class<?> targetType) {
    /* 获取type上能解析注解的所有处理器 */
    final List<GuardedAnnotationProcessor> processors = Arrays.stream(targetType.getAnnotations())
        .flatMap(annotation -> classAnnotationProcessors.stream()
            .filter(processor -> processor.test(annotation)))
        .collect(Collectors.toList());

    if (!processors.isEmpty()) {
      /* 对注解进行解析 */
      Arrays.stream(targetType.getAnnotations())
          .forEach(annotation -> processors.stream()
              .filter(processor -> processor.test(annotation))
              .forEach(processor -> processor.process(annotation, data)));
    } else {
      /* 添加 没有注解warning */
      if (targetType.getAnnotations().length == 0) {
        data.addWarning(String.format(
            "Class %s has no annotations, it may affect contract %s",
            targetType.getSimpleName(),
            getClass().getSimpleName()));
      } else {
        /* 添加 当前class上的注解不被当前contract识别warning */
        data.addWarning(String.format(
            "Class %s has annotations %s that are not used by contract %s",
            targetType.getSimpleName(),
            Arrays.stream(targetType.getAnnotations())
                .map(annotation -> annotation.annotationType()
                    .getSimpleName())
                .collect(Collectors.toList()),
            getClass().getSimpleName()));
      }
    }
  }
```

### processAnnotationOnMethod

```java
  @Override
  protected final void processAnnotationOnMethod(MethodMetadata data,
                                                 Annotation annotation,
                                                 Method method) {
    /* 获取能解析注解的所有处理器 */
    List<GuardedAnnotationProcessor> processors = methodAnnotationProcessors.stream()
        .filter(processor -> processor.test(annotation))
        .collect(Collectors.toList());

    if (!processors.isEmpty()) {
      /* 对注解进行解析 */
      processors.forEach(processor -> processor.process(annotation, data));
    } else {
      /* 添加warning */
      data.addWarning(String.format(
          "Method %s has an annotation %s that is not used by contract %s",
          method.getName(),
          annotation.annotationType()
              .getSimpleName(),
          getClass().getSimpleName()));
    }
  }
```

### processAnnotationsOnParameter

```java
  @Override
  protected final boolean processAnnotationsOnParameter(MethodMetadata data,
                                                        Annotation[] annotations,
                                                        int paramIndex) {
    /* 以annotion的class为key去找处理器 */
    List<Annotation> matchingAnnotations = Arrays.stream(annotations)
        .filter(
            annotation -> parameterAnnotationProcessors.containsKey(annotation.annotationType()))
        .collect(Collectors.toList());

    if (!matchingAnnotations.isEmpty()) {
      /* 对注解进行解析 */
      matchingAnnotations.forEach(annotation -> parameterAnnotationProcessors
          .getOrDefault(annotation.annotationType(), ParameterAnnotationProcessor.DO_NOTHING)
          .process(annotation, data, paramIndex));

    } else {
      /* 添加warning */
      final Parameter parameter = data.method().getParameters()[paramIndex];
      String parameterName = parameter.isNamePresent()
          ? parameter.getName()
          : parameter.getType().getSimpleName();
      if (annotations.length == 0) {
        data.addWarning(String.format(
            "Parameter %s has no annotations, it may affect contract %s",
            parameterName,
            getClass().getSimpleName()));
      } else {
        data.addWarning(String.format(
            "Parameter %s has annotations %s that are not used by contract %s",
            parameterName,
            Arrays.stream(annotations)
                .map(annotation -> annotation.annotationType()
                    .getSimpleName())
                .collect(Collectors.toList()),
            getClass().getSimpleName()));
      }
    }
    return false;
  }
```

### registerClassAnnotation

提供注册`解析classAnnotation`处理器的入口

```java
  /**
   * Called while class annotations are being processed
   *
   * @param annotationType to be processed
   * @param processor function that defines the annotations modifies {@link MethodMetadata}
   */
  protected <E extends Annotation> void registerClassAnnotation(Class<E> annotationType,
                                                                DeclarativeContract.AnnotationProcessor<E> processor) {
    registerClassAnnotation(
        annotation -> annotation.annotationType().equals(annotationType),
        processor);
  }

  /**
   * Called while class annotations are being processed
   *
   * @param predicate to check if the annotation should be processed or not
   * @param processor function that defines the annotations modifies {@link MethodMetadata}
   */
  protected <E extends Annotation> void registerClassAnnotation(Predicate<E> predicate,
                                                                DeclarativeContract.AnnotationProcessor<E> processor) {
    this.classAnnotationProcessors.add(new GuardedAnnotationProcessor(predicate, processor));
  }
```

### registerMethodAnnotation

提供注册`解析methodAnnotation`处理器的入口

```java
  /**
   * Called while method annotations are being processed
   *
   * @param annotationType to be processed
   * @param processor function that defines the annotations modifies {@link MethodMetadata}
   */
  protected <E extends Annotation> void registerMethodAnnotation(Class<E> annotationType,
                                                                 DeclarativeContract.AnnotationProcessor<E> processor) {
    registerMethodAnnotation(
        annotation -> annotation.annotationType().equals(annotationType),
        processor);
  }

  /**
   * Called while method annotations are being processed
   *
   * @param predicate to check if the annotation should be processed or not
   * @param processor function that defines the annotations modifies {@link MethodMetadata}
   */
  protected <E extends Annotation> void registerMethodAnnotation(Predicate<E> predicate,
                                                                 DeclarativeContract.AnnotationProcessor<E> processor) {
    this.methodAnnotationProcessors.add(new GuardedAnnotationProcessor(predicate, processor));
  }
```

### registerParameterAnnotation

提供注册`解析parameterAnnotation`处理器的入口

```c
  /**
   * Called while method parameter annotations are being processed
   *
   * @param annotation to be processed
   * @param processor function that defines the annotations modifies {@link MethodMetadata}
   */
  protected <E extends Annotation> void registerParameterAnnotation(Class<E> annotation,
                                                                    DeclarativeContract.ParameterAnnotationProcessor<E> processor) {
    this.parameterAnnotationProcessors.put((Class) annotation,
        (DeclarativeContract.ParameterAnnotationProcessor) processor);
  }
```
