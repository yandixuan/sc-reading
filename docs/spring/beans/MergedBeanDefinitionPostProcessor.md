# MergedBeanDefinitionPostProcessor

```java
public interface MergedBeanDefinitionPostProcessor extends BeanPostProcessor {

 /**
  * Post-process the given merged bean definition for the specified bean.
  * @param beanDefinition the merged bean definition for the bean
  * @param beanType the actual type of the managed bean instance
  * @param beanName the name of the bean
  * @see AbstractAutowireCapableBeanFactory#applyMergedBeanDefinitionPostProcessors
  */
 // 调用属性合并后置处理器, 进行属性合并
 // 这里会进行 一些注解 的扫描
 // CommonAnnotationBeanPostProcessor -> @PostConstruct @PreDestroy @Resource
 // AutowiredAnnotationBeanPostProcessor -> @Autowired @Value  
 void postProcessMergedBeanDefinition(RootBeanDefinition beanDefinition, Class<?> beanType, String beanName);

 /**
  * A notification that the bean definition for the specified name has been reset,
  * and that this post-processor should clear any metadata for the affected bean.
  * <p>The default implementation is empty.
  * @param beanName the name of the bean
  * @since 5.1
  * @see DefaultListableBeanFactory#resetBeanDefinition
  */
 // 容器删除bean的时候 进行调用 
 default void resetBeanDefinition(String beanName) {
 }

}
```
