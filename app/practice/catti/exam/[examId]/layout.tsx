import type { ReactNode } from 'react'

const cattiExamMobilePatch = `
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
    padding: 24px 20px !important;
  }

  [data-catti-exam-layout] main section > div > div:last-child > div {
    padding-left: 20px !important;
    padding-right: 20px !important;
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
