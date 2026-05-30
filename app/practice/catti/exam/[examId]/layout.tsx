import type { ReactNode } from 'react'

const cattiExamMobilePatch = `
[data-catti-exam-layout] {
  overflow-x: hidden;
}

[data-catti-exam-layout] *,
[data-catti-exam-layout] *::before,
[data-catti-exam-layout] *::after {
  box-sizing: border-box;
}

[data-catti-exam-layout] header > div,
[data-catti-exam-layout] main {
  padding-left: clamp(24px, 3vw, 64px) !important;
  padding-right: clamp(24px, 3vw, 64px) !important;
}

[data-catti-exam-layout] header {
  min-height: 84px;
}

[data-catti-exam-layout] header > div {
  padding-top: 18px !important;
  padding-bottom: 18px !important;
}

[data-catti-exam-layout] header span,
[data-catti-exam-layout] header button,
[data-catti-exam-layout] header .font-mono {
  line-height: 1.35 !important;
}

[data-catti-exam-layout] header .font-mono.text-2xl {
  min-width: 128px !important;
  padding: 14px 22px !important;
  text-align: center !important;
}

[data-catti-exam-layout] header span.rounded-xl {
  padding: 13px 20px !important;
}

[data-catti-exam-layout] main > div[class*="border-red"] {
  padding: 18px 24px !important;
  line-height: 1.7 !important;
}

[data-catti-exam-layout] main section > div > div:first-child {
  padding: clamp(36px, 4.5vw, 80px) !important;
}

[data-catti-exam-layout] main section > div > div:first-child > div:first-child {
  padding-bottom: 30px !important;
}

[data-catti-exam-layout] main section > div > div:first-child > div:first-child > div:last-child {
  padding: 20px 24px !important;
}

[data-catti-exam-layout] main section > div > div:first-child > div:nth-child(2) {
  padding: 24px !important;
}

[data-catti-exam-layout] main section > div > div:first-child > div:nth-child(3) {
  padding: 56px 36px !important;
}

[data-catti-exam-layout] main section > div > div:last-child > div {
  padding: 28px 32px !important;
}

[data-catti-exam-layout] main section > div > div:last-child .rounded-xl {
  padding: 16px 18px !important;
}

[data-catti-exam-layout] h1,
[data-catti-exam-layout] h2,
[data-catti-exam-layout] h3,
[data-catti-exam-layout] p,
[data-catti-exam-layout] span,
[data-catti-exam-layout] button {
  overflow-wrap: anywhere;
}

@media (max-width: 640px) {
  [data-catti-exam-layout] > .min-h-screen {
    overflow-x: hidden !important;
  }

  [data-catti-exam-layout] header > div,
  [data-catti-exam-layout] main {
    max-width: 100% !important;
    padding-left: 16px !important;
    padding-right: 16px !important;
  }

  [data-catti-exam-layout] header > div > div:last-child {
    min-width: 0 !important;
    width: 100% !important;
  }

  [data-catti-exam-layout] header .font-mono.text-2xl {
    min-width: 110px !important;
    text-align: center !important;
  }

  [data-catti-exam-layout] header button {
    width: 100% !important;
  }

  [data-catti-exam-layout] main {
    justify-content: flex-start !important;
    padding-top: 20px !important;
    padding-bottom: 20px !important;
  }

  [data-catti-exam-layout] main section,
  [data-catti-exam-layout] main section > div,
  [data-catti-exam-layout] main section > div > div {
    min-width: 0 !important;
  }

  [data-catti-exam-layout] main section > div {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  [data-catti-exam-layout] main section > div > div:first-child {
    padding: 26px 20px !important;
  }

  [data-catti-exam-layout] main section > div > div:last-child > div {
    padding-left: 20px !important;
    padding-right: 20px !important;
  }

  [data-catti-exam-layout] header .font-mono.text-2xl,
  [data-catti-exam-layout] header span.rounded-xl {
    padding-left: 16px !important;
    padding-right: 16px !important;
  }

  [data-catti-exam-layout] main section > div > div:first-child > div:first-child > div:last-child,
  [data-catti-exam-layout] main section > div > div:first-child > div:nth-child(2),
  [data-catti-exam-layout] main section > div > div:first-child > div:nth-child(3) {
    padding: 20px !important;
  }

  [data-catti-exam-layout] h2,
  [data-catti-exam-layout] h3,
  [data-catti-exam-layout] p,
  [data-catti-exam-layout] span {
    overflow-wrap: anywhere;
  }

  [data-catti-exam-layout] h2 {
    font-size: clamp(26px, 8vw, 44px) !important;
  }

  [data-catti-exam-layout] h3 {
    font-size: clamp(28px, 8vw, 44px) !important;
  }

  [data-catti-exam-layout] .md\\:grid-cols-3 > div {
    align-items: flex-start !important;
    flex-direction: column !important;
    gap: 4px !important;
  }
}
`

export default function CattiExamLayout({ children }: { children: ReactNode }) {
  return (
    <div data-catti-exam-layout>
      <style>{cattiExamMobilePatch}</style>
      {children}
    </div>
  )
}
