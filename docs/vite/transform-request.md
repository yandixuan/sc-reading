# 转换请求

在开发环境下，通过`indexHtmlMiddleware`中间件，将html的`type="module"`脚本的`scr`都会被处理成服务器可响应的格式，html会对服务器发起`application/javascript`的资源请求通过`transformMiddleware`这个中间进行处理

> 注册位置：<https://github.com/vitejs/vite/blob/main/packages/vite/src/node/server/index.ts#L646>
