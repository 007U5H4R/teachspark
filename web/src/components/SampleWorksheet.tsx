// A REAL worksheet TeachSpark produced end-to-end (English · Middle · CBSE), shown as proof-of-output
// so a teacher sees the actual result before she joins — not a mockup, not a marketing claim.
// The questions below are verbatim from a live generation; the full 15-question sheet + answer key
// is the PDF at web/public/sample-worksheet.pdf. Regenerate with `npm run try:generate` if refreshed.

type Level = { name: string; tag: string; questions: string[] };

const LEVELS: Level[] = [
  {
    name: 'Level 1',
    tag: 'Support',
    questions: [
      'Fill in the correct past form: She ___ (go) to school yesterday.',
      'Choose the correct form: I (was / were) sleeping when he called.',
      'Write the past tense of these verbs: eat, write, run.',
    ],
  },
  {
    name: 'Level 2',
    tag: 'On-level',
    questions: [
      'Change into simple past: I visit my grandmother every week.',
      'Correct the error: She were eating dinner when the phone ring.',
      'Combine using "when": (I was doing homework) + (my friend arrived).',
    ],
  },
  {
    name: 'Level 3',
    tag: 'Challenge',
    questions: [
      'Explain the difference in meaning: (a) I ate dinner when my mother called. (b) I was eating dinner when my mother called.',
      'Rewrite correctly: Yesterday, while she was cooked dinner, the lights went off.',
    ],
  },
];

export function SampleWorksheet() {
  return (
    <figure className="worksheet" aria-label="A real worksheet made by TeachSpark for Class 6 to 8 English, CBSE board">
      <div className="worksheet__tags">
        <span className="worksheet__tag">Class 6–8</span>
        <span className="worksheet__tag">English</span>
        <span className="worksheet__tag">CBSE</span>
      </div>
      <h3 className="worksheet__title">Simple Past and Past Continuous Tense Practice</h3>
      <div className="worksheet__levels">
        {LEVELS.map((lvl) => (
          <div className="worksheet__level" key={lvl.name}>
            <p className="worksheet__level-name">{lvl.name} <span>· {lvl.tag}</span></p>
            <ol className="worksheet__q">
              {lvl.questions.map((q, i) => <li key={i}>{q}</li>)}
            </ol>
          </div>
        ))}
      </div>
      <figcaption className="worksheet__foot">
        <span className="worksheet__key">✓ 15 questions across three levels, with a full answer key</span>
        <a className="worksheet__pdf" href="/sample-worksheet.pdf" target="_blank" rel="noopener noreferrer">Open the real PDF →</a>
      </figcaption>
    </figure>
  );
}
