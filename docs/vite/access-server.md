# 访问服务器

`Dev Server`启动时，**控制台**会打印访问地址即：`http://localhost:5173/`

## 中间件处理

对于本次访问，`req.url为'/'`，经过以下中间件的处理：

### transformMiddleware

由于`knownIgnoreList`的逻辑判断，该中间件不处理url为`/`的本次请求，即跳过

> 源码位置: <https://github.com/vitejs/vite/blob/main/packages/vite/src/node/server/middlewares/transform.ts#L56-L58>

### serveRawFsMiddleware

该钩子是对url以`/@fs/`的静态资源访问的路径处理，即跳过

### serveStaticMiddleware

该中间跳过处理的url如以下几种情况：

- /
- .html结尾的url
- internalRequest
  - /@fs/
  - /@id/
  - /@vite/client
  - /@vite/env

> 源码位置: <https://github.com/vitejs/vite/blob/main/packages/vite/src/node/server/middlewares/static.ts#L96-L102>

### htmlFallbackMiddleware

通过`connect-history-api-fallback`将`/`重写成`/index.html`，这也就是为什么访问服务器根目录也能访问到html的原因了，是因为`vite`底层为我们进行了配置

### indexHtmlMiddleware

`/index.html`，就会被`indexHtmlMiddleware`读取和修改。具体分析如下：

[转换HTML](./transform-html.md)
