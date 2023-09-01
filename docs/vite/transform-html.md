# HTML转换

通过`indexHtmlMiddleware`转换**HTML**，返回转换后的HTML字符串给客户端。

> 中间件注册位置: <https://github.com/vitejs/vite/blob/main/packages/vite/src/node/server/index.ts#L658-L668>

- 注入静态资源，根据项目配置和构建结果自动将生成的CSS、JavaScript等资源链接插入HTML文件中
- 处理html模板变量，允许你在模板中使用动态数据和条件渲染
- 注入hmr相关脚本，开发服务器能够及时通知浏览器更新页面，而无需手动刷新。

## 读取HTML

通过`indexHtmlMiddleware`获取到请求的html路径，尝试通过文件系统读取内容

```ts
export function indexHtmlMiddleware(
  server: ViteDevServer,
): Connect.NextHandleFunction {
  // Keep the named function. The name is visible in debug logs via `DEBUG=connect:dispatcher ...`
  return async function viteIndexHtmlMiddleware(req, res, next) {
    // 用于检查是否调用 res.end()
    if (res.writableEnded)
      return next()

    const url = req.url && cleanUrl(req.url)
    // htmlFallbackMiddleware appends '.html' to URLs
    // 本次请求的是html文档，才能进行处理
    if (url?.endsWith('.html') && req.headers['sec-fetch-dest'] !== 'script') {
      // 获取html在文件系统的绝对路径
      const filename = getHtmlFilename(url, server)
      // 判断文件是否存在
      if (fs.existsSync(filename)) {
        try {
          // 读取文件内容
          let html = await fsp.readFile(filename, 'utf-8')
          /**
           * 调用 server.transformIndexHtml 对 html 字符串进行处理
           * server.transformIndexHtml 是由 createDevHtmlTransformFn 生产而来
           */
          html = await server.transformIndexHtml(url, html, req.originalUrl)
          // 向客户端发送HTML字符串
          return send(req, res, html, 'html', {
            headers: server.config.server.headers,
          })
        }
        catch (e) {
          return next(e)
        }
      }
    }
    next()
  }
}
```

## 转换HTML

### createDevHtmlTransformFn

生成dev环境下html转换方法，即返回函数

```ts
export function createDevHtmlTransformFn(
  server: ViteDevServer,
): (url: string, html: string, originalUrl: string) => Promise<string> {
  /**
   * 遍历所有用户定义的插件
   * 1. 如果 plugin.transformIndexHtml 是一个函数，添加到 postHooks中
   * 2. plugin.transformIndexHtml 是一个对象并且，根据order属性分类：
   *  2.1 order==='pre'，放入preHooks中
   *  2.2 order==='post'，放入postHooks中
   *  2.3 否则放入normalHooks中
   */
  const [preHooks, normalHooks, postHooks] = resolveHtmlTransforms(
    server.config.plugins,
  )
  return (url: string, html: string, originalUrl: string): Promise<string> => {
    // 按下面顺序，调用hook去处理html字符串
    return applyHtmlTransforms(
      html,
      [
        // 检测 <script type="importmap"> 的顺序
        preImportMapHook(server.config),
        ...preHooks,
        // 支持在html解析 %ENV_NAME%
        htmlEnvHook(server.config),
        devHtmlHook,
        ...normalHooks,
        ...postHooks,
        // 保证 importmap script 在 module script 的前面
        postImportMapHook(),
      ],
      {
        path: url,
        filename: getHtmlFilename(url, server),
        server,
        originalUrl,
      },
    )
  }
}
```

### applyHtmlTransforms

### traverseHtml

生成HTML的AST，再进行遍历

