# DataSourceTransactionManager

基于数据源的事务管理器，继承[`AbstractPlatformTransactionManager`](../tx/AbstractPlatformTransactionManager)

## 构造函数

```java
/**
 * Create a new DataSourceTransactionManager instance.
 * A DataSource has to be set to be able to use it.
 * @see #setDataSource
 */
public DataSourceTransactionManager() {
    // 这里就默认允许使用嵌套事务
    setNestedTransactionAllowed(true);
}

/**
 * Create a new DataSourceTransactionManager instance.
 * @param dataSource the JDBC DataSource to manage transactions for
 */
public DataSourceTransactionManager(DataSource dataSource) {
    this();
    setDataSource(dataSource);
    afterPropertiesSet();
}
```

## 方法

### doGetTransaction

获取事务对象即`transaction`

```java
@Override
protected Object doGetTransaction() {
    // DataSourceTransactionManager的实现中，transaction的类型是DataSourceTransactionObject
    DataSourceTransactionObject txObject = new DataSourceTransactionObject();
    // 设置允许嵌套事务
    txObject.setSavepointAllowed(isNestedTransactionAllowed());
    // 以DataSource为键，ConnectionHolder为值绑定到线程私有存储
    // 从threadLocal中获取ConnectionHolder,可能为null
    ConnectionHolder conHolder =
            (ConnectionHolder) TransactionSynchronizationManager.getResource(obtainDataSource());
    // conHolder空与不空，newConnectionHolder都为false
    txObject.setConnectionHolder(conHolder, false);
    return txObject;
}
```

### isExistingTransaction

通过获取DataSourceTransactionObject的ConnectionHolder存在且事务激活判断

```java
@Override
protected boolean isExistingTransaction(Object transaction) {
    // doGetTransaction返回的对象是`DataSourceTransactionObject`所以判断是否有事务存在的时候可向下转型
    DataSourceTransactionObject txObject = (DataSourceTransactionObject) transaction;
    return (txObject.hasConnectionHolder() && txObject.getConnectionHolder().isTransactionActive());
}
```

### doBegin

```java
@Override
protected void doBegin(Object transaction, TransactionDefinition definition) {
    DataSourceTransactionObject txObject = (DataSourceTransactionObject) transaction;
    Connection con = null;

    try { 
        if (!txObject.hasConnectionHolder() ||
                txObject.getConnectionHolder().isSynchronizedWithTransaction()) {
            // 事务对象的connectionHolder不为空，或当前事务对象不与当前事务对象绑定即重新new一个新的connectionHolder与当前事务绑定
            // 从数据源中获取jdbc连接  
            Connection newCon = obtainDataSource().getConnection();
            if (logger.isDebugEnabled()) {
                logger.debug("Acquired Connection [" + newCon + "] for JDBC transaction");
            }
            // 将新连接绑定当前事务对象的ConnectionHolder中
            // 所以第二个参数为true：表示是新的ConnectionHolder
            txObject.setConnectionHolder(new ConnectionHolder(newCon), true);
        }
        // 事务对象设置与事务同步标志true 
        txObject.getConnectionHolder().setSynchronizedWithTransaction(true);
        // 获取连接
        con = txObject.getConnectionHolder().getConnection();
        // 更改当前连接的readOnly、isolationLevel 并返回连接之前的isolationLevel后面好还原回去
        Integer previousIsolationLevel = DataSourceUtils.prepareConnectionForTransaction(con, definition);
        // 设置属性
        txObject.setPreviousIsolationLevel(previousIsolationLevel);
        txObject.setReadOnly(definition.isReadOnly());

        // Switch to manual commit if necessary. This is very expensive in some JDBC drivers,
        // so we don't want to do it unnecessarily (for example if we've explicitly
        // configured the connection pool to set it already).
        // 获取连接自动提交，手动提交事务的时候autoCommit得为false
        if (con.getAutoCommit()) {
            txObject.setMustRestoreAutoCommit(true);
            if (logger.isDebugEnabled()) {
                logger.debug("Switching JDBC Connection [" + con + "] to manual commit");
            }
            con.setAutoCommit(false);
        }
        // 但如果你一次执行多条查询语句，例如统计查询，报表查询，在这种场景下，多条查询SQL必须保证整体的读一致性，否则，在前条SQL查询之后，后条SQL查询之前，数据被其他用户改变，就会造成数据的前后不一。
        // 根据enforceReadOnly=true 执行`stmt.executeUpdate("SET TRANSACTION READ ONLY")`
        prepareTransactionalConnection(con, definition);
        // 通过数据库连接持有器设置当前的事务状态为正在活动中
        txObject.getConnectionHolder().setTransactionActive(true);
      
        // 如果配置了超时时间，在数据连接持有者中进行设置
        int timeout = determineTimeout(definition);
        if (timeout != TransactionDefinition.TIMEOUT_DEFAULT) {
            txObject.getConnectionHolder().setTimeoutInSeconds(timeout);
        }
        // 如果当前数据库连接持有者是新建的，即首次获取数据库连接，需要调用绑定资源bindResource方法
        // Bind the connection holder to the thread.
        if (txObject.isNewConnectionHolder()) {
            TransactionSynchronizationManager.bindResource(obtainDataSource(), txObject.getConnectionHolder());
        }
    }

    catch (Throwable ex) {
        // 发生异常 
        if (txObject.isNewConnectionHolder()) {
            // 如果事务当前绑定的是新连接
            // 将数据源对应在当前线程的ConnectionHolder中持有的连接进行一个释放即对currentConnection置空，setConnection调用时会对connectionHandle进行一个重置 并不是物理意义上的释放数据源连接
            // 这里面涉及到对SmartDataSource进行一个连接释放
            DataSourceUtils.releaseConnection(con, obtainDataSource());
            // 事务对象上的ConnectionHolder设置为null
            txObject.setConnectionHolder(null, false);
        }
        throw new CannotCreateTransactionException("Could not open JDBC Connection for transaction", ex);
    }
}
```

