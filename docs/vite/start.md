# 启动vite server

根据[Vite](https://vitejs.dev/)官网的**Getting Started**，我们快速开启了一个**vue3**项目，在**package.json**的**scripts**中，仅一行`vite`就能启动dev server。package.json部分内容如下所示：

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc && vite build",
    "preview": "vite preview"
  }
}
```

定位到源码目录的`packages/vite`的[`package.json`](https://github.com/vitejs/vite/blob/main/packages/vite/package.json#L9)，就明白了**vite**命令直接调用的是`bin/vite.js`，[最终执行的都是`start`方法](https://github.com/vitejs/vite/blob/main/packages/vite/bin/vite.js#L47-L61)

```cjs
function start() {
  // 最终启动方式就是导入编译后的node cli，并且执行cli
  return import('../dist/node/cli.js')
}
```

## 执行CLI

[位于](https://github.com/vitejs/vite/blob/main/packages/vite/src/node/cli.ts#L14)，通过[`cac`](https://github.com/cacjs/cac)这个库去解析命令行参数，通过action选项执行具体操作，[位置](https://github.com/vitejs/vite/blob/main/packages/vite/src/node/cli.ts#L129-L207)

在action处便启动了本地服务器，如下：

```js
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

      if (!server.httpServer) {
        throw new Error('HTTP server not available')
      }

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
              } else {
                const inspector = await import('node:inspector').then(
                  (r) => r.default,
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
    } catch (e) {
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
