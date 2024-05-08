import type { DefaultTheme } from 'vitepress'

export function sidebarVite(): DefaultTheme.SidebarItem[] {
  return [
    {
      text: '',
      collapsed: false,
      items: [
        { text: '启动服务器', link: '/vite/start-server' },
        { text: '访问服务器', link: '/vite/access-server' },
        { text: '转换HTML', link: '/vite/transform-html' },
        { text: '转换请求', link: '/vite/transform-request' },
      ],
    },
  ]
}
