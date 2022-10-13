# AbstractBeanDefinition

这里对BeanDefinition的属性做一个介绍

[参考](https://www.jianshu.com/p/20cf0116c5c0)

## 属性

```java
 // 默认的SCOPE，默认是单例 
 public static final String SCOPE_DEFAULT = "";

 /**
  * Constant that indicates no external autowiring at all.
  * @see #setAutowireMode
  */
 // 没有显式配置上装配的方式
 public static final int AUTOWIRE_NO = AutowireCapableBeanFactory.AUTOWIRE_NO;

 /**
  * Constant that indicates autowiring bean properties by name.
  * @see #setAutowireMode
  */
 // 根据Bean的名字进行自动装配，即autowired属性的值为byName 
 public static final int AUTOWIRE_BY_NAME = AutowireCapableBeanFactory.AUTOWIRE_BY_NAME;

 /**
  * Constant that indicates autowiring bean properties by type.
  * @see #setAutowireMode
  */
 // 根据Bean的类型进行自动装配，即autowired属性的值为byType 
 public static final int AUTOWIRE_BY_TYPE = AutowireCapableBeanFactory.AUTOWIRE_BY_TYPE;

 /**
  * Constant that indicates autowiring a constructor.
  * @see #setAutowireMode
  */
 // 自动装配构造函数的形参，完成对应属性的自动装配，即autowired属性的值为byConstructor 
 // 在构造函数中进行装配
 public static final int AUTOWIRE_CONSTRUCTOR = AutowireCapableBeanFactory.AUTOWIRE_CONSTRUCTOR;

 /**
  * Constant that indicates determining an appropriate autowire strategy
  * through introspection of the bean class.
  * @see #setAutowireMode
  * @deprecated as of Spring 3.0: If you are using mixed autowiring strategies,
  * use annotation-based autowiring for clearer demarcation of autowiring needs.
  */
 // 通过内省bean类确定适当的自动装配策略,Spring已经将其标注为
 @Deprecated
 public static final int AUTOWIRE_AUTODETECT = AutowireCapableBeanFactory.AUTOWIRE_AUTODETECT;

 /**
  * Constant that indicates no dependency check at all.
  * @see #setDependencyCheck
  */
 // 不进行依赖检查 
 public static final int DEPENDENCY_CHECK_NONE = 0;

 /**
  * Constant that indicates dependency checking for object references.
  * @see #setDependencyCheck
  */
 // 如果依赖类型为对象引用，则需要检查 
 public static final int DEPENDENCY_CHECK_OBJECTS = 1;

 /**
  * Constant that indicates dependency checking for "simple" properties.
  * @see #setDependencyCheck
  * @see org.springframework.beans.BeanUtils#isSimpleProperty
  */
 // 对简单属性的依赖进行检查 
 public static final int DEPENDENCY_CHECK_SIMPLE = 2;

 /**
  * Constant that indicates dependency checking for all properties
  * (object references as well as "simple" properties).
  * @see #setDependencyCheck
  */
 // 对所有属性的依赖进行检查 
 public static final int DEPENDENCY_CHECK_ALL = 3;

 /**
  * Constant that indicates the container should attempt to infer the
  * {@link #setDestroyMethodName destroy method name} for a bean as opposed to
  * explicit specification of a method name. The value {@value} is specifically
  * designed to include characters otherwise illegal in a method name, ensuring
  * no possibility of collisions with legitimately named methods having the same
  * name.
  * <p>Currently, the method names detected during destroy method inference
  * are "close" and "shutdown", if present on the specific bean class.
  */
 // 若Bean未指定销毁方法，容器应该尝试推断Bean的销毁方法的名字，目前来说，推断的销毁方法的名字一般为close或是shutdown
 //   （即未指定Bean的销毁方法，但是内部定义了名为close或是shutdown的方法，则容器推断其为销毁方法） 
 public static final String INFER_METHOD = "(inferred)";

 /**
  * bean
  */
 @Nullable
 private volatile Object beanClass;
 /**
  * bean的作用范围，对应bean属性scope
  */
 @Nullable
 private String scope = SCOPE_DEFAULT;
 /**
  * 是否是抽象，对应bean属性abstract
  */
 private boolean abstractFlag = false;
 /**
  * 是否延迟加载，对应bean属性lazy-init
  */
 @Nullable
 private Boolean lazyInit;
 /**
  * 自动注入模式，对应bean属性autowire
  */
 private int autowireMode = AUTOWIRE_NO;
 /**
  * 依赖检查，Spring 3.0后弃用这个属性
  */
 private int dependencyCheck = DEPENDENCY_CHECK_NONE;
 /**
  * 用来表示一个bean的实例化依靠另一个bean先实例化，对应bean属性depend-on
  */
 @Nullable
 private String[] dependsOn;
 /**
  * autowire-candidate属性设置为false，这样容器在查找自动装配对象时，
  * 将不考虑该bean，即它不会被考虑作为其他bean自动装配的候选者，
  * 但是该bean本身还是可以使用自动装配来注入其他bean的
  */
 private boolean autowireCandidate = true;
 /**
  * 自动装配时出现多个bean候选者时，将作为首选者，对应bean属性primary
  */
 private boolean primary = false;
 /**
  * 用于记录Qualifier，对应子元素qualifier
  */
 private final Map<String, AutowireCandidateQualifier> qualifiers = new LinkedHashMap<>();

 @Nullable
 private Supplier<?> instanceSupplier;
 /**
  * 允许访问非公开的构造器和方法，程序设置
  */
 private boolean nonPublicAccessAllowed = true;
 /**
  * 是否以一种宽松的模式解析构造函数，默认为true，
  * 如果为false，则在以下情况
  * interface ITest{}
  * class ITestImpl implements ITest{};
  * class Main {
  *     Main(ITest i) {}
  *     Main(ITestImpl i) {}
  * }
  * 抛出异常，因为Spring无法准确定位哪个构造函数程序设置
  */
 private boolean lenientConstructorResolution = true;
 /**
  * 对应bean属性factory-bean，用法：
  * <bean id = "instanceFactoryBean" class = "example.chapter3.InstanceFactoryBean" />
  * <bean id = "currentTime" factory-bean = "instanceFactoryBean" factory-method = "createTime" />
  */
 @Nullable
 private String factoryBeanName;
 /**
  * 对应bean属性factory-method
  */
 @Nullable
 private String factoryMethodName;
 /**
  * 记录构造函数注入属性，对应bean属性constructor-arg
  */
 @Nullable
 private ConstructorArgumentValues constructorArgumentValues;
 /**
  * Bean属性的名称以及对应的值，这里不会存放构造函数相关的参数值，只会存放通过setter注入的依赖
  */
 @Nullable
 private MutablePropertyValues propertyValues;
 /**
  * 方法重写的持有者，记录lookup-method、replaced-method元素
  */
 private MethodOverrides methodOverrides = new MethodOverrides();
 /**
  * 初始化方法，对应bean属性init-method
  */
 @Nullable
 private String initMethodName;
 /**
  * 销毁方法，对应bean属性destroy-method
  */
 @Nullable
 private String destroyMethodName;
 /**
  * 是否执行init-method，程序设置
  */
 private boolean enforceInitMethod = true;
 /**
  * 是否执行destroy-method，程序设置
  */
 private boolean enforceDestroyMethod = true;
 /**
  * 是否是用户定义的而不是应用程序本身定义的，创建AOP时候为true，程序设置
  */
 private boolean synthetic = false;

 /**
  * 定义这个bean的应用，APPLICATION：用户，INFRASTRUCTURE：完全内部使用，与用户无关，
  * SUPPORT：某些复杂配置的一部分
  * 程序设置
  */
 private int role = BeanDefinition.ROLE_APPLICATION;
 /**
  * bean的描述信息
  */
 @Nullable
 private String description;
 /**
  * 这个bean定义的资源
  */
 @Nullable
 private Resource resource;

```