### doSuspend

```java
@Override
protected Object doSuspend(Object transaction) {
    DataSourceTransactionObject txObject = (DataSourceTransactionObject) transaction;
    txObject.setConnectionHolder(null);
    // 将连接从ThreadLocalMap中移除并返回,返回ConnectionHolder对象
    return TransactionSynchronizationManager.unbindResource(obtainDataSource());
}
```

### doResume

```java
@Override
protected void doResume(@Nullable Object transaction, Object suspendedResources) {
    // 将ConnectionHolder绑定回当前线程
    TransactionSynchronizationManager.bindResource(obtainDataSource(), suspendedResources);
}
```

### doCommit

获取数据库连接执行commit提交

```java
@Override
protected void doCommit(DefaultTransactionStatus status) {
    DataSourceTransactionObject txObject = (DataSourceTransactionObject) status.getTransaction();
    Connection con = txObject.getConnectionHolder().getConnection();
    if (status.isDebug()) {
        logger.debug("Committing JDBC transaction on Connection [" + con + "]");
    }
    try {
        con.commit();
    }
    catch (SQLException ex) {
        throw translateException("JDBC commit", ex);
    }
}
```

### doRollback

```java
@Override
protected void doRollback(DefaultTransactionStatus status) {
    // 根据事务状态对象获取事务对象
    DataSourceTransactionObject txObject = (DataSourceTransactionObject) status.getTransaction();
    // 获取连接 执行数据库连接的rollback方法
    Connection con = txObject.getConnectionHolder().getConnection();
    if (status.isDebug()) {
        logger.debug("Rolling back JDBC transaction on Connection [" + con + "]");
    }
    try {
        con.rollback();
    }
    catch (SQLException ex) {
        throw translateException("JDBC rollback", ex);
    }
}
```

### doSetRollbackOnly

```java
@Override
protected void doSetRollbackOnly(DefaultTransactionStatus status) {
    DataSourceTransactionObject txObject = (DataSourceTransactionObject) status.getTransaction();
    if (status.isDebug()) {
        logger.debug("Setting JDBC transaction [" + txObject.getConnectionHolder().getConnection() +
            "] rollback-only");
    }
    // connectionHolder设置rollbackOnly=true
    txObject.setRollbackOnly();
}
```

### doCleanupAfterCompletion

```java
@Override
protected void doCleanupAfterCompletion(Object transaction) {
    DataSourceTransactionObject txObject = (DataSourceTransactionObject) transaction;

    // Remove the connection holder from the thread, if exposed.
    if (txObject.isNewConnectionHolder()) {
        // 如果connectionHolder是新的，与当前线程解绑 
        TransactionSynchronizationManager.unbindResource(obtainDataSource());
    }

    // Reset connection.
    Connection con = txObject.getConnectionHolder().getConnection();
    try {
        // 恢复数据库连接autoCommit 
        if (txObject.isMustRestoreAutoCommit()) {
            con.setAutoCommit(true);
        }
        // 恢复数据库连接之前的 隔离级别、readOnly
        // 如果事务对象的只读属性是true那么就恢复false
        DataSourceUtils.resetConnectionAfterTransaction(
                con, txObject.getPreviousIsolationLevel(), txObject.isReadOnly());
    }
    catch (Throwable ex) {
        logger.debug("Could not reset JDBC Connection after transaction", ex);
    }

    if (txObject.isNewConnectionHolder()) {
        if (logger.isDebugEnabled()) {
            logger.debug("Releasing JDBC Connection [" + con + "] after transaction");
        }
        // 释放connectionHolder持有的数据库连接对象
        DataSourceUtils.releaseConnection(con, this.dataSource);
    }

    txObject.getConnectionHolder().clear();
}
```

### prepareTransactionalConnection

对事物进行优化，在只读范围下优化数据一致性

```java
/**
 * Prepare the transactional {@code Connection} right after transaction begin.
 * <p>The default implementation executes a "SET TRANSACTION READ ONLY" statement
 * if the {@link #setEnforceReadOnly "enforceReadOnly"} flag is set to {@code true}
 * and the transaction definition indicates a read-only transaction.
 * <p>The "SET TRANSACTION READ ONLY" is understood by Oracle, MySQL and Postgres
 * and may work with other databases as well. If you'd like to adapt this treatment,
 * override this method accordingly.
 * @param con the transactional JDBC Connection
 * @param definition the current transaction definition
 * @throws SQLException if thrown by JDBC API
 * @since 4.3.7
 * @see #setEnforceReadOnly
 */
protected void prepareTransactionalConnection(Connection con, TransactionDefinition definition)
        throws SQLException {

    if (isEnforceReadOnly() && definition.isReadOnly()) {
        try (Statement stmt = con.createStatement()) {
            stmt.executeUpdate("SET TRANSACTION READ ONLY");
        }
    }
}
```

## DataSourceTransactionObject

继承了`JdbcTransactionObjectSupport`

`JdbcTransactionObjectSupport`实现了`SavepointManager`、`SmartTransactionObject`接口

安全点的创建是通过`ConnectionHolder`回去jdbc`Connection`调用`setSavepoint`创建

:::tip 注意
DefaultTransactionStatus也实现了`SavepointManager`接口，从`DefaultTransactionStatus`获取到transcation即`DataSourceTransactionObject`也实现了`SavepointManager`接口，从而拥有创建安全点的能力
:::
