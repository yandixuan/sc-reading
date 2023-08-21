# vite启动

## 前置背景

根据[**Vite**](https://vitejs.dev/)官网的**Getting Started**，我们快速开启了一个**vue3**项目，在**package.json**的**scripts**中，仅一行`vite`就能启动dev server。package.json部分内容如下所示：

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc && vite build",
    "preview": "vite preview"
  }
}
```

## 执行vite

定位到源码目录的`packages/vite`的`package.json`，就明白了**vite**命令直接调用的是`bin/vite.js`。

> 命令位置：<https://github.com/vitejs/vite/blob/main/packages/vite/package.json#L9>

`bin/vite.js`最终执行的都是`start()`方法，去启动本地dev server。

> 源码位置：<https://github.com/vitejs/vite/blob/main/packages/vite/bin/vite.js#L47-L61>

```js
function start() {
  // 最终启动方式就是导入编译源码后的dist/node目录下的cli模块，并且执行cli
  return import('../dist/node/cli.js')
}
```

在`node/cli.ts`中，通过[`cac`](https://github.com/cacjs/cac)这个库去解析命令行参数，dev相关命令的源码位置如下：

> 源码位置：<https://github.com/vitejs/vite/blob/main/packages/vite/src/node/cli.ts#L114-L207>

而其中action选项中的callback则是启动server的函数：

```ts
async (root: string, options: ServerOptions & GlobalCLIOptions) => {
  // 滤掉重复选项
  filterDuplicateOptions(options)
  // output structure is preserved even after bundling so require()
  // is ok here
  // 导入服务器相关函数
  const { createServer } = await import('./server')
  try {
    // 核心，启动本地服务器
    const server = await createServer({
      root,
      base: options.base,
      mode: options.mode,
      configFile: options.config,
      logLevel: options.logLevel,
      clearScreen: options.clearScreen,
      optimizeDeps: { force: options.force },
      server: cleanOptions(options),
    })

    if (!server.httpServer)
      throw new Error('HTTP server not available')

    // 监听端口
    await server.listen()
    // 拿到info logger对象
    const info = server.config.logger.info
    /**
       * __vite_start_time跟perfomance有关
       * 控制台输出启动结果
       */
    const viteStartTime = global.__vite_start_time ?? false
    const startupDurationString = viteStartTime
      ? colors.dim(
            `ready in ${colors.reset(
              colors.bold(Math.ceil(performance.now() - viteStartTime)),
            )} ms`,
      )
      : ''

    info(
        `\n  ${colors.green(
          `${colors.bold('VITE')} v${VERSION}`,
        )}  ${startupDurationString}\n`,
        { clear: !server.config.logger.hasWarned },
    )
    // 打印server url
    server.printUrls()
    // 定义控制台快捷键
    bindShortcuts(server, {
      print: true,
      customShortcuts: [
        profileSession && {
          key: 'p',
          description: 'start/stop the profiler',
          async action(server) {
            if (profileSession) {
              await stopProfiler(server.config.logger.info)
            }
            else {
              const inspector = await import('node:inspector').then(
                r => r.default,
              )
              await new Promise<void>((res) => {
                profileSession = new inspector.Session()
                profileSession.connect()
                profileSession.post('Profiler.enable', () => {
                  profileSession!.post('Profiler.start', () => {
                    server.config.logger.info('Profiler started')
                    res()
                  })
                })
              })
            }
          },
        },
      ],
    })
  }
  catch (e) {
    // 输出启动失败日志
    const logger = createLogger(options.logLevel)
    logger.error(colors.red(`error when starting dev server:\n${e.stack}`), {
      error: e,
    })
    stopProfiler(logger.info)
    // 结束进程
    process.exit(1)
  }
}
```

## createServer

通过 **_createServer** 创建`ViteDevServer`服务对象，通过`ViteDevServer#listen`方法实现对端口的监听

