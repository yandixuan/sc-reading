import type { DefaultTheme } from 'vitepress'

export function sidebarNetty(): DefaultTheme.SidebarItem[] {
  return [
    {
      text: 'common',
      collapsed: true,
      items: [
        { text: 'AbstractEventExecutor', link: '/netty/common/AbstractEventExecutor' },
        { text: 'AbstractEventExecutorGroup', link: '/netty/common/AbstractEventExecutorGroup' },
        { text: 'DefaultPriorityQueue', link: '/netty/common/DefaultPriorityQueue' },
        { text: 'DefaultPromise', link: '/netty/common/DefaultPromise' },
        { text: 'EventExecutor', link: '/netty/common/EventExecutor' },
        { text: 'EventExecutorGroup', link: '/netty/common/EventExecutorGroup' },
        { text: 'Future', link: '/netty/common/Future' },
        { text: 'MultithreadEventExecutorGroup', link: '/netty/common/MultithreadEventExecutorGroup' },
        { text: 'Promise', link: '/netty/common/Promise' },
        { text: 'SingleThreadEventExecutor', link: '/netty/common/SingleThreadEventExecutor' },
      ],
    },
    {
      text: 'transport',
      collapsed: true,
      items: [
        { text: 'AbstractBootstrap', link: '/netty/transport/AbstractBootstrap' },
        { text: 'AbstractChannel', link: '/netty/transport/AbstractChannel' },
        { text: 'AbstractChannelHandlerContext', link: '/netty/transport/AbstractChannelHandlerContext' },
        { text: 'AbstractEventLoop', link: '/netty/transport/AbstractEventLoop' },
        { text: 'AbstractEventLoopGroup', link: '/netty/transport/AbstractEventLoopGroup' },
        { text: 'AbstractNioChannel', link: '/netty/transport/AbstractNioChannel' },
        { text: 'AbstractNioMessageChannel', link: '/netty/transport/AbstractNioMessageChannel' },
        { text: 'Channel', link: '/netty/transport/Channel' },
        { text: 'ChannelPipeline', link: '/netty/transport/ChannelPipeline' },
        { text: 'DefaultChannelPipeline', link: '/netty/transport/DefaultChannelPipeline' },
        { text: 'EventLoop', link: '/netty/transport/EventLoop' },
        { text: 'EventLoopGroup', link: '/netty/transport/EventLoopGroup' },
        { text: 'NioEventLoop', link: '/netty/transport/NioEventLoop' },
        { text: 'ServerBootstrap', link: '/netty/transport/ServerBootstrap' },
      ],
    },
  ]
}
