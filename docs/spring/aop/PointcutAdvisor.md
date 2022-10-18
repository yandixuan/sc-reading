# PointcutAdvisor

::: tip
在PointcutAdvisor中Advice和PointCut是一对一的

组合了通知和切点那么就能很明确的知道那个方法需要增强什么逻辑
:::

```java
public interface PointcutAdvisor extends Advisor {

 /**
  * Get the Pointcut that drives this advisor.
  */
 // 获取切点 
 Pointcut getPointcut();

}


```
