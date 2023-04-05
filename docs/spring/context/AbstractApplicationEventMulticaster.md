# AbstractApplicationEventMulticaster

## 属性

```java
    // 容器所有`ApplicationListener`实例及容器里所有`ApplicationListener`的BeanName的集合（包含非单例）
    private final DefaultListenerRetriever defaultRetriever = new DefaultListenerRetriever();
    // 事件类型及监听器集合的一个缓存，线程安全
    final Map<ListenerCacheKey, CachedListenerRetriever> retrieverCache = new ConcurrentHashMap<>(64);
    // 类加载器
    @Nullable
    private ClassLoader beanClassLoader;

    @Nullable
    // bean容器
    private ConfigurableBeanFactory beanFactory;
```

## 方法

### addApplicationListener

添加`ApplicationListener`

```java
@Override
public void addApplicationListener(ApplicationListener<?> listener) {
    // 因为添加、删除listener都是通过`defaultRetriever`去做的因此，存在并发问题故加锁
    synchronized (this.defaultRetriever) {
        // Explicitly remove target for a proxy, if registered already,
        // in order to avoid double invocations of the same listener.
        // 返回代理的原始对象，如果原始对象是一个ApplicationListener
        // 把原始对象移除，然后添加代理对象。避免一个监听器重复调用
        Object singletonTarget = AopProxyUtils.getSingletonTarget(listener);
        if (singletonTarget instanceof ApplicationListener) {
            this.defaultRetriever.applicationListeners.remove(singletonTarget);
        }
        // 将listener添加进合集中
        this.defaultRetriever.applicationListeners.add(listener);
        this.retrieverCache.clear();
    }
}
```

### getApplicationListeners

```java
/**
* Return a Collection of ApplicationListeners matching the given
* event type. Non-matching listeners get excluded early.
* @param event the event to be propagated. Allows for excluding
* non-matching listeners early, based on cached matching information.
* @param eventType the event type
* @return a Collection of ApplicationListeners
* @see org.springframework.context.ApplicationListener
*/
protected Collection<ApplicationListener<?>> getApplicationListeners(
        ApplicationEvent event, ResolvableType eventType) {
    // 获取事件的源
    Object source = event.getSource();
    // 源类型
    Class<?> sourceType = (source != null ? source.getClass() : null);
    // 根据eventType和sourceType构造一个缓存key
    ListenerCacheKey cacheKey = new ListenerCacheKey(eventType, sourceType);

    // Potential new retriever to populate
    CachedListenerRetriever newRetriever = null;
  
    // Quick check for existing entry on ConcurrentHashMap
    // 先从缓存中获取缓存对象
    CachedListenerRetriever existingRetriever = this.retrieverCache.get(cacheKey);
    if (existingRetriever == null) {
        // Caching a new ListenerRetriever if possible
        // 确保Spring框架的jar包和应用类的jar包使用的是同一个ClassLoader加载的,与spring application的生命周期一致即可缓存
        if (this.beanClassLoader == null ||
            (ClassUtils.isCacheSafe(event.getClass(), this.beanClassLoader) &&
                (sourceType == null || ClassUtils.isCacheSafe(sourceType, this.beanClassLoader)))) {
            // 创建一个ApplicationListener容器对象，里面包含两个属相
            // applicationListeners     
            // applicationListenerBeans    
            newRetriever = new CachedListenerRetriever();
            existingRetriever = this.retrieverCache.putIfAbsent(cacheKey, newRetriever);
            if (existingRetriever != null) {
                newRetriever = null;  // no need to populate it in retrieveApplicationListeners
            }
        }
    }
    // 如果查到CachedListenerRetriever，则从其实例中获取到所有的监听器直接返回
    if (existingRetriever != null) {
        Collection<ApplicationListener<?>> result = existingRetriever.getApplicationListeners();
        if (result != null) {
            return result;
        }
        // If result is null, the existing retriever is not fully populated yet by another thread.
        // Proceed like caching wasn't possible for this current local attempt.
    }
    // 遍历所有的事件监听器,并根据事件类型和事件源类型进行匹配。
    return retrieveApplicationListeners(eventType, sourceType, newRetriever);
}
```

