# connection

## 方法

### connTypeInitialize

初始化连接类型

```c
int connTypeInitialize() {
    /* currently socket connection type is necessary  */
    /* 注册Socket连接类型，并确保注册成功 */
    serverAssert(RedisRegisterConnectionTypeSocket() == C_OK);

    /* currently unix socket connection type is necessary  */
    /* 注册Unix Socket连接类型，并确保注册成功 */
    serverAssert(RedisRegisterConnectionTypeUnix() == C_OK);

    /* may fail if without BUILD_TLS=yes */
    /* 注册TLS连接类型，如果没有设置BUILD_TLS为yes，则注册可能会失败 */
    RedisRegisterConnectionTypeTLS();

    /* 返回成功 */
    return C_OK;
}
```