```ts
export async function _createServer(
  inlineConfig: InlineConfig = {},
  options: { ws: boolean },
): Promise<ViteDevServer> {
  /**
   * 解析config
   * 1. 加载vite的配置文件（js,mjs,ts,cjs,mts,cts），所以会调用build方法解析成js文件
   * 对于ESM格式通过写临时文件，通过 Node 原生 ESM Import 来读取这个临时的内容
   * 对于CommonJs格式，通过拦截Node.js原生require.extension方法实现即时加载
   * 2. 解析用户插件
   * 3. 加载.env环境变量配置文件
   * 4. 定义vite内部解析器，用于一些优化的场景
   * 5. 产生插件数组，优先vite内部插件，再才是用户插件，依次顺序都是[pre,normal,post]
   */
  const config = await resolveConfig(inlineConfig, 'serve')

  const { root, server: serverConfig } = config
  // https相关配置的加载
  const httpsOptions = await resolveHttpsConfig(config.server.https)
  const { middlewareMode } = serverConfig
  // 解析chokidar配置
  const resolvedWatchOptions = resolveChokidarOptions(config, {
    disableGlobbing: true,
    ...serverConfig.watch,
  })
  /**
   * 创建Connect中间件服务
   */
  const middlewares = connect() as Connect.Server
  /**
   * middlewareMode: 完全控制服务器
   * https://cn.vitejs.dev/config/server-options.html#server-middlewaremode
   */
  const httpServer = middlewareMode
    ? null
    : await resolveHttpServer(serverConfig, middlewares, httpsOptions)
  // hmr相关
  const ws = createWebSocketServer(httpServer, config, httpsOptions)

  if (httpServer)
    setClientErrorHandler(httpServer, config.logger)
  // 通过chokidar监听文件更改
  const watcher = chokidar.watch(
    // config file dependencies and env file might be outside of root
    [root, ...config.configFileDependencies, config.envDir],
    resolvedWatchOptions,
  ) as FSWatcher
  /**
   * 创建模块依赖关系视图，用来描述模块之间互相依赖的关系，其中每个模块包含 id、url、file 标示，
   * importer 模块引入了哪些模块、importedModules 被那些模块所引用 transformResult 包含 code、map、etag
   */
  const moduleGraph: ModuleGraph = new ModuleGraph((url, ssr) =>
    container.resolveId(url, undefined, { ssr }),
  )
  // 创建插件容器，其中比较重要的钩子：buildStart、resolveId、load、transform
  const container = await createPluginContainer(config, moduleGraph, watcher)
  const closeHttpServer = createServerCloseFn(httpServer)

  let exitProcess: () => void
  /**
   * 创建server对象
   */
  const server: ViteDevServer = {
    config,
    middlewares,
    httpServer,
    watcher,
    pluginContainer: container,
    ws,
    moduleGraph,
    resolvedUrls: null, // will be set on listen
    ssrTransform(
      code: string,
      inMap: SourceMap | null,
      url: string,
      originalCode = code,
    ) {
      return ssrTransform(code, inMap, url, originalCode, server.config)
    },
    transformRequest(url, options) {
      return transformRequest(url, server, options)
    },
    transformIndexHtml: null!, // to be immediately set
    async ssrLoadModule(url, opts?: { fixStacktrace?: boolean }) {
      if (isDepsOptimizerEnabled(config, true))
        await initDevSsrDepsOptimizer(config, server)

      if (config.legacy?.buildSsrCjsExternalHeuristics)
        await updateCjsSsrExternals(server)

      return ssrLoadModule(
        url,
        server,
        undefined,
        undefined,
        opts?.fixStacktrace,
      )
    },
    ssrFixStacktrace(e) {
      ssrFixStacktrace(e, moduleGraph)
    },
    ssrRewriteStacktrace(stack: string) {
      return ssrRewriteStacktrace(stack, moduleGraph)
    },
    async reloadModule(module) {
      if (serverConfig.hmr !== false && module.file)
        updateModules(module.file, [module], Date.now(), server)

    },
    async listen(port?: number, isRestart?: boolean) {
      await startServer(server, port)
      if (httpServer) {
        server.resolvedUrls = await resolveServerUrls(
          httpServer,
          config.server,
          config,
        )
        if (!isRestart && config.server.open)
          server.openBrowser()
      }
      return server
    },
    openBrowser() {
      const options = server.config.server
      const url
        = server.resolvedUrls?.local[0] ?? server.resolvedUrls?.network[0]
      if (url) {
        const path
          = typeof options.open === 'string'
            ? new URL(options.open, url).href
            : url

        _openBrowser(path, true, server.config.logger)
      }
      else {
        server.config.logger.warn('No URL available to open in browser')
      }
    },
    async close() {
      if (!middlewareMode) {
        process.off('SIGTERM', exitProcess)
        if (process.env.CI !== 'true')
          process.stdin.off('end', exitProcess)

      }
      await Promise.allSettled([
        watcher.close(),
        ws.close(),
        container.close(),
        getDepsOptimizer(server.config)?.close(),
        getDepsOptimizer(server.config, true)?.close(),
        closeHttpServer(),
      ])
      // Await pending requests. We throw early in transformRequest
      // and in hooks if the server is closing for non-ssr requests,
      // so the import analysis plugin stops pre-transforming static
      // imports and this block is resolved sooner.
      // During SSR, we let pending requests finish to avoid exposing
      // the server closed error to the users.
      while (server._pendingRequests.size > 0) {
        await Promise.allSettled(
          [...server._pendingRequests.values()].map(
            pending => pending.request,
          ),
        )
      }
      server.resolvedUrls = null
    },
    printUrls() {
      if (server.resolvedUrls) {
        printServerUrls(
          server.resolvedUrls,
          serverConfig.host,
          config.logger.info,
        )
      }
      else if (middlewareMode) {
        throw new Error('cannot print server URLs in middleware mode.')
      }
      else {
        throw new Error(
          'cannot print server URLs before server.listen is called.',
        )
      }
    },
    async restart(forceOptimize?: boolean) {
      if (!server._restartPromise) {
        server._forceOptimizeOnRestart = !!forceOptimize
        server._restartPromise = restartServer(server).finally(() => {
          server._restartPromise = null
          server._forceOptimizeOnRestart = false
        })
      }
      return server._restartPromise
    },

    _ssrExternals: null,
    _restartPromise: null,
    _importGlobMap: new Map(),
    _forceOptimizeOnRestart: false,
    _pendingRequests: new Map(),
    _fsDenyGlob: picomatch(config.server.fs.deny, { matchBase: true }),
    _shortcutsOptions: undefined,
  }
  
  /**
   * 这个方法用于在开发环境下转换 index.html 文件，默认注入一段客户端代码 /@vite/client ，
   * 用于在客户端创建 WebSocket，接收服务端热更新传递的消息
   */
  server.transformIndexHtml = createDevHtmlTransformFn(server)

  if (!middlewareMode) {
    exitProcess = async () => {
      try {
        await server.close()
      }
      finally {
        process.exit()
      }
    }
    process.once('SIGTERM', exitProcess)
    if (process.env.CI !== 'true')
      process.stdin.on('end', exitProcess)

  }

  const onHMRUpdate = async (file: string, configOnly: boolean) => {
    if (serverConfig.hmr !== false) {
      try {
        await handleHMRUpdate(file, server, configOnly)
      }
      catch (err) {
        ws.send({
          type: 'error',
          err: prepareError(err),
        })
      }
    }
  }

  const onFileAddUnlink = async (file: string) => {
    file = normalizePath(file)
    await handleFileAddUnlink(file, server)
    await onHMRUpdate(file, true)
  }

  watcher.on('change', async (file) => {
    file = normalizePath(file)
    // invalidate module graph cache on file change
    moduleGraph.onFileChange(file)

    await onHMRUpdate(file, false)
  })
  // 文件新增和删除操作
  watcher.on('add', onFileAddUnlink)
  watcher.on('unlink', onFileAddUnlink)

  ws.on('vite:invalidate', async ({ path, message }: InvalidatePayload) => {
    const mod = moduleGraph.urlToModuleMap.get(path)
    if (mod && mod.isSelfAccepting && mod.lastHMRTimestamp > 0) {
      config.logger.info(
        colors.yellow('hmr invalidate ')
          + colors.dim(path)
          + (message ? ` ${message}` : ''),
        { timestamp: true },
      )
      const file = getShortName(mod.file!, config.root)
      updateModules(
        file,
        [...mod.importers],
        mod.lastHMRTimestamp,
        server,
        true,
      )
    }
  })

  if (!middlewareMode && httpServer) {
    httpServer.once('listening', () => {
      // update actual port since this may be different from initial value
      serverConfig.port = (httpServer.address() as net.AddressInfo).port
    })
  }

  // apply server configuration hooks from plugins
  // 存储插件的configureServer的钩子函数
  const postHooks: ((() => void) | void)[] = []
  for (const hook of config.getSortedPluginHooks('configureServer'))
    postHooks.push(await hook(server))

  // Internal middlewares ------------------------------------------------------
  // 注册vite http服务内部中间件

  // request timer
  if (process.env.DEBUG)
    middlewares.use(timeMiddleware(root))

  // cors (enabled by default)
  const { cors } = serverConfig
  if (cors !== false)
    middlewares.use(corsMiddleware(typeof cors === 'boolean' ? {} : cors))

  // proxy
  const { proxy } = serverConfig
  if (proxy)
    middlewares.use(proxyMiddleware(httpServer, proxy, config))

  // base
  if (config.base !== '/')
    middlewares.use(baseMiddleware(server))
  // 支持dev开发期间，通过'/__open-in-editor'请求，调用编辑器打开相应代码文件
  // open in editor support
  middlewares.use('/__open-in-editor', launchEditorMiddleware())

  // ping request handler
  // Keep the named function. The name is visible in debug logs via `DEBUG=connect:dispatcher ...`
  // 对于服务器对于ping的请求的处理，即204 NO CONTENT
  middlewares.use((req, res, next) => {
    if (req.headers.accept === 'text/x-vite-ping')
      res.writeHead(204).end()

    else
      next()

  })

  // serve static files under /public
  // this applies before the transform middleware so that these files are served
  // as-is without transforms.
  /**
   * vite中的静态资源通过`sirv`这个包进行映射
   * 对于vite.confg.ts中的publicDir的静态资源目录进行映射
   * 必须在`transformMiddleware`之前，否则就会被`transformMiddleware`处理
   */
  if (config.publicDir) {
    middlewares.use(
      servePublicMiddleware(config.publicDir, config.server.headers),
    )
  }

  // main transform middleware
  // 响应请求之前，对请求的文件进行预处理
  middlewares.use(transformMiddleware(server))

  // serve static files
  // 处理链接root之外的相关静态文件相关，例如多项目情况
  middlewares.use(serveRawFsMiddleware(server))
  // 处理serve root路径下静态文件相关
  middlewares.use(serveStaticMiddleware(root, server))

  // html fallback
  // 单页面history模式下404的处理，即交由前端路由负责页面跳转
  if (config.appType === 'spa' || config.appType === 'mpa')
    middlewares.use(htmlFallbackMiddleware(root, config.appType === 'spa'))

  // run post config hooks
  // This is applied before the html middleware so that user middleware can
  // serve custom content instead of index.html.
  // 执行前面存储插件中的configureServer钩子，依次进行回调
  postHooks.forEach(fn => fn && fn())

  if (config.appType === 'spa' || config.appType === 'mpa') {
    // transform index.html
    // 用server.transformIndexHtml对html加工
    middlewares.use(indexHtmlMiddleware(server))

    // handle 404s
    // Keep the named function. The name is visible in debug logs via `DEBUG=connect:dispatcher ...`
    // 404处理
    middlewares.use((_, res) => {
      res.statusCode = 404
      res.end()
    })
  }

  // error handler
  // 异常处理，直接发送`ErrorOverlay`相关html字符串
  middlewares.use(errorMiddleware(server, middlewareMode))

  // httpServer.listen can be called multiple times
  // when port when using next port number
  // this code is to avoid calling buildStart multiple times
  let initingServer: Promise<void> | undefined
  let serverInited = false
  // 服务器初始化方法
  const initServer = async () => {
    if (serverInited)
      return
    if (initingServer)
      return initingServer

    initingServer = (async function () {
      await container.buildStart({})
      // start deps optimizer after all container plugins are ready
      if (isDepsOptimizerEnabled(config, false))
        await initDepsOptimizer(config, server)

      initingServer = undefined
      serverInited = true
    })()
    return initingServer
  }

  if (!middlewareMode && httpServer) {
    // overwrite listen to init optimizer before server start
    /**
     * 覆盖node原生httpServer监听端口的动作
     * 保存原有的行为，在基础上进行增强
     */
    const listen = httpServer.listen.bind(httpServer)
    httpServer.listen = (async (port: number, ...args: any[]) => {
      try {
        // ensure ws server started
        // 保证websocket已经启动
        ws.listen()
        // 初始化服务器（依赖预构建）
        await initServer()
      }
      catch (e) {
        httpServer.emit('error', e)
        return
      }
      // 监听http端口
      return listen(port, ...args)
    }) as any
  }
  else {
    // 使用用户自己创建的server，即不使用vite的默认server
    if (options.ws)
      ws.listen()
    // 初始化服务器（依赖预构建）
    await initServer()
  }
  // 返回对象
  return server
}
```
