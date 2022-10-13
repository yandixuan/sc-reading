# InstantiationAwareBeanPostProcessor

```java
public interface InstantiationAwareBeanPostProcessor extends BeanPostProcessor {

 /**
  * Apply this BeanPostProcessor <i>before the target bean gets instantiated</i>.
  * The returned bean object may be a proxy to use instead of the target bean,
  * effectively suppressing default instantiation of the target bean.
  * <p>If a non-null object is returned by this method, the bean creation process
  * will be short-circuited. The only further processing applied is the
  * {@link #postProcessAfterInitialization} callback from the configured
  * {@link BeanPostProcessor BeanPostProcessors}.
  * <p>This callback will be applied to bean definitions with their bean class,
  * as well as to factory-method definitions in which case the returned bean type
  * will be passed in here.
  * <p>Post-processors may implement the extended
  * {@link SmartInstantiationAwareBeanPostProcessor} interface in order
  * to predict the type of the bean object that they are going to return here.
  * <p>The default implementation returns {@code null}.
  * @param beanClass the class of the bean to be instantiated
  * @param beanName the name of the bean
  * @return the bean object to expose instead of a default instance of the target bean,
  * or {@code null} to proceed with default instantiation
  * @throws org.springframework.beans.BeansException in case of errors
  * @see #postProcessAfterInstantiation
  * @see org.springframework.beans.factory.support.AbstractBeanDefinition#getBeanClass()
  * @see org.springframework.beans.factory.support.AbstractBeanDefinition#getFactoryMethodName()
  */

  // 在Bean实例化前调用该方法，返回值可以为代理后的Bean，以此代替Bean默认的实例化过程。返回值不为null时，后续只会调用BeanPostProcessor的 
  // postProcessAfterInitialization方法，而不会调用别的后续后置处理方法（如postProcessAfterInitialization、 
  // postProcessBeforeInstantiation等方法）；返回值也可以为null，这时候Bean将按默认方式初始化。
 @Nullable
 default Object postProcessBeforeInstantiation(Class<?> beanClass, String beanName) throws BeansException {
  return null;
 }

 /**
  * Perform operations after the bean has been instantiated, via a constructor or factory method,
  * but before Spring property population (from explicit properties or autowiring) occurs.
  * <p>This is the ideal callback for performing custom field injection on the given bean
  * instance, right before Spring's autowiring kicks in.
  * <p>The default implementation returns {@code true}.
  * @param bean the bean instance created, with properties not having been set yet
  * @param beanName the name of the bean
  * @return {@code true} if properties should be set on the bean; {@code false}
  * if property population should be skipped. Normal implementations should return {@code true}.
  * Returning {@code false} will also prevent any subsequent InstantiationAwareBeanPostProcessor
  * instances being invoked on this bean instance.
  * @throws org.springframework.beans.BeansException in case of errors
  * @see #postProcessBeforeInstantiation
  */
 // 当Bean通过构造器或者工厂方法被实例化后，当属性还未被赋值前，该方法会被调用，一般用于自定义属性赋值。方法返回值为布尔类型，返回true时，表示
 // Bean属性需要被赋值；返回false表示跳过Bean属性赋值，并且InstantiationAwareBeanPostProcessor的postProcessProperties方法不会被调用
 default boolean postProcessAfterInstantiation(Object bean, String beanName) throws BeansException {
  return true;
 }

 /**
  * Post-process the given property values before the factory applies them
  * to the given bean, without any need for property descriptors.
  * <p>Implementations should return {@code null} (the default) if they provide a custom
  * {@link #postProcessPropertyValues} implementation, and {@code pvs} otherwise.
  * In a future version of this interface (with {@link #postProcessPropertyValues} removed),
  * the default implementation will return the given {@code pvs} as-is directly.
  * @param pvs the property values that the factory is about to apply (never {@code null})
  * @param bean the bean instance created, but whose properties have not yet been set
  * @param beanName the name of the bean
  * @return the actual property values to apply to the given bean (can be the passed-in
  * PropertyValues instance), or {@code null} which proceeds with the existing properties
  * but specifically continues with a call to {@link #postProcessPropertyValues}
  * (requiring initialized {@code PropertyDescriptor}s for the current bean class)
  * @throws org.springframework.beans.BeansException in case of errors
  * @since 5.1
  * @see #postProcessPropertyValues
  */
 // 运行的时机,主要是在填充属性的时候 即 populateBean
 // 主要是在填充属性之前再进行相关的操作
 @Nullable
 default PropertyValues postProcessProperties(PropertyValues pvs, Object bean, String beanName)
   throws BeansException {

  return null;
 }

 /**
  * Post-process the given property values before the factory applies them
  * to the given bean. Allows for checking whether all dependencies have been
  * satisfied, for example based on a "Required" annotation on bean property setters.
  * <p>Also allows for replacing the property values to apply, typically through
  * creating a new MutablePropertyValues instance based on the original PropertyValues,
  * adding or removing specific values.
  * <p>The default implementation returns the given {@code pvs} as-is.
  * @param pvs the property values that the factory is about to apply (never {@code null})
  * @param pds the relevant property descriptors for the target bean (with ignored
  * dependency types - which the factory handles specifically - already filtered out)
  * @param bean the bean instance created, but whose properties have not yet been set
  * @param beanName the name of the bean
  * @return the actual property values to apply to the given bean (can be the passed-in
  * PropertyValues instance), or {@code null} to skip property population
  * @throws org.springframework.beans.BeansException in case of errors
  * @see #postProcessProperties
  * @see org.springframework.beans.MutablePropertyValues
  * @deprecated as of 5.1, in favor of {@link #postProcessProperties(PropertyValues, Object, String)}
  */
 // 对属性值进行修改，如果postProcessAfterInstantiation方法返回false，该方法可能不会被调用。可以在该方法内对属性值进行修改
 // 5.1 之后过时了 推荐使用 postProcessProperties 方法
 @Deprecated
 @Nullable
 default PropertyValues postProcessPropertyValues(
   PropertyValues pvs, PropertyDescriptor[] pds, Object bean, String beanName) throws BeansException {

  return pvs;
}

}

```