```ts
export async function traverseHtml(
  html: string,
  filePath: string,
  visitor: (node: DefaultTreeAdapterMap['node']) => void,
): Promise<void> {
  // lazy load compiler
  const { parse } = await import('parse5')
  // 通过 parse5 生成 HTML 的 AST
  const ast = parse(html, {
    scriptingEnabled: false, // parse inside <noscript>
    sourceCodeLocationInfo: true,
    onParseError: (e: ParserError) => {
      handleParseError(e, html, filePath)
    },
  })
  traverseNodes(ast, visitor)
}
```

### traverseNodes

遍历html的AST节点对象

```ts
function traverseNodes(
  node: DefaultTreeAdapterMap['node'],
  visitor: (node: DefaultTreeAdapterMap['node']) => void,
) {
  // 观察者模式，我们可以访问到每个节点
  visitor(node)
  if (
    /**
     * 如果nodeName不是#开头则不是tag，才会有childNodes属性
     * #document、#document-fragment都是有子节点的，所以也要考虑
     */
    nodeIsElement(node) ||
    node.nodeName === '#document' ||
    node.nodeName === '#document-fragment'
  ) {
    node.childNodes.forEach((childNode) => traverseNodes(childNode, visitor))
  }
}
```

### devHtmlHook

dev环境下，将`@/vite/client.js` 插入头部，支持vite hmr热更新

