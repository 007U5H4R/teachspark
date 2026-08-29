import { useState } from 'react';

// Proof-of-output for all three things TeachSpark makes, so a teacher sees the real result before
// joining. Worksheet + quiz are verbatim from live generations (PDFs in web/public); the question
// paper is shown as its real template anatomy — the fixed bilingual, school-branded structure — not
// a specific generation, since that output is an editable Word file we don't render inline.

type Tab = 'worksheet' | 'quiz' | 'paper';

const TABS: { id: Tab; label: string }[] = [
  { id: 'worksheet', label: 'Worksheet' },
  { id: 'quiz', label: 'Quiz' },
  { id: 'paper', label: 'Question paper' },
];

type Section = { name: string; tag?: string; questions: string[] };
type TextSample = { tags: string[]; title: string; sections: Section[]; foot: string; pdf: string };

const WORKSHEET: TextSample = {
  tags: ['Class 6–8', 'English', 'CBSE'],
  title: 'Simple Past and Past Continuous Tense Practice',
  sections: [
    { name: 'Level 1', tag: 'Support', questions: [
      'Fill in the correct past form: She ___ (go) to school yesterday.',
      'Choose the correct form: I (was / were) sleeping when he called.',
      'Write the past tense of these verbs: eat, write, run.',
    ] },
    { name: 'Level 2', tag: 'On-level', questions: [
      'Change into simple past: I visit my grandmother every week.',
      'Correct the error: She were eating dinner when the phone ring.',
      'Combine using "when": (I was doing homework) + (my friend arrived).',
    ] },
    { name: 'Level 3', tag: 'Challenge', questions: [
      'Explain the difference in meaning: (a) I ate dinner when my mother called. (b) I was eating dinner when my mother called.',
      'Rewrite correctly: Yesterday, while she was cooked dinner, the lights went off.',
    ] },
  ],
  foot: '15 questions across three levels, with a full answer key',
  pdf: '/sample-worksheet.pdf',
};

const QUIZ: TextSample = {
  tags: ['Class 6–8', 'Science', 'CBSE'],
  title: 'Photosynthesis Exit Ticket',
  sections: [
    { name: 'Exit ticket', questions: [
      'Name the green pigment in leaves that helps in photosynthesis.',
      'Write the word equation for photosynthesis, showing inputs and outputs.',
      'A plant is kept in a dark cupboard for three days. Will it carry out photosynthesis? Give a reason.',
    ] },
  ],
  foot: '5 questions students finish in 5 minutes, with a full answer key',
  pdf: '/sample-quiz.pdf',
};

// The fixed bilingual paper template (Hindi + English) — the real anatomy the generator produces
// from a teacher's lesson photos. Verifiable against docs/reference/*.docx.
const PAPER_TASKS = [
  { hi: 'पठन बोध और शब्दावली', en: 'Reading Comprehension & Vocabulary', meta: '5 questions' },
  { hi: 'भाषा का प्रयोग', en: 'Language in Use', meta: '5 questions' },
  { hi: 'पाठ्य विश्लेषण', en: 'Textual Analysis', meta: '4 questions' },
  { hi: 'रचनात्मक अभिव्यक्ति', en: 'Creative Response', meta: '1 question' },
];

function TextCard({ s }: { s: TextSample }) {
  return (
    <div>
      <div className="samples__tags">{s.tags.map((t) => <span className="samples__tag" key={t}>{t}</span>)}</div>
      <h3 className="samples__title">{s.title}</h3>
      <div className="samples__levels">
        {s.sections.map((sec) => (
          <div key={sec.name}>
            <p className="samples__level-name">{sec.name}{sec.tag && <span> · {sec.tag}</span>}</p>
            <ol className="samples__q">{sec.questions.map((q, i) => <li key={i}>{q}</li>)}</ol>
          </div>
        ))}
      </div>
      <div className="samples__foot">
        <span className="samples__key">✓ {s.foot}</span>
        <a className="samples__pdf" href={s.pdf} target="_blank" rel="noopener noreferrer">Open the real PDF →</a>
      </div>
    </div>
  );
}

function PaperCard() {
  return (
    <div>
      <div className="samples__tags">
        <span className="samples__tag">Class 6–8</span>
        <span className="samples__tag">Hindi</span>
        <span className="samples__tag">CBSE</span>
        <span className="samples__tag">Editable Word file</span>
      </div>
      <div className="samples__paper-head">
        <span className="samples__paper-logo" aria-hidden="true">🏫</span>
        <span>Your school name &amp; logo · half-yearly worksheet</span>
      </div>
      <div className="samples__paper-tier">Tier A · Foundational · 35–40 min · 30 marks</div>
      <ol className="samples__paper-tasks">
        {PAPER_TASKS.map((t, i) => (
          <li key={i}>
            <span className="samples__paper-num">{i + 1}</span>
            <span className="samples__paper-task"><b lang="hi">{t.hi}</b> <span>{t.en}</span></span>
            <span className="samples__paper-meta">{t.meta}</span>
          </li>
        ))}
      </ol>
      <div className="samples__foot">
        <span className="samples__key">✓ School-branded, bilingual — from photos of your lesson chapter</span>
        <span className="samples__pdf samples__pdf--muted">Type <b>PAPER</b> in WhatsApp to make one</span>
      </div>
    </div>
  );
}

export function SampleOutputs() {
  const [tab, setTab] = useState<Tab>('worksheet');
  return (
    <figure className="samples" aria-label="Real examples of what TeachSpark makes">
      <div className="samples__tabs" role="tablist" aria-label="Choose an output">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            className={`samples__tab${tab === t.id ? ' is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="samples__body" role="tabpanel">
        {tab === 'worksheet' && <TextCard s={WORKSHEET} />}
        {tab === 'quiz' && <TextCard s={QUIZ} />}
        {tab === 'paper' && <PaperCard />}
      </div>
    </figure>
  );
}
