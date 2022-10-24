# BeanFactoryAspectJAdvisorsBuilder

:::tip
Spring AOP内部工具类,从BeanFactory中获取所有使用了@AspectJ注解的bean，最终用于自动代理机制(auto-proxying)
:::

## buildAspectJAdvisors

主要从bean中加载aspect，生成advisor

通过[`ReflectiveAspectJAdvisorFactory`](./ReflectiveAspectJAdvisorFactory#getadvisors)获取bean的注解信息，生成advisor

```java
 public List<Advisor> buildAspectJAdvisors() {
  List<String> aspectNames = this.aspectBeanNames;
  // 如果为空表示尚未缓存，进行缓存解析。这里用了DLC 方式来进行判断
  if (aspectNames == null) {
   synchronized (this) {
    aspectNames = this.aspectBeanNames;
    if (aspectNames == null) {
     List<Advisor> advisors = new ArrayList<>();
     aspectNames = new ArrayList<>();
     // 获取所有类型为Object的bean的名称，基本上也就是说所有的bean的名称了
     // includeNonSingletons:true=>包含单例，非单例bean
     // allowEagerInit:false=>不要初始化lazy-init singletons和FactoryBean创建的bean
     String[] beanNames = BeanFactoryUtils.beanNamesForTypeIncludingAncestors(
       this.beanFactory, Object.class, true, false);
     // 遍历所有的beanName  
     for (String beanName : beanNames) {
      // 判断是否是合法的bean
      // 这里交给 AnnotationAwareAspectJAutoProxyCreator 去判断了 加了个 includePatterns的正则判断
      if (!isEligibleBean(beanName)) {
       continue;
      }
      // We must be careful not to instantiate beans eagerly as in this case they
      // would be cached by the Spring container but would not have been weaved.
      // 通过beanName判断类型
      Class<?> beanType = this.beanFactory.getType(beanName, false);
      if (beanType == null) {
       continue;
      }
      // 如果bean 被 @AspectJ 注解修饰 且不是Ajc 编译, 则进一步处理
      if (this.advisorFactory.isAspect(beanType)) {
       // 将beanName存到缓存中 
       aspectNames.add(beanName);
       // 封装成AspectMetadata 
       AspectMetadata amd = new AspectMetadata(beanType, beanName);
       // aspect spring 只支出 SINGLETON、PERTHIS、PERTARGET、PERTYPEWITHIN模式。默认为SINGLETON
       // https://blog.csdn.net/u011479200/article/details/94162745
       if (amd.getAjType().getPerClause().getKind() == PerClauseKind.SINGLETON) {
        MetadataAwareAspectInstanceFactory factory =
          new BeanFactoryAspectInstanceFactory(this.beanFactory, beanName);
        // 解析标记AspectJ注解中的增强方法，也就是被 @Before、@Around 等注解修饰的方法，并将其封装成 Advisor
        List<Advisor> classAdvisors = this.advisorFactory.getAdvisors(factory);
        // 进行缓存
        if (this.beanFactory.isSingleton(beanName)) {
         this.advisorsCache.put(beanName, classAdvisors);
        }
        else {
         this.aspectFactoryCache.put(beanName, factory);
        }
        advisors.addAll(classAdvisors);
       }
       else {
        // Per target or per this.
        // 如果当前Bean是单例，但是 Aspect 不是单例则抛出异常
        if (this.beanFactory.isSingleton(beanName)) {
         throw new IllegalArgumentException("Bean with name '" + beanName +
           "' is a singleton, but aspect instantiation model is not singleton");
        }
        MetadataAwareAspectInstanceFactory factory =
          new PrototypeAspectInstanceFactory(this.beanFactory, beanName);
        this.aspectFactoryCache.put(beanName, factory);
        advisors.addAll(this.advisorFactory.getAdvisors(factory));
       }
      }
     }
     this.aspectBeanNames = aspectNames;
     return advisors;
    }
   }
  }

  if (aspectNames.isEmpty()) {
   return Collections.emptyList();
  }
  List<Advisor> advisors = new ArrayList<>();
  for (String aspectName : aspectNames) {
   List<Advisor> cachedAdvisors = this.advisorsCache.get(aspectName);
   if (cachedAdvisors != null) {
    advisors.addAll(cachedAdvisors);
   }
   else {
    // 走到这说明是多例模式
    MetadataAwareAspectInstanceFactory factory = this.aspectFactoryCache.get(aspectName);
    // 从beanFactory
    advisors.addAll(this.advisorFactory.getAdvisors(factory));
   }
  }
  return advisors;
 }
```
