// 译境品牌 logo — 六边形编织图案，brand 橙色
// 用法: <Logo size={36} />
// 透明背景的 PNG，可以直接放在任何 surface 上而不会出现白色方块。

import Image from 'next/image'

type Props = {
  /** 渲染大小（正方形 px），默认 36 */
  size?: number
  /** 额外 className（如 group-hover:scale-105 之类） */
  className?: string
  /** 无障碍：替代文本，默认 "译境" */
  alt?: string
  /** 是否为优先加载（页眉、首屏 logo 建议 priority） */
  priority?: boolean
}

export default function Logo({ size = 36, className, alt = '译境', priority }: Props) {
  // 用 128 资源给小尺寸（更省带宽），≥80 时用 512 保证清晰度
  const src = size >= 80 ? '/brand/logo.png' : '/brand/logo-128.png'

  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      priority={priority}
      className={className}
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  )
}
