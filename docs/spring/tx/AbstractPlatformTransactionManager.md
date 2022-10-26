# AbstractPlatformTransactionManager

提供事务管理器的基本抽象

具体实现类比如 `DataSourceTransactionManager`（基于数据源的事务管理器）

## getTransaction

```java
 @Override
 public final TransactionStatus getTransaction(@Nullable TransactionDefinition definition)
   throws TransactionException {

  // Use defaults if no transaction definition given.
  // 事务属性对象如果事务信息没有 就使用 StaticTransactionDefinition.INSTANCE
  TransactionDefinition def = (definition != null ? definition : TransactionDefinition.withDefaults());
  // 获取事务对象 依托于子类去实现 不同类型的事务对象不一样所以是Object类型
  Object transaction = doGetTransaction();
  boolean debugEnabled = logger.isDebugEnabled();
  // isExistingTransaction，默认返回false，同样被具体的事务管理器子类重写
  // DataSourceTransactionManager的方法将会判断上面获取的DataSourceTransactionObject内部的数据库连接connectionHolder属性是否不null
  if (isExistingTransaction(transaction)) {
   // Existing transaction found -> check propagation behavior to find out how to behave.
   // 如果已经存在事务，那么将检查传播行为并进行不同的处理，随后返回
   return handleExistingTransaction(def, transaction, debugEnabled);
  }

  // Check definition settings for new transaction.
  // 执行到这说明还未开启事务
  if (def.getTimeout() < TransactionDefinition.TIMEOUT_DEFAULT) {
   throw new InvalidTimeoutException("Invalid transaction timeout", def.getTimeout());
  }
 
  // No existing transaction found -> check propagation behavior to find out how to proceed.
  // PROPAGATION_MANDATORY：支持当前事务，如果当前没有事务，就抛出异常
  // 当前并未开启事务，所以抛出异常
  if (def.getPropagationBehavior() == TransactionDefinition.PROPAGATION_MANDATORY) {
   throw new IllegalTransactionStateException(
     "No existing transaction found for transaction marked with propagation 'mandatory'");
  }
  else if (def.getPropagationBehavior() == TransactionDefinition.PROPAGATION_REQUIRED ||
    def.getPropagationBehavior() == TransactionDefinition.PROPAGATION_REQUIRES_NEW ||
    def.getPropagationBehavior() == TransactionDefinition.PROPAGATION_NESTED) {
   // 因为当前线程执行到这，还并未开启事务，所以挂起null   
   SuspendedResourcesHolder suspendedResources = suspend(null);
   if (debugEnabled) {
    logger.debug("Creating new transaction with name [" + def.getName() + "]: " + def);
   }
   try {
    return startTransaction(def, transaction, debugEnabled, suspendedResources);
   }
   catch (RuntimeException | Error ex) {
    resume(null, suspendedResources);
    throw ex;
   }
  }
  else {
   // Create "empty" transaction: no actual transaction, but potentially synchronization.
   // PROPAGATION_SUPPORTS  PROPAGATION_NOT_SUPPORTED  PROPAGATION_NEVER
   // 这三种都不需要以事务运行
   if (def.getIsolationLevel() != TransactionDefinition.ISOLATION_DEFAULT && logger.isWarnEnabled()) {
    logger.warn("Custom isolation level specified but no actual transaction initiated; " +
      "isolation level will effectively be ignored: " + def);
   }
   // 是否是全新开启的事务同步机制
   boolean newSynchronization = (getTransactionSynchronization() == SYNCHRONIZATION_ALWAYS);
   // 准备事务状态
   return prepareTransactionStatus(def, null, true, newSynchronization, debugEnabled, null);
  }
 }
```

## prepareTransactionStatus

生成TransactionStatus对象

:::tip
第一个参数： 事务注解信息
第二个参数： 事务对象
第三个参数： 是否新建事务
第四个参数： 是否开启事务同步器
第五个参数： 是否debug（打印日志）
第六个参数： 表示挂起事务资源
:::

```java
 protected final DefaultTransactionStatus prepareTransactionStatus(
   TransactionDefinition definition, @Nullable Object transaction, boolean newTransaction,
   boolean newSynchronization, boolean debug, @Nullable Object suspendedResources) {

  DefaultTransactionStatus status = newTransactionStatus(
    definition, transaction, newTransaction, newSynchronization, debug, suspendedResources);
  prepareSynchronization(status, definition);
  return status;
 }
```

## prepareSynchronization

```java
 protected void prepareSynchronization(DefaultTransactionStatus status, TransactionDefinition definition) {
  // 开启新的事务同步
  if (status.isNewSynchronization()) {
   // 赋值
   TransactionSynchronizationManager.setActualTransactionActive(status.hasTransaction());
   TransactionSynchronizationManager.setCurrentTransactionIsolationLevel(
     definition.getIsolationLevel() != TransactionDefinition.ISOLATION_DEFAULT ?
       definition.getIsolationLevel() : null);
   TransactionSynchronizationManager.setCurrentTransactionReadOnly(definition.isReadOnly());
   TransactionSynchronizationManager.setCurrentTransactionName(definition.getName());
   // 初始化
   TransactionSynchronizationManager.initSynchronization();
  }
 }
```
