# AbstractFallbackTransactionAttributeSource

## 方法

### getTransactionAttribute

```java
@Override
@Nullable
public TransactionAttribute getTransactionAttribute(Method method, @Nullable Class<?> targetClass) {
    // 如果方法是Object的方法
    if (method.getDeclaringClass() == Object.class) {
        return null;
    }

    // First, see if we have a cached value.
    // 先将method、targetClass封装成MethodClassKey对象 这里一个方法+对象class为一个key
    Object cacheKey = getCacheKey(method, targetClass);
    // 去缓存里找
    TransactionAttribute cached = this.attributeCache.get(cacheKey);
    if (cached != null) {
        // Value will either be canonical value indicating there is no transaction attribute,
        // or an actual transaction attribute.
        // 如果缓存的key对应的值是 `NULL_TRANSACTION_ATTRIBUTE` 返回null
        if (cached == NULL_TRANSACTION_ATTRIBUTE) {
            return null;
        }
        else {
            // 返回事务信息
            return cached;
        }
    }
    else {
        // We need to work it out.
        // 如果在缓存中没找到我们需要解析出来
        TransactionAttribute txAttr = computeTransactionAttribute(method, targetClass);
        // Put it in the cache.
        if (txAttr == null) {
            this.attributeCache.put(cacheKey, NULL_TRANSACTION_ATTRIBUTE);
        }
        else {
        // 获取方法的全限定路径
        String methodIdentification = ClassUtils.getQualifiedMethodName(method, targetClass);
        if (txAttr instanceof DefaultTransactionAttribute) {
            DefaultTransactionAttribute dta = (DefaultTransactionAttribute) txAttr;
            dta.setDescriptor(methodIdentification);
            dta.resolveAttributeStrings(this.embeddedValueResolver);
        }
        if (logger.isTraceEnabled()) {
            logger.trace("Adding transactional method '" + methodIdentification + "' with attribute: " + txAttr);
        }
            // 放入缓存
            this.attributeCache.put(cacheKey, txAttr);
        }
        return txAttr;
    }
}
```

### computeTransactionAttribute

```java
@Nullable
protected TransactionAttribute computeTransactionAttribute(Method method, @Nullable Class<?> targetClass) {
    // Don't allow non-public methods, as configured.
    // allowPublicMethodsOnly==true 且 方法不是public 返回null即不支持事务
    if (allowPublicMethodsOnly() && !Modifier.isPublic(method.getModifiers())) {
        return null;
    }

    // The method may be on an interface, but we need attributes from the target class.
    // If the target class is null, the method will be unchanged.
    // SpringAOP代理分为JDK动态代理和CGLIB
    // 获取委托类上的方法
    Method specificMethod = AopUtils.getMostSpecificMethod(method, targetClass);

    // First try is the method in the target class.
    // 从委托类的method上获取 TransactionAttribute信息
    // AnnotationTransactionAttributeSource 有3种解析支持
    // JtaTransactionAnnotationParser,Ejb3TransactionAnnotationParser,SpringTransactionAnnotationParser
    // SpringTransactionAnnotationParser 返回 RuleBasedTransactionAttribute
    TransactionAttribute txAttr = findTransactionAttribute(specificMethod);
    if (txAttr != null) {
        return txAttr;
    }

    // Second try is the transaction attribute on the target class.
    // 尝试从委托类上获取注解信息
    txAttr = findTransactionAttribute(specificMethod.getDeclaringClass());
    if (txAttr != null && ClassUtils.isUserLevelMethod(method)) {
        return txAttr;
    }

    // 尝试从JDK的方法或者类上寻找事务注解信息（JDK动态代理）
    if (specificMethod != method) {
        // Fallback is to look at the original method.
        txAttr = findTransactionAttribute(method);
        if (txAttr != null) {
            return txAttr;
        }
        // Last fallback is the class of the original method.
        txAttr = findTransactionAttribute(method.getDeclaringClass());
        if (txAttr != null && ClassUtils.isUserLevelMethod(method)) {
            return txAttr;
        }
    }

    return null;
}
```
