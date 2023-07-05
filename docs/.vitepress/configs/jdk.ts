import type { DefaultTheme } from 'vitepress'

export function sidebarJdk(): DefaultTheme.SidebarItem[] {
  return [
    {
      text: 'util',
      collapsed: true,
      items: [
        { text: 'ArrayDeque', link: '/java/util/ArrayDeque' },
        { text: 'DualPivotQuicksort', link: '/java/util/DualPivotQuicksort' },
        { text: 'ArrayList', link: '/java/util/ArrayList' },
        { text: 'HashMap', link: '/java/util/HashMap' },
        { text: 'PriorityQueue', link: '/java/util/PriorityQueue' },
        { text: 'TimSort', link: '/java/util/TimSort' },
        { text: 'TreeNode', link: '/java/util/TreeNode' },
      ],
    },
    {
      text: 'concurrent',
      collapsed: true,
      items: [
        { text: 'AbstractExecutorService', link: '/java/util/concurrent/AbstractExecutorService' },
        { text: 'AbstractQueuedSynchronizer', link: '/java/util/concurrent/AbstractQueuedSynchronizer' },
        { text: 'ConcurrentHashMap', link: '/java/util/concurrent/ConcurrentHashMap' },
        { text: 'ExecutorService', link: '/java/util/concurrent/ExecutorService' },
        { text: 'TreeBin', link: '/java/util/concurrent/TreeBin' },
      ],
    },

  ]
}
