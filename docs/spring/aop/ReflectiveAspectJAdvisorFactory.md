# ReflectiveAspectJAdvisorFactory

继承[`AbstractAspectJAdvisorFactory`](./AbstractAspectJAdvisorFactory)

## 属性

```java
// 反射过滤掉不是用户定义的方法 桥接方法、合成方法、以及Object的方法
private static final MethodFilter adviceMethodFilter = ReflectionUtils.USER_DECLARED_METHODS
        .and(method -> (AnnotationUtils.getAnnotation(method, Pointcut.class) == null));
// 方法排序比较器
private static final Comparator<Method> adviceMethodComparator;   
```

## 静态代码块

InstanceComparator
:::tip 注意
`根据任意的类顺序比较对象。允许对象根据它们所继承的类的类型进行排序，如果两个对象都是相同类型的实例，这个比较器将返回 0。如果需要额外的排序，可以考虑使用 Comparator.thenComparing(Comparator)`
:::

ConvertingComparator
:::tip
在比较之前进行转换的比较器。在将每个值传递给基础 Comparator 之前，将使用指定的 Converter 对其进行转换
:::

```java
static {
    // Note: although @After is ordered before @AfterReturning and @AfterThrowing,
    // an @After advice method will actually be invoked after @AfterReturning and
    // @AfterThrowing methods due to the fact that AspectJAfterAdvice.invoke(MethodInvocation)
    // invokes proceed() in a `try` block and only invokes the @After advice method
    // in a corresponding `finally` block.
    // Aspect相关注解按 @Around、@Before、@After、@AfterReturning、@AfterThrowing排序
    // 转换器会在method搜寻  AbstractAspectJAdvisorFactory.ASPECTJ_ANNOTATION_CLASSES的注解
    Comparator<Method> adviceKindComparator = new ConvertingComparator<>(
        new InstanceComparator<>(
                Around.class, Before.class, After.class, AfterReturning.class, AfterThrowing.class),
        (Converter<Method, Annotation>) method -> {
            AspectJAnnotation<?> ann = AbstractAspectJAdvisorFactory.findAspectJAnnotationOnMethod(method);
            return (ann != null ? ann.getAnnotation() : null);
        });
    Comparator<Method> methodNameComparator = new ConvertingComparator<>(Method::getName);
    // 如果 adviceKindComparator  比较结果相等则按方法名称进行比较
    adviceMethodComparator = adviceKindComparator.thenComparing(methodNameComparator);
}
```

## 方法

### getAdvisors

```java
public List<Advisor> getAdvisors(MetadataAwareAspectInstanceFactory aspectInstanceFactory) {
    // aspect注解的class类型
    Class<?> aspectClass = aspectInstanceFactory.getAspectMetadata().getAspectClass();
    // aspect名称也是beanName
    String aspectName = aspectInstanceFactory.getAspectMetadata().getAspectName();
    // 父类有 @Aspect 注解但不是抽象的那就是错误
    // @Aspect value 代表 aspect 实例化模型默认是 SINGLETON， 不支持 PERCFLOW 和 PERCFLOWBELOW 类型
    validate(aspectClass);

    // We need to wrap the MetadataAwareAspectInstanceFactory with a decorator
    // so that it will only instantiate once.
    //对aspectInstanceFactory进行装饰，可以理解为一个静态代理，代理了aspectInstanceFactory的getAspectInstance方法
    // 代理了aspectInstanceFactory的getAspectInstance方法，它会直接调用getBean获取bean对象
    // 这里lazySingletonAspectInstanceFactory是new出来的对象
    // 对于同一个lazySingletonAspectInstanceFactory对象没必要创建多次AspectInstance，
    // 所以在lazySingletonAspectInstanceFactory对这方法代理，缓存了AspectInstance实例对象
    MetadataAwareAspectInstanceFactory lazySingletonAspectInstanceFactory =
            new LazySingletonAspectInstanceFactoryDecorator(aspectInstanceFactory);

    List<Advisor> advisors = new ArrayList<>();
    for (Method method : getAdvisorMethods(aspectClass)) {
        // Prior to Spring Framework 5.2.7, advisors.size() was supplied as the declarationOrderInAspect
        // to getAdvisor(...) to represent the "current position" in the declared methods list.
        // However, since Java 7 the "current position" is not valid since the JDK no longer
        // returns declared methods in the order in which they are declared in the source code.
        // Thus, we now hard code the declarationOrderInAspect to 0 for all advice methods
        // discovered via reflection in order to support reliable advice ordering across JVM launches.
        // Specifically, a value of 0 aligns with the default value used in
        // AspectJPrecedenceComparator.getAspectDeclarationOrder(Advisor).
        Advisor advisor = getAdvisor(method, lazySingletonAspectInstanceFactory, 0, aspectName);
        if (advisor != null) {
            advisors.add(advisor);
        }
    }

    // If it's a per target aspect, emit the dummy instantiating aspect.
    // 如果它是 PERTARGET 的 aspect，则创建虚拟实例化 aspect（默认是 SINGLETON 一般不会满足条件）
    if (!advisors.isEmpty() && lazySingletonAspectInstanceFactory.getAspectMetadata().isLazilyInstantiated()) {
        Advisor instantiationAdvisor = new SyntheticInstantiationAdvisor(lazySingletonAspectInstanceFactory);
        advisors.add(0, instantiationAdvisor);
    }

    // Find introduction fields.
    // 寻找 aspect 中定义 introduction 字段（@DeclareParents 注解）.
    for (Field field : aspectClass.getDeclaredFields()) {
        // 要是有 @DeclareParents 返回 DeclareParentsAdvisor 实例，加载 Advisor 列表的末尾 
        Advisor advisor = getDeclareParentsAdvisor(field);
        if (advisor != null) {
            advisors.add(advisor);
        }
    }

    return advisors;
}
```

