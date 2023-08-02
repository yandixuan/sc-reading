# EnableScheduling

`Spring`提供的一种能够自动安排任务执行的注解。

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Import(SchedulingConfiguration.class)
@Documented
public @interface EnableScheduling {

}
```

## 引入`SchedulingConfiguration`配置类

```java
@Configuration(proxyBeanMethods = false)
@Role(BeanDefinition.ROLE_INFRASTRUCTURE)
public class SchedulingConfiguration {

    @Bean(name = TaskManagementConfigUtils.SCHEDULED_ANNOTATION_PROCESSOR_BEAN_NAME)
    @Role(BeanDefinition.ROLE_INFRASTRUCTURE)
    public ScheduledAnnotationBeanPostProcessor scheduledAnnotationProcessor() {
        return new ScheduledAnnotationBeanPostProcessor();
    }

}
```

该配置类向Spring容器注册`ScheduledAnnotationBeanPostProcessor`

## 解析、生成定时任务

`ScheduledAnnotationBeanPostProcessor`，实现了`postProcessAfterInitialization`，即在bean完成初始化后，完成对定时任务的加载

### 解析`@Scheduled`注解

```java
    @Override
    public Object postProcessAfterInitialization(Object bean, String beanName) {
        // 忽略AopInfrastructureBean、TaskScheduler和ScheduledExecutorService三种类型的Bean
        if (bean instanceof AopInfrastructureBean || bean instanceof TaskScheduler ||
                bean instanceof ScheduledExecutorService) {
            // Ignore AOP infrastructure such as scoped proxies.
            return bean;
        }
        // 获取Bean的用户态类型，例如Bean有可能被CGLIB增强，这个时候要取目标类
        Class<?> targetClass = AopProxyUtils.ultimateTargetClass(bean);
        // nonAnnotatedClasses存放着不存在@Scheduled注解的类型，缓存起来避免重复判断它是否携带@Scheduled注解的方法
        if (!this.nonAnnotatedClasses.contains(targetClass) &&
                AnnotationUtils.isCandidateClass(targetClass, List.of(Scheduled.class, Schedules.class))) {
            /**
             * 因为JDK8之后支持重复注解，因此获取具体类型中Method -> @Scheduled的集合，也就是有可能一个方法使用多个@Scheduled注解，最终会封装为多个Task
             */
            Map<Method, Set<Scheduled>> annotatedMethods = MethodIntrospector.selectMethods(targetClass,
                    (MethodIntrospector.MetadataLookup<Set<Scheduled>>) method -> {
                        // 找到方法的Scheduled注解集合
                        Set<Scheduled> scheduledAnnotations = AnnotatedElementUtils.getMergedRepeatableAnnotations(
                                method, Scheduled.class, Schedules.class);
                        return (!scheduledAnnotations.isEmpty() ? scheduledAnnotations : null);
                    });
            // 如果targetClass没有方法被@Scheduled @Scheduleds修饰则加入缓存
            if (annotatedMethods.isEmpty()) {
                this.nonAnnotatedClasses.add(targetClass);
                if (logger.isTraceEnabled()) {
                    logger.trace("No @Scheduled annotations found on bean class: " + targetClass);
                }
            }
            else {
                // Non-empty set of methods
                // 遍历annotatedMethods，为方法的每个@Scheduled注解生成定时任务
                annotatedMethods.forEach((method, scheduledAnnotations) ->
                        scheduledAnnotations.forEach(scheduled -> processScheduled(scheduled, method, bean)));
                if (logger.isTraceEnabled()) {
                    logger.trace(annotatedMethods.size() + " @Scheduled methods processed on bean '" + beanName +
                            "': " + annotatedMethods);
                }
            }
        }
        return bean;
    }

