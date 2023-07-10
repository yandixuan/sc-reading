import type { DefaultTheme } from 'vitepress'

export function sidebarFeign(): DefaultTheme.SidebarItem[] {
  return [
    {
      text: '',
      collapsed: false,
      items: [
        { text: 'Feign', link: '/feign/index' },
      ],
    },
    {
      text: '动态代理',
      collapsed: true,
      link: '/feign/invocation/',
      items: [
        { text: 'ReflectiveFeign', link: '/feign/invocation/ReflectiveFeign' },
        { text: 'FeignInvocationHandler', link: '/feign/invocation/FeignInvocationHandler' },
        { text: 'ParseHandlersByName', link: '/feign/invocation/ParseHandlersByName' },
        { text: 'SynchronousMethodHandler', link: '/feign/invocation/SynchronousMethodHandler' },
      ],
    },
    {
      text: '合约',
      collapsed: true,
      link: '/feign/contract/',
      items: [
        { text: 'BaseContract', link: '/feign/Contract/BaseContract' },
        { text: 'DeclarativeContract', link: '/feign/Contract/DeclarativeContract' },
        { text: 'Default', link: '/feign/Contract/Default' },
      ],
    },
    {
      text: '客户端',
      collapsed: true,
      link: '/feign/client/',
      items: [
        { text: 'Default', link: '/feign/Client/Default' },
      ],
    },
  ]
}