### getAdvisorMethods

```java
private List<Method> getAdvisorMethods(Class<?> aspectClass) {
    List<Method> methods = new ArrayList<>();
    // 通过反射aspectClass 拿到 用户定义的方法，并且上面没有@PointCut注解（切点）
    ReflectionUtils.doWithMethods(aspectClass, methods::add, adviceMethodFilter);
    if (methods.size() > 1) {
        // 排序 
        methods.sort(adviceMethodComparator);
    }
    return methods;
}
```

### getAdvisor

```java
@Override
@Nullable
public Advisor getAdvisor(Method candidateAdviceMethod, MetadataAwareAspectInstanceFactory aspectInstanceFactory,
    int declarationOrderInAspect, String aspectName) {
    // 验证 aspect 类父类如果有 @Aspect 注解则其必须是抽象类
    validate(aspectInstanceFactory.getAspectMetadata().getAspectClass());
    // 获取 AspectJExpressionPointcut
    // 表达式的解析是由AspectJ的工具类完成 AspectJExpressionPointcut 判断类是否满足、方法是否满足
    AspectJExpressionPointcut expressionPointcut = getPointcut(
            candidateAdviceMethod, aspectInstanceFactory.getAspectMetadata().getAspectClass());
    if (expressionPointcut == null) {
        return null;
    }
    // 返回 InstantiationModelAwarePointcutAdvisorImpl 对象
    // 它是通过注解形式注入的最终的Advisor,这个接口提供了懒加载Advice的策略，所以提供了是否是懒加载以及advice是否被实例化的方法
    // 当要获取advice时 通过getAdvice找到通知方法 这个一动作也拖管给 ReflectiveAspectJAdvisorFactory#getAdvice完成
    return new InstantiationModelAwarePointcutAdvisorImpl(expressionPointcut, candidateAdviceMethod,
            this, aspectInstanceFactory, declarationOrderInAspect, aspectName);
}
```

### getAdvice

```java
@Override
@Nullable
public Advice getAdvice(Method candidateAdviceMethod, AspectJExpressionPointcut expressionPointcut,
    MetadataAwareAspectInstanceFactory aspectInstanceFactory, int declarationOrder, String aspectName) {
    // 获取aspectClass的class类型
    Class<?> candidateAspectClass = aspectInstanceFactory.getAspectMetadata().getAspectClass();
    // 校验class
    validate(candidateAspectClass);
    // 获取AspectJ注解
    AspectJAnnotation<?> aspectJAnnotation =
            AbstractAspectJAdvisorFactory.findAspectJAnnotationOnMethod(candidateAdviceMethod);
    if (aspectJAnnotation == null) {
        return null;
    }

    // If we get here, we know we have an AspectJ method.
    // Check that it's an AspectJ-annotated class
    // class有@Aspect注解 且不是有ajc编译而成
    if (!isAspect(candidateAspectClass)) {
        throw new AopConfigException("Advice must be declared inside an aspect type: " +
                "Offending method '" + candidateAdviceMethod + "' in class [" +
                candidateAspectClass.getName() + "]");
    }

    if (logger.isDebugEnabled()) {
        logger.debug("Found AspectJ method: " + candidateAdviceMethod);
    }

    AbstractAspectJAdvice springAdvice;

    // 将注解转成相应的advice通知
    switch (aspectJAnnotation.getAnnotationType()) {
        case AtPointcut:
            if (logger.isDebugEnabled()) {
                logger.debug("Processing pointcut '" + candidateAdviceMethod.getName() + "'");
            }
            return null;
        case AtAround:
            springAdvice = new AspectJAroundAdvice(
                    candidateAdviceMethod, expressionPointcut, aspectInstanceFactory);
            break;
        case AtBefore:
            springAdvice = new AspectJMethodBeforeAdvice(
                    candidateAdviceMethod, expressionPointcut, aspectInstanceFactory);
            break;
        case AtAfter:
            springAdvice = new AspectJAfterAdvice(
                    candidateAdviceMethod, expressionPointcut, aspectInstanceFactory);
            break;
        case AtAfterReturning:
            springAdvice = new AspectJAfterReturningAdvice(
                    candidateAdviceMethod, expressionPointcut, aspectInstanceFactory);
            AfterReturning afterReturningAnnotation = (AfterReturning) aspectJAnnotation.getAnnotation();
            if (StringUtils.hasText(afterReturningAnnotation.returning())) {
                springAdvice.setReturningName(afterReturningAnnotation.returning());
            }
            break;
        case AtAfterThrowing:
            springAdvice = new AspectJAfterThrowingAdvice(
                candidateAdviceMethod, expressionPointcut, aspectInstanceFactory);
            AfterThrowing afterThrowingAnnotation = (AfterThrowing) aspectJAnnotation.getAnnotation();
            if (StringUtils.hasText(afterThrowingAnnotation.throwing())) {
                springAdvice.setThrowingName(afterThrowingAnnotation.throwing());
            }
            break;
        default:
            throw new UnsupportedOperationException(
                    "Unsupported advice type on method: " + candidateAdviceMethod);
    }

    // Now to configure the advice...
    springAdvice.setAspectName(aspectName);
    springAdvice.setDeclarationOrder(declarationOrder);
    String[] argNames = this.parameterNameDiscoverer.getParameterNames(candidateAdviceMethod);
    if (argNames != null) {
        springAdvice.setArgumentNamesFromStringArray(argNames);
    }
    springAdvice.calculateArgumentBindings();

    return springAdvice;
}
```