```

### 生成定时任务

```java
    protected void processScheduled(Scheduled scheduled, Method method, Object bean) {
        try {
            // 构造runnable，其实现就是反射运行method
            Runnable runnable = createRunnable(bean, method);
            boolean processedSchedule = false;
            String errorMessage =
                    "Exactly one of the 'cron', 'fixedDelay(String)', or 'fixedRate(String)' attributes is required";
            // 定时任务集合
            Set<ScheduledTask> tasks = new LinkedHashSet<>(4);

            // Determine initial delay
            // 解析initial delay
            Duration initialDelay = toDuration(scheduled.initialDelay(), scheduled.timeUnit());
            String initialDelayString = scheduled.initialDelayString();
            if (StringUtils.hasText(initialDelayString)) {
                Assert.isTrue(initialDelay.isNegative(), "Specify 'initialDelay' or 'initialDelayString', not both");
                if (this.embeddedValueResolver != null) {
                    // 支持根据配置解析占位符
                    initialDelayString = this.embeddedValueResolver.resolveStringValue(initialDelayString);
                }
                if (StringUtils.hasLength(initialDelayString)) {
                    try {
                        initialDelay = toDuration(initialDelayString, scheduled.timeUnit());
                    }
                    catch (RuntimeException ex) {
                        throw new IllegalArgumentException(
                                "Invalid initialDelayString value \"" + initialDelayString + "\" - cannot parse into long");
                    }
                }
            }

            // Check cron expression
            // 解析cron表达式
            String cron = scheduled.cron();
            if (StringUtils.hasText(cron)) {
                String zone = scheduled.zone();
                if (this.embeddedValueResolver != null) {
                    cron = this.embeddedValueResolver.resolveStringValue(cron);
                    zone = this.embeddedValueResolver.resolveStringValue(zone);
                }
                if (StringUtils.hasLength(cron)) {
                    Assert.isTrue(initialDelay.isNegative(), "'initialDelay' not supported for cron triggers");
                    processedSchedule = true;
                    if (!Scheduled.CRON_DISABLED.equals(cron)) {
                        TimeZone timeZone;
                        if (StringUtils.hasText(zone)) {
                            timeZone = StringUtils.parseTimeZoneString(zone);
                        }
                        else {
                            timeZone = TimeZone.getDefault();
                        }
                        // 根据cron表达式生成ScheduledTask并添加到集合中
                        tasks.add(this.registrar.scheduleCronTask(new CronTask(runnable, new CronTrigger(cron, timeZone))));
                    }
                }
            }

            // At this point we don't need to differentiate between initial delay set or not anymore
            // 负数调整成0
            if (initialDelay.isNegative()) {
                initialDelay = Duration.ZERO;
            }

            // Check fixed delay
            // 处理fixed delay任务
            Duration fixedDelay = toDuration(scheduled.fixedDelay(), scheduled.timeUnit());
            if (!fixedDelay.isNegative()) {
                Assert.isTrue(!processedSchedule, errorMessage);
                processedSchedule = true;
                /**
                 * 此时this.scheduler为null
                 * 向ScheduledTaskRegistrar的fixedDelayTasks集合中添加FixedDelayTask
                 * 等待this.scheduler有值后再向定时任务线程吃中添加任务
                 */
                tasks.add(this.registrar.scheduleFixedDelayTask(new FixedDelayTask(runnable, fixedDelay, initialDelay)));
            }
            // 处理fixedDelayString
            String fixedDelayString = scheduled.fixedDelayString();
            if (StringUtils.hasText(fixedDelayString)) {
                if (this.embeddedValueResolver != null) {
                    fixedDelayString = this.embeddedValueResolver.resolveStringValue(fixedDelayString);
                }
                if (StringUtils.hasLength(fixedDelayString)) {
                    Assert.isTrue(!processedSchedule, errorMessage);
                    processedSchedule = true;
                    try {
                        fixedDelay = toDuration(fixedDelayString, scheduled.timeUnit());
                    }
                    catch (RuntimeException ex) {
                        throw new IllegalArgumentException(
                                "Invalid fixedDelayString value \"" + fixedDelayString + "\" - cannot parse into long");
                    }
                    // 逻辑同上
                    tasks.add(this.registrar.scheduleFixedDelayTask(new FixedDelayTask(runnable, fixedDelay, initialDelay)));
                }
            }

            // Check fixed rate
            // 处理fixed rate任务
            Duration fixedRate = toDuration(scheduled.fixedRate(), scheduled.timeUnit());
            if (!fixedRate.isNegative()) {
                Assert.isTrue(!processedSchedule, errorMessage);
                processedSchedule = true;
                // 逻辑同上
                tasks.add(this.registrar.scheduleFixedRateTask(new FixedRateTask(runnable, fixedRate, initialDelay)));
            }
            // 处理fixedRateString
            String fixedRateString = scheduled.fixedRateString();
            if (StringUtils.hasText(fixedRateString)) {
                if (this.embeddedValueResolver != null) {
                    // Spring SPEL
                    fixedRateString = this.embeddedValueResolver.resolveStringValue(fixedRateString);
                }
                if (StringUtils.hasLength(fixedRateString)) {
                    Assert.isTrue(!processedSchedule, errorMessage);
                    processedSchedule = true;
                    try {
                        fixedRate = toDuration(fixedRateString, scheduled.timeUnit());
                    }
                    catch (RuntimeException ex) {
                        throw new IllegalArgumentException(
                                "Invalid fixedRateString value \"" + fixedRateString + "\" - cannot parse into long");
                    }
                    // 逻辑同上
                    tasks.add(this.registrar.scheduleFixedRateTask(new FixedRateTask(runnable, fixedRate, initialDelay)));
                }
            }

            // Check whether we had any attribute set
            Assert.isTrue(processedSchedule, errorMessage);

            // Finally register the scheduled tasks
            // 最后注册 bean->任务集合 映射关系
            synchronized (this.scheduledTasks) {
                Set<ScheduledTask> regTasks = this.scheduledTasks.computeIfAbsent(bean, key -> new LinkedHashSet<>(4));
                regTasks.addAll(tasks);
            }
        }
        catch (IllegalArgumentException ex) {
            throw new IllegalStateException(
                    "Encountered invalid @Scheduled method '" + method.getName() + "': " + ex.getMessage());
        }
    }
