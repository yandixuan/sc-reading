# TransactionDefinition

接口

```java
public interface TransactionDefinition {

  /**
   * Support a current transaction; create a new one if none exists.
   * Analogous to the EJB transaction attribute of the same name.
   * <p>This is typically the default setting of a transaction definition,
   * and typically defines a transaction synchronization scope.
   */
  // 当前如果有事务，Spring就会使用该事务；否则会开始一个新事务 
  int PROPAGATION_REQUIRED = 0;

  /**
   * Support a current transaction; execute non-transactionally if none exists.
   * Analogous to the EJB transaction attribute of the same name.
   * <p><b>NOTE:</b> For transaction managers with transaction synchronization,
   * {@code PROPAGATION_SUPPORTS} is slightly different from no transaction
   * at all, as it defines a transaction scope that synchronization might apply to.
   * As a consequence, the same resources (a JDBC {@code Connection}, a
   * Hibernate {@code Session}, etc) will be shared for the entire specified
   * scope. Note that the exact behavior depends on the actual synchronization
   * configuration of the transaction manager!
   * <p>In general, use {@code PROPAGATION_SUPPORTS} with care! In particular, do
   * not rely on {@code PROPAGATION_REQUIRED} or {@code PROPAGATION_REQUIRES_NEW}
   * <i>within</i> a {@code PROPAGATION_SUPPORTS} scope (which may lead to
   * synchronization conflicts at runtime). If such nesting is unavoidable, make sure
   * to configure your transaction manager appropriately (typically switching to
   * "synchronization on actual transaction").
   * @see org.springframework.transaction.support.AbstractPlatformTransactionManager#setTransactionSynchronization
   * @see org.springframework.transaction.support AbstractPlatformTransactionManager#SYNCHRONIZATION_ON_ACTUAL_TRANSACTION
   */
  // 当前如果有事务，Spring就会使用该事务；否则不会开始一个新事务 
  int PROPAGATION_SUPPORTS = 1;

  /**
   * Support a current transaction; throw an exception if no current transaction
   * exists. Analogous to the EJB transaction attribute of the same name.
   * <p>Note that transaction synchronization within a {@code PROPAGATION_MANDATORY}
   * scope will always be driven by the surrounding transaction.
   */
  // 当前如果有事务，Spring就会使用该事务；否则会抛出异常 
  int PROPAGATION_MANDATORY = 2;

  /**
   * Create a new transaction, suspending the current transaction if one exists.
   * Analogous to the EJB transaction attribute of the same name.
   * <p><b>NOTE:</b> Actual transaction suspension will not work out-of-the-box
   * on all transaction managers. This in particular applies to
   * {@link org.springframework.transaction.jta.JtaTransactionManager},
   * which requires the {@code javax.transaction.TransactionManager} to be
   * made available it to it (which is server-specific in standard Java EE).
   * <p>A {@code PROPAGATION_REQUIRES_NEW} scope always defines its own
   * transaction synchronizations. Existing synchronizations will be suspended
   * and resumed appropriately.
   * @see org.springframework.transaction.jta.JtaTransactionManager#setTransactionManager
   */
  // Spring总是开始一个新事务。如果当前有事务，则该事务挂起 
  int PROPAGATION_REQUIRES_NEW = 3;

  /**
   * Do not support a current transaction; rather always execute non-transactionally.
   * Analogous to the EJB transaction attribute of the same name.
   * <p><b>NOTE:</b> Actual transaction suspension will not work out-of-the-box
   * on all transaction managers. This in particular applies to
   * {@link org.springframework.transaction.jta.JtaTransactionManager},
   * which requires the {@code javax.transaction.TransactionManager} to be
   * made available it to it (which is server-specific in standard Java EE).
   * <p>Note that transaction synchronization is <i>not</i> available within a
   * {@code PROPAGATION_NOT_SUPPORTED} scope. Existing synchronizations
   * will be suspended and resumed appropriately.
   * @see org.springframework.transaction.jta.JtaTransactionManager#setTransactionManager
   */
  // Spring不会执行事务中的代码。代码总是在非事务环境下执行，如果当前有事务，则该事务挂起 
  int PROPAGATION_NOT_SUPPORTED = 4;

  /**
   * Do not support a current transaction; throw an exception if a current transaction
   * exists. Analogous to the EJB transaction attribute of the same name.
   * <p>Note that transaction synchronization is <i>not</i> available within a
   * {@code PROPAGATION_NEVER} scope.
   */
  // 即使当前有事务，Spring也会在非事务环境下执行。如果当前有事务，则抛出异常 
  int PROPAGATION_NEVER = 5;

  /**
   * Execute within a nested transaction if a current transaction exists,
   * behave like {@link #PROPAGATION_REQUIRED} otherwise. There is no
   * analogous feature in EJB.
   * <p><b>NOTE:</b> Actual creation of a nested transaction will only work on
   * specific transaction managers. Out of the box, this only applies to the JDBC
   * {@link org.springframework.jdbc.datasource.DataSourceTransactionManager}
   * when working on a JDBC 3.0 driver. Some JTA providers might support
   * nested transactions as well.
   * @see org.springframework.jdbc.datasource.DataSourceTransactionManager
   */
  // 如果当前有事务，则在嵌套事务中执行。如果没有，那么执行情况与TransactionDefinition.PROPAGATION_REQUIRED一样 
  int PROPAGATION_NESTED = 6;


  /**
   * Use the default isolation level of the underlying datastore.
   * All other levels correspond to the JDBC isolation levels.
   * @see java.sql.Connection
   */
  // PlatformTransactionManager的默认隔离级别（对大多数数据库来说就是ISOLATION_ READ_COMMITTED） 
  int ISOLATION_DEFAULT = -1;

  /**
   * Indicates that dirty reads, non-repeatable reads and phantom reads
   * can occur.
   * <p>This level allows a row changed by one transaction to be read by another
   * transaction before any changes in that row have been committed (a "dirty read").
   * If any of the changes are rolled back, the second transaction will have
   * retrieved an invalid row.
   * @see java.sql.Connection#TRANSACTION_READ_UNCOMMITTED
   */
  // 最低的隔离级别。事实上我们不应该称其为隔离级别，因为在事务完成前，其他事务可以看到该事务所修改的数据。而在其他事务提交前，该事务也可以看到其他事务所做的修改 
  int ISOLATION_READ_UNCOMMITTED = 1;  // same as java.sql.Connection.TRANSACTION_READ_UNCOMMITTED;

  /**
   * Indicates that dirty reads are prevented; non-repeatable reads and
   * phantom reads can occur.
   * <p>This level only prohibits a transaction from reading a row
   * with uncommitted changes in it.
   * @see java.sql.Connection#TRANSACTION_READ_COMMITTED
   */
  // 大多数数据库的默认级别。在事务完成前，其他事务无法看到该事务所修改的数据。遗憾的是，在该事务提交后，你就可以查看其他事务插入或更新的数据。这意味着在事务的不同点上，如果其他事务修改了数据，你就会看到不同的数据 
  int ISOLATION_READ_COMMITTED = 2;  // same as java.sql.Connection.TRANSACTION_READ_COMMITTED;

  /**
   * Indicates that dirty reads and non-repeatable reads are prevented;
   * phantom reads can occur.
   * <p>This level prohibits a transaction from reading a row with uncommitted changes
   * in it, and it also prohibits the situation where one transaction reads a row,
   * a second transaction alters the row, and the first transaction re-reads the row,
   * getting different values the second time (a "non-repeatable read").
   * @see java.sql.Connection#TRANSACTION_REPEATABLE_READ
   */
  // 比ISOLATION_READ_COMMITTED更严格，该隔离级别确保如果在事务中查询了某个数据集，你至少还能再次查询到相同的数据集，即使其他事务修改了所查询的数据。然而如果其他事务插入了新数据，你就可以查询到该新插入的数据 
  int ISOLATION_REPEATABLE_READ = 4;  // same as java.sql.Connection.TRANSACTION_REPEATABLE_READ;

  /**
   * Indicates that dirty reads, non-repeatable reads and phantom reads
   * are prevented.
   * <p>This level includes the prohibitions in {@link #ISOLATION_REPEATABLE_READ}
   * and further prohibits the situation where one transaction reads all rows that
   * satisfy a {@code WHERE} condition, a second transaction inserts a row
   * that satisfies that {@code WHERE} condition, and the first transaction
   * re-reads for the same condition, retrieving the additional "phantom" row
   * in the second read.
   * @see java.sql.Connection#TRANSACTION_SERIALIZABLE
   */
  // 代价最大、可靠性最高的隔离级别，所有的事务都是按顺序一个接一个地执行 
  int ISOLATION_SERIALIZABLE = 8;  // same as java.sql.Connection.TRANSACTION_SERIALIZABLE;


  /**
   * Use the default timeout of the underlying transaction system,
   * or none if timeouts are not supported.
   */
  // 事务提交超时时间 
  int TIMEOUT_DEFAULT = -1;


  /**
   * Return the propagation behavior.
   * <p>Must return one of the {@code PROPAGATION_XXX} constants
   * defined on {@link TransactionDefinition this interface}.
   * <p>The default is {@link #PROPAGATION_REQUIRED}.
   * @return the propagation behavior
   * @see #PROPAGATION_REQUIRED
   * @see org.springframework.transaction.support.TransactionSynchronizationManager#isActualTransactionActive()
   */
  // 获取事务传播属性 
  default int getPropagationBehavior() {
      return PROPAGATION_REQUIRED;
  }

  /**
   * Return the isolation level.
   * <p>Must return one of the {@code ISOLATION_XXX} constants defined on
   * {@link TransactionDefinition this interface}. Those constants are designed
   * to match the values of the same constants on {@link java.sql.Connection}.
   * <p>Exclusively designed for use with {@link #PROPAGATION_REQUIRED} or
   * {@link #PROPAGATION_REQUIRES_NEW} since it only applies to newly started
   * transactions. Consider switching the "validateExistingTransactions" flag to
   * "true" on your transaction manager if you'd like isolation level declarations
   * to get rejected when participating in an existing transaction with a different
   * isolation level.
   * <p>The default is {@link #ISOLATION_DEFAULT}. Note that a transaction manager
   * that does not support custom isolation levels will throw an exception when
   * given any other level than {@link #ISOLATION_DEFAULT}.
   * @return the isolation level
   * @see #ISOLATION_DEFAULT
   * @see org.springframework.transaction.support.AbstractPlatformTransactionManager#setValidateExistingTransaction
   */
  // 获取事务隔离级别 
  default int getIsolationLevel() {
      return ISOLATION_DEFAULT;
  }

  /**
   * Return the transaction timeout.
   * <p>Must return a number of seconds, or {@link #TIMEOUT_DEFAULT}.
   * <p>Exclusively designed for use with {@link #PROPAGATION_REQUIRED} or
   * {@link #PROPAGATION_REQUIRES_NEW} since it only applies to newly started
   * transactions.
   * <p>Note that a transaction manager that does not support timeouts will throw
   * an exception when given any other timeout than {@link #TIMEOUT_DEFAULT}.
   * <p>The default is {@link #TIMEOUT_DEFAULT}.
   * @return the transaction timeout
   */
  // 获取事务超时时间 
  default int getTimeout() {
      return TIMEOUT_DEFAULT;
  }

  /**
   * Return whether to optimize as a read-only transaction.
   * <p>The read-only flag applies to any transaction context, whether backed
   * by an actual resource transaction ({@link #PROPAGATION_REQUIRED}/
   * {@link #PROPAGATION_REQUIRES_NEW}) or operating non-transactionally at
   * the resource level ({@link #PROPAGATION_SUPPORTS}). In the latter case,
   * the flag will only apply to managed resources within the application,
   * such as a Hibernate {@code Session}.
   * <p>This just serves as a hint for the actual transaction subsystem;
   * it will <i>not necessarily</i> cause failure of write access attempts.
   * A transaction manager which cannot interpret the read-only hint will
   * <i>not</i> throw an exception when asked for a read-only transaction.
   * @return {@code true} if the transaction is to be optimized as read-only
   * ({@code false} by default)
   * @see org.springframework.transaction.support.TransactionSynchronization#beforeCommit(boolean)
   * @see org.springframework.transaction.support.TransactionSynchronizationManager#isCurrentTransactionReadOnly()
   */
  // 事务是否只读 
  default boolean isReadOnly() {
      return false;
  }

  /**
   * Return the name of this transaction. Can be {@code null}.
   * <p>This will be used as the transaction name to be shown in a
   * transaction monitor, if applicable (for example, WebLogic's).
   * <p>In case of Spring's declarative transactions, the exposed name will be
   * the {@code fully-qualified class name + "." + method name} (by default).
   * @return the name of this transaction ({@code null} by default}
   * @see org.springframework.transaction.interceptor.TransactionAspectSupport
   * @see org.springframework.transaction.support.TransactionSynchronizationManager#getCurrentTransactionName()
   */
  @Nullable
  default String getName() {
      return null;
  }


  // Static builder methods

  /**
   * Return an unmodifiable {@code TransactionDefinition} with defaults.
   * <p>For customization purposes, use the modifiable
   * {@link org.springframework.transaction.support.DefaultTransactionDefinition}
   * instead.
   * @since 5.2
   */
  static TransactionDefinition withDefaults() {
      return StaticTransactionDefinition.INSTANCE;
  }
```
