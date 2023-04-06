# ConnectionHolder

继承`ResourceHolderSupport`

jdbc connection连接持有者

## 属性

```java
    /**
     * Prefix for savepoint names.
     */
    // 安全点名称前缀 
    public static final String SAVEPOINT_NAME_PREFIX = "SAVEPOINT_";


    @Nullable
    // 对connection对象的持有
    private ConnectionHandle connectionHandle;

    @Nullable
    // 当前数据库连接
    private Connection currentConnection;
    
    // 事务是否处于活动
    private boolean transactionActive = false;
    
    @Nullable
    // 当前连接是否支持savepoint
    private Boolean savepointsSupported;
    //savepoint的个数
    private int savepointCounter = 0;
```

## 方法

### setConnection

```java
/**
 * Override the existing Connection handle with the given Connection.
 * Reset the handle if given {@code null}.
 * <p>Used for releasing the Connection on suspend (with a {@code null}
 * argument) and setting a fresh Connection on resume.
 */
protected void setConnection(@Nullable Connection connection) {
    // 当前连接对象不为空
    if (this.currentConnection != null) {
        // 连接处理对象不为空
        if (this.connectionHandle != null) {
            // 调用connectionHandle的releaseConnection方法
            this.connectionHandle.releaseConnection(this.currentConnection);
        }
        // 将当前连接对象置空
        this.currentConnection = null;
    }
    if (connection != null) {
        // 将设置进来的 Connection 包装成 SimpleConnectionHandle对象
        this.connectionHandle = new SimpleConnectionHandle(connection);
    }
    else {
        this.connectionHandle = null;
    }
}

```

### getConnection

返回当前连接对象或者连接处理对象返回`数据库连接`

```java
/**
 * Return the current Connection held by this ConnectionHolder.
 * <p>This will be the same Connection until {@code released}
 * gets called on the ConnectionHolder, which will reset the
 * held Connection, fetching a new Connection on demand.
 * @see ConnectionHandle#getConnection()
 * @see #released()
 */
public Connection getConnection() {
    Assert.notNull(this.connectionHandle, "Active Connection is required");
    if (this.currentConnection == null) {
        this.currentConnection = this.connectionHandle.getConnection();
    }
    return this.currentConnection;
}
```

### supportsSavepoints

通过当前数据库连接的`metaData`判读是否支持`savepoint`

```java
/**
 * Return whether JDBC 3.0 Savepoints are supported.
 * Caches the flag for the lifetime of this ConnectionHolder.
 * @throws SQLException if thrown by the JDBC driver
 */
public boolean supportsSavepoints() throws SQLException {
    if (this.savepointsSupported == null) {
        this.savepointsSupported = getConnection().getMetaData().supportsSavepoints();
    }
    return this.savepointsSupported;
}
```

### createSavepoint

当前连接创建`savepoint`，同时增加计数

```java
/**
 * Create a new JDBC 3.0 Savepoint for the current Connection,
 * using generated savepoint names that are unique for the Connection.
 * @return the new Savepoint
 * @throws SQLException if thrown by the JDBC driver
 */
public Savepoint createSavepoint() throws SQLException {
    this.savepointCounter++;
    return getConnection().setSavepoint(SAVEPOINT_NAME_PREFIX + this.savepointCounter);
}
```

### released

```java
/**
 * Releases the current Connection held by this ConnectionHolder.
 * <p>This is necessary for ConnectionHandles that expect "Connection borrowing",
 * where each returned Connection is only temporarily leased and needs to be
 * returned once the data operation is done, to make the Connection available
 * for other operations within the same transaction.
 */
@Override
public void released() {
    // 父类的释放就是引用减1
    super.released();
    // 如果引用计数不要为0 且 当前连接不为空
    // 可能有别的地方持有引用 调用 releaseConnection
    if (!isOpen() && this.currentConnection != null) {
        if (this.connectionHandle != null) {
            this.connectionHandle.releaseConnection(this.currentConnection);
        }
        this.currentConnection = null;
    }
}
```

### clear

```java
@Override
public void clear() {
    super.clear();
    this.transactionActive = false;
    this.savepointsSupported = null;
    this.savepointCounter = 0;
}
```