```

## 提交任务

Spring容器刷新完成后会发布`ContextRefreshedEvent`事件

```java
    @Override
    public void onApplicationEvent(ContextRefreshedEvent event) {
        if (event.getApplicationContext() == this.applicationContext) {
            // Running in an ApplicationContext -> register tasks this late...
            // giving other ContextRefreshedEvent listeners a chance to perform
            // their work at the same time (e.g. Spring Batch's job registration).
            finishRegistration();
        }
    }
```

`finishRegistration`会触发任务的提交

```java
    private void finishRegistration() {
        // registrar设置TaskScheduler
        if (this.scheduler != null) {
            this.registrar.setScheduler(this.scheduler);
        }
        // 实现了SchedulingConfigurer接口的bean调用
        if (this.beanFactory instanceof ListableBeanFactory lbf) {
            Map<String, SchedulingConfigurer> beans = lbf.getBeansOfType(SchedulingConfigurer.class);
            List<SchedulingConfigurer> configurers = new ArrayList<>(beans.values());
            AnnotationAwareOrderComparator.sort(configurers);
            for (SchedulingConfigurer configurer : configurers) {
                configurer.configureTasks(this.registrar);
            }
        }
        // 
        /**
         * 存在任务并且registrar的TaskScheduler还是null，那么从容器去取bean
         * 1. 根据名字: DEFAULT_TASK_SCHEDULER_BEAN_NAME
         * 2. 根据类型: TaskScheduler.class
         */
        if (this.registrar.hasTasks() && this.registrar.getScheduler() == null) {
            Assert.state(this.beanFactory != null, "BeanFactory must be set to find scheduler by type");
            try {
                // Search for TaskScheduler bean...
                this.registrar.setTaskScheduler(resolveSchedulerBean(this.beanFactory, TaskScheduler.class, false));
            }
            catch (NoUniqueBeanDefinitionException ex) {
                if (logger.isTraceEnabled()) {
                    logger.trace("Could not find unique TaskScheduler bean - attempting to resolve by name: " +
                            ex.getMessage());
                }
                try {
                    this.registrar.setTaskScheduler(resolveSchedulerBean(this.beanFactory, TaskScheduler.class, true));
                }
                catch (NoSuchBeanDefinitionException ex2) {
                    if (logger.isInfoEnabled()) {
                        logger.info("More than one TaskScheduler bean exists within the context, and " +
                                "none is named 'taskScheduler'. Mark one of them as primary or name it 'taskScheduler' " +
                                "(possibly as an alias); or implement the SchedulingConfigurer interface and call " +
                                "ScheduledTaskRegistrar#setScheduler explicitly within the configureTasks() callback: " +
                                ex.getBeanNamesFound());
                    }
                }
            }
            catch (NoSuchBeanDefinitionException ex) {
                if (logger.isTraceEnabled()) {
                    logger.trace("Could not find default TaskScheduler bean - attempting to find ScheduledExecutorService: " +
                            ex.getMessage());
                }
                // Search for ScheduledExecutorService bean next...
                try {
                    this.registrar.setScheduler(resolveSchedulerBean(this.beanFactory, ScheduledExecutorService.class, false));
                }
                catch (NoUniqueBeanDefinitionException ex2) {
                    if (logger.isTraceEnabled()) {
                        logger.trace("Could not find unique ScheduledExecutorService bean - attempting to resolve by name: " +
                                ex2.getMessage());
                    }
                    try {
                        this.registrar.setScheduler(resolveSchedulerBean(this.beanFactory, ScheduledExecutorService.class, true));
                    }
                    catch (NoSuchBeanDefinitionException ex3) {
                        if (logger.isInfoEnabled()) {
                            logger.info("More than one ScheduledExecutorService bean exists within the context, and " +
                                    "none is named 'taskScheduler'. Mark one of them as primary or name it 'taskScheduler' " +
                                    "(possibly as an alias); or implement the SchedulingConfigurer interface and call " +
                                    "ScheduledTaskRegistrar#setScheduler explicitly within the configureTasks() callback: " +
                                    ex2.getBeanNamesFound());
                        }
                    }
                }
                catch (NoSuchBeanDefinitionException ex2) {
                    if (logger.isTraceEnabled()) {
                        logger.trace("Could not find default ScheduledExecutorService bean - falling back to default: " +
                                ex2.getMessage());
                    }
                    // Giving up -> falling back to default scheduler within the registrar...
                    logger.info("No TaskScheduler/ScheduledExecutorService bean found for scheduled processing");
                }
            }
        }
        // 有了定时任务线程池那么我们就可以向其中提交任务了
        this.registrar.afterPropertiesSet();
    }
