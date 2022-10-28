# AbstractPlatformTransactionManager

提供事务管理器的基本抽象

具体实现类比如 `DataSourceTransactionManager`（基于数据源的事务管理器）

## getTransaction

在获取事务状态对象的方法里会涉及到开启事务`doBegin`，挂起事务`doSuspend`，恢复事务`doResume`的调用，以上方法均有子类实现

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
   // 挂起当前事务，这里传null是因为当前没有事务
   // 仍然调用suspend的意义在于触发 TransactionSynchronization#suspend() 回调  
   SuspendedResourcesHolder suspendedResources = suspend(null);
   if (debugEnabled) {
    logger.debug("Creating new transaction with name [" + def.getName() + "]: " + def);
   }
   try {
    return startTransaction(def, transaction, debugEnabled, suspendedResources);
   }
   catch (RuntimeException | Error ex) {
    // 开启事务异常
    // 唤醒此前挂起的事务和资源
    // 当前事务开启失败，所以当前的事务对象为null
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

## suspend

挂起事务

```java
 /**
  * Suspend the given transaction. Suspends transaction synchronization first,
  * then delegates to the {@code doSuspend} template method.
  * @param transaction the current transaction object
  * (or {@code null} to just suspend active synchronizations, if any)
  * @return an object that holds suspended resources
  * (or {@code null} if neither transaction nor synchronization active)
  * @see #doSuspend
  * @see #resume
  */
 @Nullable
 protected final SuspendedResourcesHolder suspend(@Nullable Object transaction) throws TransactionException {
  // 获取当前线程注册的事务同步
  if (TransactionSynchronizationManager.isSynchronizationActive()) {
   // 回调事务同步的suspend方法 
   // 同时清空当前线程的事务同步
   List<TransactionSynchronization> suspendedSynchronizations = doSuspendSynchronization();
   try {
    Object suspendedResources = null;
    // 如果当前事务对象不为空
    if (transaction != null) {
     // 执行挂起
     suspendedResources = doSuspend(transaction);
    }
    // 获取事务名称
    String name = TransactionSynchronizationManager.getCurrentTransactionName();
    // 置空当前事务名称
    TransactionSynchronizationManager.setCurrentTransactionName(null);
    // 下面以此类推
    boolean readOnly = TransactionSynchronizationManager.isCurrentTransactionReadOnly();
    TransactionSynchronizationManager.setCurrentTransactionReadOnly(false);
    Integer isolationLevel = TransactionSynchronizationManager.getCurrentTransactionIsolationLevel();
    TransactionSynchronizationManager.setCurrentTransactionIsolationLevel(null);
    boolean wasActive = TransactionSynchronizationManager.isActualTransactionActive();
    TransactionSynchronizationManager.setActualTransactionActive(false);
    // 将要悬挂的事务 封装进 SuspendedResourcesHolder
    return new SuspendedResourcesHolder(
      suspendedResources, suspendedSynchronizations, name, readOnly, isolationLevel, wasActive);
   }
   catch (RuntimeException | Error ex) {
    // doSuspend failed - original transaction is still active...
    // doSuspend报异常
    doResumeSynchronization(suspendedSynchronizations);
    throw ex;
   }
  }
  else if (transaction != null) {
   // Transaction active but no synchronization active.
   // 事务不为空则悬挂当前事务
   Object suspendedResources = doSuspend(transaction);
   // 封装进SuspendedResourcesHolder
   return new SuspendedResourcesHolder(suspendedResources);
  }
  else {
   // 事务对象为空直接返回空
   // Neither transaction nor synchronization active.
   return null;
  }
 }
```

## doSuspendSynchronization

执行当前线程的事务同步的suspend回调

将当前线程的事务同步保存进临时对象清空再返回

```java
 /**
  * Suspend all current synchronizations and deactivate transaction
  * synchronization for the current thread.
  * @return the List of suspended TransactionSynchronization objects
  */
 private List<TransactionSynchronization> doSuspendSynchronization() {
  List<TransactionSynchronization> suspendedSynchronizations =
    TransactionSynchronizationManager.getSynchronizations();
  for (TransactionSynchronization synchronization : suspendedSynchronizations) {
   synchronization.suspend();
  }
  TransactionSynchronizationManager.clearSynchronization();
  return suspendedSynchronizations;
 }
```

## doResumeSynchronization

置空事务同步列表

将挂起之前的事务同步列表执行resume再注册进去

```java
 /**
  * Reactivate transaction synchronization for the current thread
  * and resume all given synchronizations.
  * @param suspendedSynchronizations a List of TransactionSynchronization objects
  */
 private void doResumeSynchronization(List<TransactionSynchronization> suspendedSynchronizations) {
  // 
  TransactionSynchronizationManager.initSynchronization();
  for (TransactionSynchronization synchronization : suspendedSynchronizations) {
   synchronization.resume();
   TransactionSynchronizationManager.registerSynchronization(synchronization);
  }
 }
```

## startTransaction

```java
 /**
  * Start a new transaction.
  */
 private TransactionStatus startTransaction(TransactionDefinition definition, Object transaction,
   boolean debugEnabled, @Nullable SuspendedResourcesHolder suspendedResources) {
  // 是否需要激活 transaction synchronization  
  boolean newSynchronization = (getTransactionSynchronization() != SYNCHRONIZATION_NEVER);
  // 创建一个代表事务状态的对象
  DefaultTransactionStatus status = newTransactionStatus(
    definition, transaction, true, newSynchronization, debugEnabled, suspendedResources);
  // 事务启动 由子类实现  
  doBegin(transaction, definition);
  // 准备事务同步器
  prepareSynchronization(status, definition);
  return status;
 }
```

## resume

```java
 /**
  * Resume the given transaction. Delegates to the {@code doResume}
  * template method first, then resuming transaction synchronization.
  * @param transaction the current transaction object
  * @param resourcesHolder the object that holds suspended resources,
  * as returned by {@code suspend} (or {@code null} to just
  * resume synchronizations, if any)
  * @see #doResume
  * @see #suspend
  */
 protected final void resume(@Nullable Object transaction, @Nullable SuspendedResourcesHolder resourcesHolder)
   throws TransactionException {
  // 恢复挂起的事务
  if (resourcesHolder != null) {
   Object suspendedResources = resourcesHolder.suspendedResources;
   if (suspendedResources != null) {
    // 恢复旧的事务由子类去实现
    doResume(transaction, suspendedResources);
   }
   // 恢复挂起事务的事务同步器
   List<TransactionSynchronization> suspendedSynchronizations = resourcesHolder.suspendedSynchronizations;
   if (suspendedSynchronizations != null) {
    TransactionSynchronizationManager.setActualTransactionActive(resourcesHolder.wasActive);
    TransactionSynchronizationManager.setCurrentTransactionIsolationLevel(resourcesHolder.isolationLevel);
    TransactionSynchronizationManager.setCurrentTransactionReadOnly(resourcesHolder.readOnly);
    TransactionSynchronizationManager.setCurrentTransactionName(resourcesHolder.name);
    doResumeSynchronization(suspendedSynchronizations);
   }
  }
 }
```

## handleExistingTransaction

如果当前已存在事务，则handleExistingTransaction处理已存在事务

```java
 /**
  * Create a TransactionStatus for an existing transaction.
  */
 private TransactionStatus handleExistingTransaction(
   TransactionDefinition definition, Object transaction, boolean debugEnabled)
   throws TransactionException {
  
  // 如果当前配置的传播行为是PROPAGATION_NEVER，该行为的特点是：当前方法一定以非事务的方式运行，并且如果当前存在事务，则直接抛出异常，所以这里由于存在外部事务，那么直接抛出异常
  if (definition.getPropagationBehavior() == TransactionDefinition.PROPAGATION_NEVER) {
   throw new IllegalTransactionStateException(
     "Existing transaction found for transaction marked with propagation 'never'");
  }
  // 如果当前配置的传播行为是PROPAGATION_NOT_SUPPORTED，该行为的特点是：当前方法一定以非事务的方式运行，如果当前存在事务，则把当前事务挂起，直到当前方法执行完毕，才恢复外层事务
  if (definition.getPropagationBehavior() == TransactionDefinition.PROPAGATION_NOT_SUPPORTED) {
   if (debugEnabled) {
    logger.debug("Suspending current transaction");
   }
   // 挂起当前事务
   Object suspendedResources = suspend(transaction);
   boolean newSynchronization = (getTransactionSynchronization() == SYNCHRONIZATION_ALWAYS);
   // 返回一个新的事务对象
   // 不会调用doBegin方法，不会真正的开启事物
   return prepareTransactionStatus(
     definition, null, false, newSynchronization, debugEnabled, suspendedResources);
  }
  // 如果当前配置的传播行为是PROPAGATION_REQUIRES_NEW，该行为的特点是：当前方法开启一个新事物独立运行，从不参与外部的现有事务。则当内部事务开始执行时，外部事务（如果存在）将被挂起，内务事务结束时，外部事务将继续执行
  if (definition.getPropagationBehavior() == TransactionDefinition.PROPAGATION_REQUIRES_NEW) {
   if (debugEnabled) {
    logger.debug("Suspending current transaction, creating new transaction with name [" +
      definition.getName() + "]");
   }
   SuspendedResourcesHolder suspendedResources = suspend(transaction);
   try {
    // 所以这里会开启一个新事务
    return startTransaction(definition, transaction, debugEnabled, suspendedResources);
   }
   catch (RuntimeException | Error beginEx) {
    // 在开启事务失败后恢复此前的事务
    resumeAfterBeginException(transaction, suspendedResources, beginEx);
    throw beginEx;
   }
  }
  // 如果当前配置的传播行为是PROPAGATION_NESTED，该行为的特点是：如果当前存在事务，则创建一个新“事务”作为当前事务的嵌套事务来运行；如果当前没有事务，则等价于PROPAGATION_REQUIRED，即会新建一个事务运行。
  if (definition.getPropagationBehavior() == TransactionDefinition.PROPAGATION_NESTED) {
   // 判断是否允许PROPAGATION_NESTED行为，默认不允许，但是DataSourceTransactionManager重写为为允许
   if (!isNestedTransactionAllowed()) {
    throw new NestedTransactionNotSupportedException(
      "Transaction manager does not allow nested transactions by default - " +
      "specify 'nestedTransactionAllowed' property with value 'true'");
   }
   if (debugEnabled) {
    logger.debug("Creating nested transaction with name [" + definition.getName() + "]");
   }
   // 返回是否对嵌套事务使用保存点，默认true，JtaTransactionManager设置为false
   // PROPAGATION_NESTED就是通过Savepoint保存点来实现的
   if (useSavepointForNestedTransaction()) {
    // Create savepoint within existing Spring-managed transaction,
    // through the SavepointManager API implemented by TransactionStatus.
    // Usually uses JDBC 3.0 savepoints. Never activates Spring synchronization.
    // 并没有挂起当前事务，创建TransactionStatus，transaction参数就是当前事务
    DefaultTransactionStatus status =
      prepareTransactionStatus(definition, transaction, false, false, debugEnabled, null);
    // DefaultTransactionStatus通过transaction事务创建savepoint，并设置到DefaultTransactionStatus对象的属性上
    status.createAndHoldSavepoint();
    return status;
   }
   else {
    // Nested transaction through nested begin and commit/rollback calls.
    // Usually only for JTA: Spring synchronization might get activated here
    // in case of a pre-existing JTA transaction.
    // 通过在事务中嵌套的begin和commit / rollback调用开启的嵌套事务。
    // 通常仅用于JTA：如果存在预先存在的JTA事务，则可以在此处激活Spring同步。
    return startTransaction(definition, transaction, debugEnabled, null);
   }
  }
  // 剩下的传播行为就是PROPAGATION_SUPPORTS或者PROPAGATION_REQUIRED。
  // Assumably PROPAGATION_SUPPORTS or PROPAGATION_REQUIRED.
  if (debugEnabled) {
   logger.debug("Participating in existing transaction");
  }
  // 是否在参与现有事务之前进行验证，默认false
  if (isValidateExistingTransaction()) {
   // 隔离级别需保持一致 
   if (definition.getIsolationLevel() != TransactionDefinition.ISOLATION_DEFAULT) {
    Integer currentIsolationLevel = TransactionSynchronizationManager.getCurrentTransactionIsolationLevel();
    if (currentIsolationLevel == null || currentIsolationLevel != definition.getIsolationLevel()) {
     Constants isoConstants = DefaultTransactionDefinition.constants;
     throw new IllegalTransactionStateException("Participating transaction with definition [" +
       definition + "] specifies isolation level which is incompatible with existing transaction: " +
       (currentIsolationLevel != null ?
         isoConstants.toCode(currentIsolationLevel, DefaultTransactionDefinition.PREFIX_ISOLATION) :
         "(unknown)"));
    }
   }
   if (!definition.isReadOnly()) {
    if (TransactionSynchronizationManager.isCurrentTransactionReadOnly()) {
     throw new IllegalTransactionStateException("Participating transaction with definition [" +
       definition + "] is not marked as read-only but existing transaction is");
    }
   }
  }
  boolean newSynchronization = (getTransactionSynchronization() != SYNCHRONIZATION_NEVER);
  // 剩下的2种传播规则则不需要开启事务了，所以第三个参数是false.
  // 也不需要挂起此前的事务
  return prepareTransactionStatus(definition, transaction, false, newSynchronization, debugEnabled, null);
 }
```

## resumeAfterBeginException

恢复此前事务，同时抛出异常

```java
 private void resumeAfterBeginException(
   Object transaction, @Nullable SuspendedResourcesHolder suspendedResources, Throwable beginEx) {

  try {
   resume(transaction, suspendedResources);
  }
  catch (RuntimeException | Error resumeEx) {
   String exMessage = "Inner transaction begin exception overridden by outer transaction resume exception";
   logger.error(exMessage, beginEx);
   throw resumeEx;
  }
 }
```

## commit

```java
 /**
  * This implementation of commit handles participating in existing
  * transactions and programmatic rollback requests.
  * Delegates to {@code isRollbackOnly}, {@code doCommit}
  * and {@code rollback}.
  * @see org.springframework.transaction.TransactionStatus#isRollbackOnly()
  * @see #doCommit
  * @see #rollback
  */
 @Override
 public final void commit(TransactionStatus status) throws TransactionException {
  if (status.isCompleted()) {
   // 事务状态如果已完成则抛出异常
   throw new IllegalTransactionStateException(
     "Transaction is already completed - do not call commit or rollback more than once per transaction");
  }

  DefaultTransactionStatus defStatus = (DefaultTransactionStatus) status;
  // 我们可以通过Transactionstatus的setRollbackOnly ()方法标记 事务回滚
  if (defStatus.isLocalRollbackOnly()) {
   if (defStatus.isDebug()) {
    logger.debug("Transactional code has requested rollback");
   }
   // 执行回滚
   // 然后退出
   processRollback(defStatus, false);
   return;
  }
  // shouldCommitOnGlobalRollbackOnly默认实现是false。这里是指如果发现事务被标记全局回滚并且在全局回滚标记情况下不应该提交事务的话，那么则进行回滚。
  // 进行判断是指读取DefaultTransactionStatus中EntityTransaction对象的
  if (!shouldCommitOnGlobalRollbackOnly() && defStatus.isGlobalRollbackOnly()) {
   if (defStatus.isDebug()) {
    logger.debug("Global transaction is marked as rollback-only but transactional code requested commit");
   }
   // 进行回滚并抛出异常
   processRollback(defStatus, true);
   return;
  }

  processCommit(defStatus);
 }
```

## processRollback

根据回滚进行设置，不涉及到实际的回滚动作

```java
 /**
  * Process an actual rollback.
  * The completed flag has already been checked.
  * @param status object representing the transaction
  * @throws TransactionException in case of rollback failure
  */
 private void processRollback(DefaultTransactionStatus status, boolean unexpected) {
  try {
   boolean unexpectedRollback = unexpected;

   try {
    // 触发事务同步列表中的回调
    triggerBeforeCompletion(status);
    // 如果持有安全点 NESTED情况
    if (status.hasSavepoint()) {
     if (status.isDebug()) {
      logger.debug("Rolling back transaction to savepoint");
     }
     // 内层事务回滚到安全点
     status.rollbackToHeldSavepoint();
    }
    // 新的事务
    else if (status.isNewTransaction()) {
     if (status.isDebug()) {
      logger.debug("Initiating transaction rollback");
     }
     // 子类实现具体的回滚逻辑
     doRollback(status);
    }
    else {
     // Participating in larger transaction
     // 作为嵌套的一个子事务参与到外层事务中
     // 首先得判定status是否存在事务对象
     // prepareTransactionStatus 创建的status的transaction可能为空
     if (status.hasTransaction()) {
      // 当前事务是否设置rollback 或者 回滚交由外层事务统一决定
      if (status.isLocalRollbackOnly() || isGlobalRollbackOnParticipationFailure()) {
       if (status.isDebug()) {
        logger.debug("Participating transaction failed - marking existing transaction as rollback-only");
       }
       // 执行DataSourceTransactionManager#doSetRollbackOnly
       // 事务对象打上回滚标记
       // 一个线程共享一个事务对象，但是每个事务的transactionStatus和txObject是不一样的
       // 将当前的连接对象即connectionHolder的rollbackOnly设置成true 即是全局回滚标志
       // 如果设置在transactionStatus是当前事务的
       // DataSourceTransactionManager的实现里是修改了connectionHolder中的rollbackOnly
       doSetRollbackOnly(status);
      }
      else {
       // 让事务自己觉得是否回滚 
       if (status.isDebug()) {
        logger.debug("Participating transaction failed - letting transaction originator decide on rollback");
       }
      }
     }
     else {
      logger.debug("Should roll back transaction but cannot - no transaction available");
     }
     // Unexpected rollback only matters here if we're asked to fail early
     if (!isFailEarlyOnGlobalRollbackOnly()) {
      unexpectedRollback = false;
     }
    }
   }
   catch (RuntimeException | Error ex) {
    // 遍历触发TransactionSynchronization 的afterCompletion  状态是STATUS_UNKNOWN
    triggerAfterCompletion(status, TransactionSynchronization.STATUS_UNKNOWN);
    throw ex;
   }
   // 遍历触发TransactionSynchronization 的afterCompletion  状态是STATUS_ROLLED_BACK 
   triggerAfterCompletion(status, TransactionSynchronization.STATUS_ROLLED_BACK);

   // Raise UnexpectedRollbackException if we had a global rollback-only marker
   if (unexpectedRollback) {
    throw new UnexpectedRollbackException(
      "Transaction rolled back because it has been marked as rollback-only");
   }
  }
  finally {
   // 完成后清理事务信息
   cleanupAfterCompletion(status);
  }
 }
```

### processCommit

```java
 /**
  * Process an actual commit.
  * Rollback-only flags have already been checked and applied.
  * @param status object representing the transaction
  * @throws TransactionException in case of commit failure
  */
 private void processCommit(DefaultTransactionStatus status) throws TransactionException {
  try {
   boolean beforeCompletionInvoked = false;

   try {
    boolean unexpectedRollback = false;
    prepareForCommit(status);
    // 遍历触发TransactionSynchronization 的beforeCommit
    triggerBeforeCommit(status);
    // 遍历触发TransactionSynchronization 的beforeCompletion
    triggerBeforeCompletion(status);
    beforeCompletionInvoked = true;
    // 如果事务设置了保存点,则需要释放所有的保存点
    if (status.hasSavepoint()) {
     if (status.isDebug()) {
      logger.debug("Releasing transaction savepoint");
     }
     // 全局回滚
     unexpectedRollback = status.isGlobalRollbackOnly();
     status.releaseHeldSavepoint();
    }
    // 新的事务
    else if (status.isNewTransaction()) {
     if (status.isDebug()) {
      logger.debug("Initiating transaction commit");
     }
     unexpectedRollback = status.isGlobalRollbackOnly();
     // 回滚已经在processRollback对应的分支做了
     // 执行提交就可以了
     doCommit(status);
    }
    // failEarlyOnGlobalRollbackOnly默认是false
    else if (isFailEarlyOnGlobalRollbackOnly()) {
     unexpectedRollback = status.isGlobalRollbackOnly();
    }

    // Throw UnexpectedRollbackException if we have a global rollback-only
    // marker but still didn't get a corresponding exception from commit.
    if (unexpectedRollback) {
     throw new UnexpectedRollbackException(
       "Transaction silently rolled back because it has been marked as rollback-only");
    }
   }
   catch (UnexpectedRollbackException ex) {
    // can only be caused by doCommit
    // 遍历触发TransactionSynchronization 的afterCompletion
    triggerAfterCompletion(status, TransactionSynchronization.STATUS_ROLLED_BACK);
    throw ex;
   }
   catch (TransactionException ex) {
    // can only be caused by doCommit
    // spring.transaction可配置 默认false
    // 开启的话在事务真正物理提交doCommit失败后会进行回滚
    if (isRollbackOnCommitFailure()) {
     doRollbackOnCommitException(status, ex);
    }
    else {
     // 遍历触发TransactionSynchronization 的afterCompletion
     triggerAfterCompletion(status, TransactionSynchronization.STATUS_UNKNOWN);
    }
    throw ex;
   }
   catch (RuntimeException | Error ex) {
    // 如果beforeCompletion没有触发
    if (!beforeCompletionInvoked) {
     // 遍历触发TransactionSynchronization 的beforeCompletion
     triggerBeforeCompletion(status);
    }
    // 进行回滚
    doRollbackOnCommitException(status, ex);
    throw ex;
   }

   // Trigger afterCommit callbacks, with an exception thrown there
   // propagated to callers but the transaction still considered as committed.
   try {
    // 遍历触发TransactionSynchronization 的afterCommit
    triggerAfterCommit(status);
   }
   finally {
    // 遍历触发TransactionSynchronization 的afterCompletion
    triggerAfterCompletion(status, TransactionSynchronization.STATUS_COMMITTED);
   }

  }
  finally {
   // 清理 
   cleanupAfterCompletion(status);
  }
 }
```

### cleanupAfterCompletion

```java
 /**
  * Clean up after completion, clearing synchronization if necessary,
  * and invoking doCleanupAfterCompletion.
  * @param status object representing the transaction
  * @see #doCleanupAfterCompletion
  */
 private void cleanupAfterCompletion(DefaultTransactionStatus status) {
  // 设置完成状态
  status.setCompleted();
  // nested情况下 isNewSynchronization 为false
  // 其他情况下清空 TransactionSynchronizationManager
  if (status.isNewSynchronization()) {
   TransactionSynchronizationManager.clear();
  }
  if (status.isNewTransaction()) {
   // 新事物的情况下 执行子类的doCleanupAfterCompletion
   // 比如说回滚autoCommit、isolationLevel 
   doCleanupAfterCompletion(status.getTransaction());
  }
  if (status.getSuspendedResources() != null) {
   if (status.isDebug()) {
    logger.debug("Resuming suspended transaction after completion of inner transaction");
   }
   Object transaction = (status.hasTransaction() ? status.getTransaction() : null);
   // 存在挂起事务那么就恢复事务
   resume(transaction, (SuspendedResourcesHolder) status.getSuspendedResources());
  }
 }

```
