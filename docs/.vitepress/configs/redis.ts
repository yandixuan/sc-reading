import type { DefaultTheme } from 'vitepress'

export function sidebarRedis(): DefaultTheme.SidebarItem[] {
  return [
    {
      text: '数据结构',
      collapsed: true,
      items: [
        { text: 'sds', link: '/redis/data-structure/sds' },
        { text: 'listpack', link: '/redis/data-structure/listpack' },
        { text: 'skiplist', link: '/redis/data-structure/skiplist' },
        { text: 'quicklist', link: '/redis/data-structure/quicklist' },
        { text: 'adlist', link: '/redis/data-structure/adlist' },
      ],
    },
    {
      text: '命令类型',
      collapsed: true,
      items: [
        { text: 'list', link: '/redis/command-type/list' },
        { text: 'zset', link: '/redis/command-type/zset' },
      ],
    },
    {
      text: 'server',
      link: '/redis/server/index',
      collapsed: true,
      items: [
        { text: 'header', link: '/redis/server/header' },
        { text: 'initServer', link: '/redis/server/initServer' },
        { text: 'initListeners', link: '/redis/server/initListeners' },
        { text: 'InitServerLast', link: '/redis/server/InitServerLast' },
        // { text: 'call', link: '/redis/server/call' },
        { text: 'beforeSleep', link: '/redis/server/beforeSleep' },
        { text: 'afterSleep', link: '/redis/server/afterSleep' },
      ],
    },
    {
      text: 'networking',
      collapsed: true,
      items: [
        { text: 'io', link: '/redis/networking/io' },
      ],
    },
    {
      text: 'other',
      collapsed: true,
      items: [
        { text: 'adlist', link: '/redis/adlist' },
        { text: 'sds', link: '/redis/sds' },
        { text: 'dict', link: '/redis/dict' },
        { text: 'ae_epoll', link: '/redis/ae_epoll' },
        { text: 'ae', link: '/redis/ae' },
        { text: 'anet', link: '/redis/anet' },
        { text: 'config', link: '/redis/config' },
        { text: 'connection', link: '/redis/connection' },
        { text: 'evict', link: '/redis/evict' },
        { text: 'networking', link: '/redis/networking' },
        { text: 'socket', link: '/redis/socket' },
        { text: 'zmalloc', link: '/redis/zmalloc' },
        { text: 'skiplist', link: '/redis/skiplist' },
        { text: 'listpack', link: '/redis/listpack' },
        { text: 't_zset', link: '/redis/t_zset' },
      ],
    },
  ]
}