```

向线程池中提交任务

```java
    @Override
    public void afterPropertiesSet() {
        scheduleTasks();
    }
    /**
     * 如果还是没有taskScheduler，那么创建一个线程池
     */
    protected void scheduleTasks() {
        if (this.taskScheduler == null) {
            this.localExecutor = Executors.newSingleThreadScheduledExecutor();
            this.taskScheduler = new ConcurrentTaskScheduler(this.localExecutor);
        }
        // 由于this.taskScheduler不为null，后面就是遍历各个类型的任务向线程池中提交定时任务
        if (this.triggerTasks != null) {
            for (TriggerTask task : this.triggerTasks) {
                addScheduledTask(scheduleTriggerTask(task));
            }
        }
        if (this.cronTasks != null) {
            for (CronTask task : this.cronTasks) {
                addScheduledTask(scheduleCronTask(task));
            }
        }
        if (this.fixedRateTasks != null) {
            for (IntervalTask task : this.fixedRateTasks) {
                if (task instanceof FixedRateTask fixedRateTask) {
                    addScheduledTask(scheduleFixedRateTask(fixedRateTask));
                }
                else {
                    addScheduledTask(scheduleFixedRateTask(new FixedRateTask(task)));
                }
            }
        }
        if (this.fixedDelayTasks != null) {
            for (IntervalTask task : this.fixedDelayTasks) {
                if (task instanceof FixedDelayTask fixedDelayTask) {
                    addScheduledTask(scheduleFixedDelayTask(fixedDelayTask));
                }
                else {
                    addScheduledTask(scheduleFixedDelayTask(new FixedDelayTask(task)));
                }
            }
        }
    }
```
