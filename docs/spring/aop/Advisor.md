# Advisor

:::tip
advisor解释为通知，所以拥有获取通知的能力（advice）
:::

```java
public interface Advisor {

 /**
  * Common placeholder for an empty {@code Advice} to be returned from
  * {@link #getAdvice()} if no proper advice has been configured (yet).
  * @since 5.0
  */
 Advice EMPTY_ADVICE = new Advice() {};


 /**
  * Return the advice part of this aspect. An advice may be an
  * interceptor, a before advice, a throws advice, etc.
  * @return the advice that should apply if the pointcut matches
  * @see org.aopalliance.intercept.MethodInterceptor
  * @see BeforeAdvice
  * @see ThrowsAdvice
  * @see AfterReturningAdvice
  */
 Advice getAdvice();

 /**
  * Return whether this advice is associated with a particular instance
  * (for example, creating a mixin) or shared with all instances of
  * the advised class obtained from the same Spring bean factory.
  * <p><b>Note that this method is not currently used by the framework.</b>
  * Typical Advisor implementations always return {@code true}.
  * Use singleton/prototype bean definitions or appropriate programmatic
  * proxy creation to ensure that Advisors have the correct lifecycle model.
  * @return whether this advice is associated with a particular target instance
  */
 boolean isPerInstance();

}

```
