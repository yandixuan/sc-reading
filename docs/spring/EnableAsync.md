# EnableAsync

使用@EnableAsync注解后，将自动创建一个线程池，并在方法被调用时，使用线程池中的线程来执行方法。这样可以避免阻塞主线程，提高系统的并发性能。

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Import(AsyncConfigurationSelector.class)
public @interface EnableAsync {
    // ...省略
}
```

## 引入`AsyncConfigurationSelector`

`AsyncConfigurationSelector`实现了`ImportSelector`接口，在解析Config class时，会触发`selector`实例的[`selectImports`](https://github.com/spring-projects/spring-framework/blob/main/spring-context/src/main/java/org/springframework/context/annotation/ConfigurationClassParser.java#L494-L498)方法，。即向Spring容器提供配置类去解析出`Bean> Definition`。

```java
    @Override
    public final String[] selectImports(AnnotationMetadata importingClassMetadata) {
        // 获取AsyncConfigurationSelector的泛型，即EnableAsync
        Class<?> annType = GenericTypeResolver.resolveTypeArgument(getClass(), AdviceModeImportSelector.class);
        Assert.state(annType != null, "Unresolvable type argument for AdviceModeImportSelector");
        // 获取引入EnableAsync类上的EnableAsync注解相关属性
        AnnotationAttributes attributes = AnnotationConfigUtils.attributesFor(importingClassMetadata, annType);
        if (attributes == null) {
            throw new IllegalArgumentException(String.format(
                    "@%s is not present on importing class '%s' as expected",
                    annType.getSimpleName(), importingClassMetadata.getClassName()));
        }
        /**
         * 拿的注解设置的模式:
         * 1. AdviceMode.PROXY
         * 2. AdviceMode.ASPECTJ
         */        
        AdviceMode adviceMode = attributes.getEnum(getAdviceModeAttributeName());
        /**
         * 根据模式获取到配置类全限定路径:
         * 1. AdviceMode.PROXY - org.springframework.scheduling.annotation.ProxyAsyncConfiguration
         * 2. AdviceMode.ASPECTJ - org.springframework.scheduling.aspectj.AspectJAsyncConfiguration
         * 一般是 ProxyAsyncConfiguration
         */
        String[] imports = selectImports(adviceMode);
        if (imports == null) {
            throw new IllegalArgumentException("Unknown AdviceMode: " + adviceMode);
        }
        return imports;
    }
```

## ProxyAsyncConfiguration

```java
@Configuration(proxyBeanMethods = false)
@Role(BeanDefinition.ROLE_INFRASTRUCTURE)
public class ProxyAsyncConfiguration extends AbstractAsyncConfiguration {