```ts
const devHtmlHook: IndexHtmlTransformHook = async (
  html,
  { path: htmlPath, filename, server, originalUrl },
) => {
  const { config, moduleGraph, watcher } = server!
  const base = config.base || '/'
  htmlPath = decodeURI(htmlPath)

  let proxyModulePath: string
  let proxyModuleUrl: string

  const trailingSlash = htmlPath.endsWith('/')
  if (!trailingSlash && fs.existsSync(filename)) {
    proxyModulePath = htmlPath
    proxyModuleUrl = joinUrlSegments(base, htmlPath)
  }
  else {
    // There are users of vite.transformIndexHtml calling it with url '/'
    // for SSR integrations #7993, filename is root for this case
    // A user may also use a valid name for a virtual html file
    // Mark the path as virtual in both cases so sourcemaps aren't processed
    // and ids are properly handled
    const validPath = `${htmlPath}${trailingSlash ? 'index.html' : ''}`
    proxyModulePath = `\0${validPath}`
    proxyModuleUrl = wrapId(proxyModulePath)
  }
  /**
   * 字符串的魔术替换
   * 这个库的目的就是在一些轻量级替换源代码的场景中替代 AST 这种过于庞大的解决方案。
   */
  const s = new MagicString(html)
  let inlineModuleIndex = -1
  const proxyCacheUrl = cleanUrl(proxyModulePath).replace(
    normalizePath(config.root),
    '',
  )
  const styleUrl: AssetNode[] = []

  /**
   * 将内联脚本转成外联脚本，提高页面性能
   */
  const addInlineModule = (
    node: DefaultTreeAdapterMap['element'],
    ext: 'js',
  ) => {
    inlineModuleIndex++

    const contentNode = node.childNodes[0] as DefaultTreeAdapterMap['textNode']

    const code = contentNode.value

    let map: SourceMapInput | undefined
    if (proxyModulePath[0] !== '\0') {
      map = new MagicString(html)
        .snip(
          contentNode.sourceCodeLocation!.startOffset,
          contentNode.sourceCodeLocation!.endOffset,
        )
        .generateMap({ hires: 'boundary' })
      map.sources = [filename]
      map.file = filename
    }

    // add HTML Proxy to Map
    // 内联脚本的内容会被记录在 htmlProxyMap 这个表中
    addToHTMLProxyCache(config, proxyCacheUrl, inlineModuleIndex, { code, map })

    // inline js module. convert to src="proxy" (dev only, base is never relative)
    const modulePath = `${proxyModuleUrl}?html-proxy&index=${inlineModuleIndex}.${ext}`

    // invalidate the module so the newly cached contents will be served
    const module = server?.moduleGraph.getModuleById(modulePath)
    if (module)
      server?.moduleGraph.invalidateModule(module)
    // magic-string修改成外联脚本，向服务器请求脚本
    s.update(
      node.sourceCodeLocation!.startOffset,
      node.sourceCodeLocation!.endOffset,
      `<script type="module" src="${modulePath}"></script>`,
    )
    // 提前触发pluginCotainer的对 modulePath 资源的解析加载操作
    preTransformRequest(server!, modulePath, base)
  }

  /**
   * traverseHtml将html解析成AST语法树
   * 每访问一层 AST 就会执行一次传入的这个回调函数。
   */
  await traverseHtml(html, filename, (node) => {
    // 只处理html标签
    if (!nodeIsElement(node))
      return

    // script tags
    if (node.nodeName === 'script') {
      // 拿到AST节点相关属性
      const { src, sourceCodeLocation, isModule } = getScriptInfo(node)

      if (src) {
        /**
         * 将src处理成服务器能响应的地址
         * 再根据sourceCodeLocation操作magic-string api进行覆盖
         */
        processNodeUrl(
          src,
          sourceCodeLocation!,
          s,
          config,
          htmlPath,
          originalUrl,
          server,
        )
      }
      else if (isModule && node.childNodes.length) {
        // 内联脚本转外联
        addInlineModule(node, 'js')
      }
    }
    // 将内联style存储到styleUrl数组中，后面再处理
    if (node.nodeName === 'style' && node.childNodes.length) {
      const children = node.childNodes[0] as DefaultTreeAdapterMap['textNode']
      styleUrl.push({
        start: children.sourceCodeLocation!.startOffset,
        end: children.sourceCodeLocation!.endOffset,
        code: children.value,
      })
    }

    // elements with [href/src] attrs
    // 处理其他元素上src属性，例如a,video
    const assetAttrs = assetAttrsConfig[node.nodeName]
    if (assetAttrs) {
      for (const p of node.attrs) {
        const attrKey = getAttrKey(p)
        if (p.value && assetAttrs.includes(attrKey)) {
          /**
           * 将src处理成服务器能响应的地址
           * 再根据sourceCodeLocation操作magic-string api进行覆盖
           */
          processNodeUrl(
            p,
            node.sourceCodeLocation!.attrs![attrKey],
            s,
            config,
            htmlPath,
            originalUrl,
          )
        }
      }
    }
  })

  await Promise.all(
    // 内联css转外联css
    styleUrl.map(async ({ start, end, code }, index) => {
      const url = `${proxyModulePath}?html-proxy&direct&index=${index}.css`

      // ensure module in graph after successful load
      // 确保模块url对应的ModuleNode的存在
      const mod = await moduleGraph.ensureEntryFromUrl(url, false)
      // 保证root外文件的监听
      ensureWatchedFile(watcher, mod.file, config.root)
      // 调用转换钩子，对css转换
      const result = await server!.pluginContainer.transform(code, mod.id!)
      let content = ''
      if (result) {
        if (result.map && 'version' in result.map) {
          /**
           * rollup只关心mappings属性，只因为它能表示映射信息
           * https://rollupjs.org/plugin-development/#source-code-transformations
           */
          if (result.map.mappings) {
            // 如果sourcesContent为null，尝试注入
            await injectSourcesContent(
              result.map,
              proxyModulePath,
              config.logger,
            )
          }
          // 在内容最后添加 sourceMappingURL
          content = getCodeWithSourcemap('css', result.code, result.map)
        }
        else {
          content = result.code
        }
      }
      // magic-string覆盖原内容
      s.overwrite(start, end, content)
    }),
  )

  html = s.toString()
  // 返回处理过后的html字符串以及在head头前注入'/@vite/cilent'脚本添加hmr支持
  return {
    html,
    tags: [
      {
        tag: 'script',
        attrs: {
          type: 'module',
          src: path.posix.join(base, CLIENT_PUBLIC_PATH),
        },
        injectTo: 'head-prepend',
      },
    ],
  }
}
```
