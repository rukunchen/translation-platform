'use client'

import type { FormEvent } from 'react'
import { forwardRef, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { hasSupabaseBrowserEnv, supabase } from '@/lib/supabase'
import Logo from '@/components/Logo'

type IconKind =
  | 'ai'
  | 'arrow'
  | 'book'
  | 'bookmark'
  | 'chart'
  | 'check'
  | 'document'
  | 'folder'
  | 'library'
  | 'lock'
  | 'mail'
  | 'map'
  | 'mind'
  | 'review'
  | 'search'
  | 'translate'
  | 'upload'
  | 'users'

const navItems = [
  { label: '平台说明', target: 'platform-intro' },
  { label: '能力地图', target: 'capability-map' },
  { label: '协作方式', target: 'workflow-loop' },
  { label: '授权入口', target: 'login-entry' },
]

const atlasColumns: Array<{ label: string; meta: string; icon: IconKind }> = [
  { label: '原文', meta: 'Source', icon: 'book' },
  { label: '初译', meta: 'Draft', icon: 'translate' },
  { label: '审校译文', meta: 'Reviewed', icon: 'check' },
]

const atlasRows = [
  {
    source: '真君拂尘去，仙鹤随云行。',
    draft: 'The Lord sweeps his whisk away, the crane followed the clouds.',
    reviewed: 'The Lord flicked dust aside; the crane rode the clouds.',
  },
  {
    source: '人间何处不相逢，一笑泯恩仇。',
    draft: 'Where in this world do we not meet, A smile dissolves grievances.',
    reviewed: 'In this world we all meet somewhere, a smile lets grudges fade.',
  },
  {
    source: '长风破浪会有时，直挂云帆济沧海。',
    draft: 'When the strong wind breaks the waves, We will sail the vast sea.',
    reviewed: 'When the gale breaks through the waves, We’ll hoist the sail and cross the deep sea.',
  },
]

const capabilityNodes: Array<{
  key: string
  title: string
  body: string
  icon: IconKind
  className: string
}> = [
  {
    key: 'A',
    title: '项目协作',
    body: '文档分工、成员角色、进度与交付',
    icon: 'users',
    className: 'lg:left-[12%] lg:top-[24%]',
  },
  {
    key: 'B',
    title: '术语资产',
    body: '术语提取、项目匹配、一致性复盘',
    icon: 'library',
    className: 'lg:left-[42%] lg:top-[10%]',
  },
  {
    key: 'C',
    title: 'AI 对照实验',
    body: '多模型候选译文、采用记录、实验沉淀',
    icon: 'ai',
    className: 'lg:right-[9%] lg:top-[24%]',
  },
  {
    key: 'D',
    title: '译训库',
    body: 'CATTI/翻译练习、AI 参考译文、表达分析',
    icon: 'document',
    className: 'lg:left-[9%] lg:bottom-[12%]',
  },
  {
    key: 'E',
    title: '精读与前沿文献',
    body: '精读摘录、AI 解释、前沿文献卡片',
    icon: 'book',
    className: 'lg:left-[40%] lg:bottom-[5%]',
  },
  {
    key: 'F',
    title: '思维导图与论文写作',
    body: '知识结构、论文项目、模板与文献库',
    icon: 'mind',
    className: 'lg:right-[6%] lg:bottom-[12%]',
  },
]

const loopSteps: Array<{ title: string; body: string; icon: IconKind }> = [
  { title: '原文输入', body: '导入文档或粘贴文本，建立项目语境', icon: 'upload' },
  { title: '句段翻译', body: '高效翻译与 AI 辅助，生成候选译文', icon: 'translate' },
  { title: '审校定稿', body: '协同审核、批注讨论，输出高质量译文', icon: 'search' },
  { title: '术语沉淀', body: '提取术语并沉淀资产，保障一致性与复用', icon: 'bookmark' },
  { title: '训练复盘', body: '译训与对照实验，沉淀经验与方法论', icon: 'chart' },
  { title: '论文写作', body: '结构化整合资料，完成研究与写作输出', icon: 'document' },
]

const archiveScenes = [
  {
    index: '01',
    title: '原典研译',
    body: '回到文本源头，精读细研，诠释原义，守护文脉。',
    image: '/landing/archive-classics.png',
  },
  {
    index: '02',
    title: '文明互鉴',
    body: '跨越语言与文化，互学互鉴，成就更深远的理解。',
    image: '/landing/archive-encounter.png',
  },
  {
    index: '03',
    title: '文化远航',
    body: '让经典与思想远航世界，让知识展现更多可能。',
    image: '/landing/archive-voyage.png',
  },
  {
    index: '04',
    title: '共识审校',
    body: '多方协作，审校求证，凝聚共识，精准传承。',
    image: '/landing/archive-review.png',
  },
]

function friendlyAuthError(message: string) {
  if (/invalid login credentials/i.test(message)) return '邮箱或密码错误，请重试。'
  if (/email not confirmed/i.test(message)) return '邮箱尚未验证，请先打开验证邮件完成确认后再登录。'
  if (/password/i.test(message)) return '密码不符合要求，请确认至少 6 位。'
  return message || '操作失败，请稍后重试。'
}

function loginDestination(): string {
  if (typeof window === 'undefined') return '/dashboard'

  const next = new URLSearchParams(window.location.search).get('next')
  return next && next.startsWith('/') && !next.startsWith('//')
    ? next
    : '/dashboard'
}

export default function LoginPage() {
  const router = useRouter()
  const emailRef = useRef<HTMLInputElement>(null)
  const referenceMountainRef = useRef<HTMLDivElement>(null)
  const atlasPanelRef = useRef<HTMLDivElement>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return
      if (data.session) {
        router.replace(loginDestination())
        return
      }
      if (error && /refresh token|invalid token|expired/i.test(error.message)) {
        void supabase.auth.signOut()
      }
    })
    return () => { alive = false }
  }, [router])

  useEffect(() => {
    const updateMountainEdge = () => {
      const mountain = referenceMountainRef.current
      const atlas = atlasPanelRef.current
      if (!mountain || !atlas) return

      const scrollTop = window.scrollY || document.documentElement.scrollTop || 0
      const mountainTop = mountain.getBoundingClientRect().top + scrollTop
      const atlasTop = atlas.getBoundingClientRect().top + scrollTop
      const height = Math.max(240, Math.min(620, atlasTop - mountainTop + 6))

      document.documentElement.style.setProperty('--yijing-atlas-top-edge', `${Math.round(atlasTop)}px`)
      document.documentElement.style.setProperty('--yijing-reference-mountain-height', `${Math.round(height)}px`)
    }

    updateMountainEdge()
    const frame = window.requestAnimationFrame(updateMountainEdge)
    const timeout = window.setTimeout(updateMountainEdge, 250)
    window.addEventListener('resize', updateMountainEdge)

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateMountainEdge)
      : null
    if (resizeObserver) {
      if (atlasPanelRef.current) resizeObserver.observe(atlasPanelRef.current)
      if (referenceMountainRef.current) resizeObserver.observe(referenceMountainRef.current)
    }

    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timeout)
      window.removeEventListener('resize', updateMountainEdge)
      resizeObserver?.disconnect()
      document.documentElement.style.removeProperty('--yijing-atlas-top-edge')
      document.documentElement.style.removeProperty('--yijing-reference-mountain-height')
    }
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(friendlyAuthError(error.message))
    else router.push(loginDestination())
    setLoading(false)
  }

  const focusLogin = () => {
    emailRef.current?.focus()
  }

  const scrollTo = (target: string) => {
    if (target === 'login-entry') {
      focusLogin()
      return
    }
    document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7f1e6] text-[#17120f]">
      <style>{`
        @keyframes yijingMistDrift {
          0% { transform: translate3d(-2.5%, 0, 0) scale(1); opacity: 0.38; }
          50% { transform: translate3d(2.2%, -1.1%, 0) scale(1.025); opacity: 0.56; }
          100% { transform: translate3d(-2.5%, 0, 0) scale(1); opacity: 0.38; }
        }

        @keyframes yijingMountainBreath {
          0% { transform: translate3d(1.6%, 0, 0) scale(1.02); opacity: 0.34; }
          50% { transform: translate3d(-1.6%, 0.8%, 0) scale(1.04); opacity: 0.48; }
          100% { transform: translate3d(1.6%, 0, 0) scale(1.02); opacity: 0.34; }
        }

        @keyframes yijingMountainFloatFar {
          0% { transform: translate3d(1.5%, 0, 0) scale(1.01); opacity: 0.58; }
          50% { transform: translate3d(-1.4%, 0.8%, 0) scale(1.035); opacity: 0.72; }
          100% { transform: translate3d(1.5%, 0, 0) scale(1.01); opacity: 0.58; }
        }

        @keyframes yijingMountainFloatNear {
          0% { transform: translate3d(-1.2%, 0.6%, 0) scale(1.02); opacity: 0.42; }
          50% { transform: translate3d(1.6%, -0.4%, 0) scale(1.045); opacity: 0.58; }
          100% { transform: translate3d(-1.2%, 0.6%, 0) scale(1.02); opacity: 0.42; }
        }

        @keyframes yijingMistRibbonFlow {
          0% { transform: translate3d(-5%, 0, 0) scaleX(1); opacity: 0.42; }
          50% { transform: translate3d(5%, -1.2%, 0) scaleX(1.1); opacity: 0.72; }
          100% { transform: translate3d(-5%, 0, 0) scaleX(1); opacity: 0.42; }
        }

        @keyframes yijingCloudSlide {
          0% { transform: translate3d(-14%, 0, 0) scaleX(0.94); opacity: 0.32; }
          45% { transform: translate3d(13%, -2%, 0) scaleX(1.1); opacity: 0.72; }
          100% { transform: translate3d(-14%, 0, 0) scaleX(0.94); opacity: 0.32; }
        }

        @keyframes yijingCloudSlideAlt {
          0% { transform: translate3d(12%, 1.2%, 0) scaleX(1.06); opacity: 0.28; }
          50% { transform: translate3d(-13%, -1.4%, 0) scaleX(0.92); opacity: 0.64; }
          100% { transform: translate3d(12%, 1.2%, 0) scaleX(1.06); opacity: 0.28; }
        }

        @keyframes yijingRouteGlow {
          0% { opacity: 0.35; stroke-dashoffset: 0; }
          50% { opacity: 0.82; stroke-dashoffset: -22; }
          100% { opacity: 0.35; stroke-dashoffset: -44; }
        }

        @keyframes yijingReferenceMountainDrift {
          0% { transform: translate3d(1.2%, 0, 0) scale(1.04); opacity: 0.48; }
          50% { transform: translate3d(-1.2%, -1.4%, 0) scale(1.08); opacity: 0.64; }
          100% { transform: translate3d(1.2%, 0, 0) scale(1.04); opacity: 0.48; }
        }

        @keyframes yijingReferenceBirdFlight {
          0% {
            transform: translate3d(94vw, 7vh, 0) scale(0.62) rotate(-7deg);
            opacity: 0;
          }
          8% {
            transform: translate3d(86vw, 12vh, 0) scale(0.7) rotate(-9deg);
            opacity: 0.38;
          }
          18% {
            transform: translate3d(74vw, 22vh, 0) scale(0.84) rotate(-14deg);
            opacity: 0.56;
          }
          32% {
            transform: translate3d(82vw, 36vh, 0) scale(0.98) rotate(8deg);
            opacity: 0.62;
          }
          46% {
            transform: translate3d(58vw, 50vh, 0) scale(1.16) rotate(-15deg);
            opacity: 0.66;
          }
          60% {
            transform: translate3d(66vw, 64vh, 0) scale(1.28) rotate(9deg);
            opacity: 0.64;
          }
          75% {
            transform: translate3d(36vw, 78vh, 0) scale(1.42) rotate(-16deg);
            opacity: 0.54;
          }
          90% {
            transform: translate3d(10vw, 90vh, 0) scale(1.5) rotate(-19deg);
            opacity: 0.26;
          }
          100% {
            transform: translate3d(-12vw, 98vh, 0) scale(1.5) rotate(-14deg);
            opacity: 0;
          }
        }

        @keyframes yijingReferenceBirdFlightUpper {
          0% {
            transform: translate3d(96vw, 5vh, 0) scale(0.52) rotate(-5deg);
            opacity: 0;
          }
          8% {
            transform: translate3d(88vw, 9vh, 0) scale(0.6) rotate(-8deg);
            opacity: 0.3;
          }
          20% {
            transform: translate3d(70vw, 20vh, 0) scale(0.78) rotate(-13deg);
            opacity: 0.42;
          }
          34% {
            transform: translate3d(78vw, 34vh, 0) scale(0.94) rotate(8deg);
            opacity: 0.48;
          }
          50% {
            transform: translate3d(52vw, 52vh, 0) scale(1.14) rotate(-14deg);
            opacity: 0.5;
          }
          64% {
            transform: translate3d(58vw, 66vh, 0) scale(1.26) rotate(7deg);
            opacity: 0.46;
          }
          80% {
            transform: translate3d(28vw, 82vh, 0) scale(1.42) rotate(-17deg);
            opacity: 0.36;
          }
          92% {
            transform: translate3d(8vw, 92vh, 0) scale(1.5) rotate(-14deg);
            opacity: 0.18;
          }
          100% {
            transform: translate3d(-14vw, 99vh, 0) scale(1.5) rotate(-10deg);
            opacity: 0;
          }
        }

        @keyframes yijingInkBoatVoyage {
          0% {
            transform: translate3d(96vw, 8px, 0) scaleX(-1) scale(0.68);
            opacity: 0;
            filter: blur(2px) drop-shadow(0 8px 14px rgba(70, 56, 39, 0.12));
          }
          12% {
            transform: translate3d(82vw, 4px, 0) scaleX(-1) scale(0.72);
            opacity: 0.42;
            filter: blur(0.9px) drop-shadow(0 8px 14px rgba(70, 56, 39, 0.14));
          }
          34% {
            transform: translate3d(58vw, 0, 0) scaleX(-1) scale(0.8);
            opacity: 0.72;
            filter: blur(0.12px) drop-shadow(0 9px 15px rgba(70, 56, 39, 0.16));
          }
          58% {
            transform: translate3d(34vw, 2px, 0) scaleX(-1) scale(0.82);
            opacity: 0.7;
            filter: blur(0.1px) drop-shadow(0 9px 15px rgba(70, 56, 39, 0.16));
          }
          70% {
            transform: translate3d(24vw, 4px, 0) scaleX(-1) scale(0.76);
            opacity: 0.2;
            filter: blur(1.4px) drop-shadow(0 8px 14px rgba(70, 56, 39, 0.08));
          }
          78% {
            transform: translate3d(18vw, 6px, 0) scaleX(-1) scale(0.7);
            opacity: 0;
            filter: blur(3.4px) drop-shadow(0 8px 14px rgba(70, 56, 39, 0));
          }
          100% {
            transform: translate3d(18vw, 6px, 0) scaleX(-1) scale(0.7);
            opacity: 0;
            filter: blur(3.4px) drop-shadow(0 8px 14px rgba(70, 56, 39, 0));
          }
        }

        @keyframes yijingBirdWingLeft {
          0%, 100% { transform: rotate(-24deg) translateY(0); }
          42% { transform: rotate(24deg) translateY(1px); }
          68% { transform: rotate(5deg) translateY(-0.5px); }
        }

        @keyframes yijingBirdWingRight {
          0%, 100% { transform: rotate(24deg) translateY(0); }
          42% { transform: rotate(-24deg) translateY(1px); }
          68% { transform: rotate(-5deg) translateY(-0.5px); }
        }

        @keyframes yijingBirdBodyFloat {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); }
          50% { transform: translate3d(0, -2px, 0) rotate(-1.5deg); }
        }

        .yijing-mist-layer {
          animation: yijingMistDrift 24s ease-in-out infinite;
          will-change: transform, opacity;
        }

        .yijing-mountain-layer {
          animation: yijingMountainBreath 30s ease-in-out infinite;
          will-change: transform, opacity;
        }

        .yijing-mountain-scene {
          position: absolute;
          z-index: 1;
          pointer-events: none;
          overflow: visible;
          mix-blend-mode: multiply;
        }

        .yijing-reference-mountain {
          position: absolute;
          z-index: 2;
          top: -46px;
          right: -7vw;
          width: clamp(980px, 76vw, 1280px);
          height: clamp(650px, 52vw, 840px);
          pointer-events: none;
          background-image: url('/landing/c-bg-hero-landscape.png');
          background-position: center top;
          background-repeat: no-repeat;
          background-size: cover;
          filter: saturate(0.84) contrast(0.96) brightness(1.04);
          mix-blend-mode: multiply;
          opacity: 0.72;
          mask-image: linear-gradient(90deg, transparent 0%, #000 16%, #000 100%), linear-gradient(180deg, transparent 0%, #000 12%, #000 82%, transparent 100%);
          mask-composite: intersect;
          -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 16%, #000 100%), linear-gradient(180deg, transparent 0%, #000 12%, #000 82%, transparent 100%);
          -webkit-mask-composite: source-in;
          visibility: hidden;
          opacity: 0;
        }

        .yijing-reference-mountain::before {
          content: '';
          position: absolute;
          inset: -14% -6% -18% -34%;
          pointer-events: none;
          background:
            linear-gradient(90deg, rgba(247, 241, 230, 0.9) 0%, rgba(247, 241, 230, 0.54) 24%, rgba(247, 241, 230, 0) 50%),
            linear-gradient(180deg, rgba(247, 241, 230, 0.78) 0%, rgba(247, 241, 230, 0.18) 16%, rgba(247, 241, 230, 0) 54%, rgba(247, 241, 230, 0.62) 100%);
          mix-blend-mode: screen;
          opacity: 0.82;
        }

        .yijing-reference-mountain::after {
          content: none;
          position: absolute;
          left: -20%;
          right: -8%;
          top: 34%;
          bottom: 0;
          pointer-events: none;
          background:
            radial-gradient(ellipse at 78% 2%, rgba(58, 71, 65, 0.22), rgba(102, 111, 101, 0.15) 36%, transparent 64%),
            linear-gradient(180deg, rgba(76, 88, 80, 0.18), rgba(132, 136, 120, 0.14) 42%, rgba(209, 200, 181, 0.16) 70%, rgba(245, 237, 221, 0.08) 100%),
            radial-gradient(ellipse at 54% 86%, rgba(236, 226, 207, 0.56), transparent 70%);
          filter: blur(6px);
          opacity: 0.95;
          transform: skewX(-4deg);
          transform-origin: 50% 0;
        }

        .yijing-reference-birds {
          position: absolute;
          z-index: 90;
          top: 0;
          left: 0;
          width: 100%;
          height: 112svh;
          pointer-events: none;
          overflow: visible;
          mix-blend-mode: normal;
        }

        .yijing-bird-swarm {
          position: absolute;
          left: 0;
          top: 0;
          width: clamp(340px, 27vw, 520px);
          height: 192px;
          color: rgba(39, 42, 38, 0.58);
          filter: blur(0.08px) drop-shadow(0 1px 2px rgba(255, 250, 240, 0.58));
          opacity: 0;
          overflow: visible;
          will-change: transform, opacity;
          animation: yijingReferenceBirdFlight 48s linear infinite;
        }

        .yijing-bird-swarm--secondary {
          color: rgba(39, 42, 38, 0.42);
          animation-delay: -24s;
        }

        .yijing-bird-swarm--upper-route {
          width: clamp(300px, 22vw, 440px);
          height: 150px;
          color: rgba(39, 42, 38, 0.36);
          filter: blur(0.12px) drop-shadow(0 1px 2px rgba(255, 250, 240, 0.5));
          animation: yijingReferenceBirdFlightUpper 56s linear infinite;
          animation-delay: -13s;
        }

        .yijing-ink-boat {
          position: absolute;
          z-index: 4;
          top: calc(100% + clamp(8px, 2.1vh, 26px));
          left: 0;
          width: clamp(52px, 4.8vw, 86px);
          height: auto;
          pointer-events: none;
          color: rgba(70, 68, 62, 0.6);
          opacity: 0;
          mix-blend-mode: normal;
          filter: drop-shadow(0 8px 14px rgba(49, 45, 39, 0.12));
          transform-origin: 50% 50%;
          will-change: transform, opacity, filter;
          animation: yijingInkBoatVoyage 82s ease-in-out infinite;
          animation-delay: -18s;
          mask-image: linear-gradient(90deg, transparent 0%, rgba(0, 0, 0, 0.08) 10%, #000 24%, #000 100%);
          -webkit-mask-image: linear-gradient(90deg, transparent 0%, rgba(0, 0, 0, 0.08) 10%, #000 24%, #000 100%);
        }

        .yijing-bird-flutter {
          animation: yijingBirdBodyFloat 1.8s ease-in-out infinite;
          transform-box: fill-box;
          transform-origin: center;
          will-change: transform;
        }

        .yijing-bird-wing {
          transform-box: fill-box;
          will-change: transform;
        }

        .yijing-bird-wing--left {
          animation: yijingBirdWingLeft 0.72s ease-in-out infinite;
          transform-origin: 100% 50%;
        }

        .yijing-bird-wing--right {
          animation: yijingBirdWingRight 0.72s ease-in-out infinite;
          transform-origin: 0% 50%;
        }

        .yijing-bird-body {
          fill: currentColor;
        }

        .yijing-mountain-scene--hero {
          display: none;
        }

        .yijing-mountain-scene--lower {
          top: 880px;
          left: -130px;
          width: min(1520px, 112vw);
          height: 640px;
          opacity: 0.58;
        }

        .yijing-mountain-scene svg {
          display: block;
          width: 100%;
          height: 100%;
        }

        .yijing-mountain-scene__far {
          animation: yijingMountainFloatFar 34s ease-in-out infinite;
          transform-origin: 56% 58%;
          will-change: transform, opacity;
        }

        .yijing-mountain-scene__near {
          animation: yijingMountainFloatNear 27s ease-in-out infinite;
          transform-origin: 48% 64%;
          will-change: transform, opacity;
        }

        .yijing-mountain-scene__mist {
          animation: yijingMistRibbonFlow 16s ease-in-out infinite;
          transform-origin: 50% 50%;
          will-change: transform, opacity;
        }

        .yijing-mountain-scene__cloud {
          animation: yijingCloudSlide 10s ease-in-out infinite;
          transform-origin: 50% 50%;
          will-change: transform, opacity;
        }

        .yijing-mountain-scene__cloud--alt {
          animation: yijingCloudSlideAlt 13s ease-in-out infinite;
        }

        .yijing-mountain-scene__route {
          animation: yijingRouteGlow 12s ease-in-out infinite;
          will-change: opacity, stroke-dashoffset;
        }

        .yijing-atlas-panel {
          transform: none;
          transform-origin: 50% 55%;
        }

        .yijing-atlas-panel-back {
          transform: translate(18px, 18px) scale(0.985);
        }

        .yijing-ink-mask {
          mask-image: radial-gradient(ellipse at center, #000 50%, transparent 78%);
          -webkit-mask-image: radial-gradient(ellipse at center, #000 50%, transparent 78%);
        }

        .yijing-home-shell {
          position: relative;
          z-index: 20;
          max-width: 1560px;
          margin: 0 auto;
          padding: 28px clamp(24px, 5vw, 80px) 40px;
        }

        .yijing-home-header {
          position: relative;
          z-index: 80;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 32px;
          opacity: 1;
          filter: none;
          isolation: isolate;
        }

        .yijing-logo-button {
          display: flex;
          align-items: center;
          gap: 12px;
          opacity: 1;
          filter: none;
          color: #171512;
        }

        .yijing-nav {
          align-items: center;
          gap: 48px;
          color: #201c18;
          opacity: 1;
          filter: none;
          text-shadow: 0 1px 0 rgba(255, 250, 242, 0.62);
        }

        .yijing-nav-item {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .yijing-nav-item::before {
          content: '';
          display: inline-block;
          flex: 0 0 auto;
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #d46f37;
          box-shadow: 0 0 0 4px rgba(212, 111, 55, 0.12);
        }

        .yijing-nav-item:nth-child(2)::before {
          width: 5px;
          height: 15px;
          border-radius: 999px;
          background: linear-gradient(180deg, #e08a4f, #c75d2b);
          box-shadow: 0 4px 12px rgba(199, 93, 43, 0.18);
        }

        .yijing-nav-item:nth-child(3)::before {
          width: 9px;
          height: 9px;
          border-radius: 2px;
          transform: rotate(45deg);
          background: #d46f37;
          box-shadow: 0 0 0 4px rgba(212, 111, 55, 0.1);
        }

        .yijing-nav-item:nth-child(4)::before {
          width: 14px;
          height: 14px;
          border: 1.5px solid #d46f37;
          border-radius: 5px;
          background: rgba(255, 249, 240, 0.42);
          box-shadow: inset 0 0 0 3px rgba(212, 111, 55, 0.08);
        }

        .yijing-header-sun {
          position: relative;
          width: clamp(48px, 4.6vw, 64px);
          height: clamp(48px, 4.6vw, 64px);
          flex: 0 0 auto;
          pointer-events: none;
          border-radius: 999px;
          background:
            radial-gradient(circle at 45% 42%, rgba(255, 203, 121, 0.7) 0 20%, rgba(224, 96, 40, 0.54) 48%, rgba(157, 66, 36, 0.34) 70%, rgba(157, 66, 36, 0) 79%),
            conic-gradient(from 24deg, rgba(175, 75, 39, 0.12), rgba(255, 174, 92, 0.2), rgba(143, 61, 35, 0.1), rgba(255, 199, 123, 0.18), rgba(175, 75, 39, 0.12));
          box-shadow:
            0 16px 34px rgba(171, 82, 42, 0.12),
            0 4px 12px rgba(126, 75, 45, 0.08);
          filter: saturate(0.98) blur(0.12px);
          mix-blend-mode: multiply;
          opacity: 0.72;
        }

        .yijing-header-sun::before,
        .yijing-header-sun::after {
          content: '';
          position: absolute;
          border-radius: inherit;
          pointer-events: none;
        }

        .yijing-header-sun::before {
          inset: -12px;
          background:
            radial-gradient(circle at 50% 50%, rgba(220, 111, 52, 0.16), rgba(220, 111, 52, 0.06) 48%, rgba(220, 111, 52, 0) 74%);
          filter: blur(8px);
        }

        .yijing-header-sun::after {
          inset: 5px;
          clip-path: polygon(50% 0%, 59% 4%, 69% 2%, 78% 8%, 88% 16%, 94% 28%, 100% 42%, 96% 54%, 99% 66%, 91% 80%, 79% 90%, 67% 94%, 55% 100%, 42% 96%, 30% 99%, 18% 91%, 8% 81%, 3% 68%, 0% 54%, 4% 40%, 2% 29%, 10% 17%, 21% 8%, 36% 5%);
          background:
            radial-gradient(circle at 38% 32%, rgba(255, 236, 188, 0.24), transparent 24%),
            radial-gradient(circle at 67% 68%, rgba(113, 49, 32, 0.12), transparent 32%),
            radial-gradient(circle at 50% 50%, transparent 46%, rgba(118, 50, 31, 0.11) 63%, transparent 72%);
          box-shadow: inset 0 -10px 16px rgba(117, 54, 34, 0.08);
        }

        .yijing-seal {
          display: none;
          width: 50px;
          height: 58px;
          align-items: center;
          justify-content: center;
          border-radius: 15px;
          line-height: 1.12;
        }

        .yijing-hero-grid {
          --yijing-hero-stage-height: 620px;
          display: grid;
          align-items: center;
          min-height: 720px;
          gap: 48px;
          padding: 70px 0 86px;
        }

        .yijing-hero-copy {
          width: 100%;
          max-width: 820px;
        }

        .yijing-eyebrow {
          margin-bottom: 20px;
        }

        .yijing-headline {
          max-width: 860px;
        }

        .yijing-hero-calligraphy {
          font-family: 'ZiHunFenghuaYasong', '字魂风华雅宋(商用需授权)', '字魂风华雅宋', 'QianTuMakeShouxie', 'yijing-slogan', 'STKaiti', 'KaiTi', serif;
          font-weight: 400;
          letter-spacing: -0.035em;
        }

        .yijing-title-line {
          display: block;
          line-height: 1.02;
        }

        .yijing-title-line + .yijing-title-line {
          margin-top: clamp(12px, 1.15vw, 18px);
        }

        .yijing-title-line--accent {
          margin-top: clamp(16px, 1.35vw, 24px);
        }

        .yijing-lead {
          max-width: 680px;
          margin-top: 22px;
        }

        .yijing-lead-seal {
          display: none;
          padding-top: 16px;
        }

        .yijing-login-card {
          width: 100%;
          max-width: 408px;
          margin-top: 34px;
          padding: 22px;
          border-radius: 18px;
        }

        .yijing-login-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 18px;
        }

        .yijing-admin-button {
          padding: 10px 18px;
        }

        .yijing-login-input-shell {
          position: relative;
          display: block;
        }

        .yijing-login-input-icon {
          position: absolute;
          left: 18px;
          top: 50%;
          transform: translateY(-50%);
          color: #91877d;
        }

        .yijing-login-input {
          width: 100%;
          height: 48px;
          padding: 0 18px 0 48px;
        }

        .yijing-checkbox-label {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .yijing-field-stack {
          display: grid;
          gap: 12px;
        }

        .yijing-login-options {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-top: 12px;
        }

        .yijing-submit {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          height: 50px;
          margin-top: 12px;
        }

        .yijing-login-foot {
          margin-top: 12px;
          padding-top: 12px;
        }

        .yijing-visual {
          min-height: 560px;
        }

        .yijing-atlas-wrap {
          max-width: 830px;
          margin-left: auto;
          padding-top: 4px;
        }

        .yijing-atlas-panel {
          padding: 6px;
        }

        .yijing-atlas-header {
          position: relative;
          z-index: 20;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 16px 24px;
        }

        .yijing-atlas-header > div {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .yijing-atlas-grid {
          height: 440px;
          min-height: 440px;
        }

        .yijing-atlas-table {
          position: relative;
          z-index: 10;
          display: grid;
          grid-template-rows: 86px minmax(0, 1fr);
          height: 100%;
        }

        .yijing-atlas-head-row {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          border-bottom: 1px solid rgba(226, 213, 199, 0.78);
          background: rgba(255, 253, 247, 0.28);
        }

        .yijing-atlas-column-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          min-height: 0;
          padding: 22px 24px 18px;
          border-right: 1px solid rgba(226, 213, 199, 0.8);
        }

        .yijing-atlas-column-head:last-child {
          border-right: 0;
        }

        .yijing-atlas-column-head > div {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .yijing-atlas-icon {
          display: flex;
          width: 32px;
          height: 32px;
          align-items: center;
          justify-content: center;
        }

        .yijing-atlas-body {
          display: grid;
          grid-template-rows: repeat(3, minmax(0, 1fr));
          min-height: 0;
        }

        .yijing-atlas-row {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          min-height: 0;
          border-bottom: 1px solid rgba(226, 213, 199, 0.58);
          background: rgba(255, 253, 247, 0.26);
        }

        .yijing-atlas-row:nth-child(even) {
          background: rgba(248, 240, 227, 0.32);
        }

        .yijing-atlas-row:last-child {
          border-bottom: 0;
        }

        .yijing-atlas-cell {
          position: relative;
          display: flex;
          min-height: 0;
          align-items: flex-start;
          padding: 18px 24px;
          border-right: 1px solid rgba(226, 213, 199, 0.72);
          overflow: hidden;
        }

        .yijing-atlas-cell:last-child {
          border-right: 0;
        }

        .yijing-atlas-cell p {
          margin: 0;
        }

        .yijing-atlas-cell--source p {
          font-size: 16px;
          line-height: 1.8;
          color: #42372f;
        }

        .yijing-atlas-cell--draft p {
          font-size: 14px;
          line-height: 1.72;
          color: #5a5049;
        }

        .yijing-atlas-cell--reviewed p {
          font-size: 14px;
          line-height: 1.72;
          color: #35669d;
        }

        .yijing-capability-section {
          padding: 88px 0 112px;
        }

        .yijing-section-heading {
          text-align: center;
        }

        .yijing-section-title {
          margin-top: 16px;
        }

        .yijing-section-desc {
          max-width: 620px;
          margin: 20px auto 0;
        }

        .yijing-capability-map {
          position: relative;
          max-width: 1260px;
          min-height: 680px;
          margin: 48px auto 0;
        }

        .yijing-capability-list {
          display: grid;
          gap: 28px;
        }

        .yijing-capability-node {
          padding: 24px;
        }

        .yijing-capability-inner {
          display: flex;
          align-items: flex-start;
          gap: 20px;
        }

        .yijing-capability-copy {
          padding-top: 8px;
        }

        .yijing-workflow-section {
          padding: 24px 0 56px;
        }

        .yijing-workflow-card {
          padding: 48px 24px;
        }

        .yijing-workflow-steps {
          position: relative;
          display: grid;
          gap: 28px;
          margin-top: 44px;
        }

        .yijing-footer {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 12px 0 16px;
          text-align: center;
        }

        .yijing-footer-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        @media (min-width: 768px) {
          .yijing-capability-list,
          .yijing-workflow-steps {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 1279px) {
          .yijing-atlas-panel,
          .yijing-atlas-panel-back {
            transform: none;
          }
        }

        @media (min-width: 1280px) {
          .yijing-nav {
            display: flex;
          }

          .yijing-seal {
            display: inline-flex;
          }

          .yijing-lead-seal {
            display: block;
          }

          .yijing-hero-grid {
            --yijing-hero-stage-height: clamp(620px, 64vh, 720px);
            align-items: stretch;
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
            gap: 48px;
            padding: 76px 0 84px;
          }

          .yijing-hero-copy {
            display: flex;
            min-height: var(--yijing-hero-stage-height);
            flex-direction: column;
          }

          .yijing-visual {
            display: flex;
            min-height: var(--yijing-hero-stage-height);
            align-items: flex-end;
          }

          .yijing-login-card {
            margin-top: auto;
          }

          .yijing-atlas-wrap {
            width: 100%;
            max-width: 800px;
            padding-top: 0;
          }

          .yijing-capability-map {
            min-height: 560px;
          }

          .yijing-capability-list {
            display: block;
          }

          .yijing-capability-node {
            position: absolute;
            width: 330px;
            padding: 0;
          }

          .yijing-workflow-card {
            padding: 48px 40px;
          }

          .yijing-workflow-steps {
            grid-template-columns: repeat(6, minmax(0, 1fr));
          }
        }

        @media (min-width: 1280px) and (max-height: 900px) {
          .yijing-hero-grid {
            --yijing-hero-stage-height: 636px;
            align-items: stretch;
            min-height: calc(100vh - 92px);
            padding: 38px 0 60px;
          }

          .yijing-eyebrow {
            margin-bottom: 16px;
          }

          .yijing-lead {
            margin-top: 12px;
            font-size: 16px;
            line-height: 30px;
          }

          .yijing-login-card {
            max-width: 408px;
            margin-top: auto;
            padding: 20px;
          }

          .yijing-login-head {
            margin-bottom: 18px;
          }

          .yijing-login-input {
            height: 52px;
          }

          .yijing-field-stack {
            gap: 12px;
          }

          .yijing-login-options {
            margin-top: 14px;
          }

          .yijing-submit {
            height: 50px;
            margin-top: 14px;
          }

          .yijing-login-foot {
            margin-top: 12px;
            padding-top: 10px;
            line-height: 20px;
          }

          .yijing-login-foot p {
            display: none;
          }

          .yijing-visual {
            min-height: var(--yijing-hero-stage-height);
          }

          .yijing-atlas-wrap {
            max-width: 800px;
          }

          .yijing-atlas-grid {
            height: 410px;
            min-height: 410px;
          }

          .yijing-atlas-table {
            grid-template-rows: 78px minmax(0, 1fr);
          }

          .yijing-atlas-header {
            padding: 14px 22px;
          }

          .yijing-atlas-column-head {
            min-height: 0;
            padding: 18px 20px 16px;
          }

          .yijing-atlas-cell {
            min-height: 0;
            padding: 15px 20px;
          }

          .yijing-atlas-cell--source p {
            font-size: 15px;
            line-height: 1.74;
          }

          .yijing-atlas-cell--draft p,
          .yijing-atlas-cell--reviewed p {
            font-size: 13px;
            line-height: 1.66;
          }
        }

        @media (max-width: 767px) {
          .yijing-home-shell {
            padding: 22px 20px 32px;
          }

          .yijing-home-header {
            gap: 16px;
          }

          .yijing-hero-grid {
            min-height: 0;
            padding: 54px 0 72px;
          }

          .yijing-login-options,
          .yijing-login-head {
            align-items: flex-start;
            flex-direction: column;
          }

          .yijing-atlas-head-row,
          .yijing-atlas-row {
            grid-template-columns: 1fr;
          }

          .yijing-atlas-grid {
            height: auto;
            min-height: 0;
          }

          .yijing-atlas-table,
          .yijing-atlas-body {
            grid-template-rows: none;
            height: auto;
          }

          .yijing-atlas-column-head {
            min-height: auto;
            border-right: 0;
            border-bottom: 1px solid rgba(226, 213, 199, 0.8);
          }

          .yijing-atlas-column-head:last-child {
            border-bottom: 0;
          }

          .yijing-atlas-cell {
            min-height: auto;
            border-right: 0;
            border-bottom: 1px solid rgba(226, 213, 199, 0.54);
            overflow: visible;
          }

          .yijing-atlas-cell:last-child {
            border-bottom: 0;
          }

          .yijing-capability-section {
            padding: 64px 0 80px;
          }

          .yijing-capability-inner {
            flex-direction: column;
          }
        }

        .yijing-reference-mountain {
          top: -46px;
          right: -7vw;
          width: clamp(980px, 76vw, 1280px);
          height: clamp(650px, 52vw, 840px);
          background-position: center top;
          background-size: cover;
          opacity: 0.72;
          filter: saturate(0.84) contrast(0.96) brightness(1.04);
          mask-image: linear-gradient(90deg, transparent 0%, #000 16%, #000 100%), linear-gradient(180deg, transparent 0%, #000 12%, #000 82%, transparent 100%);
          -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 16%, #000 100%), linear-gradient(180deg, transparent 0%, #000 12%, #000 82%, transparent 100%);
        }

        .yijing-header-sun {
          opacity: 0;
        }

        .yijing-mountain-scene--hero {
          display: none;
        }

        .yijing-hero-grid.yijing-archive-stage {
          position: relative;
          display: block;
          isolation: isolate;
          min-height: 0;
          padding: 0 0 clamp(34px, 5.5vh, 68px);
        }

        .yijing-hero-grid.yijing-archive-stage::before {
          content: '';
          position: absolute;
          z-index: 0;
          left: calc(-1 * clamp(120px, 18vw, 280px));
          right: calc(-1 * clamp(28px, 6vw, 96px));
          top: -128px;
          bottom: -180px;
          pointer-events: none;
          background-image:
            linear-gradient(90deg, rgba(247, 241, 230, 0.98) 0%, rgba(247, 241, 230, 0.92) 18%, rgba(247, 241, 230, 0.68) 34%, rgba(247, 241, 230, 0.28) 56%, rgba(247, 241, 230, 0.08) 100%),
            linear-gradient(180deg, rgba(247, 241, 230, 0.08) 0%, rgba(247, 241, 230, 0.03) 48%, rgba(247, 241, 230, 0.16) 100%),
            url('/landing/scroll-landscape-hd.jpg');
          background-position:
            left top,
            left top,
            right top;
          background-size:
            100% 100%,
            100% 100%,
            auto calc(100% + 160px);
          background-repeat: no-repeat;
          opacity: 0.82;
          filter: blur(0.25px) saturate(0.9) contrast(0.98) brightness(1.06);
          mix-blend-mode: multiply;
          mask-image:
            linear-gradient(90deg, transparent 0%, rgba(0, 0, 0, 0.04) 12%, rgba(0, 0, 0, 0.22) 30%, rgba(0, 0, 0, 0.68) 52%, #000 70%, #000 100%),
            linear-gradient(180deg, transparent 0%, #000 3%, #000 96%, transparent 100%);
          mask-composite: intersect;
          -webkit-mask-image:
            linear-gradient(90deg, transparent 0%, rgba(0, 0, 0, 0.04) 12%, rgba(0, 0, 0, 0.22) 30%, rgba(0, 0, 0, 0.68) 52%, #000 70%, #000 100%),
            linear-gradient(180deg, transparent 0%, #000 3%, #000 96%, transparent 100%);
          -webkit-mask-composite: source-in;
        }

        .yijing-hero-grid.yijing-archive-stage::after {
          content: '';
          position: absolute;
          z-index: 0;
          left: calc(-1 * clamp(140px, 20vw, 320px));
          right: calc(-1 * clamp(28px, 6vw, 96px));
          top: -96px;
          bottom: -160px;
          pointer-events: none;
          background:
            linear-gradient(90deg, rgba(247, 241, 230, 0.98) 0%, rgba(247, 241, 230, 0.9) 24%, rgba(247, 241, 230, 0.54) 46%, rgba(247, 241, 230, 0.16) 70%, rgba(247, 241, 230, 0.06) 100%),
            radial-gradient(ellipse at 31% 48%, rgba(255, 255, 255, 0.42), transparent 58%),
            radial-gradient(ellipse at 62% 78%, rgba(255, 255, 255, 0.22), transparent 44%);
          opacity: 0.66;
          filter: blur(10px);
          mix-blend-mode: screen;
        }

        .yijing-archive-intro {
          position: relative;
          z-index: 10;
          display: flex;
          min-height: calc(100svh - 112px);
          flex-direction: column;
          justify-content: center;
          max-width: 780px;
          padding: clamp(42px, 7vh, 82px) 0 clamp(78px, 10vh, 118px);
          scroll-margin-top: 28px;
        }

        .yijing-archive-intro .yijing-headline {
          max-width: 720px;
        }

        .yijing-archive-intro .yijing-lead {
          max-width: 650px;
          margin-top: 18px;
        }

        .yijing-archive-gallery {
          position: relative;
          z-index: 12;
          display: flex;
          min-height: calc(74svh - 28px);
          flex-direction: column;
          justify-content: center;
          margin-top: clamp(34px, 5.5vh, 68px);
          padding: clamp(30px, 4.5vh, 56px) 0 clamp(34px, 5vh, 58px);
          scroll-margin-top: 24px;
        }

        .yijing-archive-gallery::before {
          content: none;
          position: absolute;
          left: -8vw;
          right: -8vw;
          top: 18%;
          height: 56%;
          pointer-events: none;
          background:
            radial-gradient(ellipse at 30% 42%, rgba(255, 255, 255, 0.86), transparent 60%),
            linear-gradient(90deg, rgba(236, 222, 203, 0), rgba(236, 222, 203, 0.34), rgba(236, 222, 203, 0));
          filter: blur(18px);
          opacity: 0.82;
        }

        .yijing-archive-gallery::after {
          content: none;
          position: absolute;
          z-index: 0;
          left: -10vw;
          right: -10vw;
          top: -120px;
          height: 520px;
          pointer-events: none;
          background: url('/landing/c-bg-archive-atmosphere.png') center center / cover no-repeat;
          opacity: 0.12;
          filter: saturate(0.76) contrast(0.95) brightness(1.04);
          mix-blend-mode: multiply;
          mask-image: radial-gradient(ellipse at 56% 48%, #000 0%, #000 46%, transparent 76%);
          -webkit-mask-image: radial-gradient(ellipse at 56% 48%, #000 0%, #000 46%, transparent 76%);
        }

        .yijing-archive-kicker {
          position: relative;
          z-index: 2;
          display: grid;
          gap: 8px;
          margin-bottom: 22px;
          color: #7d6e62;
        }

        .yijing-archive-kicker strong {
          font-size: 18px;
          letter-spacing: 0.08em;
          color: #bc6238;
        }

        .yijing-archive-cards {
          position: relative;
          z-index: 2;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: clamp(18px, 1.45vw, 28px);
          align-items: stretch;
          padding: 0 clamp(8px, 1vw, 18px);
        }

        .yijing-archive-card {
          position: relative;
          min-height: 388px;
          overflow: hidden;
          border: 1px solid rgba(222, 207, 190, 0.82);
          border-radius: 14px;
          background:
            linear-gradient(180deg, rgba(255, 251, 244, 0.62), rgba(248, 239, 224, 0.9)),
            rgba(255, 250, 242, 0.76);
          box-shadow: 0 22px 62px rgba(81, 58, 33, 0.08);
          backdrop-filter: blur(5px);
        }

        .yijing-archive-card::after {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          border-radius: inherit;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.64),
            inset 0 -26px 46px rgba(209, 173, 126, 0.08);
        }

        .yijing-archive-card img {
          display: block;
          width: 100%;
          height: 232px;
          object-fit: cover;
          object-position: center;
          filter: saturate(0.72) contrast(0.94) brightness(1.05);
          mix-blend-mode: multiply;
          mask-image: linear-gradient(180deg, #000 0%, #000 76%, transparent 100%);
          -webkit-mask-image: linear-gradient(180deg, #000 0%, #000 76%, transparent 100%);
        }

        .yijing-archive-card__copy {
          position: relative;
          z-index: 1;
          padding: 18px 24px 22px;
        }

        .yijing-archive-card__title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 22px;
          font-weight: 700;
          letter-spacing: -0.04em;
          color: #2c241f;
        }

        .yijing-archive-card__index {
          display: inline-flex;
          width: 32px;
          height: 32px;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          border: 1px solid rgba(195, 95, 52, 0.55);
          color: #c76034;
          font-size: 14px;
          letter-spacing: 0;
        }

        .yijing-archive-card__body {
          margin-top: 12px;
          font-size: 14px;
          line-height: 1.72;
          color: #776b60;
        }

        .yijing-archive-route {
          position: relative;
          z-index: 1;
          height: 36px;
          margin: 14px -4vw 0;
          color: rgba(214, 111, 54, 0.68);
        }

        .yijing-archive-bottom {
          position: relative;
          z-index: 12;
          display: grid;
          min-height: calc(76svh - 36px);
          grid-template-columns: minmax(0, 1fr) minmax(360px, 430px);
          gap: clamp(44px, 7vw, 96px);
          align-items: center;
          margin-top: clamp(38px, 6vh, 76px);
          padding: clamp(34px, 5vh, 62px) 0 clamp(38px, 5.5vh, 68px);
          scroll-margin-top: 24px;
        }

        .yijing-archive-bottom::before {
          content: none;
          position: absolute;
          z-index: 0;
          left: -8vw;
          right: -8vw;
          top: -18px;
          bottom: -128px;
          pointer-events: none;
          background:
            radial-gradient(ellipse at 16% 72%, rgba(128, 137, 122, 0.18), transparent 34%),
            radial-gradient(ellipse at 52% 76%, rgba(168, 148, 113, 0.11), transparent 40%),
            radial-gradient(ellipse at 86% 82%, rgba(126, 133, 120, 0.17), transparent 34%),
            linear-gradient(180deg, rgba(247, 241, 230, 0) 0%, rgba(241, 232, 216, 0.24) 38%, rgba(235, 224, 207, 0.3) 100%);
          opacity: 0.8;
          filter: saturate(0.9) contrast(0.96) brightness(1.02);
          mix-blend-mode: multiply;
          mask-image: linear-gradient(180deg, transparent 0%, #000 18%, #000 100%);
          -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 18%, #000 100%);
        }

        .yijing-archive-bottom::after {
          content: none;
          position: absolute;
          z-index: 0;
          left: -8vw;
          right: -8vw;
          bottom: -132px;
          height: 280px;
          pointer-events: none;
          background:
            url('/landing/ink-mountain-hero-extended.png') left bottom / 520px auto no-repeat,
            url('/landing/ink-mountain-hero-extended.png') right bottom / 430px auto no-repeat;
          opacity: 0.18;
          filter: grayscale(1) saturate(0.7) contrast(0.92) brightness(1.12);
          mix-blend-mode: multiply;
          mask-image: linear-gradient(90deg, #000 0%, rgba(0, 0, 0, 0.7) 22%, transparent 50%, rgba(0, 0, 0, 0.7) 78%, #000 100%);
          -webkit-mask-image: linear-gradient(90deg, #000 0%, rgba(0, 0, 0, 0.7) 22%, transparent 50%, rgba(0, 0, 0, 0.7) 78%, #000 100%);
        }

        .yijing-loop-plain {
          position: relative;
          z-index: 2;
          padding-top: 8px;
        }

        .yijing-loop-heading {
          display: grid;
          gap: 10px;
          margin-bottom: 28px;
        }

        .yijing-loop-heading strong {
          font-size: 18px;
          color: #c76034;
        }

        .yijing-loop-steps-plain {
          position: relative;
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 18px;
        }

        .yijing-loop-steps-plain::before {
          content: '';
          position: absolute;
          left: 52px;
          right: 52px;
          top: 34px;
          border-top: 1px dashed rgba(214, 111, 54, 0.5);
        }

        .yijing-loop-step-plain {
          position: relative;
          text-align: center;
        }

        .yijing-loop-step-icon {
          position: relative;
          z-index: 2;
          display: inline-flex;
          height: 70px;
          width: 70px;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          border: 1px solid rgba(224, 183, 146, 0.82);
          background: rgba(255, 249, 240, 0.74);
          box-shadow: inset 0 0 0 10px rgba(255, 255, 255, 0.58), 0 18px 42px rgba(126, 86, 50, 0.08);
          color: #d66f36;
        }

        .yijing-loop-step-plain h3 {
          margin-top: 14px;
          font-size: 14px;
          font-weight: 700;
          color: #332a23;
        }

        .yijing-loop-step-plain p {
          margin: 9px auto 0;
          max-width: 128px;
          font-size: 12px;
          line-height: 1.75;
          color: #81756b;
        }

        .yijing-archive-login-card {
          position: relative;
          z-index: 2;
          max-width: none;
          margin-top: 0;
          overflow: hidden;
          border-radius: 22px;
          padding: 24px;
          background:
            linear-gradient(180deg, rgba(255, 253, 248, 0.58), rgba(255, 250, 242, 0.46)),
            rgba(255, 253, 248, 0.4);
          backdrop-filter: blur(12px) saturate(1.04);
          -webkit-backdrop-filter: blur(12px) saturate(1.04);
        }

        .yijing-archive-login-card::before {
          content: '';
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background:
            radial-gradient(ellipse at 26% 18%, rgba(255, 255, 255, 0.52), transparent 48%),
            linear-gradient(90deg, rgba(255, 251, 244, 0.26), rgba(255, 251, 244, 0.06));
        }

        .yijing-archive-login-card > * {
          position: relative;
          z-index: 1;
        }

        .yijing-archive-promise {
          display: flex;
          align-items: center;
          gap: 18px;
          margin-top: 42px;
          color: #5f554d;
        }

        .yijing-archive-promise__seal {
          display: inline-flex;
          width: 46px;
          height: 62px;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(199, 93, 43, 0.52);
          border-radius: 18px;
          color: #c75d2b;
          font-size: 13px;
          line-height: 1.2;
        }

        @media (min-width: 1280px) {
          .yijing-hero-grid.yijing-archive-stage {
            display: block;
            min-height: 0;
            padding: 0 0 clamp(36px, 5.5vh, 70px);
          }

          .yijing-archive-intro .yijing-headline {
            font-size: clamp(58px, 4.7vw, 76px) !important;
            line-height: 1 !important;
          }
        }

        @media (max-width: 1100px) {
          .yijing-archive-cards {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 18px;
          }

          .yijing-archive-card,
          .yijing-archive-card:nth-child(n) {
            margin: 0;
            transform: none;
          }

          .yijing-archive-bottom {
            grid-template-columns: 1fr;
          }

          .yijing-loop-steps-plain {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 767px) {
          .yijing-reference-mountain {
            top: -58px;
            right: -430px;
            width: 1080px;
            height: 760px;
            opacity: 0.66;
          }

          .yijing-hero-grid.yijing-archive-stage::before {
            left: -26px;
            right: -26px;
            top: -96px;
            bottom: -120px;
            background-image:
              linear-gradient(90deg, rgba(247, 241, 230, 0.58) 0%, rgba(247, 241, 230, 0.16) 46%, rgba(247, 241, 230, 0.03) 100%),
              linear-gradient(180deg, rgba(247, 241, 230, 0.04) 0%, rgba(247, 241, 230, 0.02) 52%, rgba(247, 241, 230, 0.1) 100%),
              url('/landing/scroll-landscape-hd.jpg');
            background-position:
              left top,
              left top,
              center top;
            background-size:
              100% 100%,
              100% 100%,
              auto calc(100% + 80px);
            background-repeat: no-repeat;
          }

          .yijing-archive-cards {
            grid-template-columns: 1fr;
          }

          .yijing-archive-card img {
            height: 230px;
          }

          .yijing-loop-steps-plain {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .yijing-loop-steps-plain::before {
            display: none;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .yijing-mist-layer,
          .yijing-mountain-layer,
          .yijing-mountain-scene__far,
          .yijing-mountain-scene__near,
          .yijing-mountain-scene__mist,
          .yijing-mountain-scene__cloud,
          .yijing-reference-mountain,
          .yijing-bird-swarm,
          .yijing-bird-flutter,
          .yijing-bird-wing,
          .yijing-ink-boat {
            animation: none;
          }
        }
      `}</style>

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: [
            'radial-gradient(circle at 18% 12%, rgba(221, 122, 74, 0.1), transparent 24%)',
            'radial-gradient(circle at 82% 18%, rgba(135, 151, 125, 0.16), transparent 34%)',
            'radial-gradient(ellipse at 56% 53%, rgba(255, 255, 255, 0.88), transparent 48%)',
            'linear-gradient(180deg, rgba(255,253,248,0.98), rgba(245,238,225,0.94) 52%, rgba(250,247,240,0.99))',
          ].join(','),
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.09]"
        style={{
          backgroundImage: 'linear-gradient(rgba(84, 66, 46, .14) 1px, transparent 1px), linear-gradient(90deg, rgba(84, 66, 46, .14) 1px, transparent 1px)',
          backgroundSize: '92px 92px',
        }}
      />

      <div ref={referenceMountainRef} className="yijing-reference-mountain" aria-hidden="true" />
      <FlyingBirds />
      <MountainScene variant="hero" />
      <MistLayer className="left-[-18%] top-[520px] h-[220px] w-[72vw] opacity-20" />

      <div className="yijing-home-shell relative">
        <header className="yijing-home-header">
          <button
            type="button"
            onClick={() => scrollTo('platform-intro')}
            className="yijing-logo-button"
            aria-label="译境首页"
          >
            <Logo size={50} priority />
            <span className="brand-wordmark text-[38px] leading-none text-[#171512]">译境</span>
          </button>

          <nav className="yijing-nav hidden text-[15px] font-semibold text-[#2d2924]">
            {navItems.map(item => (
              <button
                key={item.label}
                type="button"
                onClick={() => scrollTo(item.target)}
                className="yijing-nav-item text-[#201c18] transition-colors hover:text-[#c75d2b]"
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="yijing-header-sun" aria-hidden="true" />
        </header>

        <section
          id="platform-intro"
          className="yijing-hero-grid yijing-archive-stage"
        >
          <div className="yijing-archive-intro">
            <p className="yijing-eyebrow text-[13px] font-semibold uppercase tracking-[0.36em] text-[#b56a48]">
              Project Translation Atlas
            </p>
            <h1
              className="yijing-headline yijing-hero-calligraphy text-[#14100d]"
              style={{ fontSize: 'clamp(52px, 5vw, 84px)', lineHeight: 1 }}
            >
              <span className="yijing-title-line">让翻译协作，</span>
              <span className="yijing-title-line">沉淀为可复盘的</span>
              <span className="yijing-title-line yijing-title-line--accent text-[#ba5b32]">
                研究资产
              </span>
            </h1>
            <p className="yijing-lead text-[18px] leading-9 text-[#655c54]">
              管理翻译项目、术语资产、审校流程、AI 对照实验与研究训练。
            </p>
            <div className="yijing-lead-seal">
              <span className="yijing-seal border border-[#ba5b32]/60 text-[14px] font-semibold tracking-[0.08em] text-[#ba5b32]">
                译<br />境
              </span>
            </div>
          </div>

          <section id="capability-map" ref={atlasPanelRef} className="yijing-archive-gallery">
            <div className="yijing-archive-kicker">
              <strong>墨韵典藏 · 四境一图</strong>
              <span className="text-[15px] leading-7">以译为舟，贯通古今，联结世界，凝聚共识。</span>
            </div>

            <div className="yijing-archive-cards">
              {archiveScenes.map(scene => (
                <article key={scene.title} className="yijing-archive-card">
                  <img src={scene.image} alt={scene.title} />
                  <div className="yijing-archive-card__copy">
                    <h2 className="yijing-archive-card__title landing-slogan">
                      <span className="yijing-archive-card__index">{scene.index}</span>
                      {scene.title}
                    </h2>
                    <p className="yijing-archive-card__body">{scene.body}</p>
                  </div>
                </article>
              ))}
            </div>

            <svg className="yijing-archive-route" viewBox="0 0 1320 64" fill="none" preserveAspectRatio="none" aria-hidden="true">
              <path d="M0 28 C 154 62, 262 46, 372 35 C 500 20, 552 58, 690 37 C 824 17, 890 20, 1012 45 C 1122 67, 1220 24, 1320 36" stroke="currentColor" strokeWidth="2" strokeDasharray="6 10" />
              {[180, 472, 690, 1050].map(cx => (
                <g key={cx}>
                  <circle cx={cx} cy="38" r="14" stroke="currentColor" opacity="0.34" />
                  <circle cx={cx} cy="38" r="5" fill="currentColor" />
                </g>
              ))}
            </svg>
            <InkBoat />
          </section>

          <section id="workflow-loop" className="yijing-archive-bottom">
            <div className="yijing-loop-plain">
              <div className="yijing-loop-heading">
                <strong>沉淀为研究的闭环</strong>
                <h2 className="landing-slogan text-[32px] font-bold tracking-[-0.035em] text-[#171512] sm:text-[42px]">
                  从翻译到研究，每一步都可复盘
                </h2>
                <p className="max-w-[680px] text-[15px] leading-8 text-[#80756b]">
                  译境贯穿每一次协作，让翻译成果成为可复盘、可沉淀、可复用的知识资产。
                </p>
              </div>

              <div className="yijing-loop-steps-plain">
                {loopSteps.map(step => (
                  <article key={step.title} className="yijing-loop-step-plain">
                    <span className="yijing-loop-step-icon">
                      <IconGlyph kind={step.icon} className="h-8 w-8" />
                    </span>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </article>
                ))}
              </div>

              <div className="yijing-archive-promise">
                <span className="yijing-archive-promise__seal">
                  私有<br />安全
                </span>
                <div>
                  <h3 className="landing-slogan text-[25px] font-bold tracking-[-0.03em] text-[#1f1914]">
                    私有 · 安全 · 专业
                  </h3>
                  <p className="mt-2 max-w-[560px] text-[14px] leading-7 text-[#746b62]">
                    面向研究团队的专属协作空间，数据全程加密，权限精细可控。
                  </p>
                </div>
              </div>
            </div>

            <form
              id="login-entry"
              onSubmit={handleSubmit}
              className="yijing-login-card yijing-archive-login-card border border-[#ded2c5] shadow-[0_24px_72px_rgba(87,58,30,0.12)] backdrop-blur-xl"
            >
              <div className="yijing-login-head">
                <h2 className="text-[26px] font-semibold tracking-[-0.04em] text-[#171512]">进入译境</h2>
                <button
                  type="button"
                  onClick={() => router.push('/admin')}
                  className="yijing-admin-button rounded-[14px] border border-[#d8cbbd] bg-[#fffaf2]/80 text-xs font-semibold text-[#77685c] transition-colors hover:border-[#c75d2b]/40 hover:text-[#b9653e]"
                >
                  管理员入口
                </button>
              </div>

              {!hasSupabaseBrowserEnv && (
                <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  当前本地环境缺少 Supabase 配置，页面已恢复可访问，但暂时不能登录。
                </div>
              )}

              <div className="yijing-field-stack">
                <LoginField
                  ref={emailRef}
                  label="邮箱"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  placeholder="邮箱 / 手机号"
                  icon="mail"
                />
                <LoginField
                  label="密码"
                  type="password"
                  value={password}
                  onChange={setPassword}
                  placeholder="密码"
                  icon="lock"
                />
              </div>

              <div className="yijing-login-options text-[13px] text-[#807266]">
                <label className="yijing-checkbox-label">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={e => setRemember(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-[#d3c5b6] accent-[#c75d2b]"
                  />
                  <span>7 天内自动登录</span>
                </label>
                <button
                  type="button"
                  onClick={() => router.push('/account/password')}
                  className="font-medium text-[#8d6e5c] transition-colors hover:text-[#b9653e]"
                >
                  忘记密码？
                </button>
              </div>

              {error && (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={!hasSupabaseBrowserEnv || loading}
                className="yijing-submit rounded-[16px] bg-gradient-to-r from-[#d66f36] to-[#b6532c] text-sm font-semibold text-white shadow-[0_12px_28px_rgba(190,88,42,0.2)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-55"
              >
                {loading ? '处理中' : '登录进入工作台'}
                <IconGlyph kind="arrow" className="h-4 w-4" />
              </button>

              <div className="yijing-login-foot border-t border-[#e5d9cb] text-[12px] leading-5 text-[#93877d]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>还没有账号？</span>
                  <span className="font-semibold text-[#b9653e]">联系平台管理员开通</span>
                </div>
              </div>
            </form>
          </section>
        </section>

        <footer className="yijing-footer text-[13px] text-[#8a8077]">
          <p className="yijing-footer-row">
            <IconGlyph kind="check" className="h-4 w-4" />
            安全可靠，数据加密存储
          </p>
          <p>© 2026 译境 · 专业翻译协作平台</p>
        </footer>
      </div>
    </main>
  )
}

type LoginFieldProps = {
  label: string
  type: 'email' | 'password'
  value: string
  onChange: (value: string) => void
  placeholder: string
  icon: IconKind
}

const LoginField = forwardRef<HTMLInputElement, LoginFieldProps>(function LoginField({
  label,
  type,
  value,
  onChange,
  placeholder,
  icon,
}, ref) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <span className="yijing-login-input-shell">
        <span className="yijing-login-input-icon pointer-events-none">
          <IconGlyph kind={icon} className="h-4.5 w-4.5" />
        </span>
        <input
          ref={ref}
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          required
          className="yijing-login-input rounded-[11px] border border-[#ddd2c6] bg-white/74 text-sm text-[#171512] outline-none transition-colors placeholder:text-[#aaa096] focus:border-[#c75d2b]"
        />
      </span>
    </label>
  )
})

function MountainScene({ variant }: { variant: 'hero' | 'lower' }) {
  const prefix = `yijing-mountain-${variant}`
  const isHero = variant === 'hero'
  const mountainFills =
    isHero
      ? [
        {
          d: 'M468 388 C 520 336, 550 270, 602 206 C 660 134, 694 78, 746 72 C 792 66, 810 150, 852 144 C 900 136, 928 94, 1006 88 L1040 660 L468 660 Z',
          fill: 'far',
          opacity: 0.8,
        },
        {
          d: 'M392 526 C 490 464, 578 474, 664 416 C 742 364, 806 306, 892 318 C 952 326, 988 360, 1040 358 L1040 660 L392 660 Z',
          fill: 'middle',
          opacity: 0.72,
        },
        {
          d: 'M300 616 C 410 562, 520 576, 626 540 C 748 498, 866 512, 1040 468 L1040 660 L300 660 Z',
          fill: 'near',
          opacity: 0.62,
        },
      ]
      : [
        {
          d: 'M-120 430 C 56 360, 188 394, 326 334 C 468 272, 566 236, 682 292 C 788 342, 846 226, 956 210 C 1032 198, 1086 226, 1148 274 L1148 660 L-120 660 Z',
          fill: 'far',
          opacity: 0.62,
        },
        {
          d: 'M-100 530 C 88 462, 238 492, 378 438 C 526 380, 642 414, 780 368 C 898 328, 1014 354, 1142 410 L1142 660 L-100 660 Z',
          fill: 'middle',
          opacity: 0.6,
        },
        {
          d: 'M-118 616 C 86 560, 262 584, 446 532 C 620 484, 798 518, 1096 458 L1096 660 L-118 660 Z',
          fill: 'near',
          opacity: 0.55,
        },
      ]
  const ridgeLines =
    isHero
      ? [
        'M402 392 C 478 342, 532 260, 596 178',
        'M612 150 C 652 92, 704 92, 758 170',
        'M750 174 C 812 148, 858 94, 958 120',
        'M646 104 C 620 172, 584 230, 538 282',
        'M710 104 C 690 190, 656 252, 612 310',
        'M826 126 C 804 206, 760 268, 706 324',
        'M492 504 C 584 456, 682 448, 782 388',
        'M404 548 C 520 496, 650 512, 774 456',
        'M594 596 C 716 554, 846 558, 996 512',
      ]
      : [
        'M12 424 C 156 372, 284 394, 412 334',
        'M414 334 C 526 276, 628 286, 738 326',
        'M742 326 C 834 260, 936 232, 1044 272',
        'M344 350 C 316 414, 266 448, 202 468',
        'M646 292 C 618 348, 574 388, 516 420',
        'M920 226 C 892 302, 840 358, 774 398',
        'M38 520 C 184 476, 312 488, 460 438',
        'M468 440 C 598 394, 732 420, 850 376',
        'M116 584 C 264 548, 404 566, 540 592',
        'M552 514 C 664 484, 792 496, 936 532',
      ]
  const treeLines =
    isHero
      ? [
        'M736 560 C 758 530, 788 526, 812 554 M774 560 L774 500 M804 560 L804 520 M836 560 L836 536',
        'M852 582 C 878 550, 914 548, 940 578 M896 582 L896 520 M930 582 L930 540',
        'M476 608 C 498 582, 528 582, 552 606 M518 608 L518 554 M548 608 L548 572',
      ]
      : [
        'M72 560 C 98 522, 132 520, 160 556 M120 560 L120 486 M154 560 L154 512 M188 560 L188 532',
        'M312 602 C 340 566, 374 568, 402 598 M358 602 L358 538 M392 602 L392 560',
        'M780 558 C 812 516, 856 514, 890 552 M838 558 L838 476 M876 558 L876 504 M912 558 L912 530',
        'M990 594 C 1018 560, 1050 560, 1078 590 M1038 594 L1038 528 M1070 594 L1070 550',
      ]
  const cloudBands =
    isHero
      ? [
        'M300 318 C 418 286, 520 304, 640 270 C 760 236, 868 258, 1036 220',
        'M312 488 C 438 448, 552 474, 684 432 C 820 390, 928 410, 1068 372',
      ]
      : [
        'M-80 334 C 86 288, 248 322, 404 282 C 560 242, 704 282, 880 240 C 986 216, 1078 224, 1160 210',
        'M-56 462 C 110 414, 274 452, 438 410 C 612 366, 776 394, 1004 348',
      ]

  return (
    <div className={`yijing-mountain-scene yijing-mountain-scene--${variant}`} aria-hidden="true">
      <svg viewBox="0 0 1040 660" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={`${prefix}-far`} x1="520" y1="70" x2="520" y2="640" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#35423d" stopOpacity={isHero ? '0.09' : '0.07'} />
            <stop offset="0.52" stopColor="#9b9d8e" stopOpacity={isHero ? '0.08' : '0.06'} />
            <stop offset="1" stopColor="#f7f1e6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${prefix}-middle`} x1="500" y1="220" x2="500" y2="650" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#4e5b54" stopOpacity={isHero ? '0.075' : '0.06'} />
            <stop offset="0.56" stopColor="#b0a995" stopOpacity={isHero ? '0.07' : '0.055'} />
            <stop offset="1" stopColor="#f7f1e6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${prefix}-near`} x1="470" y1="360" x2="470" y2="650" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#637064" stopOpacity={isHero ? '0.055' : '0.052'} />
            <stop offset="0.64" stopColor="#c7b9a4" stopOpacity={isHero ? '0.06' : '0.05'} />
            <stop offset="1" stopColor="#f7f1e6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${prefix}-ink-line`} x1="180" y1="110" x2="1030" y2="550" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#24342e" stopOpacity={isHero ? '0.1' : '0.075'} />
            <stop offset="0.52" stopColor="#6f786b" stopOpacity={isHero ? '0.075' : '0.06'} />
            <stop offset="1" stopColor="#9f947f" stopOpacity="0.025" />
          </linearGradient>
          <linearGradient id={`${prefix}-cloud`} x1="60" y1="0" x2="900" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fffdf7" stopOpacity="0" />
            <stop offset="0.2" stopColor="#fffdf7" stopOpacity="0.9" />
            <stop offset="0.55" stopColor="#f2e5d2" stopOpacity="0.82" />
            <stop offset="1" stopColor="#fffdf7" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${prefix}-route`} x1="180" y1="0" x2="900" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#d97635" stopOpacity="0" />
            <stop offset="0.26" stopColor="#d97635" stopOpacity="0.42" />
            <stop offset="0.5" stopColor="#fff2c9" stopOpacity="0.9" />
            <stop offset="0.82" stopColor="#d97635" stopOpacity="0.42" />
            <stop offset="1" stopColor="#d97635" stopOpacity="0" />
          </linearGradient>
          <radialGradient id={`${prefix}-wash`} cx="55%" cy="50%" r="62%">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.92" />
            <stop offset="0.58" stopColor="#eadcc8" stopOpacity="0.2" />
            <stop offset="1" stopColor="#eadcc8" stopOpacity="0" />
          </radialGradient>
          <filter id={`${prefix}-soft`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.1" />
          </filter>
          <filter id={`${prefix}-ink-soft`} x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.012 0.05" numOctaves="3" seed={isHero ? 7 : 13} result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale={isHero ? 2.2 : 1.8} xChannelSelector="R" yChannelSelector="G" />
            <feGaussianBlur stdDeviation="0.35" />
          </filter>
          <filter id={`${prefix}-mist-soft`} x="-20%" y="-30%" width="140%" height="160%">
            <feGaussianBlur stdDeviation="18" />
          </filter>
          <filter id={`${prefix}-cloud-soft`} x="-25%" y="-60%" width="150%" height="220%">
            <feGaussianBlur stdDeviation="9" />
          </filter>
          <filter id={`${prefix}-route-soft`} x="-15%" y="-80%" width="130%" height="260%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        <ellipse
          className="yijing-mountain-scene__mist"
          cx={isHero ? '720' : '520'}
          cy={isHero ? '432' : '448'}
          rx={isHero ? '410' : '560'}
          ry={isHero ? '142' : '170'}
          fill={`url(#${prefix}-wash)`}
          filter={`url(#${prefix}-mist-soft)`}
        />

        <g className="yijing-mountain-scene__far" filter={`url(#${prefix}-ink-soft)`}>
          {mountainFills.map((mountain, index) => (
            <path
              key={`mountain-${index}`}
              d={mountain.d}
              fill={`url(#${prefix}-${mountain.fill})`}
              opacity={mountain.opacity}
            />
          ))}
        </g>

        <g className="yijing-mountain-scene__near" filter={`url(#${prefix}-soft)`}>
          {ridgeLines.map((line, index) => (
            <path
              key={`ridge-${index}`}
              d={line}
              stroke={`url(#${prefix}-ink-line)`}
              strokeWidth={index < 3 ? (isHero ? '1.25' : '1.15') : '0.95'}
              strokeLinecap="round"
              fill="none"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {ridgeLines.slice(0, 5).map((line, index) => (
            <path
              key={`ridge-shadow-${index}`}
              d={line}
              stroke="#fffaf1"
              strokeOpacity="0.28"
              strokeWidth="3.2"
              strokeLinecap="round"
              fill="none"
            />
          ))}
        </g>

        {!isHero && (
          <g className="yijing-mountain-scene__route" filter={`url(#${prefix}-route-soft)`}>
            <path
              d="M96 520 C 230 452, 376 502, 518 448 C 640 402, 718 438, 798 484 C 884 534, 980 496, 1110 414"
              stroke="#fff8d8"
              strokeWidth="16"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M96 520 C 230 452, 376 502, 518 448 C 640 402, 718 438, 798 484 C 884 534, 980 496, 1110 414"
              stroke={`url(#${prefix}-route)`}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray="18 20"
              fill="none"
            />
          </g>
        )}

        <g opacity={isHero ? '0.22' : '0.2'} filter={`url(#${prefix}-soft)`}>
          {treeLines.map((tree, index) => (
            <path
              key={`tree-${index}`}
              d={tree}
              stroke="#5d675d"
              strokeWidth={isHero ? '1.2' : '1.1'}
              strokeLinecap="round"
              fill="none"
            />
          ))}
        </g>

        <g className="yijing-mountain-scene__cloud" filter={`url(#${prefix}-cloud-soft)`}>
          <path
            d={cloudBands[0]}
            stroke={`url(#${prefix}-cloud)`}
            strokeWidth={isHero ? '52' : '66'}
            strokeLinecap="round"
            fill="none"
          />
          <path
            d={cloudBands[0]}
            stroke="#fffdf7"
            strokeOpacity="0.78"
            strokeWidth={isHero ? '18' : '24'}
            strokeLinecap="round"
            fill="none"
          />
          <path
            d={cloudBands[0]}
            stroke="#68756b"
            strokeOpacity="0.12"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
        </g>

        <g className="yijing-mountain-scene__cloud yijing-mountain-scene__cloud--alt" filter={`url(#${prefix}-cloud-soft)`}>
          <path
            d={cloudBands[1]}
            stroke={`url(#${prefix}-cloud)`}
            strokeWidth={isHero ? '46' : '56'}
            strokeLinecap="round"
            fill="none"
          />
          <path
            d={cloudBands[1]}
            stroke="#fffaf0"
            strokeOpacity="0.72"
            strokeWidth={isHero ? '16' : '22'}
            strokeLinecap="round"
            fill="none"
          />
          <path
            d={cloudBands[1]}
            stroke="#d6cabb"
            strokeOpacity="0.16"
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
          />
        </g>

        <g className="yijing-mountain-scene__mist" opacity={isHero ? '0.72' : '0.86'} filter={`url(#${prefix}-mist-soft)`}>
          <path
            d={isHero
              ? 'M318 522 C 440 486, 550 512, 672 474 C 800 434, 910 456, 1080 414'
              : 'M-40 516 C 106 480, 260 508, 404 470 C 540 434, 664 464, 808 424 C 934 388, 1030 408, 1130 382'}
            stroke="#fff9ef"
            strokeWidth={isHero ? '64' : '78'}
            strokeLinecap="round"
          />
          <path
            d={isHero
              ? 'M400 596 C 542 560, 680 584, 824 548 C 936 520, 1006 522, 1090 500'
              : 'M70 594 C 230 552, 390 580, 544 546 C 706 510, 846 540, 1034 490'}
            stroke="#f3e6d2"
            strokeOpacity="0.62"
            strokeWidth={isHero ? '52' : '66'}
            strokeLinecap="round"
          />
        </g>
      </svg>
    </div>
  )
}

function MistLayer({ className }: { className: string }) {
  return (
    <div
      className={`pointer-events-none absolute yijing-mist-layer rounded-full ${className}`}
      style={{
        background: 'radial-gradient(ellipse at center, rgba(255,255,255,.78), rgba(244,231,210,.34) 48%, transparent 72%)',
        filter: 'blur(18px)',
      }}
      aria-hidden="true"
    />
  )
}

function FlyingBirds() {
  const birds = [
    { x: 78, y: 88, scale: 0.9, delay: '-0.1s' },
    { x: 112, y: 34, scale: 0.62, delay: '-0.46s' },
    { x: 148, y: 54, scale: 0.68, delay: '-0.36s' },
    { x: 232, y: 92, scale: 0.76, delay: '-0.58s' },
    { x: 276, y: 34, scale: 0.58, delay: '-0.18s' },
    { x: 318, y: 42, scale: 0.82, delay: '-0.22s' },
    { x: 408, y: 74, scale: 0.58, delay: '-0.48s' },
    { x: 468, y: 30, scale: 0.72, delay: '-0.68s' },
  ]

  const farBirds = [
    { x: 58, y: 42, scale: 0.55, delay: '-0.25s' },
    { x: 182, y: 104, scale: 0.5, delay: '-0.6s' },
    { x: 238, y: 28, scale: 0.4, delay: '-0.12s' },
    { x: 286, y: 58, scale: 0.44, delay: '-0.4s' },
    { x: 390, y: 116, scale: 0.48, delay: '-0.74s' },
  ]

  const upperRouteBirds = [
    { x: 54, y: 62, scale: 0.52, delay: '-0.18s' },
    { x: 150, y: 42, scale: 0.42, delay: '-0.52s' },
    { x: 252, y: 78, scale: 0.48, delay: '-0.34s' },
    { x: 304, y: 28, scale: 0.38, delay: '-0.58s' },
    { x: 354, y: 50, scale: 0.44, delay: '-0.7s' },
  ]

  return (
    <div className="yijing-reference-birds" aria-hidden="true">
      <svg className="yijing-bird-swarm yijing-bird-swarm--upper-route" viewBox="0 0 440 150" preserveAspectRatio="none">
        {upperRouteBirds.map((bird, index) => (
          <FlyingBird key={`upper-route-bird-${index}`} {...bird} />
        ))}
      </svg>
      <svg className="yijing-bird-swarm" viewBox="0 0 520 192" preserveAspectRatio="none">
        {birds.map((bird, index) => (
          <FlyingBird key={`bird-${index}`} {...bird} />
        ))}
      </svg>
      <svg className="yijing-bird-swarm yijing-bird-swarm--secondary" viewBox="0 0 520 192" preserveAspectRatio="none">
        {farBirds.map((bird, index) => (
          <FlyingBird key={`far-bird-${index}`} {...bird} />
        ))}
      </svg>
    </div>
  )
}

function InkBoat() {
  return (
    <svg className="yijing-ink-boat" viewBox="0 0 160 72" fill="none" aria-hidden="true">
      <path
        d="M18 48C42 55 92 56 130 46C117 61 50 66 18 48Z"
        fill="currentColor"
        opacity="0.38"
      />
      <path
        d="M35 43C54 49 98 50 126 42C116 53 52 57 35 43Z"
        fill="currentColor"
        opacity="0.74"
      />
      <path
        d="M78 14C80 25 81 34 80 43"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.72"
      />
      <path
        d="M82 17C100 24 111 33 118 42C101 39 91 31 82 17Z"
        fill="currentColor"
        opacity="0.34"
      />
      <path
        d="M76 20C63 27 55 35 50 43C63 40 71 32 76 20Z"
        fill="currentColor"
        opacity="0.28"
      />
      <path
        d="M4 55C26 51 48 53 69 56C92 59 114 59 153 52"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.3"
      />
      <path
        d="M16 62C43 58 64 60 82 63C104 67 125 64 146 58"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.22"
      />
    </svg>
  )
}

function FlyingBird({
  x,
  y,
  scale,
  delay,
}: {
  x: number
  y: number
  scale: number
  delay: string
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <g className="yijing-bird-flutter" style={{ animationDelay: delay }}>
        <path
          className="yijing-bird-body"
          d="M-2.8 0.2C-1.4-1.2 1.4-1.2 2.8 0.2C1.4 1.4-1.4 1.4-2.8 0.2Z"
        />
        <g className="yijing-bird-wing yijing-bird-wing--left" style={{ animationDelay: delay }}>
          <path
            d="M0 0C-6.5-6.2-14.4-7.4-22.4-1.8"
            stroke="currentColor"
            strokeWidth="3.1"
            strokeLinecap="round"
            fill="none"
          />
        </g>
        <g className="yijing-bird-wing yijing-bird-wing--right" style={{ animationDelay: delay }}>
          <path
            d="M0 0C6.5-6.2 14.4-7.4 22.4-1.8"
            stroke="currentColor"
            strokeWidth="3.1"
            strokeLinecap="round"
            fill="none"
          />
        </g>
      </g>
    </g>
  )
}

function Birds() {
  return (
    <svg width="140" height="60" viewBox="0 0 140 60" fill="none" aria-hidden="true">
      <path d="M15 35c8-7 15-7 23 0M55 23c7-6 13-6 20 0M95 36c8-7 15-7 23 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function IconGlyph({ kind, className = 'h-5 w-5' }: { kind: IconKind; className?: string }) {
  const size = className.includes('h-3.5') ? 14
    : className.includes('h-4.5') ? 18
      : className.includes('h-4') ? 16
        : className.includes('h-7') ? 28
          : className.includes('h-8') ? 32
            : 20

  const common = {
    className,
    fill: 'none',
    height: size,
    stroke: 'currentColor',
    viewBox: '0 0 24 24',
    width: size,
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': true,
  } as const

  switch (kind) {
    case 'ai':
      return (
        <svg {...common}>
          <rect x="4.5" y="4.5" width="15" height="15" rx="3.2" strokeWidth="1.7" />
          <path d="M8.2 15.8l2.1-7.6 2.1 7.6M8.9 13.2h2.8M15.5 8.2v7.6" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'arrow':
      return (
        <svg {...common}>
          <path d="M5 12h13M13 6l6 6-6 6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'book':
      return (
        <svg {...common}>
          <path d="M5 5.8A2.3 2.3 0 017.3 3.5H20v15H7.3A2.3 2.3 0 005 20.8V5.8z" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M5 5.8A2.3 2.3 0 002.7 3.5H2v15h.7A2.3 2.3 0 015 20.8M8 7.5h8.5" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )
    case 'bookmark':
      return (
        <svg {...common}>
          <path d="M7 4.5h10a1.5 1.5 0 011.5 1.5v14L12 16.5 5.5 20V6A1.5 1.5 0 017 4.5z" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M9 8h6" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      )
    case 'chart':
      return (
        <svg {...common}>
          <path d="M5 19V5M5 19h14" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M8.2 15.2l3.1-3.5 3 2.2 3.8-5.2" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'check':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.2" strokeWidth="1.7" />
          <path d="M8.5 12.2l2.3 2.4 4.8-5.2" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'document':
      return (
        <svg {...common}>
          <path d="M6.5 3.8h7.2l3.8 3.9v12.5h-11a2 2 0 01-2-2V5.8a2 2 0 012-2z" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M13.5 4v4h4M8.3 12h7.2M8.3 15.5h5.5" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      )
    case 'folder':
      return (
        <svg {...common}>
          <path d="M3.8 7.5a2 2 0 012-2h4.1l1.8 2h6.5a2 2 0 012 2v7.7a2 2 0 01-2 2H5.8a2 2 0 01-2-2V7.5z" strokeWidth="1.7" strokeLinejoin="round" />
        </svg>
      )
    case 'library':
      return (
        <svg {...common}>
          <path d="M6 4.5h12v15H6zM9 8h6M9 11.5h6M9 15h3.5" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 6.5v15h12" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'lock':
      return (
        <svg {...common}>
          <path d="M7.5 10V8.1a4.5 4.5 0 019 0V10" strokeWidth="1.7" strokeLinecap="round" />
          <rect x="5.7" y="10" width="12.6" height="9" rx="2" strokeWidth="1.7" />
        </svg>
      )
    case 'mail':
      return (
        <svg {...common}>
          <rect x="3.8" y="5.8" width="16.4" height="12.4" rx="2.2" strokeWidth="1.7" />
          <path d="M5.2 8l6.8 5 6.8-5" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'map':
      return (
        <svg {...common}>
          <path d="M4.5 6.5l4.8-2 5.4 2 4.8-2v13l-4.8 2-5.4-2-4.8 2v-13zM9.3 4.5v13M14.7 6.5v13" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'mind':
      return (
        <svg {...common}>
          <circle cx="12" cy="5.5" r="2.5" strokeWidth="1.7" />
          <circle cx="6" cy="17.5" r="2.5" strokeWidth="1.7" />
          <circle cx="18" cy="17.5" r="2.5" strokeWidth="1.7" />
          <path d="M10.9 7.8l-3.8 7.3M13.1 7.8l3.8 7.3M8.5 17.5h7" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      )
    case 'review':
      return (
        <svg {...common}>
          <path d="M5 12.5l3.5 3.5L19 5.5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M19 12v5.2a2 2 0 01-2 2H6.8a2 2 0 01-2-2V7a2 2 0 012-2h7" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      )
    case 'search':
      return (
        <svg {...common}>
          <circle cx="10.5" cy="10.5" r="5.8" strokeWidth="1.8" />
          <path d="M15 15l4.5 4.5" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )
    case 'translate':
      return (
        <svg {...common}>
          <path d="M4 5.5h8M8 3.5v2M6.2 9.2c1.4 2.3 3.4 3.8 5.8 4.6" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M11 5.5c-.7 4-2.9 6.8-6.3 8.6M13.5 20.5l4.2-10 4.3 10M15 17h5.1" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'upload':
      return (
        <svg {...common}>
          <path d="M12 15V4.5M8 8.5l4-4 4 4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 14.5v3.2a2 2 0 002 2h10a2 2 0 002-2v-3.2" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      )
    case 'users':
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" strokeWidth="1.7" />
          <circle cx="17" cy="9.5" r="2.4" strokeWidth="1.7" />
          <path d="M3.8 19a5.2 5.2 0 0110.4 0M14.5 18.5a4.4 4.4 0 016.2 0" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      )
  }
}