    @Bean(name = TaskManagementConfigUtils.ASYNC_ANNOTATION_PROCESSOR_BEAN_NAME)
    @Role(BeanDefinition.ROLE_INFRASTRUCTURE)
    public AsyncAnnotationBeanPostProcessor asyncAdvisor() {
        Assert.state(this.enableAsync != null, "@EnableAsync annotation metadata was not injected");
        AsyncAnnotationBeanPostProcessor bpp = new AsyncAnnotationBeanPostProcessor();
        bpp.configure(this.executor, this.exceptionHandler);
        Class<? extends Annotation> customAsyncAnnotation = this.enableAsync.getClass("annotation");
        if (customAsyncAnnotation != AnnotationUtils.getDefaultValue(EnableAsync.class, "annotation")) {
            bpp.setAsyncAnnotationType(customAsyncAnnotation);
        }
        bpp.setProxyTargetClass(this.enableAsync.getBoolean("proxyTargetClass"));
        bpp.setOrder(this.enableAsync.<Integer>getNumber("order"));
        return bpp;
    }

}
```

从配置类中向Spring容器注册了`AsyncAnnotationBeanPostProcessor`这个Bean Definition

## 创建BeanPostProcesser

在容器刷新的过程中会创建BeanPostProcesser，调用堆栈如下:

```java
setBeanFactory:149, AsyncAnnotationBeanPostProcessor (org.springframework.scheduling.annotation)
invokeAwareMethods:1791, AbstractAutowireCapableBeanFactory (org.springframework.beans.factory.support)
initializeBean:1758, AbstractAutowireCapableBeanFactory (org.springframework.beans.factory.support)
doCreateBean:598, AbstractAutowireCapableBeanFactory (org.springframework.beans.factory.support)
createBean:520, AbstractAutowireCapableBeanFactory (org.springframework.beans.factory.support)
lambda$doGetBean$0:326, AbstractBeanFactory (org.springframework.beans.factory.support)
getObject:-1, AbstractBeanFactory$$Lambda$328/0x0000000800e03998 (org.springframework.beans.factory.support)
getSingleton:234, DefaultSingletonBeanRegistry (org.springframework.beans.factory.support)
doGetBean:324, AbstractBeanFactory (org.springframework.beans.factory.support)
getBean:205, AbstractBeanFactory (org.springframework.beans.factory.support)
registerBeanPostProcessors:261, PostProcessorRegistrationDelegate (org.springframework.context.support)
registerBeanPostProcessors:788, AbstractApplicationContext (org.springframework.context.support)
refresh:592, AbstractApplicationContext (org.springframework.context.support)
refresh:66, ReactiveWebServerApplicationContext (org.springframework.boot.web.reactive.context)
refresh:732, SpringApplication (org.springframework.boot)
refreshContext:434, SpringApplication (org.springframework.boot)
run:310, SpringApplication (org.springframework.boot)
main:17, ServerApplication (com.ydx.server)
```

因为我们`AsyncAnnotationBeanPostProcessor`是Bean后置处理器，所以会走到`registerBeanPostProcessors`处，即向Spring容器实例化所有注册的BeanPostProcessor，因`ProxyAsyncConfiguration`向Spring容器注册了`AsyncAnnotationBeanPostProcessor` Bean Definition。所以直接走getBean创建流程。

`AsyncAnnotationBeanPostProcessor`实现了`BeanFactoryAware`接口。[在Bean进行Spring实例化之前会调用`setBeanFactory`方法](https://github.com/spring-projects/spring-framework/blob/main/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractAutowireCapableBeanFactory.java#L1759)

`AsyncAnnotationBeanPostProcessor`的`setBeanFactory`实现中，这个方法会为我们创建`AsyncAnnotationAdvisor`

### 初始化AsyncAnnotationAdvisor

异步注解方法的增强器

```java
    public AsyncAnnotationAdvisor(
            @Nullable Supplier<Executor> executor, @Nullable Supplier<AsyncUncaughtExceptionHandler> exceptionHandler) {
        
        Set<Class<? extends Annotation>> asyncAnnotationTypes = new LinkedHashSet<>(2);
        asyncAnnotationTypes.add(Async.class);

        ClassLoader classLoader = AsyncAnnotationAdvisor.class.getClassLoader();
        /**
         * 添加对 Jakarta EE、Jakarta EJB中异步方法注解的支持
         */
        try {
            asyncAnnotationTypes.add((Class<? extends Annotation>)
                    ClassUtils.forName("jakarta.ejb.Asynchronous", classLoader));
        }
        catch (ClassNotFoundException ex) {
            // If EJB API not present, simply ignore.
        }
        try {
            asyncAnnotationTypes.add((Class<? extends Annotation>)
                    ClassUtils.forName("jakarta.enterprise.concurrent.Asynchronous", classLoader));
        }
        catch (ClassNotFoundException ex) {
            // If Jakarta Concurrent API not present, simply ignore.
        }
        // 创建通知
        this.advice = buildAdvice(executor, exceptionHandler);
        // 创建切点
        this.pointcut = buildPointcut(asyncAnnotationTypes);
    }
```

### 创建通知

代理类方法增强逻辑

```java
    protected Advice buildAdvice(
            @Nullable Supplier<Executor> executor, @Nullable Supplier<AsyncUncaughtExceptionHandler> exceptionHandler) {
        // 代理对象方法增强的逻辑
        AnnotationAsyncExecutionInterceptor interceptor = new AnnotationAsyncExecutionInterceptor(null);
        interceptor.configure(executor, exceptionHandler);
        return interceptor;
    }
```

### 创建切点

告诉我们什么方法需要经过`Spring Aop`拦截器链增强

```java
    protected Pointcut buildPointcut(Set<Class<? extends Annotation>> asyncAnnotationTypes) {
        ComposablePointcut result = null;
        for (Class<? extends Annotation> asyncAnnotationType : asyncAnnotationTypes) {
            Pointcut cpc = new AnnotationMatchingPointcut(asyncAnnotationType, true);
            Pointcut mpc = new AnnotationMatchingPointcut(null, asyncAnnotationType, true);
            if (result == null) {
                result = new ComposablePointcut(cpc);
            }
            else {
                result.union(cpc);
            }
            result = result.union(mpc);
        }
        // 切点其实就是起过滤的作用，方法和类上声明了@Async都是需要进行AOP拦截器链增强的。即需要为目标生成代理类
        return (result != null ? result : Pointcut.TRUE);
    }