### retrieveApplicationListeners

```java
/**
* Actually retrieve the application listeners for the given event and source type.
* @param eventType the event type
* @param sourceType the event source type
* @param retriever the ListenerRetriever, if supposed to populate one (for caching purposes)
* @return the pre-filtered list of application listeners for the given event and source type
*/
private Collection<ApplicationListener<?>> retrieveApplicationListeners(
        ResolvableType eventType, @Nullable Class<?> sourceType, @Nullable CachedListenerRetriever retriever) {
    // 结果集
    List<ApplicationListener<?>> allListeners = new ArrayList<>();
    // 单例bean
    Set<ApplicationListener<?>> filteredListeners = (retriever != null ? new LinkedHashSet<>() : null);
    // 其他scope的been
    Set<String> filteredListenerBeans = (retriever != null ? new LinkedHashSet<>() : null);

    Set<ApplicationListener<?>> listeners;
    Set<String> listenerBeans;
    // 从defaultRetriever取出对应的`listeners`,`listenerBeans`
    synchronized (this.defaultRetriever) {
        listeners = new LinkedHashSet<>(this.defaultRetriever.applicationListeners);
        listenerBeans = new LinkedHashSet<>(this.defaultRetriever.applicationListenerBeans);
    }

    // Add programmatically registered listeners, including ones coming
    // from ApplicationListenerDetector (singleton beans and inner beans).
    // 遍历全部监听器，过滤出匹配的
    for (ApplicationListener<?> listener : listeners) {
        if (supportsEvent(listener, eventType, sourceType)) {
            // 缓存可能为null，判断确保安全
            if (retriever != null) {
                filteredListeners.add(listener);
            }
            allListeners.add(listener);
        }
    }

    // Add listeners by bean name, potentially overlapping with programmatically
    // registered listeners above - but here potentially with additional metadata.
    if (!listenerBeans.isEmpty()) {
        ConfigurableBeanFactory beanFactory = getBeanFactory();
        for (String listenerBeanName : listenerBeans) {
            try {
                // 判断当前监听器是否对listener对event感兴趣 
                if (supportsEvent(beanFactory, listenerBeanName, eventType)) {
                    // 从容器根据beanName取出监听器
                    ApplicationListener<?> listener =
                            beanFactory.getBean(listenerBeanName, ApplicationListener.class);
                    if (!allListeners.contains(listener) && supportsEvent(listener, eventType, sourceType)) {
                        // 对应的事件存在缓存
                        if (retriever != null) {
                            if (beanFactory.isSingleton(listenerBeanName)) {
                                filteredListeners.add(listener);
                            }
                            else {
                                filteredListenerBeans.add(listenerBeanName);
                            }
                        }
                        // 感兴趣的监听器会被加入到allListeners集合中
                        allListeners.add(listener);
                    }
                }
                else {
                    // Remove non-matching listeners that originally came from
                    // ApplicationListenerDetector, possibly ruled out by additional
                    // BeanDefinition metadata (e.g. factory method generics) above.
                    Object listener = beanFactory.getSingleton(listenerBeanName);
                    // 如果该监听器对事件不感兴趣，则从`filteredListeners`,`allListeners`里移除
                    if (retriever != null) {
                        filteredListeners.remove(listener);
                    }
                    allListeners.remove(listener);
                }
            }
            catch (NoSuchBeanDefinitionException ex) {
                // Singleton listener instance (without backing bean definition) disappeared -
                // probably in the middle of the destruction phase
            }
        }
    }
    
    // 排序
    AnnotationAwareOrderComparator.sort(allListeners);
    // 缓存赋值
    if (retriever != null) {
        if (filteredListenerBeans.isEmpty()) {
            retriever.applicationListeners = new LinkedHashSet<>(allListeners);
            retriever.applicationListenerBeans = filteredListenerBeans;
        }
        else {
            retriever.applicationListeners = filteredListeners;
            retriever.applicationListenerBeans = filteredListenerBeans;
        }
    }
    return allListeners;
}
```