```

## 目标生成代理类

`AsyncAnnotationBeanPostProcessor`继承`AbstractAdvisingBeanPostProcessor`，而`AbstractAdvisingBeanPostProcessor`提供了`postProcessAfterInitialization`方法的实现，用于bean在spring实例化之后生成代理对象。

```java
    @Override
    public Object postProcessAfterInitialization(Object bean, String beanName) {
        /**
         * AopInfrastructureBean 是一个标记接口。若Bean实现了此接口，表明它是一个Spring AOP的基础类，那么这个类是不会被AOP给代理的
         */
        if (this.advisor == null || bean instanceof AopInfrastructureBean) {
            // Ignore AOP infrastructure such as scoped proxies.
            return bean;
        }
        // 如果bean是代理类
        if (bean instanceof Advised advised) {
            // isEligible就会判断切点是否与bean的class是否匹配
            if (!advised.isFrozen() && isEligible(AopUtils.getTargetClass(bean))) {
                // Add our local Advisor to the existing proxy's Advisor chain.
                /**
                 * this.beforeExistingAdvisors == true，则将该通知者添加到代理对象的通知者数组的开始位置
                 * AsyncAnnotationBeanPostProcessor 初始化会执行 setBeforeExistingAdvisors(true);
                 */
                if (this.beforeExistingAdvisors) {
                    advised.addAdvisor(0, this.advisor);
                }
                /**
                 * 对于接口的代理，最后一个advisor会完成实际工作，所以当前advisor添加到数组中倒数第二的位置
                 * https://github.com/spring-projects/spring-framework/commit/6a6a35a0b95ac946c66c102ff0a43f0a638b5421
                 */
                else if (advised.getTargetSource() == AdvisedSupport.EMPTY_TARGET_SOURCE &&
                        advised.getAdvisorCount() > 0) {
                    // No target, leave last Advisor in place and add new Advisor right before.
                    advised.addAdvisor(advised.getAdvisorCount() - 1, this.advisor);
                    return bean;
                }
                // 正常添加到数组的末端
                else {
                    advised.addAdvisor(this.advisor);
                }
                return bean;
            }
        }

        if (isEligible(bean, beanName)) {
            // 代理对象工厂
            ProxyFactory proxyFactory = prepareProxyFactory(bean, beanName);
            if (!proxyFactory.isProxyTargetClass()) {
                evaluateProxyInterfaces(bean.getClass(), proxyFactory);
            }
            // 添加通知者
            proxyFactory.addAdvisor(this.advisor);
            customizeProxyFactory(proxyFactory);

            // Use original ClassLoader if bean class not locally loaded in overriding class loader
            ClassLoader classLoader = getProxyClassLoader();
            if (classLoader instanceof SmartClassLoader smartClassLoader &&
                    classLoader != bean.getClass().getClassLoader()) {
                classLoader = smartClassLoader.getOriginalClassLoader();
            }
            // 生成代理类并且返回
            return proxyFactory.getProxy(classLoader);
        }

        // No proxy needed.
        return bean;
    }
```

## 异步方法的执行

创建`AsyncAnnotationAdvisor`时，会创建`AnnotationAsyncExecutionInterceptor`,它会创建切点和通知

`AsyncExecutionInterceptor`实现了SpringAop中的`org.aopalliance.intercept.MethodInterceptor`即`Advice`，它提供了`invoke`方法的实现

```java
    @Override
    @Nullable
    public Object invoke(final MethodInvocation invocation) throws Throwable {
        // 获取代理的目标类
        Class<?> targetClass = (invocation.getThis() != null ? AopUtils.getTargetClass(invocation.getThis()) : null);
        // 获取执行方法
        Method specificMethod = ClassUtils.getMostSpecificMethod(invocation.getMethod(), targetClass);
        // 对桥接方法的处理
        final Method userDeclaredMethod = BridgeMethodResolver.findBridgedMethod(specificMethod);
        // 从容器中找到合适的线程池
        AsyncTaskExecutor executor = determineAsyncExecutor(userDeclaredMethod);
        if (executor == null) {
            throw new IllegalStateException(
                    "No executor specified and no default executor set on AsyncExecutionInterceptor either");
        }
        // 将invocation.proceed()封装成task
        Callable<Object> task = () -> {
            try {
                // invocation.proceed()交由下一个拦截器执行，如果拦截器执行完了就是targetClass的方法执行，即主要逻辑
                Object result = invocation.proceed();
                if (result instanceof Future<?> future) {
                    return future.get();
                }
            }
            catch (ExecutionException ex) {
                handleError(ex.getCause(), userDeclaredMethod, invocation.getArguments());
            }
            catch (Throwable ex) {
                handleError(ex, userDeclaredMethod, invocation.getArguments());
            }
            return null;
        };
        // 将task提交到线程池中执行，根据returnType进行一个适配
        return doSubmit(task, executor, invocation.getMethod().getReturnType());
    }
```
